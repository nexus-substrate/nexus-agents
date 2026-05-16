/**
 * Core contract types for nexus-memory.
 *
 * Reflects the Phase 2 vote (#2766, #2768):
 * - Schema shape **C** (hybrid hot+archive) — hot tables get domain-typed
 *   backends; the cold archive shares one row shape with a `type` discriminator.
 * - Telemetry **C** (aggregated counters + opt-in audit) — every operation
 *   feeds counters; full payloads only when `NEXUS_MEMORY_AUDIT_MODE=audit`.
 *
 * @module nexus-memory/types
 */

import type { z } from 'zod';

/** Canonical CLI identifier used for the `cli` tag column. */
export type CliName = 'claude' | 'codex' | 'gemini' | 'opencode';

/**
 * Filter for {@link IMemoryBackend.query}. `where` is a partial subset of
 * the backend's value shape — backends translate to a SQL `WHERE` clause
 * over indexed columns. `limit`/`order` are advisory; backends MAY
 * implement them via `LIMIT`/`ORDER BY`.
 */
export interface QueryFilter<TValue> {
  readonly where?: Partial<TValue>;
  readonly cli?: CliName;
  readonly limit?: number;
  readonly orderBy?: keyof TValue;
  readonly orderDir?: 'asc' | 'desc';
}

/** Per-write metadata. Optional, but `cli` should be supplied where known. */
export interface WriteMeta {
  /** CLI that produced this row. Per-CLI tag (vote-ratified default share-by-default). */
  readonly cli?: CliName;
  /** Free-form source identifier (`'expert'` | `'pipeline'` | `'cli'` | etc.). */
  readonly source?: string;
  /** Override the default `Date.now()` timestamp. */
  readonly timestamp?: number;
  /** Trust tier per the input-hardening epic (#818). Cold-archive promotion may gate on this. */
  readonly trustTier?: 1 | 2 | 3 | 4;
}

/** Per-backend statistics surfaced by {@link IMemoryBackend.stats}. */
export interface BackendStats {
  readonly domain: string;
  readonly count: number;
  readonly oldestTimestamp: number | null;
  readonly newestTimestamp: number | null;
}

/**
 * Every memory backend implements this contract. Each backend owns a single
 * **domain** (e.g., `'experience'`, `'outcomes'`, `'beliefs'`). Cross-domain
 * coordination happens in {@link MemoryRegistry}.
 */
export interface IMemoryBackend<TKey, TValue> {
  /** Stable identifier; matches the table name in SQLite backends. */
  readonly domain: string;

  /** Read by primary key. Returns undefined for missing keys. */
  read(key: TKey): Promise<TValue | undefined>;

  /** Write or overwrite. `meta.cli` populates the per-CLI tag column. */
  write(key: TKey, value: TValue, meta?: WriteMeta): Promise<void>;

  /** Range/filter query. Returns rows matching {@link QueryFilter}. */
  query(filter?: QueryFilter<TValue>): Promise<readonly TValue[]>;

  /** Delete by primary key. Returns true if a row was removed. */
  delete(key: TKey): Promise<boolean>;

  /** Lightweight counts + bounds. Cheap to call. */
  stats(): Promise<BackendStats>;

  /**
   * Close any open handles. Idempotent.
   *
   * `Promise<void>` so a future async backend (network-backed) can drop in.
   */
  close(): Promise<void>;
}

/**
 * Validation contract for the cold-archive write path (Phase 2 vote
 * mitigation #1, security dissent). Every cold-archive backend MUST
 * validate its payload against a Zod schema before persisting; the
 * promotion test in `contract.test.ts` exercises both the happy and
 * failure paths.
 *
 * Hot-path backends typically have stronger compile-time typing and
 * may skip this in favor of TypeScript guarantees.
 */
export interface ColdArchiveSchema<TValue> {
  /** Zod schema used to validate values before write. */
  readonly schema: z.ZodType<TValue>;
}

/**
 * Telemetry event emitted on every backend operation.
 *
 * Counter mode (default): backends increment per-`{domain, op}` counters
 * and emit a single aggregate event per logical operation.
 *
 * Audit mode (`NEXUS_MEMORY_AUDIT_MODE=audit`): backends additionally
 * include `keySummary`, `payloadSummary`, and `resultSummary` so an
 * incident-response replay can reconstruct individual ops.
 */
export interface MemoryEvent {
  readonly domain: string;
  readonly op: 'read' | 'write' | 'query' | 'delete' | 'stats';
  readonly cli?: CliName;
  readonly durationMs: number;
  /** True for `read` ops that found a row, `query` ops with non-empty result, `delete` ops that found a target. */
  readonly hit?: boolean;
  /** Populated only in audit mode. Truncated to ~120 chars. */
  readonly keySummary?: string;
  /** Populated only in audit mode. Truncated to ~240 chars. */
  readonly payloadSummary?: string;
  /** Populated only in audit mode. Truncated to ~240 chars. */
  readonly resultSummary?: string;
}

/** Subscriber callback for `subscribeToMemoryEvents`. */
export type MemoryEventListener = (event: MemoryEvent) => void;

/**
 * Aggregate counters surfaced by `getMemoryEventCounters()`. Mirrors the
 * shape of {@link MemoryEvent} but with per-`{domain, op}` rollups.
 */
export interface MemoryEventCounters {
  readonly domain: string;
  readonly op: MemoryEvent['op'];
  readonly count: number;
  readonly hitCount: number;
  readonly totalDurationMs: number;
  readonly maxDurationMs: number;
}
