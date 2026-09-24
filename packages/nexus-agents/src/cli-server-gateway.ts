/**
 * Gateway adapter bootstrap (#2502, child 2 of epic #2500).
 *
 * The OpenAI-compatible gateway adapter (`adapters/openai-compat-adapter.ts`,
 * #2468) was implemented but never wired into the runtime. This module
 * closes that loop: at MCP-server startup, when `NEXUS_OPENAI_COMPAT_URL`
 * + `NEXUS_OPENAI_COMPAT_KEY` are set, we discover the gateway's models
 * and produce a single `IModelAdapter` that orchestrator/expert tools can
 * use directly. In sandbox mode (#2501), we fail-fast on misconfiguration
 * because there's no human at a CLI prompt to recover. The deprecated
 * `NEXUS_CUSTOM_API_*` pair does NOT reach this path (#4392 increment 3,
 * panel option C): it aliases the single-model `custom-openai` reader only.
 *
 * @module cli-server-gateway
 */

import type { ILogger, IModelAdapter } from './core/index.js';
import {
  readOpenAICompatEndpoint,
  readOpenAICompatEnv,
  buildOpenAICompatAdapters,
} from './adapters/openai-compat-adapter.js';
import { createGatewayArmAdapter } from './adapters/gateway-arm-adapter.js';
import {
  GatewayHostRefusedError,
  type GatewayHostRefused,
} from './adapters/gateway-host-status.js';
import { GatewayRediscovery, setGatewayRediscovery } from './adapters/gateway-rediscovery.js';
import { setGatewayCatalog } from './adapters/sdk/gateway-catalog.js';
import { logGatewaySlotMapping, setGatewaySlotCatalog } from './adapters/gateway-family-slots.js';
import { gatewayEndpointRejection } from './adapters/sdk/gateway-cost.js';
import { hostnameOf, warnDeprecatedGatewayEnvOnce } from './adapters/sdk/gateway-env.js';
import type { IResilientAdapter } from './adapters/resilient-adapter-types.js';
import { getDefaultCliCircuitBreakerRegistry } from './cli-adapters/cli-circuit-breaker.js';
import { isEndpointArmId, type EndpointArmId } from './cli-adapters/types-core.js';
import { detectSandbox } from './config/sandbox-detection.js';
import { EXIT_CODES } from './cli-types.js';

/**
 * Try to wire an OpenAI-compatible gateway as an `IModelAdapter`.
 *
 * Behavioural matrix:
 *
 * | Sandbox | Env vars | Probe   | Outcome                                  |
 * | :------ | :------- | :------ | :--------------------------------------- |
 * | active  | unset    | n/a     | exit(SERVER_START_FAILED)                |
 * | active  | set      | fails   | exit(SERVER_START_FAILED) with HTTP info |
 * | active  | set      | succeed | log + return first discovered adapter    |
 * | inactive| unset    | n/a     | return undefined (CLI flow handles it)   |
 * | inactive| set      | fails   | log warning + return undefined           |
 * | inactive| set      | succeed | log + return first discovered adapter    |
 *
 * The "first discovered" choice is intentional: when the harness is the
 * one routing models (via MCP tool params), nexus-agents should use
 * whichever the gateway lists. Per-model adapter selection lives in the
 * tool handlers, not in the bootstrap.
 */
/**
 * Wire ALL discovered gateway adapters — one per model the gateway serves
 * (#4040). Same probe/fail-closed contract as {@link tryWireGatewayAdapter};
 * returns the full list so the voter path can round-robin roles across distinct
 * models (per-role diversity, all in-process). Returns undefined when no gateway
 * is configured or the probe fails.
 */
export async function tryWireGatewayAdapters(
  logger: ILogger
): Promise<readonly IModelAdapter[] | undefined> {
  return (await wireGatewayOnce(logger)).adapters;
}

/** One wiring attempt's adapters, and whether a later attempt could succeed. */
interface WiringOutcome {
  readonly adapters: readonly IModelAdapter[] | undefined;
  readonly retryable: boolean;
}

/**
 * One wiring attempt. `retryable` is true when a gateway is configured but
 * the probe failed for a reason that can clear on its own — unreachable,
 * error status, zero models — and false when retrying cannot help: not
 * configured, or refused by the private-address guard (allowing it is an env
 * change, which needs a restart). Lazy re-discovery (#6608) arms only on
 * `retryable`.
 */
async function wireGatewayOnce(logger: ILogger): Promise<WiringOutcome> {
  // #4392 increment 3: the ONE deprecated-alias warn, at startup, from the
  // gateway bootstrap — the operator who set the legacy pair expecting this
  // path is told here that the rename is what opts in (option C).
  warnDeprecatedGatewayEnvOnce(process.env, logger);
  const sandboxActive = detectSandbox().active;
  const env = readOpenAICompatEnv();
  if (env === null) {
    handleMissingEnv(logger, sandboxActive);
    noticeCliSubprocessFallback(logger);
    return { adapters: undefined, retryable: false };
  }

  const result = await buildOpenAICompatAdapters(logger);
  if (result === null) {
    // env-was-set guard; build contract allows it
    noticeCliSubprocessFallback(logger);
    return { adapters: undefined, retryable: false };
  }
  if (!result.ok && result.error instanceof GatewayHostRefusedError) {
    handleHostRefused(logger, sandboxActive, result.error.status);
    noticeCliSubprocessFallback(logger);
    return { adapters: undefined, retryable: false };
  }
  if (!result.ok) {
    handleProbeFailure(logger, sandboxActive, result.error.message);
    noticeCliSubprocessFallback(logger);
    return { adapters: undefined, retryable: true };
  }
  if (result.value.length === 0) {
    handleZeroModels(logger, sandboxActive);
    noticeCliSubprocessFallback(logger);
    return { adapters: undefined, retryable: true };
  }

  // Log the discovered model IDs at info level — operators want to confirm
  // the gateway's catalog matches what they configured upstream. The API
  // key never reaches logs (env-only read), and neither does the full base
  // URL — it can carry userinfo — only its host (#4392 increment 3).
  logger.info('OpenAI-compatible gateway wired', {
    host: hostnameOf(env.baseUrl),
    modelCount: result.value.length,
    models: result.value.map((a) => a.modelId),
  });
  return { adapters: result.value, retryable: false };
}

export async function tryWireGatewayAdapter(logger: ILogger): Promise<IModelAdapter | undefined> {
  const all = await tryWireGatewayAdapters(logger);
  return all?.[0];
}

/**
 * One-time operator notice (#4255): whenever no in-process gateway ends up
 * wired — env unset, probe failed, or the gateway listed 0 models — voter
 * and consensus calls fall through to the CLI-subprocess round-robin path
 * (`voter-agents.ts` `getAvailableClis`). That path is slower (~90s wall
 * time observed) and depends on each CLI's own auth/quota, but nothing told
 * the operator a faster in-process option exists (#4040). Logged once per
 * process via {@link cliSubprocessFallbackNoticeLogged} so a busy startup
 * (or repeated calls in tests) can't spam it.
 */
let cliSubprocessFallbackNoticeLogged = false;

function noticeCliSubprocessFallback(logger: ILogger): void {
  if (cliSubprocessFallbackNoticeLogged) return;
  cliSubprocessFallbackNoticeLogged = true;
  logger.info(
    'No in-process gateway is configured, so voter/consensus calls will spawn CLI ' +
      "subprocesses (slower per-vote startup, subject to each CLI's own auth/quota). " +
      'Set NEXUS_OPENAI_COMPAT_URL and NEXUS_OPENAI_COMPAT_KEY to route voters through ' +
      'an OpenAI-compatible gateway in-process instead (lower latency, no subprocess spawn).'
  );
}

/** Test-only: reset the one-time notice guard so repeated tests can re-trigger it. */
export function _resetCliSubprocessFallbackNotice(): void {
  cliSubprocessFallbackNoticeLogged = false;
}

/**
 * The default model adapter: the primary in-process gateway model when a gateway
 * is configured (#2502/#4040), else the CLI-registry default. The registry is
 * typed structurally so this stays free of the adapter-registry import.
 */
export function resolveDefaultModelAdapter(
  gatewayAdapters: readonly IModelAdapter[] | undefined,
  adapterRegistry: { getDefault(): IModelAdapter }
): IModelAdapter {
  return gatewayAdapters?.[0] ?? adapterRegistry.getDefault();
}

/**
 * Register the discovered gateway models as ONE `api:<endpoint>` arm in the
 * adapter registry (#4392 increment 2, step 2), in EVERY billing mode — the
 * arm is what the shared breaker, the `NEXUS_GATEWAY_COST` declaration and
 * (once #6291 widens the routing ids) routing key on. `registerApiArm` warns
 * when the arm's cost is undeclared. The per-model adapters keep flowing to
 * the voter tools unchanged; this adds the arm beside them.
 *
 * Returns the arm id, or `undefined` when nothing was registered: no gateway
 * (`adapters` undefined or empty — the named empty case, logged at debug), or
 * an `endpoint` that is not a valid endpoint id (the env schema already
 * reported it; a garbage arm id is never minted from it).
 */
export function registerGatewayArm(
  adapters: readonly IModelAdapter[] | undefined,
  endpoint: string,
  registry: {
    registerApiArm(arm: EndpointArmId, adapter: IResilientAdapter): void;
    getLogger(): ILogger;
  }
): EndpointArmId | undefined {
  const logger = registry.getLogger();
  if (adapters === undefined || adapters.length === 0) {
    logger.debug('No gateway adapters discovered; no api: arm registered');
    return undefined;
  }
  const armId = `api:${endpoint}`;
  const rejection = gatewayEndpointRejection(endpoint);
  if (rejection !== undefined || !isEndpointArmId(armId)) {
    // Not echoed: the likely mistake is a pasted URL, which can carry a key.
    logger.warn('Gateway endpoint is not a valid gateway endpoint; no api: arm registered', {
      reason: rejection ?? 'not a valid endpoint id',
    });
    return undefined;
  }
  registry.registerApiArm(
    armId,
    createGatewayArmAdapter(armId, adapters, {
      circuitBreakerRegistry: getDefaultCliCircuitBreakerRegistry(),
      logger,
    })
  );
  // AFTER registerApiArm: a re-registration disposes the earlier arm, and its
  // dispose() clears the catalogue — set first, the new catalogue would go too.
  setGatewayCatalog(
    armId,
    adapters.map((a) => a.modelId)
  );
  logger.info('Gateway registered as one api: arm', { arm: armId, modelCount: adapters.length });
  return armId;
}

/**
 * The bootstrap entry (#4392 inc 2 step 2): discover the gateway
 * ({@link tryWireGatewayAdapters}), register its `api:<endpoint>` arm
 * ({@link registerGatewayArm}) under the operator's endpoint id, register the
 * family-slot catalogue (#6604), and hand the per-model adapters back for the
 * tools. One call, so `cli-server.ts` cannot
 * wire the adapters without the arm.
 */
export async function wireGateway(
  logger: ILogger,
  registry: Parameters<typeof registerGatewayArm>[2]
): Promise<readonly IModelAdapter[] | undefined> {
  const { adapters, retryable } = await wireGatewayOnce(logger);
  const endpoint = readOpenAICompatEndpoint(process.env, logger);
  registerGatewayArm(adapters, endpoint, registry);
  registerFamilySlots(adapters, logger);
  if (!retryable) return adapters;
  // #6608: a gateway that was down at boot is retried lazily. The tools get
  // an empty live list (every reader treats empty as "no gateway"); the first
  // gateway-needing call after the backoff fills it in place and registers
  // the arm. Every registry adapter triggers it (#6659, see
  // gateway-rediscovery.ts), and the boot-time default re-detects onto the
  // gateway once it is found.
  const live: IModelAdapter[] = [];
  setGatewayRediscovery(
    new GatewayRediscovery({
      target: live,
      logger,
      discover: () => rediscoverGateway(logger),
      onDiscovered: (found) => {
        registerGatewayArm(found, endpoint, registry);
        registerFamilySlots(found, logger);
      },
    })
  );
  return live;
}

/**
 * #6604: the family-slot catalogue — each vendor CLI slot without an
 * available CLI resolves to a gateway model of its own family. None
 * registered (no gateway, or discovery failed) means no gateway.
 */
function registerFamilySlots(
  adapters: readonly IModelAdapter[] | undefined,
  logger: ILogger
): void {
  setGatewaySlotCatalog(adapters ?? []);
  logGatewaySlotMapping(logger);
}

/**
 * One lazy re-discovery attempt: the adapters; `undefined` (logged) when it
 * failed in a way that can clear; `'refused'` when the private-address guard
 * refused the host (#6659), logged with the same remedy as at boot and never
 * retried, since allowing it is an env change that needs a restart.
 */
async function rediscoverGateway(
  logger: ILogger
): Promise<readonly IModelAdapter[] | 'refused' | undefined> {
  const result = await buildOpenAICompatAdapters(logger);
  if (result === null) return undefined;
  if (!result.ok && result.error instanceof GatewayHostRefusedError) {
    // Re-discovery is armed only outside sandbox mode (a failed boot probe
    // there exits), so this never takes the sandbox exit branch.
    handleHostRefused(logger, false, result.error.status);
    return 'refused';
  }
  if (!result.ok) {
    logger.warn('Gateway re-discovery failed; calls stay on CLI subprocesses', {
      error: result.error.message,
    });
    return undefined;
  }
  return result.value;
}

function handleMissingEnv(logger: ILogger, sandboxActive: boolean): void {
  if (sandboxActive) {
    logger.error(
      'Sandbox mode active but NEXUS_OPENAI_COMPAT_URL / NEXUS_OPENAI_COMPAT_KEY are not set. ' +
        'Configure the gateway in your launch env or opencode.json. ' +
        'See docs/guides/SANDBOXED-USAGE.md.',
      new Error('Missing gateway configuration in sandbox mode')
    );
    process.exit(EXIT_CODES.SERVER_START_FAILED);
  }
  return undefined;
}

function handleProbeFailure(logger: ILogger, sandboxActive: boolean, reason: string): void {
  if (sandboxActive) {
    logger.error(
      'Sandbox mode active and OpenAI-compatible gateway probe failed.',
      new Error(reason)
    );
    process.exit(EXIT_CODES.SERVER_START_FAILED);
  }
  logger.warn('OpenAI-compatible gateway probe failed; continuing with CLI adapters', {
    error: reason,
  });
  return undefined;
}

/**
 * The private-address guard refused the gateway host (#6608). The message
 * names the variable that allows it and says the gateway is not in use —
 * before this, the operator saw a generic probe-failure line.
 */
function handleHostRefused(
  logger: ILogger,
  sandboxActive: boolean,
  status: GatewayHostRefused
): void {
  const message =
    `Gateway host ${status.host} refused by the private-address guard: the in-process ` +
    'gateway is NOT in use, and voter/consensus calls fall back to CLI subprocesses. ' +
    status.remedy;
  if (sandboxActive) {
    logger.error(message, new Error(status.reason));
    process.exit(EXIT_CODES.SERVER_START_FAILED);
  }
  logger.warn(message, { host: status.host, reason: status.reason });
}

function handleZeroModels(logger: ILogger, sandboxActive: boolean): void {
  if (sandboxActive) {
    logger.error(
      'Sandbox mode active and gateway returned 0 models. Check upstream provider quotas / list filters.',
      new Error('Gateway discovered 0 models')
    );
    process.exit(EXIT_CODES.SERVER_START_FAILED);
  }
  logger.warn('OpenAI-compatible gateway returned 0 models; ignoring');
  return undefined;
}
