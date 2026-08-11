/**
 * AvailableModelsCache (#2540 PR 6 of 8).
 *
 * Central, harness-driven view of what models the runtime can actually
 * dispatch to right now. PR 5 added `listModels()` on direct-API adapters
 * (Anthropic, Google, OpenAI gateway) and on the OpenCode CLI adapter;
 * this cache stitches those probes together into one queryable surface.
 *
 * Design invariants:
 *
 *   1. Sources are the source of truth — if a harness drops a model,
 *      the registry never decides it's still routable. The
 *      `ModelRegistry` (PR 1) answers "how should this model behave"
 *      while this cache answers "is this model routable at all".
 *
 *   2. Stale-while-revalidate: serve the most recent successful result
 *      while a refresh runs in the background, so callers never block on
 *      a slow `models.list` round-trip.
 *
 *   3. One bad source must not poison the others. A failing `listModels`
 *      logs and is excluded from the next snapshot; remaining sources
 *      remain queryable.
 *
 *   4. No persistence. Process-local cache only — operators restart and
 *      get a fresh probe. Persistence belongs in PR 7 if it's needed.
 */

import { createLogger } from '../core/logger.js';

const logger = createLogger({ component: 'available-models-cache' });

/** Default freshness TTL: 5 minutes — matches per-adapter listModels TTL. */
const DEFAULT_TTL_MS = 5 * 60 * 1000;
/** Default stale TTL: 25 minutes — beyond this, callers wait on a refresh. */
const DEFAULT_STALE_TTL_MS = 25 * 60 * 1000;

/**
 * One adapter (CLI or API) that can be asked what models it currently has.
 * Exists so this cache doesn't have to know about IModelAdapter vs
 * ICliAdapter — both can adapt themselves to this minimal surface.
 */
export interface AvailableModelsSource {
  /** Stable, human-readable identifier — e.g. `claude`, `gateway-openrouter`. */
  readonly name: string;
  /**
   * Optional vendor-family hint — `anthropic` / `openai` / `google` / etc.
   * Used to pre-tag entries when the source's own model ids don't carry
   * a `provider/` prefix (Anthropic API, Google API).
   */
  readonly providerHint?: string;
  /** Probe the underlying surface for currently available models. */
  listModels(): Promise<readonly { id: string }[]>;
}

/** One row in the cache: model id + which source first reported it. */
export interface AvailableModel {
  readonly id: string;
  readonly source: string;
  /** `provider/` prefix when the source uses one; otherwise the providerHint. */
  readonly provider?: string;
}

export interface AvailableModelsCacheOptions {
  readonly sources: readonly AvailableModelsSource[];
  /** Freshness TTL (ms). Defaults to 5 minutes. */
  readonly ttlMs?: number;
  /** Beyond this, callers block on the next refresh. Defaults to 25 minutes. */
  readonly staleTtlMs?: number;
  /** Override `Date.now` for tests. */
  readonly now?: () => number;
}

interface SourceState {
  value: readonly AvailableModel[] | null;
  fetchedAt: number;
  inFlight: Promise<readonly AvailableModel[]> | null;
}

export class AvailableModelsCache {
  private sources: AvailableModelsSource[];
  private readonly ttlMs: number;
  private readonly staleTtlMs: number;
  private readonly now: () => number;
  private readonly states: Map<string, SourceState>;

  constructor(options: AvailableModelsCacheOptions) {
    this.sources = [...options.sources];
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.staleTtlMs = options.staleTtlMs ?? DEFAULT_STALE_TTL_MS;
    this.now = options.now ?? Date.now;
    this.states = new Map();
    for (const s of this.sources) {
      this.states.set(s.name, { value: null, fetchedAt: 0, inFlight: null });
    }
  }

  /**
   * Register a source after construction. Used by adapter factories that
   * wire themselves into the default cache lazily as they're built.
   * Duplicate names are ignored (first registration wins, on the
   * assumption that the same factory might run twice in a test session).
   */
  addSource(source: AvailableModelsSource): void {
    if (this.states.has(source.name)) return;
    this.sources.push(source);
    this.states.set(source.name, { value: null, fetchedAt: 0, inFlight: null });
  }

  /**
   * Remove a previously-registered source. Used by tests + by factories
   * that want to drop a probe when an adapter is being disposed.
   */
  removeSource(name: string): void {
    this.sources = this.sources.filter((s) => s.name !== name);
    this.states.delete(name);
  }

  /**
   * Returns the union of every source's available models. Stale-while-
   * revalidate: serve fresh-or-stale immediately, refresh stale entries
   * in the background. First call (no cache yet) blocks on every source.
   */
  async getAll(): Promise<readonly AvailableModel[]> {
    const probes = this.sources.map((s) => this.probeOne(s));
    const results = await Promise.all(probes);
    const out: AvailableModel[] = [];
    for (const r of results) {
      for (const m of r) out.push(m);
    }
    return out;
  }

  /** Models reported by one named source (subset of getAll). */
  async byProvider(sourceName: string): Promise<readonly AvailableModel[]> {
    const all = await this.getAll();
    return all.filter((m) => m.source === sourceName);
  }

  /** True iff some source currently reports the given model id. */
  async has(modelId: string): Promise<boolean> {
    const all = await this.getAll();
    return all.some((m) => m.id === modelId);
  }

  /** Force a synchronous refresh of every source — used after a 404. */
  async refresh(): Promise<readonly AvailableModel[]> {
    for (const s of this.sources) {
      const state = this.states.get(s.name);
      if (state === undefined) continue;
      state.fetchedAt = 0;
      state.value = null;
    }
    return this.getAll();
  }

  /**
   * Probe one source. Returns:
   *  - cached value if still fresh
   *  - cached value AND kicks a background refresh if stale-but-not-expired
   *  - blocks on the source if no cache or fully expired
   *
   * Source errors yield an empty list (logged) so one bad source can't
   * poison the union.
   */
  private async probeOne(source: AvailableModelsSource): Promise<readonly AvailableModel[]> {
    const state = this.getState(source.name);
    const age = this.now() - state.fetchedAt;

    if (state.value !== null && age < this.ttlMs) {
      return state.value;
    }
    if (state.value !== null && age < this.staleTtlMs) {
      state.inFlight ??= this.fetchSource(source).finally(() => {
        state.inFlight = null;
      });
      return state.value;
    }
    if (state.inFlight !== null) return state.inFlight;
    state.inFlight = this.fetchSource(source).finally(() => {
      state.inFlight = null;
    });
    return state.inFlight;
  }

  private async fetchSource(source: AvailableModelsSource): Promise<readonly AvailableModel[]> {
    const state = this.getState(source.name);
    try {
      const raw = await source.listModels();
      const value = raw.map((m) => normaliseEntry(m, source));
      state.value = value;
      state.fetchedAt = this.now();
      return value;
    } catch (e: unknown) {
      logger.warn('AvailableModelsCache source probe failed', {
        source: source.name,
        error: e instanceof Error ? e.message : String(e),
      });
      // Keep the stale value if we have one; otherwise empty.
      return state.value ?? [];
    }
  }

  private getState(name: string): SourceState {
    const state = this.states.get(name);
    // Constructor seeds an entry for every configured source, and the public
    // surface only routes through `this.sources`, so a missing state would
    // be a programming error — surface it loudly rather than masking it.
    if (state === undefined) {
      throw new Error(`AvailableModelsCache: unknown source "${name}"`);
    }
    return state;
  }
}

function normaliseEntry(raw: { id: string }, source: AvailableModelsSource): AvailableModel {
  const slash = raw.id.indexOf('/');
  if (slash > 0 && slash < raw.id.length - 1) {
    return { id: raw.id, source: source.name, provider: raw.id.slice(0, slash) };
  }
  if (source.providerHint !== undefined) {
    return { id: raw.id, source: source.name, provider: source.providerHint };
  }
  return { id: raw.id, source: source.name };
}

// ============================================================================
// Default (process-singleton) instance — read by the `list_available_models`
// MCP tool and the composite router. Operators that need a different cache
// (different TTLs, custom sources) can override via
// `setDefaultAvailableModelsCache` at startup.
// ============================================================================

let defaultCache: AvailableModelsCache | null = null;

/**
 * Get (or lazily construct) the process-default cache. Starts with no
 * sources — callers register them via `addSource`. Until at least one
 * source is added the cache returns empty snapshots, so every consumer
 * must treat an empty result as "unknown", not as "no models exist".
 */
export function getDefaultAvailableModelsCache(): AvailableModelsCache {
  defaultCache ??= new AvailableModelsCache({ sources: [] });
  return defaultCache;
}

/**
 * Override the default cache. Useful for tests and for operators that
 * want a pre-populated cache wired at startup.
 */
export function setDefaultAvailableModelsCache(cache: AvailableModelsCache | null): void {
  defaultCache = cache;
}
