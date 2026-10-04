/**
 * In-memory backend — primarily for tests, but also used as the cold-archive
 * fallback when no `dbPath` is provided.
 *
 * Implements {@link IMemoryBackend}; passes the same contract test as
 * {@link SqliteBackend}.
 *
 * @module nexus-memory/backends/memory
 */

import type { z } from 'zod';
import { assertStringKey, copyJson, validateMemoryValue } from '../json.js';
export { MemoryValidationError } from '../json.js';
import { recordFailedMemoryOp, recordMemoryEvent } from '../telemetry.js';
import type { BackendStats, IMemoryBackend, JsonValue, QueryFilter, WriteMeta } from '../types.js';

interface Row<TValue> {
  readonly value: TValue;
  readonly cli?: string;
  readonly source?: string;
  readonly timestamp: number;
  readonly trustTier?: 1 | 2 | 3 | 4;
}

export interface InMemoryBackendOptions<TValue extends JsonValue> {
  readonly domain: string;
  /**
   * Optional Zod schema. Phase 2 vote mitigation #1 (security dissent):
   * when supplied, every `write()` validates the value first; invalid
   * payloads throw `MemoryValidationError`.
   */
  readonly schema?: z.ZodType<TValue>;
}

function buildInMemoryRow<TValue>(value: TValue, meta: WriteMeta | undefined): Row<TValue> {
  return {
    value,
    ...(meta?.cli !== undefined && { cli: meta.cli }),
    ...(meta?.source !== undefined && { source: meta.source }),
    timestamp: meta?.timestamp ?? Date.now(),
    ...(meta?.trustTier !== undefined && { trustTier: meta.trustTier }),
  };
}

/** Apply `where`, `orderBy`, `limit` to an in-memory row set. Extracted from
 * `query` to satisfy the eslint complexity gate. */
function applyInMemoryFilter<T>(values: T[], filter?: QueryFilter<T>): T[] {
  let out = values;
  if (filter?.where !== undefined) {
    const where = filter.where;
    out = out.filter((v) => {
      for (const [k, expected] of Object.entries(where)) {
        if ((v as Record<string, unknown>)[k] !== expected) return false;
      }
      return true;
    });
  }
  if (filter?.orderBy !== undefined) {
    const orderBy = filter.orderBy;
    const dir = filter.orderDir === 'desc' ? -1 : 1;
    out = [...out].sort((a, b) => {
      const av = (a as Record<string | symbol | number, unknown>)[orderBy];
      const bv = (b as Record<string | symbol | number, unknown>)[orderBy];
      if (av === bv) return 0;
      if (av === undefined || av === null) return 1;
      if (bv === undefined || bv === null) return -1;
      return (av < bv ? -1 : 1) * dir;
    });
  }
  if (filter?.limit !== undefined) {
    out = out.slice(0, filter.limit);
  }
  return out;
}

export class InMemoryBackend<
  TKey extends string,
  TValue extends JsonValue,
> implements IMemoryBackend<TKey, TValue> {
  readonly domain: string;
  private readonly rows = new Map<string, Row<TValue>>();
  private readonly schema?: z.ZodType<TValue>;
  private closed = false;

  constructor(options: InMemoryBackendOptions<TValue>) {
    this.domain = options.domain;
    if (options.schema !== undefined) {
      this.schema = options.schema;
    }
  }

  async read(key: TKey): Promise<TValue | undefined> {
    const start = Date.now();
    return recordFailedMemoryOp(
      {
        domain: this.domain,
        op: 'read',
      },
      start,
      () => {
        this.assertOpen();
        assertStringKey(key, this.domain);
        const row = this.rows.get(key);
        recordMemoryEvent({
          domain: this.domain,
          op: 'read',
          hit: row !== undefined,
          durationMs: Date.now() - start,
          key,
          result: row?.value,
        });
        return Promise.resolve(row === undefined ? undefined : copyJson(row.value));
      }
    );
  }

  async write(key: TKey, value: TValue, meta?: WriteMeta): Promise<void> {
    const start = Date.now();
    return recordFailedMemoryOp(
      {
        domain: this.domain,
        op: 'write',
        ...(meta?.cli !== undefined && { cli: meta.cli }),
      },
      start,
      () => {
        this.assertOpen();
        assertStringKey(key, this.domain);
        const copy = validateMemoryValue(value, this.domain, this.schema);
        this.rows.set(key, buildInMemoryRow(copy, meta));
        recordMemoryEvent({
          domain: this.domain,
          op: 'write',
          ...(meta?.cli !== undefined && { cli: meta.cli }),
          durationMs: Date.now() - start,
          key,
          payload: copy,
        });
        return Promise.resolve();
      }
    );
  }

  async query(filter?: QueryFilter<TValue>): Promise<readonly TValue[]> {
    const start = Date.now();
    return recordFailedMemoryOp(
      {
        domain: this.domain,
        op: 'query',
        ...(filter?.cli !== undefined && { cli: filter.cli }),
      },
      start,
      () => {
        this.assertOpen();
        let rows = [...this.rows.values()];
        if (filter?.cli !== undefined) {
          rows = rows.filter((r) => r.cli === filter.cli);
        }
        const values = applyInMemoryFilter(
          rows.map((r) => r.value),
          filter
        );
        recordMemoryEvent({
          domain: this.domain,
          op: 'query',
          hit: values.length > 0,
          ...(filter?.cli !== undefined && { cli: filter.cli }),
          durationMs: Date.now() - start,
          key: filter,
          result: { count: values.length },
        });
        return Promise.resolve(values.map((value) => copyJson(value)));
      }
    );
  }

  async delete(key: TKey): Promise<boolean> {
    const start = Date.now();
    return recordFailedMemoryOp(
      {
        domain: this.domain,
        op: 'delete',
      },
      start,
      () => {
        this.assertOpen();
        assertStringKey(key, this.domain);
        const removed = this.rows.delete(key);
        recordMemoryEvent({
          domain: this.domain,
          op: 'delete',
          hit: removed,
          durationMs: Date.now() - start,
          key,
        });
        return Promise.resolve(removed);
      }
    );
  }

  async stats(): Promise<BackendStats> {
    const start = Date.now();
    return recordFailedMemoryOp(
      {
        domain: this.domain,
        op: 'stats',
      },
      start,
      () => {
        this.assertOpen();
        const timestamps = [...this.rows.values()].map((r) => r.timestamp);
        const result: BackendStats = {
          domain: this.domain,
          count: this.rows.size,
          oldestTimestamp: timestamps.length > 0 ? Math.min(...timestamps) : null,
          newestTimestamp: timestamps.length > 0 ? Math.max(...timestamps) : null,
        };
        recordMemoryEvent({
          domain: this.domain,
          op: 'stats',
          durationMs: Date.now() - start,
          result,
        });
        return Promise.resolve(result);
      }
    );
  }

  async close(): Promise<void> {
    this.closed = true;
    this.rows.clear();
    return Promise.resolve();
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error(`nexus-memory: backend "${this.domain}" is closed`);
    }
  }
}
