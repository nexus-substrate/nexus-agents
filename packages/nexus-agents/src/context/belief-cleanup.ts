/**
 * Phase 9 of #2766 — one-shot cleanup script for belief-backend rows
 * polluted by the #2719-era arXiv feed-fallback bug.
 *
 * Pre-#2755 the `extractEntryXml` helper fell back to the feed-level
 * `<title>` when an arXiv query returned no entries. The feed title for
 * a no-results query is literally `arXiv Query: search_query=...`, which
 * then got persisted as a "belief" with the bogus title as the subject.
 * The feed-fallback bug was fixed in #2755, but pre-fix rows still live
 * in users' belief stores. This module flags + removes them.
 *
 * Idempotent: a marker file under `<nexusDataDir>/memory/` records
 * completion; re-running after a successful pass is a no-op.
 *
 * @module context/belief-cleanup
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Belief } from './belief-core-types.js';
import { nexusDataPath } from '../config/nexus-data-dir.js';

/** Regex patterns that identify a polluted belief row. */
const POLLUTED_PATTERNS: readonly RegExp[] = [
  /arXiv Query:\s*search_query=/i,
  // `id_list=...max_results=` — the no-results feed-fallback URL format.
  // Allow `&` separators between params; `[\s\S]` keeps it permissive but
  // capped to 200 chars so it won't false-positive on long unrelated text.
  /id_list=[\s\S]{0,200}?max_results=/i,
];

/** Marker file name used to skip re-runs of a successful cleanup. */
export const BELIEF_CLEANUP_MARKER = '.belief-cleanup-done';

/** Decision for a single belief: keep or drop. */
export interface BeliefCleanupDecision {
  readonly belief: Belief;
  readonly polluted: boolean;
  readonly matchedPattern?: string;
}

/** Summary returned by `runBeliefCleanup`. */
export interface BeliefCleanupResult {
  readonly scanned: number;
  readonly removed: number;
  readonly kept: number;
  readonly samples: readonly string[];
  readonly skipped: boolean;
  readonly markerPath: string;
}

/** Inspect a single belief; return a decision. */
export function classifyBelief(belief: Belief): BeliefCleanupDecision {
  const haystacks = [belief.subject, belief.predicate, belief.object].filter(
    (s): s is string => typeof s === 'string' && s.length > 0
  );
  for (const pattern of POLLUTED_PATTERNS) {
    for (const text of haystacks) {
      if (pattern.test(text)) {
        return { belief, polluted: true, matchedPattern: pattern.source };
      }
    }
  }
  return { belief, polluted: false };
}

/**
 * Run cleanup against a provided beliefs array. Returns the decisions
 * (caller is responsible for actually removing the polluted rows from
 * the underlying store). This separation keeps the function pure and
 * testable; the storage-aware wrapper is below.
 */
export function classifyBeliefs(beliefs: readonly Belief[]): readonly BeliefCleanupDecision[] {
  return beliefs.map(classifyBelief);
}

/**
 * Storage-aware cleanup driver. Reads beliefs via the provided
 * `loadBeliefs` callback, identifies polluted rows, removes them via
 * `deleteBelief`, and writes a marker file so subsequent runs no-op.
 *
 * Tests inject the callbacks with in-memory stores; production wires
 * them to `HindsightBeliefMemory.query()` + `.forget()` (or the persisted
 * snapshot at `<nexusDataDir>/memory/belief-snapshot.json`).
 *
 * Callbacks are async-only: every real implementation is async (the
 * belief store returns `Promise<Result<...>>`), and tests can wrap
 * sync data with `Promise.resolve`.
 */
export interface RunBeliefCleanupOptions {
  readonly loadBeliefs: () => Promise<readonly Belief[]>;
  readonly deleteBelief: (id: string) => Promise<void>;
  /** Directory to place the `.belief-cleanup-done` marker. */
  readonly markerDir?: string;
  /** Skip the marker check (force re-run). Tests only. */
  readonly force?: boolean;
}

export async function runBeliefCleanup(
  options: RunBeliefCleanupOptions
): Promise<BeliefCleanupResult> {
  const markerDir = options.markerDir ?? nexusDataPath('memory');
  const markerPath = join(markerDir, BELIEF_CLEANUP_MARKER);

  if (options.force !== true && existsSync(markerPath)) {
    return {
      scanned: 0,
      removed: 0,
      kept: 0,
      samples: [],
      skipped: true,
      markerPath,
    };
  }

  const beliefs = await options.loadBeliefs();
  const decisions = classifyBeliefs(beliefs);
  const polluted = decisions.filter((d) => d.polluted);
  const samples = polluted.slice(0, 3).map((d) => d.belief.subject);

  for (const d of polluted) {
    await options.deleteBelief(d.belief.beliefId);
  }

  mkdirSync(dirname(markerPath), { recursive: true });
  writeFileSync(
    markerPath,
    JSON.stringify(
      {
        completedAt: new Date().toISOString(),
        scanned: beliefs.length,
        removed: polluted.length,
        samples,
      },
      null,
      2
    ),
    'utf-8'
  );

  return {
    scanned: beliefs.length,
    removed: polluted.length,
    kept: beliefs.length - polluted.length,
    samples,
    skipped: false,
    markerPath,
  };
}

/** Read an existing marker file, if any. Useful for status displays. */
export function readBeliefCleanupMarker(markerDir: string = nexusDataPath('memory')): unknown {
  const path = join(markerDir, BELIEF_CLEANUP_MARKER);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as unknown;
  } catch {
    return null;
  }
}
