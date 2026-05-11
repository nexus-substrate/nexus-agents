/**
 * withModelNotFoundFallback (#2540 PR 8 of 8).
 *
 * Wraps an `IModelAdapter` so that calls that fail with `MODEL_NOT_FOUND`
 * (404 / "model is deprecated" / etc.) are retried once with the closest
 * available alternative from the same vendor family — picked from the
 * adapter's `listModels()` and the registry.
 *
 * Why this exists: nexus-agents has historically baked model ids into
 * configuration. When a vendor retires a model (Codex on GPT-5.4 vs an
 * older 5.1, Claude bumping minor versions, etc.), the next request 404s.
 * This primitive turns that 404 into a single observable retry against
 * the latest sibling — operators see the retirement in the log, work
 * keeps moving, and the cache (PR 6) is invalidated so subsequent calls
 * pick up the new ground truth.
 *
 * Design notes:
 *   - Single retry only. If the fallback also 404s, surface the second
 *     error (callers can escalate). Don't loop — that risks wedging.
 *   - The wrapper keeps the same `providerId`/`modelId` shape as the
 *     wrapped adapter so downstream consumers (telemetry, OutcomeStore)
 *     don't see schema changes. The chosen fallback id appears in
 *     `errorMessage` of the original error and in the logger.
 *   - `stream()` is left as passthrough — streaming retries belong in
 *     a future iteration where partial-result reconciliation is handled.
 */

import type {
  CompletionRequest,
  CompletionResponse,
  IModelAdapter,
  ModelError,
  Result,
  StreamChunk,
} from '../core/index.js';
import { err, ErrorCode, ok, ModelError as ModelErrorClass } from '../core/index.js';
import { createLogger } from '../core/logger.js';
import { getDefaultRegistry, type ModelRegistry } from '../config/model-registry.js';
import {
  type AvailableModelsCache,
  getDefaultAvailableModelsCache,
} from '../config/available-models-cache.js';

const logger = createLogger({ component: 'model-not-found-fallback' });

export interface ModelNotFoundFallbackOptions {
  /**
   * Process-local cache of routable models. Refreshed on a 404. Defaults
   * to `getDefaultAvailableModelsCache()` — passing one explicitly is the
   * right move for tests and for multi-cache topologies.
   */
  readonly cache?: AvailableModelsCache;
  /** Registry used to resolve vendor/family from a model id. Defaults to global. */
  readonly registry?: ModelRegistry;
  /**
   * Optional adapter factory used to build a new IModelAdapter for the
   * fallback model id. When provided, the wrapper retries through the
   * factory's adapter. When omitted, the wrapper logs + emits a
   * `MODEL_NOT_FOUND` error enriched with the suggested fallback id —
   * the caller (orchestrator / router) is responsible for re-routing.
   */
  readonly adapterFactory?: (modelId: string) => IModelAdapter;
  /**
   * Optional callback invoked when a retirement is detected. Use for
   * telemetry / sticky-state updates. Failures in the callback are
   * swallowed — the user's call is what matters.
   */
  readonly onRetirement?: (info: RetirementInfo) => void;
}

export interface RetirementInfo {
  readonly retiredModelId: string;
  readonly fallbackModelId: string;
  readonly providerId: string;
  readonly errorMessage: string;
}

/**
 * Decorate an IModelAdapter with retire-and-retry. Behaviour:
 *
 *  1. Forward `complete(request)` to the inner adapter.
 *  2. On `MODEL_NOT_FOUND`: refresh the cache, find the closest
 *     same-family alternative, retry once with `request.model =
 *     <fallback>`. Original error is returned if no fallback found.
 *  3. The wrapper returns the SECOND error if the retry also fails.
 *  4. `stream`, `countTokens`, `validateConfig`, `listModels` are
 *     passthrough.
 */
export function withModelNotFoundFallback(
  inner: IModelAdapter,
  options: ModelNotFoundFallbackOptions = {}
): IModelAdapter {
  const registry = options.registry ?? getDefaultRegistry();
  const cache = options.cache ?? getDefaultAvailableModelsCache();
  const resolvedOptions: ResolvedOptions = {
    cache,
    registry,
    adapterFactory: options.adapterFactory,
    onRetirement: options.onRetirement,
  };
  const wrapped: IModelAdapter = {
    providerId: inner.providerId,
    modelId: inner.modelId,
    capabilities: inner.capabilities,
    countTokens: (text) => inner.countTokens(text),
    validateConfig: () => inner.validateConfig(),
    stream: (request: CompletionRequest): AsyncIterable<StreamChunk> => inner.stream(request),
    complete: (request: CompletionRequest) => completeWithFallback(inner, request, resolvedOptions),
  };
  if (typeof inner.listModels === 'function') {
    const list = inner.listModels.bind(inner);
    wrapped.listModels = () => list();
  }
  return wrapped;
}

interface ResolvedOptions {
  readonly cache: AvailableModelsCache;
  readonly registry: ModelRegistry;
  readonly adapterFactory?: ((modelId: string) => IModelAdapter) | undefined;
  readonly onRetirement?: ((info: RetirementInfo) => void) | undefined;
}

async function completeWithFallback(
  inner: IModelAdapter,
  request: CompletionRequest,
  options: ResolvedOptions
): Promise<Result<CompletionResponse, ModelError>> {
  const first = await inner.complete(request);
  if (first.ok) return first;
  if (first.error.code !== ErrorCode.MODEL_NOT_FOUND) return first;

  const fallback = await pickFallback(inner.modelId, options.cache, options.registry);
  if (fallback === null) {
    logger.warn('Model not found and no fallback available', {
      modelId: inner.modelId,
      providerId: inner.providerId,
      errorMessage: first.error.message,
    });
    return first;
  }

  logger.info('Model retirement detected; retrying with fallback', {
    retiredModelId: inner.modelId,
    fallbackModelId: fallback,
    providerId: inner.providerId,
  });
  notifyRetirement(options.onRetirement, {
    retiredModelId: inner.modelId,
    fallbackModelId: fallback,
    providerId: inner.providerId,
    errorMessage: first.error.message,
  });

  // No factory wired → enrich the original error with a suggested
  // fallback id and let the caller decide. This is the safe default
  // for adapters where reconfiguring per-call isn't supported.
  if (options.adapterFactory === undefined) {
    return err(
      new ModelErrorClass(`${first.error.message} — suggested fallback: ${fallback}`, {
        code: ErrorCode.MODEL_NOT_FOUND,
        cause: first.error,
      })
    );
  }

  const fallbackAdapter = options.adapterFactory(fallback);
  const retried = await fallbackAdapter.complete(request);
  if (retried.ok) return retried;
  // Surface the SECOND error so callers see the retry's failure
  // mode, not the (already-handled) original 404.
  return err(
    new ModelErrorClass(`Fallback ${fallback} also failed: ${retried.error.message}`, {
      code: retried.error.code,
      cause: retried.error,
    })
  );
}

function notifyRetirement(
  cb: ((info: RetirementInfo) => void) | undefined,
  info: RetirementInfo
): void {
  if (cb === undefined) return;
  try {
    cb(info);
  } catch (e: unknown) {
    logger.debug('onRetirement callback threw', {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Pick the closest available alternative to a retired model. Strategy:
 *   1. Refresh the cache (the retirement signal is authoritative).
 *   2. Resolve the retired id's vendor + family via the registry.
 *   3. Among the now-available ids, take the first match in the same
 *      family. If none match family, fall back to vendor.
 *   4. If still nothing, return null — surfaces the original error.
 *
 * Deliberately simple — picking the "best" sibling deserves its own
 * scoring/ranking pass; here we just need ANY same-family id to keep
 * the user moving. Caller logs both ids so the behaviour is auditable.
 */
async function pickFallback(
  retiredModelId: string,
  cache: AvailableModelsCache,
  registry: ModelRegistry
): Promise<string | null> {
  const refreshed = await cache.refresh();
  if (refreshed.length === 0) return null;
  const target = registry.getEntry(retiredModelId);

  const sameFamily = refreshed.find((m) => {
    if (m.id === retiredModelId) return false;
    const candidate = registry.getEntry(m.id);
    return candidate.family === target.family && candidate.vendor === target.vendor;
  });
  if (sameFamily !== undefined) return sameFamily.id;

  const sameVendor = refreshed.find((m) => {
    if (m.id === retiredModelId) return false;
    const candidate = registry.getEntry(m.id);
    return candidate.vendor === target.vendor;
  });
  return sameVendor?.id ?? null;
}

// Re-export ok for tests that synthesise success results.
export { ok };

// ============================================================================
// Resilient-adapter aware wrapper (#2549).
//
// `withModelNotFoundFallback` returns an `IModelAdapter` — fine for direct-API
// adapters that satisfy that surface directly. For `IResilientAdapter` callers
// who also depend on `getHealth` / `refresh` / `setPreferredCli` / `onFailover`
// / `dispose`, this helper preserves those methods while routing `complete()`
// through the fallback path.
// ============================================================================

/**
 * Minimal shape of `IResilientAdapter` — duplicated here as a local
 * type so that `model-not-found-fallback.ts` doesn't acquire a circular
 * import with `adapters/resilient-adapter-types.ts`. The shape matches
 * the resilient adapter's extension methods over `IModelAdapter`.
 */
export interface ResilientLike extends IModelAdapter {
  getHealth(): unknown;
  refresh(): Promise<void>;
  setPreferredCli(cli: unknown): void;
  onFailover(cb: (info: unknown) => void): () => void;
  dispose(): void;
}

/**
 * Wrap an `IResilientAdapter` (or anything that satisfies `ResilientLike`)
 * so its `complete()` path retries on MODEL_NOT_FOUND while its
 * health/lifecycle methods continue to work unchanged.
 */
export function wrapResilientWithFallback<T extends ResilientLike>(
  inner: T,
  options: ModelNotFoundFallbackOptions = {}
): T {
  const wrapped = withModelNotFoundFallback(inner, options);
  // Object.assign re-attaches the resilient-specific methods bound to
  // the original adapter so health/lifecycle behaviour is unchanged.
  return Object.assign(wrapped, {
    getHealth: inner.getHealth.bind(inner),
    refresh: inner.refresh.bind(inner),
    setPreferredCli: inner.setPreferredCli.bind(inner),
    onFailover: inner.onFailover.bind(inner),
    dispose: inner.dispose.bind(inner),
  }) as unknown as T;
}
