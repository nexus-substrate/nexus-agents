/**
 * Phase 5 of #2766 — thin {@link IMemoryBackend} adapters for tool-memory
 * backends so each one becomes discoverable through `getMemoryRegistry()`.
 *
 * Scope is intentionally narrow: each adapter exposes the underlying
 * backend's row count via `stats()` so `memory_stats` can read all four
 * domains from the unified registry. `read`/`write`/`query`/`delete` are
 * left as escape hatches — callers wanting CRUD continue to use the
 * underlying backend directly (HybridMemoryBackend, AgenticMemoryBackend,
 * etc.). Fully folding the storage into nexus-memory's SqliteBackend is
 * a follow-up Phase 5.1.
 *
 * @module mcp/tools/tool-memory-registry-adapters
 */

import { MemoryRegistry, hasMemoryRegistry, setMemoryRegistry } from 'nexus-memory';
import type { BackendStats, CliName, IMemoryBackend, QueryFilter, WriteMeta } from 'nexus-memory';

import { nexusDataPath } from '../../config/nexus-data-dir.js';

/** Default cap when a consumer omits `limit` in `query()`. */
const DEFAULT_SEARCH_LIMIT = 10;

/**
 * Pull the free-text search term out of a {@link QueryFilter}. Returns
 * `null` when the filter doesn't carry one, so callers can skip the search
 * dispatch entirely. The convention is `filter.where.text` — see
 * docs/architecture/memory-context-retrieval.md (Phase 1 of #2792).
 */
function extractSearchText(filter?: QueryFilter<unknown>): string | null {
  const where: unknown = filter?.where;
  if (where === null || where === undefined || typeof where !== 'object') return null;
  if (!('text' in where)) return null;
  const candidate = where.text;
  return typeof candidate === 'string' && candidate !== '' ? candidate : null;
}

/** Minimal "count + close" shape every tool-memory backend implements. */
export interface CountableBackend {
  /** Returns total row count (the heart of `memory_stats`). */
  count(): unknown;
  /** Idempotent close. */
  close?(): Promise<void> | void;
  /**
   * Optional native search surface used by {@link StatsOnlyAdapter.query}
   * (Phase 1 of #2792). When attached from `tool-memory.ts`, each backend
   * wires this to its idiomatic search call — `recallBySubject` for
   * beliefs, `searchAgentic` for A-MEM, `retrieveByPriority` for adaptive,
   * etc. Returns a flat array; the adapter is responsible for unwrapping
   * Result types and projecting to a useful shape (typically the raw
   * entry object, since consumers will project further).
   */
  search?(query: string, limit: number): Promise<readonly unknown[]>;
}

/**
 * Adapter that surfaces `count()` from an arbitrary tool-memory backend
 * as an `IMemoryBackend`. Methods other than `stats()` and `close()`
 * delegate to no-ops or rejections — call sites doing actual CRUD must
 * keep using the underlying backend directly until a deeper migration
 * folds the storage in.
 */
export class StatsOnlyAdapter implements IMemoryBackend<string, unknown> {
  readonly domain: string;
  private readonly backend: CountableBackend;

  constructor(domain: string, backend: CountableBackend) {
    this.domain = domain;
    this.backend = backend;
  }

  read(_key: string): Promise<unknown> {
    // Reads through the unified registry aren't wired yet. Callers wanting
    // actual data should fetch via the underlying backend.
    return Promise.resolve(undefined);
  }

  write(_key: string, _value: unknown, _meta?: WriteMeta): Promise<void> {
    return Promise.reject(
      new Error(
        `nexus-memory: domain "${this.domain}" is attached as stats-only; ` +
          `write through the underlying backend instead`
      )
    );
  }

  /**
   * Phase 1 of #2792: real query fan-out via the backend's native search.
   * Honors the free-text convention `filter.where.text`. Without a search
   * callback on the underlying backend (or without a text term), returns
   * `[]` — consumers that need full coverage must wire `search()` on every
   * backend they attach. Search exceptions are swallowed; the registry's
   * `memory_stats` consumer relies on `query()` never throwing.
   */
  async query(filter?: QueryFilter<unknown>): Promise<readonly unknown[]> {
    if (this.backend.search === undefined) return [];
    const text = extractSearchText(filter);
    if (text === null) return [];
    const limit = filter?.limit ?? DEFAULT_SEARCH_LIMIT;
    try {
      return await this.backend.search(text, limit);
    } catch {
      return [];
    }
  }

  delete(_key: string): Promise<boolean> {
    return Promise.resolve(false);
  }

  async stats(): Promise<BackendStats> {
    const rawCount = await Promise.resolve(this.backend.count());
    const count = extractCount(rawCount);
    return {
      domain: this.domain,
      count,
      oldestTimestamp: null,
      newestTimestamp: null,
    };
  }

  async close(): Promise<void> {
    if (this.backend.close !== undefined) {
      await Promise.resolve(this.backend.close());
    }
  }
}

/**
 * Normalize different backend `count()` return shapes:
 * - `number` (e.g., `MobiMem.profile.getEntryCount()`)
 * - `Result<number, MemoryError>` (HybridMemoryBackend)
 * - `Promise<number | Result<number, MemoryError>>` (after await)
 * Anything unrecognized falls back to 0 — the adapter must never throw on
 * a stats read because that would break `memory_stats` for the whole pipeline.
 */
function extractCount(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value !== null && typeof value === 'object') {
    const v = value as { ok?: boolean; value?: unknown };
    if (v.ok === true && typeof v.value === 'number') return v.value;
  }
  return 0;
}

/** Convenience tag the adapter passes to `WriteMeta.cli` for future writes. */
export type AdapterCli = CliName;

// ============================================================================
// Shared MemoryRegistry path injection (#3995)
// ============================================================================

/**
 * Ensure the process-wide shared {@link MemoryRegistry} is constructed with
 * the canonical nexus-agents data path (#3995).
 *
 * nexus-memory ships a dep-free `resolveDefaultDbPath()` fallback that
 * re-implements `~/.nexus-agents/memory/memory.db` inline so the package stays
 * free of inter-package imports (it is reused by `nexus-eval-*`). In
 * production nexus-agents we want the canonical {@link nexusDataPath} resolver
 * instead — it adds sandbox detection, the per-repo/cross-repo split, the
 * homedir-unwritable fallback, and `.gitignore` auto-wiring that the dep-free
 * fallback cannot know about. We keep nexus-memory dep-free by doing the
 * resolution HERE (on the nexus-agents side) and injecting the resolved path
 * as a plain string via `setMemoryRegistry`.
 *
 * No-op when a registry is already present (`hasMemoryRegistry()`): that means
 * either a test injected an in-memory registry, or a prior call already wired
 * the canonical path. Checking presence — rather than calling
 * `getMemoryRegistry()` — is what lets us win the race against nexus-memory's
 * lazy default-path initialization without ever triggering it. Call this
 * before the first `getMemoryRegistry()` in any production path that attaches
 * a backend.
 */
export function ensureSharedMemoryRegistry(): void {
  if (hasMemoryRegistry()) return;
  // `memory` is intentionally cross-repo (not in PER_REPO_SUBDIRS), so this
  // resolves to `~/.nexus-agents/memory/memory.db` on a normal machine and to
  // the sandbox / per-repo-fallback root under those modes.
  const dbPath = nexusDataPath('memory', 'memory.db');
  setMemoryRegistry(new MemoryRegistry({ dbPath }));
}
