/**
 * One gateway discovery per process, for every process (#4392).
 *
 * Discovery (`GET /v1/models`, `buildOpenAICompatAdapters`) used to run only
 * in the MCP server bootstrap (`cli-server-gateway.ts`). A CLI process —
 * `nexus-agents orchestrate`, or any direct `createAutoAdapter` caller — never
 * had a catalogue, so every gateway-aware path fell back to its no-gateway
 * branch: the family slots stayed `inactive` and the `custom-openai` fallback
 * sent `NEXUS_CUSTOM_MODEL ?? 'gpt-5.5'` to a gateway that might not serve it.
 *
 * This module memoizes the discovery for the process:
 *
 * - {@link discoverGatewayOnce} — the one probe. The server bootstrap awaits
 *   it and handles the outcome itself (sandbox exits, arm registration), so a
 *   server never probes twice.
 * - {@link ensureGatewayCatalogue} — the lazy path. Called on first adapter
 *   use (through `ensureGatewayDiscovered`), it runs the probe if nothing has
 *   and registers the family-slot catalogue on success. When the bootstrap
 *   already ran the probe it only waits for it: registration is the
 *   bootstrap's.
 *
 * Outcomes, named (the empty case included):
 * - no gateway configured → `not_configured`: nothing registered, every
 *   caller's behaviour is what it was before this module existed;
 * - models discovered → `discovered`: the catalogue is registered;
 * - probe failed, threw, refused, or listed zero models → `failed`: logged
 *   once, nothing registered. Callers that still send a model read
 *   {@link gatewayDiscoveryStatus} and say the model is unverified
 *   (`auto-adapter.ts` `customModelChoice`) instead of sending it as if valid.
 *
 * A failed lazy probe is not retried in this process: a CLI process is short
 * and the operator sees the warning. The long-lived server retries through
 * `gateway-rediscovery.ts`, which is unaffected.
 *
 * @module adapters/gateway-discovery
 */

import type { ILogger, IModelAdapter } from '../core/index.js';
import { createLogger, err, getErrorMessage, ConfigError } from '../core/index.js';
import type { buildOpenAICompatAdapters } from './openai-compat-adapter.js';
import { logGatewaySlotMapping, setGatewaySlotCatalog } from './gateway-family-slots.js';

/** One discovery's raw result, as `buildOpenAICompatAdapters` returns it. */
export type GatewayDiscoveryResult = Awaited<ReturnType<typeof buildOpenAICompatAdapters>>;

/** Where this process's discovery stands. */
export type GatewayDiscoveryStatus =
  'unattempted' | 'pending' | 'not_configured' | 'discovered' | 'failed';

const defaultLogger = createLogger({ component: 'gateway-discovery' });

let probe: Promise<GatewayDiscoveryResult> | undefined;
let settled: { readonly result: GatewayDiscoveryResult } | undefined;
let lazy: Promise<void> | undefined;

/**
 * The process's one discovery probe; every call after the first returns the
 * same promise. Never rejects: a thrown probe becomes an error result.
 */
export function discoverGatewayOnce(
  logger: ILogger = defaultLogger
): Promise<GatewayDiscoveryResult> {
  probe ??= runProbe(logger).then((result) => {
    settled = { result };
    return result;
  });
  return probe;
}

async function runProbe(logger: ILogger): Promise<GatewayDiscoveryResult> {
  try {
    // Loaded on first probe, not at import: this module sits under
    // `gateway-rediscovery.ts`, which every resilient adapter imports, and the
    // openai-compat chain (the `openai` SDK) should not load with it.
    const { buildOpenAICompatAdapters: build } = await import('./openai-compat-adapter.js');
    return await build(logger);
  } catch (error: unknown) {
    return err(new ConfigError(`Gateway discovery threw: ${getErrorMessage(error)}`));
  }
}

/** Where this process's discovery stands; see the module doc for each value. */
export function gatewayDiscoveryStatus(): GatewayDiscoveryStatus {
  if (probe === undefined) return 'unattempted';
  if (settled === undefined) return 'pending';
  const { result } = settled;
  if (result === null) return 'not_configured';
  return discoveredModels(result) === undefined ? 'failed' : 'discovered';
}

/** The discovered models, or undefined for a failed or empty discovery. */
function discoveredModels(
  result: NonNullable<GatewayDiscoveryResult>
): readonly IModelAdapter[] | undefined {
  return result.ok && result.value.length > 0 ? result.value : undefined;
}

/**
 * Make sure this process has tried discovery, registering the family-slot
 * catalogue when the probe is this call's. Never rejects.
 */
export function ensureGatewayCatalogue(logger: ILogger = defaultLogger): Promise<void> {
  if (lazy !== undefined) return lazy;
  // The bootstrap's probe: it registers what it found itself.
  if (probe !== undefined) return probe.then(() => undefined);
  lazy = discoverGatewayOnce(logger).then((result) => {
    registerLazily(result, logger);
  });
  return lazy;
}

function registerLazily(result: GatewayDiscoveryResult, logger: ILogger): void {
  if (result === null) return; // not configured: the named empty case
  const models = discoveredModels(result);
  if (models === undefined) {
    logger.warn(
      'OpenAI-compatible gateway discovery failed in this process: no gateway catalogue, so ' +
        'gateway family slots are unavailable and a custom-openai fallback model is unverified',
      { error: result.ok ? 'the gateway listed 0 models' : result.error.message }
    );
    return;
  }
  setGatewaySlotCatalog(models);
  logger.info('OpenAI-compatible gateway discovered on first use', {
    modelCount: models.length,
  });
  logGatewaySlotMapping(logger);
}

/** Test-only: forget this process's discovery. */
export function _resetGatewayDiscovery(): void {
  probe = undefined;
  settled = undefined;
  lazy = undefined;
}
