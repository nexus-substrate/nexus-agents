/**
 * The gateway half of `nexus-agents doctor` (#6609, epic #6612).
 *
 * Before this, doctor printed "✓ Voter transport: In-process gateway" from the
 * presence of two env vars, and its verdict counted only vendor API keys and
 * installed CLIs — so a host served entirely by a working gateway always
 * exited 1, and a host whose gateway was down could still print a check mark.
 *
 * {@link checkGatewayHealth} MEASURES the gateway with the calls the server
 * itself makes: the private-address guard (`checkGatewayHost`) and discovery
 * (`GET /models`, chat filter, allowlist). The completion probe is opt-in
 * because it spends tokens. {@link gatewayVerdict} turns the measurement into
 * the one term `isAllHealthy` and `failingVerdictTerms` read.
 *
 * Secrets: the key, the extra header values and the proxy URL's userinfo
 * never reach the result. Errors are redacted of the key and every header
 * value before they are stored.
 *
 * @module cli/doctor-gateway
 */

import type { IModelAdapter } from '../core/index.js';
import { getErrorMessage, getTimeProvider } from '../core/index.js';
import {
  createOpenAICompatAdapter,
  discoverGatewayCatalog,
  readOpenAICompatEnv,
  type OpenAICompatConfig,
} from '../adapters/openai-compat-adapter.js';
import {
  checkGatewayHost,
  GATEWAY_HOST_LOOKUP_TIMED_OUT,
  type GatewayHostStatus,
} from '../adapters/gateway-host-status.js';
import { gatewayProxyUrl } from '../adapters/gateway-http.js';
import { redactGatewaySecrets } from '../adapters/gateway-redaction.js';
import {
  gatewayModelFamily,
  gatewaySlotMapping,
  type GatewayFamily,
  type GatewaySlotMapping,
} from '../adapters/gateway-family-slots.js';
import type { CliCheckResult } from './doctor.js';
import { gatewaySlotServing, installedCliIsBroken } from './doctor-gateway-slots.js';

/** Census buckets: the three slot families, and every model outside them. */
export type GatewayCensusBucket = GatewayFamily | 'unknown';

/**
 * Chat models per family. `unknown` counts every model not classified as one
 * of the three: an unrecognised vendor and a recognised fourth vendor alike.
 */
export type GatewayCensus = Readonly<Record<GatewayCensusBucket, number>>;

/**
 * How gateway calls leave the host. Never carries the proxy URL: it can hold
 * `user:password@`. `proxyHost` is host and port only.
 */
export type GatewayProxyStatus =
  | { readonly kind: 'direct' }
  | { readonly kind: 'proxy'; readonly proxyHost: string }
  /** A proxy variable is set, but `NO_PROXY` exempts the gateway host. */
  | { readonly kind: 'exempt' }
  /** A proxy variable is set but unusable (not http/https): calls go direct. */
  | { readonly kind: 'ignored' };

/** One family's completion probe. */
export type GatewayCompletionProbe =
  | { readonly family: GatewayFamily; readonly outcome: 'no_model' }
  | {
      readonly family: GatewayFamily;
      readonly outcome: 'ok' | 'failed';
      readonly model: string;
      readonly latencyMs: number;
      /** Redacted of the key and header values. Present when `failed`. */
      readonly error?: string;
    };

/** The measured gateway. Every state but `not_configured` names the host. */
export type GatewayHealth =
  | { readonly state: 'not_configured' }
  | {
      readonly state: 'refused_private_host';
      readonly host: string;
      readonly reason: string;
      readonly remedy: string;
      readonly proxy: GatewayProxyStatus;
    }
  | {
      /** `/models` failed: unreachable, refused, timed out, rejected the key, or over the cap. */
      readonly state: 'discovery_failed';
      readonly host: string;
      readonly error: string;
      readonly proxy: GatewayProxyStatus;
    }
  | {
      /** `/models` answered, but no model survived the chat filter and allowlist. */
      readonly state: 'no_chat_models';
      readonly host: string;
      readonly listedCount: number;
      readonly proxy: GatewayProxyStatus;
    }
  | {
      readonly state: 'healthy';
      readonly host: string;
      /** Rows `/models` returned, before the chat filter. */
      readonly listedCount: number;
      /** Chat models kept after the chat filter (and the allowlist, when set). */
      readonly chatCount: number;
      readonly allowlistActive: boolean;
      readonly census: GatewayCensus;
      readonly slots: GatewaySlotMapping;
      readonly proxy: GatewayProxyStatus;
      /** `skipped` unless the operator passed `--probe`. */
      readonly probes: readonly GatewayCompletionProbe[] | 'skipped';
    };

/** The verdict term: no gateway, a gateway that works, or one that does not. */
export type GatewayVerdict = 'absent' | 'pass' | 'fail';

const PROBE_FAMILIES: readonly GatewayFamily[] = ['anthropic', 'openai', 'google'];
const PROBE_SLOT: Readonly<Record<GatewayFamily, keyof GatewaySlotMapping>> = {
  anthropic: 'claude',
  openai: 'codex',
  google: 'gemini',
};
/** Room for a reasoning model to think and still answer one word. */
const PROBE_MAX_TOKENS = 256;
const PROBE_TIMEOUT_MS = 30_000;

export interface GatewayHealthOptions {
  /** Send one completion per family. Spends tokens; off unless `--probe`. */
  readonly probe?: boolean;
  /** Injectable for tests; defaults to the server's reader. */
  readonly config?: OpenAICompatConfig | null;
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * The health a host-guard outcome ends the check with, or `undefined` when the
 * host is allowed. A lookup timeout fails closed, as discovery does (#6671).
 */
function hostGuardHealth(
  guard: GatewayHostStatus,
  proxy: GatewayProxyStatus
): GatewayHealth | undefined {
  if (guard.state === 'refused_private_host') {
    const { host, reason, remedy } = guard;
    return { state: 'refused_private_host', host, reason, remedy, proxy };
  }
  if (guard.state === 'lookup_timed_out') {
    return {
      state: 'discovery_failed',
      host: guard.host,
      error: GATEWAY_HOST_LOOKUP_TIMED_OUT,
      proxy,
    };
  }
  return undefined;
}

/** Measure the configured gateway. `not_configured` makes no network call. */
export async function checkGatewayHealth(
  options: GatewayHealthOptions = {}
): Promise<GatewayHealth> {
  const config = options.config !== undefined ? options.config : readOpenAICompatEnv();
  if (config === null) return { state: 'not_configured' };
  const env = options.env ?? process.env;
  const proxy = proxyStatus(config, env);
  const guard = await checkGatewayHost(config.baseUrl);
  const blocked = hostGuardHealth(guard, proxy);
  if (blocked !== undefined) return blocked;
  const host = guard.host;
  const discovered = await discoverGatewayCatalog(config);
  if (!discovered.ok) {
    return {
      state: 'discovery_failed',
      host,
      error: redact(discovered.error.message, config),
      proxy,
    };
  }
  const { listedCount, models } = discovered.value;
  if (models.length === 0) return { state: 'no_chat_models', host, listedCount, proxy };
  const adapters = models.map((m) => createOpenAICompatAdapter(m.id, config, m.created));
  const slots = gatewaySlotMapping(adapters, env);
  return {
    state: 'healthy',
    host,
    listedCount,
    chatCount: models.length,
    allowlistActive: (config.modelAllowlist ?? []).length > 0,
    census: censusOf(models.map((m) => m.id)),
    slots,
    proxy,
    probes: options.probe === true ? await probeFamilies(adapters, slots, config) : 'skipped',
  };
}

/** Chat models per family. */
function censusOf(ids: readonly string[]): GatewayCensus {
  const census: Record<GatewayCensusBucket, number> = {
    anthropic: 0,
    openai: 0,
    google: 0,
    unknown: 0,
  };
  for (const id of ids) {
    const family = gatewayModelFamily(id);
    const bucket = family === undefined || family === 'other' ? 'unknown' : family;
    census[bucket] += 1;
  }
  return census;
}

/** The proxy the gateway's calls use, told apart from its three look-alikes. */
function proxyStatus(config: OpenAICompatConfig, env: NodeJS.ProcessEnv): GatewayProxyStatus {
  if (config.proxyUrl !== undefined) return { kind: 'proxy', proxyHost: proxyHostOf(config) };
  if (gatewayProxyUrl(config.baseUrl, env) !== undefined) return { kind: 'ignored' };
  const withoutNoProxy = { ...env, no_proxy: undefined, NO_PROXY: undefined };
  if (gatewayProxyUrl(config.baseUrl, withoutNoProxy) !== undefined) return { kind: 'exempt' };
  return { kind: 'direct' };
}

function proxyHostOf(config: OpenAICompatConfig): string {
  try {
    return new URL(config.proxyUrl ?? '').host;
  } catch {
    return '<unparseable proxy>';
  }
}

/** One completion per family, in family order; a family with no model is not called. */
async function probeFamilies(
  adapters: readonly IModelAdapter[],
  slots: GatewaySlotMapping,
  config: OpenAICompatConfig
): Promise<readonly GatewayCompletionProbe[]> {
  const probes: GatewayCompletionProbe[] = [];
  for (const family of PROBE_FAMILIES) {
    const model = slots[PROBE_SLOT[family]];
    const adapter = adapters.find((a) => a.modelId === model);
    if (adapter === undefined) {
      probes.push({ family, outcome: 'no_model' });
      continue;
    }
    probes.push(await probeOne(family, adapter, config));
  }
  return probes;
}

async function probeOne(
  family: GatewayFamily,
  adapter: IModelAdapter,
  config: OpenAICompatConfig
): Promise<GatewayCompletionProbe> {
  const clock = getTimeProvider();
  const started = clock.now();
  const base = { family, model: adapter.modelId };
  try {
    const result = await adapter.complete({
      messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
      maxTokens: PROBE_MAX_TOKENS,
      timeoutMs: PROBE_TIMEOUT_MS,
    });
    const latencyMs = clock.now() - started;
    if (result.ok) return { ...base, outcome: 'ok', latencyMs };
    return { ...base, outcome: 'failed', latencyMs, error: redact(result.error.message, config) };
  } catch (e: unknown) {
    const latencyMs = clock.now() - started;
    return { ...base, outcome: 'failed', latencyMs, error: redact(getErrorMessage(e), config) };
  }
}

/** `message` with the key and every extra header value replaced. */
function redact(message: string, config: OpenAICompatConfig): string {
  return redactGatewaySecrets(message, { apiKey: config.apiKey, headers: config.extraHeaders });
}

/** A vendor slot the gateway can serve: one per family. */
type GatewaySlot = keyof GatewaySlotMapping;

/**
 * The family slots a healthy gateway does NOT serve, in family order (#6658):
 * each slot that resolved to `unavailable`. This is also exactly the set of
 * `--probe` `no_model` results — `probeFamilies` reads the same mapping — so a
 * `no_model` family counts against the verdict the same way. Empty for any
 * other state: there is no slot mapping to read.
 */
function unservedGatewaySlots(health: GatewayHealth): readonly GatewaySlot[] {
  if (health.state !== 'healthy') return [];
  const { slots } = health;
  return PROBE_FAMILIES.map((family) => PROBE_SLOT[family]).filter(
    (slot) => slots[slot] === 'unavailable'
  );
}

/**
 * The verdict term. A requested probe that failed fails the gateway: it was
 * asked whether the gateway serves, and it said no. A gateway that serves NO
 * family slot fails too (#6658): it answered `/models` but every pinned slot
 * would throw "unavailable" at use. One that serves SOME slots passes, and
 * {@link gatewaySlotWarnings} names each slot it does not serve.
 */
export function gatewayVerdict(health: GatewayHealth): GatewayVerdict {
  if (health.state === 'not_configured') return 'absent';
  if (health.state !== 'healthy') return 'fail';
  const failed = health.probes !== 'skipped' && health.probes.some((p) => p.outcome === 'failed');
  if (failed) return 'fail';
  return unservedGatewaySlots(health).length < PROBE_FAMILIES.length ? 'pass' : 'fail';
}

/**
 * One warning per family slot the passing gateway leaves with no arm (#6658):
 * its CLI is missing or disabled by `NEXUS_DISABLED_CLIS` (#6720), and the
 * gateway has no model of its family — the router's own decision, read via
 * {@link gatewaySlotServing}. Such a slot does not fail the verdict — other
 * slots work — but a task pinned to it throws "unavailable" at use, so it is
 * named rather than silently excused. opencode has no gateway slot, so a
 * missing opencode is always named. No warning when the gateway does not
 * pass: the missing CLIs then fail the verdict themselves
 * ({@link cliFailsVerdict}).
 */
export function gatewaySlotWarnings(
  health: GatewayHealth,
  clis: readonly CliCheckResult[]
): string[] {
  if (gatewayVerdict(health) !== 'pass') return [];
  const missing = (name: CliCheckResult['name']): boolean =>
    clis.some((c) => c.name === name && !c.installed);
  const warnings = gatewaySlotServing(health, clis)
    .filter((s) => s.serving === 'unavailable')
    .map((s) => {
      const why = s.disabled ? 'disabled by NEXUS_DISABLED_CLIS' : 'not installed';
      return `${s.slot} slot unavailable: ${why}, and the gateway has no ${s.family} model`;
    });
  if (missing('opencode')) {
    warnings.push('opencode slot unavailable: not installed, and the gateway has no opencode slot');
  }
  return warnings;
}

/**
 * The `doctor --gateway` line for each family slot the gateway does not serve,
 * in family order — or one line saying no slot is served, the case
 * {@link gatewayVerdict} fails on.
 */
export function unservedSlotLines(health: GatewayHealth): string[] {
  const unserved = unservedGatewaySlots(health);
  if (health.state !== 'healthy' || unserved.length === 0) return [];
  if (unserved.length === PROBE_FAMILIES.length) {
    return [
      'no slot has a gateway model: every pinned claude, codex or gemini slot is unavailable',
    ];
  }
  return PROBE_FAMILIES.filter((f) => unserved.includes(PROBE_SLOT[f])).map(
    (f) => `${PROBE_SLOT[f]} slot unavailable: the gateway has no ${f} model`
  );
}

/**
 * Whether one CLI counts against the verdict. With a passing gateway — one
 * that serves at least one family slot — a CLI that is not installed does
 * not. When its own slot has a gateway model it is excused outright; when it
 * has none (or it is opencode, which never has one) it is a named warning
 * from {@link gatewaySlotWarnings}, not a failure (#6658). A host with zero
 * served slots has a failing gateway, so every missing CLI counts. An
 * installed CLI still has to be authenticated and supported — unless the
 * gateway actually serves its slot (`gatewayCovered`, from
 * `gatewayCoveredClis` in `doctor-gateway-slots.ts`): service is unaffected, so it is a named ⚠, not
 * a failure (#6782). A broken CLI whose slot nothing serves still fails.
 */
export function cliFailsVerdict(
  cli: CliCheckResult,
  gateway: GatewayVerdict,
  gatewayCovered: boolean
): boolean {
  if (!cli.installed) return gateway !== 'pass';
  return installedCliIsBroken(cli) && !gatewayCovered;
}
