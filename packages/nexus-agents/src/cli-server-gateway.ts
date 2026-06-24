/**
 * Gateway adapter bootstrap (#2502, child 2 of epic #2500).
 *
 * The OpenAI-compatible gateway adapter (`adapters/openai-compat-adapter.ts`,
 * #2468) was implemented but never wired into the runtime. This module
 * closes that loop: at MCP-server startup, when `NEXUS_OPENAI_COMPAT_URL`
 * + `NEXUS_OPENAI_COMPAT_KEY` are set, we discover the gateway's models
 * and produce a single `IModelAdapter` that orchestrator/expert tools can
 * use directly. In sandbox mode (#2501), we fail-fast on misconfiguration
 * because there's no human at a CLI prompt to recover.
 *
 * @module cli-server-gateway
 */

import type { ILogger, IModelAdapter } from './core/index.js';
import {
  readOpenAICompatEnv,
  buildOpenAICompatAdapters,
} from './adapters/openai-compat-adapter.js';
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
  const sandboxActive = detectSandbox().active;
  const env = readOpenAICompatEnv();
  if (env === null) {
    handleMissingEnv(logger, sandboxActive);
    return undefined;
  }

  const result = await buildOpenAICompatAdapters();
  if (result === null) return undefined; // env-was-set guard; build contract allows it
  if (!result.ok) {
    handleProbeFailure(logger, sandboxActive, result.error.message);
    return undefined;
  }
  if (result.value.length === 0) {
    handleZeroModels(logger, sandboxActive);
    return undefined;
  }

  // Log the discovered model IDs at info level — operators want to confirm
  // the gateway's catalog matches what they configured upstream. The API
  // key never reaches logs (env-only read).
  logger.info('OpenAI-compatible gateway wired', {
    baseUrl: env.baseUrl,
    modelCount: result.value.length,
    models: result.value.map((a) => a.modelId),
  });
  return result.value;
}

export async function tryWireGatewayAdapter(logger: ILogger): Promise<IModelAdapter | undefined> {
  const all = await tryWireGatewayAdapters(logger);
  return all?.[0];
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
