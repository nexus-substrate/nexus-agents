/**
 * MemoryRegistry — the single entry point for accessing memory backends.
 *
 * Every concept-space (experience, outcomes, beliefs, …) registers a
 * backend; callers reach it via `registry.get('experience')` or, more
 * commonly, the typed accessors that wrap the registry.
 *
 * Sharing a SQLite connection across backends keeps WAL-mode behavior
 * coherent — one writer thread, many tables.
 *
 * @module nexus-memory/registry
 */

import Database, { type Database as DatabaseType } from 'better-sqlite3';
import type { z } from 'zod';
import { InMemoryBackend } from './backends/memory.js';
import { SqliteBackend } from './backends/sqlite.js';
import type { IMemoryBackend } from './types.js';

export interface MemoryRegistryOptions {
  /**
   * SQLite file path. Use `':memory:'` for tests. When omitted, the
   * registry creates `InMemoryBackend` instances and never touches disk
   * — the standard test-isolation pattern (Phase 2 acceptance criterion).
   */
  readonly dbPath?: string;
}

export interface RegisterBackendOptions<TValue> {
  /** Stable domain identifier. Becomes the SQLite table name. */
  readonly domain: string;
  /** Optional Zod schema for cold-archive validation. */
  readonly schema?: z.ZodType<TValue>;
}

/**
 * The registry. One per `dbPath` (or one in-memory registry per test).
 * `MemoryRegistry.get(domain)` is `O(1)` after registration.
 */
export class MemoryRegistry {
  private readonly backends = new Map<string, IMemoryBackend<unknown, unknown>>();
  private readonly db?: DatabaseType;
  private closed = false;

  constructor(options: MemoryRegistryOptions = {}) {
    if (options.dbPath !== undefined) {
      this.db = new Database(options.dbPath);
      this.db.pragma('journal_mode = WAL');
    }
  }

  /**
   * Register a backend for `domain`. Throws on duplicate domain.
   *
   * When the registry has a `dbPath`, the new backend is SQLite-backed
   * and shares the registry's connection. Otherwise, an `InMemoryBackend`
   * is created (used for tests).
   */
  register<TKey, TValue>(options: RegisterBackendOptions<TValue>): IMemoryBackend<TKey, TValue> {
    this.assertOpen();
    if (this.backends.has(options.domain)) {
      throw new Error(`nexus-memory: domain "${options.domain}" already registered`);
    }
    const backend: IMemoryBackend<TKey, TValue> =
      this.db !== undefined
        ? new SqliteBackend<TKey, TValue>({
            domain: options.domain,
            dbPath: '<shared>', // unused when db is supplied
            db: this.db,
            ...(options.schema !== undefined && { schema: options.schema }),
          })
        : new InMemoryBackend<TKey, TValue>({
            domain: options.domain,
            ...(options.schema !== undefined && { schema: options.schema }),
          });
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- TypeScript narrows the union type here, but the Map needs the lifted IMemoryBackend<unknown, unknown>; the assertion documents the variance and survives future contract changes.
    this.backends.set(options.domain, backend as IMemoryBackend<unknown, unknown>);
    return backend;
  }

  /**
   * Attach an externally-managed {@link IMemoryBackend}. Use this when the
   * backend owns its own storage (e.g., a pre-existing SQLite file under
   * `~/.nexus-agents/memory/agentic.db`) and you want it discoverable
   * through the registry without changing its persistence.
   *
   * Phase 5–7 of the memory-unification epic use this to bring the
   * tool-memory backends (`agentic`, `adaptive`, `typed`, `belief`),
   * OutcomeStore, SICA, skills, etc. under a unified observability
   * contract without rewriting their internals. Each attached backend
   * still owns its own `.db` (or JSONL, etc.) until a follow-up migration
   * folds the storage in fully.
   */
  attach<TKey, TValue>(
    domain: string,
    backend: IMemoryBackend<TKey, TValue>
  ): IMemoryBackend<TKey, TValue> {
    this.assertOpen();
    if (this.backends.has(domain)) {
      throw new Error(`nexus-memory: domain "${domain}" already registered`);
    }
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- See `register`.
    this.backends.set(domain, backend as IMemoryBackend<unknown, unknown>);
    return backend;
  }

  /**
   * Get a previously-registered backend. Returns `undefined` if the
   * domain isn't registered — callers should treat that as "not yet
   * migrated to the unified contract."
   */
  get<TKey, TValue>(domain: string): IMemoryBackend<TKey, TValue> | undefined {
    this.assertOpen();
    const backend = this.backends.get(domain);
    return backend as IMemoryBackend<TKey, TValue> | undefined;
  }

  /** List all registered domains. Useful for `memory_stats`-style readers. */
  domains(): readonly string[] {
    return [...this.backends.keys()];
  }

  /**
   * Close every registered backend and the shared SQLite handle. After
   * `close()` the registry rejects all further operations.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const backend of this.backends.values()) {
      await backend.close();
    }
    this.backends.clear();
    if (this.db !== undefined) this.db.close();
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error('nexus-memory: registry is closed');
    }
  }
}

// ============================================================================
// Singleton accessor
// ============================================================================

let sharedRegistry: MemoryRegistry | null = null;

/**
 * Get the process-wide shared registry. Initializes on first call with
 * `dbPath` from `NEXUS_DATA_DIR` (defaults to `~/.nexus-agents/memory/memory.db`)
 * unless `setMemoryRegistry` was called first.
 *
 * Test code should call `setMemoryRegistry(createInMemoryMemoryRegistry())`
 * in `beforeEach` — this matches the existing `setOutcomeStore` pattern.
 */
export function getMemoryRegistry(): MemoryRegistry {
  if (sharedRegistry === null) {
    // Default path resolution happens here, NOT at module load — so tests
    // that call `setMemoryRegistry` before any `getMemoryRegistry` see
    // their in-memory instance, not a side-effectful production path.
    const dbPath = resolveDefaultDbPath();
    sharedRegistry = new MemoryRegistry({ dbPath });
  }
  return sharedRegistry;
}

/**
 * Inject a registry. Used by tests to swap in `InMemoryBackend`-backed
 * registries. After test, call again with `null` to reset, or call
 * `closeMemoryRegistry()` to dispose.
 */
export function setMemoryRegistry(registry: MemoryRegistry | null): void {
  sharedRegistry = registry;
}

/** Close + null out the shared registry. Idempotent. */
export async function closeMemoryRegistry(): Promise<void> {
  if (sharedRegistry !== null) {
    await sharedRegistry.close();
    sharedRegistry = null;
  }
}

function resolveDefaultDbPath(): string {
  // Match `nexus-agents`'s `nexusDataPath` convention without importing it
  // (keep nexus-memory free of inter-package deps for nexus-eval-* reuse).
  const root = process.env['NEXUS_DATA_DIR'] ?? `${process.env['HOME'] ?? '/tmp'}/.nexus-agents`;
  return `${root}/memory/memory.db`;
}
