/**
 * Test factories. Production code uses {@link getMemoryRegistry} from
 * `./registry.js`; tests use these helpers to avoid touching disk.
 *
 * @module nexus-memory/factory
 */

import { MemoryRegistry } from './registry.js';

/**
 * Create a registry that lives entirely in memory. Every `register()`
 * call returns an {@link InMemoryBackend}; nothing is persisted.
 *
 * Use this in `beforeEach`:
 *
 * ```ts
 * beforeEach(() => {
 *   setMemoryRegistry(createInMemoryMemoryRegistry());
 * });
 * afterEach(async () => {
 *   await closeMemoryRegistry();
 * });
 * ```
 */
export function createInMemoryMemoryRegistry(): MemoryRegistry {
  return new MemoryRegistry({
    /* no dbPath → InMemoryBackend per domain */
  });
}

/**
 * Create a SQLite-backed registry rooted at `dbPath`. Pass `':memory:'`
 * for tests that need to exercise the SQLite code path (e.g.,
 * migration tests, parity tests).
 */
export function createSqliteMemoryRegistry(dbPath: string): MemoryRegistry {
  return new MemoryRegistry({ dbPath });
}
