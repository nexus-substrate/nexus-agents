/**
 * Phase 6 of #2766 — IMemoryBackend adapter for OutcomeStore.
 *
 * Routes `getMemoryRegistry().get('outcomes')` reads through the existing
 * OutcomeStore so memory_stats and any other consumer can discover routing
 * outcomes via the unified contract. CRUD continues to flow through the
 * existing typed surface (`store.append`, `store.query`, etc.).
 *
 * Full JSONL→SQLite migration deferred to Phase 6.1.
 *
 * @module orchestration/outcomes/outcome-store-adapter
 */

import type { BackendStats, IMemoryBackend, QueryFilter, WriteMeta } from 'nexus-memory';
import type { OutcomeStore } from './outcome-store.js';
import type { TaskOutcome } from './outcome-types.js';

export class OutcomeStoreAdapter implements IMemoryBackend<string, TaskOutcome> {
  readonly domain = 'outcomes';
  private readonly store: OutcomeStore;

  constructor(store: OutcomeStore) {
    this.store = store;
  }

  read(_key: string): Promise<TaskOutcome | undefined> {
    // OutcomeStore is keyed by query filter, not primary key. Direct
    // key lookup isn't a meaningful operation — callers should `query`.
    return Promise.resolve(undefined);
  }

  write(_key: string, _value: TaskOutcome, _meta?: WriteMeta): Promise<void> {
    return Promise.reject(
      new Error(
        'nexus-memory: outcomes write should go through OutcomeStore.append() directly; ' +
          'the adapter is read-only for discovery + telemetry'
      )
    );
  }

  query(filter?: QueryFilter<TaskOutcome>): Promise<readonly TaskOutcome[]> {
    // Translate the IMemoryBackend filter into OutcomeStore.query's
    // narrower shape. `where` is shallow-matched, `limit` is honored.
    const where = filter?.where ?? {};
    const all = this.store.query({
      ...(typeof where.cli === 'string' && { cli: where.cli }),
      ...(typeof where.category === 'string' && { category: where.category }),
      ...(typeof where.success === 'boolean' && { success: where.success }),
      ...(typeof where.baselineId === 'string' && { baselineId: where.baselineId }),
    });
    const limit = filter?.limit;
    return Promise.resolve(limit !== undefined ? all.slice(0, limit) : all);
  }

  delete(_key: string): Promise<boolean> {
    // OutcomeStore has bulk-purge methods (`purgeSkippedWorkers`) but no
    // per-key delete. Treat as no-op for the contract.
    return Promise.resolve(false);
  }

  stats(): Promise<BackendStats> {
    const all = this.store.query({});
    let oldest: number | null = null;
    let newest: number | null = null;
    for (const o of all) {
      const t = new Date(o.timestamp).getTime();
      if (oldest === null || t < oldest) oldest = t;
      if (newest === null || t > newest) newest = t;
    }
    return Promise.resolve({
      domain: this.domain,
      count: this.store.size,
      oldestTimestamp: oldest,
      newestTimestamp: newest,
    });
  }

  close(): Promise<void> {
    // OutcomeStore has no close — singleton lives for the process.
    return Promise.resolve();
  }
}
