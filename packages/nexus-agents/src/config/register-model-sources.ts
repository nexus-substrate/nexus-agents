/**
 * Registers live model-discovery sources onto an AvailableModelsCache (#3404).
 *
 * The cache + the CLI-level routing pre-filter (`getCandidateCliNames`) and the
 * 404 fallback already exist, but in production the cache had **no sources**, so
 * it was always empty and the pre-filter was inert. This wires:
 *  - the OpenRouter live catalog (`createOpenRouterModelsSource`), and
 *  - every adapter that implements `listModels()` (opencode + SDK adapters),
 *    named by its CLI so `getCandidateCliNames` can filter on it.
 *
 * Opt-in: gated by `NEXUS_DYNAMIC_MODELS` (default OFF for the initial ship; the
 * flag flips ON in a follow-up once telemetry + QA confirm it, per the project's
 * gated default-off→on discipline). Every source is fail-OPEN — a failing probe
 * yields `[]`, never an exception, so registration can never wedge routing.
 *
 * @module config/register-model-sources
 */
import { createLogger } from '../core/index.js';

import { createOpenRouterModelsSource } from './openrouter-models-source.js';

import type { AvailableModelsCache, AvailableModelsSource } from './available-models-cache.js';

const logger = createLogger({ component: 'register-model-sources' });

/** Whether dynamic model discovery is enabled (opt-in; default OFF). */
export function isDynamicModelsEnabled(): boolean {
  return process.env['NEXUS_DYNAMIC_MODELS'] === 'true';
}

/** Minimal structural view of an adapter that can list its models. */
interface ListsModels {
  listModels(): Promise<readonly { id: string }[]>;
}

function hasListModels(adapter: unknown): adapter is ListsModels {
  return (
    typeof adapter === 'object' &&
    adapter !== null &&
    typeof (adapter as { listModels?: unknown }).listModels === 'function'
  );
}

/**
 * Wrap an adapter's `listModels()` as a fail-open cache source named for its CLI
 * (so `getCandidateCliNames` filters on it). Probe failures → `[]`.
 */
function adapterSource(cliName: string, adapter: ListsModels): AvailableModelsSource {
  return {
    name: cliName,
    listModels: () =>
      adapter
        .listModels()
        .then((models) => models.map((m) => ({ id: m.id })))
        .catch((error: unknown) => {
          logger.debug('adapter listModels failed; treating as empty', {
            cli: cliName,
            error: error instanceof Error ? error.message : String(error),
          });
          return [];
        }),
  };
}

export interface RegisterModelSourcesOptions {
  /** Include the OpenRouter live catalog source (default true). */
  readonly includeOpenRouter?: boolean;
}

/**
 * Register the default discovery sources onto `cache`. Idempotent per source
 * name (the cache ignores duplicate names). `adapters` is the CLI→adapter map
 * the router already builds; any adapter exposing `listModels()` becomes a
 * source. Safe to call unconditionally — callers gate on
 * {@link isDynamicModelsEnabled} for the opt-in rollout.
 */
export function registerDefaultModelSources(
  cache: AvailableModelsCache,
  adapters: ReadonlyMap<string, unknown>,
  opts: RegisterModelSourcesOptions = {}
): void {
  if (opts.includeOpenRouter !== false) {
    cache.addSource(createOpenRouterModelsSource());
  }
  for (const [cliName, adapter] of adapters) {
    if (hasListModels(adapter)) {
      cache.addSource(adapterSource(cliName, adapter));
    }
  }
}
