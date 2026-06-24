/**
 * Tests for the pr-review TAMPER-EVIDENT, DIFF-BOUND RECORD SET (#3831, Epic B,
 * Option-C binding). Mirrors the vote-record tests (#3927). Core properties:
 *  - the self-hash covers the full payload INCLUDING prNumber + baseSha +
 *    reviewedDiffHash + verdict (the diff-binding), so editing any is a `hash_mismatch`;
 *  - the ledger is a SET, not a chain: order does not matter, concurrent forks
 *    (duplicate sequences) are benign, omission shows up as a `sequence_gap`;
 *  - `buildPrReviewRecord` produces a record that verifies.
 *
 * @module audit/pr-review-record.test
 */

import { describe, it, expect } from 'vitest';

import type { PrReviewRecord } from './pr-review-record.js';
import { computePrReviewRecordHash, verifyPrReviewRecordSet } from './pr-review-record.js';
import { buildPrReviewRecord } from './pr-review-record-store.js';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const DIFF_HASH_A = 'c'.repeat(64);
const DIFF_HASH_B = 'd'.repeat(64);

/**
 * Build a self-hashed record at `sequence`. `previousHash` is advisory (NOT
 * covered by the hash) — set it to prove verification ignores it.
 */
function makeRecord(
  prNumber: number,
  sequence: number,
  overrides: Partial<Omit<PrReviewRecord, 'hash'>> = {}
): PrReviewRecord {
  const payload: Omit<PrReviewRecord, 'hash'> = {
    version: '1.1',
    sequence,
    prNumber,
    baseSha: SHA_A,
    reviewedDiffHash: DIFF_HASH_A,
    recordedAt: '2026-06-15T00:00:00.000Z',
    verdict: 'approve',
    verified: false,
    voteCounts: { approve: 3, request_changes: 0, abstain: 0, error: 0, total: 3 },
    summary: 'looks good',
    ...overrides,
  };
  return { ...payload, hash: computePrReviewRecordHash(payload) };
}

describe('verifyPrReviewRecordSet (#3831)', () => {
  it('verifies a clean set and is order-independent', () => {
    const a = makeRecord(100, 0);
    const b = makeRecord(101, 1);
    expect(verifyPrReviewRecordSet([a, b]).ok).toBe(true);
    // Reversed order still verifies (set, not chain).
    expect(verifyPrReviewRecordSet([b, a]).ok).toBe(true);
  });

  it('verifies an empty set trivially', () => {
    expect(verifyPrReviewRecordSet([])).toEqual({ ok: true, recordCount: 0 });
  });

  it('ignores the advisory previousHash in the hash', () => {
    const withPrev = makeRecord(100, 0, { previousHash: 'f'.repeat(64) });
    expect(verifyPrReviewRecordSet([withPrev]).ok).toBe(true);
  });

  it('DETECTS a flipped verdict as hash_mismatch (tamper evidence)', () => {
    const rec = makeRecord(100, 0);
    const tampered: PrReviewRecord = { ...rec, verdict: 'request_changes' };
    const result = verifyPrReviewRecordSet([tampered]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('hash_mismatch');
  });

  it('DETECTS an edited reviewedDiffHash as hash_mismatch (diff-binding)', () => {
    const rec = makeRecord(100, 0);
    // Swap the reviewed-diff hash without recomputing the self-hash → tamper.
    const tampered: PrReviewRecord = { ...rec, reviewedDiffHash: DIFF_HASH_B };
    const result = verifyPrReviewRecordSet([tampered]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('hash_mismatch');
  });

  it('DETECTS an edited baseSha as hash_mismatch (diff-binding)', () => {
    const rec = makeRecord(100, 0);
    const tampered: PrReviewRecord = { ...rec, baseSha: SHA_B };
    const result = verifyPrReviewRecordSet([tampered]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('hash_mismatch');
  });

  it('DETECTS a missing hash', () => {
    const rec = makeRecord(100, 0);
    const result = verifyPrReviewRecordSet([{ ...rec, hash: '' }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('missing_hash');
  });

  it('DETECTS a sequence gap (omission)', () => {
    const a = makeRecord(100, 0);
    const c = makeRecord(102, 2); // 1 is missing
    const result = verifyPrReviewRecordSet([a, c]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('sequence_gap');
  });

  it('treats duplicate sequences (concurrent forks) as benign', () => {
    const a = makeRecord(100, 0);
    const b = makeRecord(101, 1);
    const bFork = makeRecord(202, 1); // same sequence, different PR
    const result = verifyPrReviewRecordSet([a, b, bFork]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.forks).toEqual([1]);
  });
});

describe('buildPrReviewRecord (#3831)', () => {
  it('produces a record that verifies and binds the reviewed diff', () => {
    const rec = buildPrReviewRecord({
      prNumber: 4242,
      baseSha: SHA_B,
      reviewedDiffHash: DIFF_HASH_B,
      verdict: 'request_changes',
      verified: true,
      voteCounts: { approve: 1, request_changes: 3, abstain: 1, error: 0, total: 5 },
      summary: 'needs work',
      sequence: 0,
      recordedAt: '2026-06-15T00:00:00.000Z',
    });
    expect(rec.baseSha).toBe(SHA_B);
    expect(rec.reviewedDiffHash).toBe(DIFF_HASH_B);
    expect(rec.verdict).toBe('request_changes');
    expect(verifyPrReviewRecordSet([rec]).ok).toBe(true);
  });

  it('truncates an over-long summary', () => {
    const long = 'x'.repeat(2000);
    const rec = buildPrReviewRecord({
      prNumber: 1,
      baseSha: SHA_A,
      reviewedDiffHash: DIFF_HASH_A,
      verdict: 'approve',
      verified: false,
      voteCounts: { approve: 1, request_changes: 0, abstain: 0, error: 0, total: 1 },
      summary: long,
    });
    expect(rec.summary.length).toBeLessThan(long.length);
    expect(rec.summary.endsWith('...')).toBe(true);
    expect(verifyPrReviewRecordSet([rec]).ok).toBe(true);
  });
});
