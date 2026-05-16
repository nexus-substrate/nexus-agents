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

import type { BackendStats, CliName, IMemoryBackend, QueryFilter, WriteMeta } from 'nexus-memory';

/** Minimal "count + close" shape every tool-memory backend implements. */
export interface CountableBackend {
  /** Returns total row count (the heart of `memory_stats`). */
  count(): unknown;
  /** Idempotent close. */
  close?(): Promise<void> | void;
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

  query(_filter?: QueryFilter<unknown>): Promise<readonly unknown[]> {
    return Promise.resolve([]);
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
