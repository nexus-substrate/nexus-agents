/**
 * nexus-agents/config - Model Availability Probes & Fallback Chains
 *
 * Runtime availability tracking for model APIs. Maintains a bounded
 * TTL cache of probe results and provides fallback chain resolution
 * when a model is unavailable.
 *
 * @module config/model-availability
 * (Source: Issue #869)
 */

import type { ModelId, CliNameLiteral } from './model-capabilities-types.js';
import { DEFAULT_MODEL_PER_CLI } from './model-capabilities.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Status of a model probe. */
export interface ProbeResult {
  readonly modelId: ModelId;
  readonly available: boolean;
  readonly latencyMs: number;
  readonly checkedAt: number;
  readonly error?: string;
}

/** Configuration for the availability cache. */
export interface AvailabilityCacheConfig {
  /** Time-to-live in ms for probe results. Default: 60_000 (1 min). */
  readonly ttlMs?: number;
  /** Maximum entries in the cache. Default: 50. */
  readonly maxEntries?: number;
}

/** A function that probes whether a model is reachable. */
export type ProbeFn = (modelId: ModelId) => Promise<ProbeResult>;

/** Fallback chain entry with model and reason for fallback. */
export interface FallbackEntry {
  readonly modelId: ModelId;
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// Availability Cache
// ---------------------------------------------------------------------------

const DEFAULT_TTL_MS = 60_000;
const DEFAULT_MAX_ENTRIES = 50;

/**
 * Bounded TTL cache for model availability probe results.
 * Thread-safe for single-threaded Node.js; no locks needed.
 */
export class AvailabilityCache {
  private readonly cache = new Map<ModelId, ProbeResult>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(config: AvailabilityCacheConfig = {}) {
    this.ttlMs = config.ttlMs ?? DEFAULT_TTL_MS;
    this.maxEntries = config.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  /** Get a cached probe result, or undefined if expired/missing. */
  get(modelId: ModelId): ProbeResult | undefined {
    const entry = this.cache.get(modelId);
    if (entry === undefined) return undefined;
    if (Date.now() - entry.checkedAt > this.ttlMs) {
      this.cache.delete(modelId);
      return undefined;
    }
    return entry;
  }

  /** Store a probe result, evicting oldest if at capacity. */
  set(result: ProbeResult): void {
    if (this.cache.size >= this.maxEntries && !this.cache.has(result.modelId)) {
      const oldest = this.cache.keys().next();
      if (oldest.done !== true) {
        this.cache.delete(oldest.value);
      }
    }
    this.cache.set(result.modelId, result);
  }

  /** Mark a model as unavailable without a full probe. */
  markUnavailable(modelId: ModelId, error: string): void {
    this.set({
      modelId,
      available: false,
      latencyMs: 0,
      checkedAt: Date.now(),
      error,
    });
  }

  /** Mark a model as available. */
  markAvailable(modelId: ModelId, latencyMs: number): void {
    this.set({
      modelId,
      available: true,
      latencyMs,
      checkedAt: Date.now(),
    });
  }

  /** Check if a model is known-unavailable (cached and not expired). */
  isKnownUnavailable(modelId: ModelId): boolean {
    const entry = this.get(modelId);
    return entry !== undefined && !entry.available;
  }

  /** Get all cached entries (for diagnostics). */
  entries(): ReadonlyArray<ProbeResult> {
    return [...this.cache.values()];
  }

  /** Number of cached entries. */
  get size(): number {
    return this.cache.size;
  }

  /** Clear all cached entries. */
  clear(): void {
    this.cache.clear();
  }
}

// ---------------------------------------------------------------------------
// Fallback Chain Resolution
// ---------------------------------------------------------------------------

/** Default fallback order per CLI (strongest → weakest). */
const FALLBACK_CHAINS: Readonly<Record<CliNameLiteral, readonly ModelId[]>> = {
  claude: ['claude-opus', 'claude-sonnet', 'claude-haiku'],
  gemini: ['gemini-3-pro', 'gemini-pro', 'gemini-3-flash', 'gemini-flash'],
  codex: ['codex-5.3', 'codex-5.2', 'codex-5.1-mini'],
  opencode: ['opencode-default'],
};

/**
 * Resolves a fallback chain for a given model.
 * Returns the first available model in the chain, skipping known-unavailable ones.
 */
export function resolveFallback(modelId: ModelId, cache: AvailabilityCache): FallbackEntry | null {
  const cli = getCliForModelId(modelId);
  if (cli === undefined) return null;

  const chain = FALLBACK_CHAINS[cli];
  for (const candidate of chain) {
    if (candidate === modelId) continue;
    if (!cache.isKnownUnavailable(candidate)) {
      return {
        modelId: candidate,
        reason: `Fallback from ${modelId} (unavailable) to ${candidate}`,
      };
    }
  }
  return null;
}

/**
 * Get the fallback chain for a CLI tool.
 */
export function getFallbackChain(cli: CliNameLiteral): readonly ModelId[] {
  return FALLBACK_CHAINS[cli];
}

/**
 * Get the CLI name for a model ID.
 */
export function getCliForModelId(modelId: ModelId): CliNameLiteral | undefined {
  for (const [cli, defaultModel] of Object.entries(DEFAULT_MODEL_PER_CLI)) {
    const chain = FALLBACK_CHAINS[cli as CliNameLiteral];
    if (chain.includes(modelId)) return cli as CliNameLiteral;
    if (defaultModel === modelId) return cli as CliNameLiteral;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Singleton Cache (shared across the process)
// ---------------------------------------------------------------------------

let globalCache: AvailabilityCache | undefined;

/** Get the shared availability cache (lazy-init). */
export function getAvailabilityCache(): AvailabilityCache {
  globalCache ??= new AvailabilityCache();
  return globalCache;
}

/** Reset the global cache (for testing). */
export function resetAvailabilityCache(): void {
  globalCache = undefined;
}

// ---------------------------------------------------------------------------
// Filter Integration
// ---------------------------------------------------------------------------

/**
 * Filters out known-unavailable models from a set of model IDs.
 * Returns the filtered set, or null if no models were removed.
 * Used by scoreAllModels() to skip unavailable models.
 */
export function filterAvailableModels(
  modelIds: readonly string[],
  cache: AvailabilityCache
): { available: string[]; removed: string[] } {
  const available: string[] = [];
  const removed: string[] = [];
  for (const id of modelIds) {
    if (cache.isKnownUnavailable(id as ModelId)) {
      removed.push(id);
    } else {
      available.push(id);
    }
  }
  return { available, removed };
}
