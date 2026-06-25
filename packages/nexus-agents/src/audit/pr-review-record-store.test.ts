/**
 * Tests for the pr-review-record PRODUCER ({@link persistPrReviewRecord}, #4031).
 *
 * Covers the Stage-2 producer the #3831 Stage-1 store deferred: ledger-tip read →
 * monotonic sequence assignment → previousHash chaining → self-hashed append, plus
 * the merge-safe SET semantics and the never-throw best-effort contract. The pure
 * builder/reader/path resolution are exercised by `pr-review-record.test.ts`.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { verifyPrReviewRecordSet } from './pr-review-record.js';
import type { PrReviewVoteCounts } from './pr-review-record.js';
import {
  persistPrReviewRecord,
  readPrReviewRecords,
  type PersistPrReviewRecordOptions,
} from './pr-review-record-store.js';

const BASE_SHA = 'a'.repeat(40);
const DIFF_HASH = 'b'.repeat(64);

const VOTE_COUNTS: PrReviewVoteCounts = {
  approve: 3,
  request_changes: 1,
  abstain: 1,
  error: 0,
  total: 5,
};

function baseOpts(
  overrides: Partial<PersistPrReviewRecordOptions> = {}
): PersistPrReviewRecordOptions {
  return {
    prNumber: 42,
    baseSha: BASE_SHA,
    reviewedDiffHash: DIFF_HASH,
    verdict: 'approve',
    verified: true,
    voteCounts: VOTE_COUNTS,
    summary: 'approve (3/1/1) — Test PR',
    ...overrides,
  };
}

describe('persistPrReviewRecord (#4031)', () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pr-review-records-'));
    filePath = join(dir, 'pr-review-records.jsonl');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes the first record at sequence 0 with no previousHash and a valid self-hash', () => {
    const record = persistPrReviewRecord(baseOpts({ filePath }));
    expect(record).toBeDefined();
    expect(record?.sequence).toBe(0);
    expect(record?.previousHash).toBeUndefined();
    expect(record?.prNumber).toBe(42);
    expect(record?.reviewedDiffHash).toBe(DIFF_HASH);

    const { records, invalidLines } = readPrReviewRecords(filePath);
    expect(invalidLines).toEqual([]);
    expect(records).toHaveLength(1);
    expect(verifyPrReviewRecordSet(records).ok).toBe(true);
  });

  it('assigns monotonic sequences and chains previousHash to the prior tip', () => {
    const first = persistPrReviewRecord(baseOpts({ filePath, prNumber: 1 }));
    const second = persistPrReviewRecord(baseOpts({ filePath, prNumber: 2 }));

    expect(first?.sequence).toBe(0);
    expect(second?.sequence).toBe(1);
    // previousHash is advisory and links to the prior tip's self-hash.
    expect(second?.previousHash).toBe(first?.hash);

    const { records } = readPrReviewRecords(filePath);
    expect(records).toHaveLength(2);
    expect(verifyPrReviewRecordSet(records).ok).toBe(true);
  });

  it('does not include previousHash in the self-hash (position-independent / merge-safe)', () => {
    // Two records appended from the same tip would carry the SAME sequence on a
    // concurrent merge; the self-hash must not depend on previousHash, so a
    // record's hash is stable regardless of which tip it observed.
    const a = persistPrReviewRecord(baseOpts({ filePath, prNumber: 7 }));
    const b = persistPrReviewRecord(baseOpts({ filePath, prNumber: 8 }));
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    // Re-verifying after reordering the file lines still passes (set semantics).
    const { records } = readPrReviewRecords(filePath);
    const reordered = [...records].reverse();
    expect(verifyPrReviewRecordSet(reordered).ok).toBe(true);
  });

  it('returns the binding verdict + counts faithfully (no lossy projection)', () => {
    const record = persistPrReviewRecord(
      baseOpts({ filePath, verdict: 'request_changes', verified: false })
    );
    expect(record?.verdict).toBe('request_changes');
    expect(record?.verified).toBe(false);
    expect(record?.voteCounts).toEqual(VOTE_COUNTS);
  });

  it('returns undefined (best-effort, never throws) when the path cannot be written', () => {
    // Point at a path whose parent is a FILE, so mkdirSync/append fails.
    const blocker = join(dir, 'blocker');
    writeFileSync(blocker, 'x', 'utf-8');
    const record = persistPrReviewRecord(baseOpts({ filePath: join(blocker, 'nested.jsonl') }));
    expect(record).toBeUndefined();
  });

  it('appends one JSON line per record (newline-delimited)', () => {
    persistPrReviewRecord(baseOpts({ filePath, prNumber: 10 }));
    persistPrReviewRecord(baseOpts({ filePath, prNumber: 11 }));
    const lines = readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter((l) => l.trim() !== '');
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(() => {
        JSON.parse(line);
      }).not.toThrow();
    }
  });
});
