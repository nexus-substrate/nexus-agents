/**
 * Registers live model-discovery sources onto an AvailableModelsCache (#3404).
 *
 * The cache + the CLI-level routing pre-filter (`getCandidateCliNames`) and the
 * 404 fallback already exist, but in production the cache had **no sources**, so
 * it was always empty and the pre-filter was inert. This wires:
 *  - the OpenRouter live catalog (`createOpenRouterModelsSource`), named
 *    `openrouter` — it feeds existence checks (`cache.has()`), the 404 fallback,
 *    and the Phase 2 alias resolver; it does NOT drive the CLI pre-filter (its
 *    name is not a CLI name), which is intentional, and
 *  - every adapter that implements `listModels()` (opencode + SDK adapters),
 *    named by its CLI so `getCandidateCliNames` CAN filter on it.
 *
 * Opt-in: gated by the boolean `NEXUS_DYNAMIC_MODELS` (`true`/`1`; default OFF
 * for the initial ship; the flag flips ON in a follow-up once telemetry + QA
 * confirm it, per the project's gated default-off→on discipline). Every source is fail-OPEN — a failing probe
 * yields `[]`, never an exception, so registration can never wedge routing.
 *
 * @module config/register-model-sources
 */

import { createOpenRouterModelsSource } from './openrouter-models-source.js';
import { parseBoolEnv } from './defaults-env.js';
import { routingArmDisplaySlot } from '../cli-adapters/types.js';
import type { RoutingArmId } from '../cli-adapters/types.js';

import type { AvailableModelsCache, AvailableModelsSource } from './available-models-cache.js';

/** Whether dynamic model discovery is enabled (opt-in; default OFF). */
export function isDynamicModelsEnabled(): boolean {
  return parseBoolEnv('NEXUS_DYNAMIC_MODELS', false);
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
 * Wrap an adapter's `listModels()` as a cache source named for its CLI (so
 * `getCandidateCliNames` filters on it).
 *
 * Probe failures propagate (#5059). Catching them here returned `[]`, which
 * reached `AvailableModelsCache` on the SUCCESS path: the empty list replaced
 * a good catalog and was stamped fresh for the whole TTL. The cache has always
 * had the right handling for a rejection — keep the stale value, do not
 * restamp — it just never ran. One bad source still cannot poison the union;
 * that isolation lives in the cache, one level up, where it can tell a failed
 * probe from an empty one.
 */
function adapterSource(cliName: string, adapter: ListsModels): AvailableModelsSource {
  return {
    name: cliName,
    listModels: () => adapter.listModels().then((models) => models.map((m) => ({ id: m.id }))),
  };
}

export interface RegisterModelSourcesOptions {
  /** Include the OpenRouter live catalog source (default true). */
  readonly includeOpenRouter?: boolean;
}

/**
 * Build (but don't register) the default discovery sources: the OpenRouter live
 * catalog + a CLI-named source per adapter exposing `listModels()`. Used both by
 * {@link registerDefaultModelSources} and by the `list_available_models` tool to
 * probe each transport for health (#3406).
 */
export function buildDefaultModelSources(
  adapters: ReadonlyMap<string, unknown>,
  opts: RegisterModelSourcesOptions = {}
): AvailableModelsSource[] {
  const sources: AvailableModelsSource[] = [];
  if (opts.includeOpenRouter !== false) {
    sources.push(createOpenRouterModelsSource());
  }
  for (const [key, adapter] of adapters) {
    if (hasListModels(adapter)) {
      // #3425: the router's adapter map can be keyed by api:* arm ids (#3422).
      // Register the source under the display CLI slot so no api:* literal leaks
      // into the model-source registry; the cache de-dups by name, so when both
      // a CLI slot and its api arm are present the CLI source wins.
      const slot = routingArmDisplaySlot(key as RoutingArmId);
      sources.push(adapterSource(slot, adapter));
    }
  }
  return sources;
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
  for (const source of buildDefaultModelSources(adapters, opts)) {
    cache.addSource(source);
  }
}
