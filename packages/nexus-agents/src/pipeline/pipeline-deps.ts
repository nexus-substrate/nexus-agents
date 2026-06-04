/**
 * PipelineDeps — explicit dependency seam for the pipeline engine (#3175).
 *
 * The reusable engine (`PipelineRunner`) previously reached for the process-global
 * `PluginRegistry` singleton inline (`getPipelinePluginRegistry()`) — an *implicit*
 * dependency that made independent in-process pipelines and test isolation awkward.
 * This module makes that dependency *explicit*: callers pass a `PipelineDeps` bundle
 * and any unset field falls back to its documented global default. Behavior is
 * unchanged when nothing is injected (the resolved value IS the singleton).
 *
 * Scope note (verified for #3175): the `EventBus` is already injected via
 * `PipelineExecuteOptions.eventBus`, and its global fallback already lives in one
 * authority — `pipeline-observability.resolveBus()`. The `ArtifactStore` is not
 * consumed by the runner today; an injectable `ArtifactStore`/`OutcomeStore` lands
 * with #3145 and will extend this same bundle. So this seam intentionally covers
 * only the one dependency the engine actually resolves implicitly today — the
 * `PluginRegistry` — rather than introduce unconsumed fields.
 *
 * @module pipeline/pipeline-deps
 */
import { getPipelinePluginRegistry } from './core-plugins.js';

import type { IPluginRegistry } from './plugin-types.js';

/**
 * Injectable pipeline dependencies. Every field is optional; an unset field
 * falls back to its documented process-global default at resolve time.
 */
export interface PipelineDeps {
  /**
   * Plugin registry for resolving stage handlers. Defaults to the global
   * pipeline registry (`getPipelinePluginRegistry()`) when unset.
   */
  readonly pluginRegistry?: IPluginRegistry;
}

/** Fully-resolved pipeline dependencies — every field concrete. */
export interface ResolvedPipelineDeps {
  readonly pluginRegistry: IPluginRegistry;
}

/**
 * Resolves a {@link PipelineDeps} bundle, filling any unset field from its
 * documented global default. An injected field is returned untouched; an omitted
 * field returns the process-global default. The only side effect is the lazy,
 * idempotent creation of the global registry inside `getPipelinePluginRegistry()`.
 */
export function resolvePipelineDeps(deps?: PipelineDeps): ResolvedPipelineDeps {
  return {
    pluginRegistry: deps?.pluginRegistry ?? getPipelinePluginRegistry(),
  };
}
