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

import { assertStringKey } from 'nexus-memory';
import type { BackendStats, IMemoryBackend, JsonValue, QueryFilter, WriteMeta } from 'nexus-memory';
import { OutcomeQuerySchema } from './outcome-types.js';
import type { OutcomeQuery } from './outcome-types.js';
import type { OutcomeStore } from './outcome-store.js';
import { projectMemoryJson } from '../../context/memory-json.js';

type JsonOutcome = Readonly<Record<string, JsonValue>>;

function toOutcomeQuery(filter?: QueryFilter<JsonValue>): OutcomeQuery {
  const raw = filter?.where;
  const where =
    raw !== null && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Readonly<Record<string, JsonValue>>)
      : {};
  return OutcomeQuerySchema.parse({
    ...(typeof where['cli'] === 'string' && { cli: where['cli'] }),
    ...(typeof where['category'] === 'string' && { category: where['category'] }),
    ...(typeof where['success'] === 'boolean' && { success: where['success'] }),
    ...(typeof where['baselineId'] === 'string' && { baselineId: where['baselineId'] }),
  });
}

export class OutcomeStoreAdapter implements IMemoryBackend<string, JsonValue> {
  readonly domain = 'outcomes';
  private readonly store: OutcomeStore;

  constructor(store: OutcomeStore) {
    this.store = store;
  }

  async read(key: string): Promise<JsonOutcome | undefined> {
    assertStringKey(key, this.domain);
    // OutcomeStore is keyed by query filter, not primary key. Direct
    // key lookup isn't a meaningful operation — callers should `query`.
    return Promise.resolve(undefined);
  }

  async write(key: string, _value: JsonValue, _meta?: WriteMeta): Promise<void> {
    assertStringKey(key, this.domain);
    return Promise.reject(
      new Error(
        'nexus-memory: outcomes write should go through OutcomeStore.append() directly; ' +
          'the adapter is read-only for discovery + telemetry'
      )
    );
  }

  async query(filter?: QueryFilter<JsonValue>): Promise<readonly JsonOutcome[]> {
    // Translate the IMemoryBackend filter into OutcomeStore.query's
    // narrower shape. `where` is shallow-matched, `limit` is honored.
    const all = this.store.query(toOutcomeQuery(filter));
    const limit = filter?.limit;
    const rows = limit !== undefined ? all.slice(0, limit) : all;
    return Promise.resolve(rows.map((row) => projectMemoryJson(row) as JsonOutcome));
  }

  async delete(key: string): Promise<boolean> {
    assertStringKey(key, this.domain);
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
