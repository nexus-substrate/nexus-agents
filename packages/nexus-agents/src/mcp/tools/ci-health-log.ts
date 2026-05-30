/**
 * CI health-event log (#3076 primitive #4 / #3084).
 *
 * Append-only per-repo JSONL at `<NEXUS_DATA_DIR>/ci-health/events.jsonl`.
 * Each `ci_health_check` call appends one entry. `getCiOutageFrequency`
 * windows the log to give callers (primarily `improvement_review`) a
 * rolling-N-day view of CI infrastructure health.
 *
 * ## Design notes
 *
 * - **Per-repo storage** — outages reported via `ci_health_check({ repo })`
 *   are repo-correlated; a wedge on one repo's queue doesn't predict
 *   another's. See `PER_REPO_SUBDIRS` (#2872 / #3084).
 * - **Append-only** — no in-place rewrites. Reader trims by `ts` window;
 *   on-disk pruning is a separate caller concern (see `pruneOlderThan`).
 * - **Failure-resilient writes** — if the write itself fails (disk full,
 *   permission), log a warn and continue. The TELEMETRY surface must not
 *   block the diagnostic surface (`ci_health_check`'s primary job is to
 *   return a status, not to durably log it).
 *
 * @module mcp/tools/ci-health-log
 */

import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';

import { z } from 'zod';

import { createLogger } from '../../core/index.js';
import { nexusDataPathEnsure } from '../../config/nexus-data-dir.js';
import { CiHealthStatusSchema, type CiHealthSignal } from './ci-health-check-tool.js';

const logger = createLogger({ component: 'ci-health-log' });

/** One on-disk health-event record. Versioned for forward-compat. */
export const CiHealthEventSchema = z.object({
  v: z.literal(1),
  ts: z.iso.datetime(),
  status: CiHealthStatusSchema,
  repo: z.string().optional(),
  signals: z.array(
    z.object({
      source: z.enum(['github-status', 'repo-activity-window']),
      status: CiHealthStatusSchema,
      evidence: z.string(),
    })
  ),
});
export type CiHealthEvent = z.infer<typeof CiHealthEventSchema>;

/** Aggregate window output for `getCiOutageFrequency`. */
export interface CiOutageFrequency {
  /** Total events in window. */
  readonly events: number;
  /** Subset where `status === 'outage'`. */
  readonly outages: number;
  /** Subset where `status === 'degraded'`. */
  readonly degraded: number;
  /** `(outages + degraded) / events`. 0 when `events === 0`. */
  readonly degradedRatio: number;
  /** Window size in days. */
  readonly windowDays: number;
  /** ISO timestamp at the start of the window. */
  readonly windowStart: string;
}

function logFilePath(): string {
  return nexusDataPathEnsure('ci-health', 'events.jsonl');
}

/**
 * Default on-disk size cap for the log, in bytes (#3089). Bounds the
 * disk + read cost of an unbounded append loop — `getCiOutageFrequency`
 * reads the whole file, so growth degrades reads too. Age-based pruning
 * (`pruneOlderThan`) can't bound a burst of *recent* events within the
 * retention window; this size cap can. Overridable via
 * `NEXUS_CI_HEALTH_MAX_BYTES` (ops tuning + test injection).
 */
const DEFAULT_CI_HEALTH_MAX_BYTES = 2_097_152; // 2 MiB

function maxLogBytes(): number {
  const raw = process.env['NEXUS_CI_HEALTH_MAX_BYTES'];
  if (raw === undefined || raw === '') return DEFAULT_CI_HEALTH_MAX_BYTES;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_CI_HEALTH_MAX_BYTES;
}

/**
 * Bound the log to the most recent lines that fit within `maxLogBytes()`
 * (#3089). Cheap `statSync` pre-check so the O(n) rewrite only runs when
 * the file actually exceeds the cap — after a rewrite the size drops and
 * won't re-trigger until it regrows, keeping append amortized-cheap. The
 * newest line is always retained even if it alone exceeds the cap.
 * Post-condition: on-disk size <= `maxLogBytes()`, except the degenerate
 * case of a single retained line larger than the cap.
 * Best-effort: failures are logged, never thrown.
 */
function capLogSize(path: string): void {
  const max = maxLogBytes();
  let size: number;
  try {
    size = statSync(path).size;
  } catch {
    return; // file vanished / unreadable — nothing to cap
  }
  if (size <= max) return;
  try {
    const lines = readFileSync(path, 'utf-8')
      .split('\n')
      .filter((l) => l !== '');
    const kept: string[] = [];
    let bytes = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i] as string;
      const lineBytes = Buffer.byteLength(`${line}\n`, 'utf-8');
      // Always keep the newest line; otherwise stop once the cap is hit.
      if (kept.length > 0 && bytes + lineBytes > max) break;
      kept.push(line);
      bytes += lineBytes;
    }
    kept.reverse();
    writeFileSync(path, kept.length > 0 ? `${kept.join('\n')}\n` : '');
    logger.warn('ci-health log exceeded size cap — dropped oldest events', {
      maxBytes: max,
      previousBytes: size,
      droppedEvents: lines.length - kept.length,
      keptEvents: kept.length,
    });
  } catch (err) {
    logger.warn('Failed to cap ci-health log size', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Append one event. Best-effort: failures are logged but never thrown —
 * the caller (`ci_health_check`) must not block on telemetry success.
 */
export function appendCiHealthEvent(event: Omit<CiHealthEvent, 'v' | 'ts'>): void {
  const record: CiHealthEvent = {
    v: 1,
    ts: new Date().toISOString(),
    ...event,
  };
  try {
    const path = logFilePath();
    appendFileSync(path, `${JSON.stringify(record)}\n`);
    // #3089: opportunistically bound growth so an autonomous polling loop
    // can't grow the log (and thus every read) without limit.
    capLogSize(path);
  } catch (err) {
    logger.warn('Failed to append ci-health event', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Read all events from the log. Tolerates per-line parse failures —
 * a corrupt line is skipped, not fatal (future-schema or partial write).
 */
function readAllEvents(): CiHealthEvent[] {
  const path = logFilePath();
  if (!existsSync(path)) return [];
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (err) {
    logger.warn('Failed to read ci-health log', {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
  const out: CiHealthEvent[] = [];
  let skipped = 0;
  for (const line of raw.split('\n')) {
    if (line === '') continue;
    try {
      const parsed = CiHealthEventSchema.safeParse(JSON.parse(line) as unknown);
      if (parsed.success) out.push(parsed.data);
      else skipped++;
    } catch {
      skipped++;
    }
  }
  // #3089: surface corruption rather than dropping lines silently. A
  // partial write or tampered line would otherwise make aggregates
  // under-count with zero signal to the operator.
  if (skipped > 0) {
    logger.warn('ci-health log: skipped malformed lines', { skipped, kept: out.length });
  }
  return out;
}

/**
 * Aggregate outage frequency over a rolling window. Default 30 days.
 * Window bounds: `[now - days, now]`; events outside the window are
 * ignored. `degradedRatio` combines `outage` + `degraded` because both
 * are signals the operator should care about (a steady drumbeat of
 * degraded is as informative as a single outage).
 */
export function getCiOutageFrequency(days = 30): CiOutageFrequency {
  if (days <= 0) {
    throw new Error(`getCiOutageFrequency: days must be > 0 (got ${String(days)})`);
  }
  const now = Date.now();
  const startMs = now - days * 86_400_000;
  const events = readAllEvents().filter((e) => Date.parse(e.ts) >= startMs);
  const outages = events.filter((e) => e.status === 'outage').length;
  const degraded = events.filter((e) => e.status === 'degraded').length;
  return {
    events: events.length,
    outages,
    degraded,
    degradedRatio: events.length === 0 ? 0 : (outages + degraded) / events.length,
    windowDays: days,
    windowStart: new Date(startMs).toISOString(),
  };
}

/**
 * Rewrite the log keeping only entries within the last `keepDays`. Idempotent.
 * Intended for periodic cleanup (e.g., from `improvement_review` or a cron),
 * not on every append.
 */
export function pruneOlderThan(keepDays: number): { kept: number; removed: number } {
  const all = readAllEvents();
  const cutoffMs = Date.now() - keepDays * 86_400_000;
  const kept = all.filter((e) => Date.parse(e.ts) >= cutoffMs);
  const removed = all.length - kept.length;
  if (removed > 0) {
    writeFileSync(logFilePath(), kept.map((e) => `${JSON.stringify(e)}\n`).join(''));
  }
  return { kept: kept.length, removed };
}

/** Internal: shape conversion from `CiHealthSignal` (re-used by ci-health-check-tool). */
export function eventFromCheck(params: {
  status: import('./ci-health-check-tool.js').CiHealthStatus;
  signals: readonly CiHealthSignal[];
  repo?: string;
}): Omit<CiHealthEvent, 'v' | 'ts'> {
  return {
    status: params.status,
    signals: params.signals.map((s) => ({
      source: s.source,
      status: s.status,
      evidence: s.evidence,
    })),
    ...(params.repo !== undefined ? { repo: params.repo } : {}),
  };
}
