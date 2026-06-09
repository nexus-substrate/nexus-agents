/**
 * Tests for the soundness-review surface (#3765) — durable review-record store,
 * secret-scrub, and the summarize surface the readiness collector (#3764) reads.
 */

import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  ReviewRecordSchema,
  createRemediationReviewStore,
  scrubReviewRecord,
  summarizeRemediationReviews,
  type ReviewRecord,
} from './remediation-review.js';

function mkRecord(over: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    soakRef: 'signal-A::2026-06-08T00:00:00.000Z',
    reviewedAt: '2026-06-08T01:00:00.000Z',
    reviewed: true,
    sound: true,
    evaluator: 'alice',
    ...over,
  };
}

describe('ReviewRecordSchema', () => {
  it('accepts a valid record', () => {
    expect(ReviewRecordSchema.safeParse(mkRecord()).success).toBe(true);
  });

  it('rejects a record missing the evaluator', () => {
    const bad = { ...mkRecord() } as Record<string, unknown>;
    delete bad['evaluator'];
    expect(ReviewRecordSchema.safeParse(bad).success).toBe(false);
  });
});

describe('scrubReviewRecord', () => {
  it('redacts a secret in the note while leaving clean fields intact', () => {
    const withSecret = mkRecord({
      note: 'token ghp_0123456789abcdefghijklmnopqrstuvwxyz0 leaked',
    });
    const scrubbed = scrubReviewRecord(withSecret);
    expect(scrubbed.note).toContain('[redacted:');
    expect(scrubbed.note).not.toContain('ghp_0123456789');
    expect(scrubbed.evaluator).toBe('alice');
  });

  it('leaves a clean note untouched and is a no-op when note is absent', () => {
    expect(scrubReviewRecord(mkRecord({ note: 'looks fine' })).note).toBe('looks fine');
    expect(scrubReviewRecord(mkRecord()).note).toBeUndefined();
  });
});

describe('createRemediationReviewStore round-trip', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'review-store-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('persists a review and re-hydrates it on reconstruct', () => {
    const path = join(dir, 'reviews.jsonl');
    const store = createRemediationReviewStore(path);
    store.record(mkRecord({ soakRef: 'sig-1::t1' }));
    expect(existsSync(path)).toBe(true);

    const reloaded = createRemediationReviewStore(path);
    expect(reloaded.getRecords()).toHaveLength(1);
    expect(reloaded.getRecords()[0]?.soakRef).toBe('sig-1::t1');
  });

  it('scrubs a secret in the note before it hits disk', () => {
    const path = join(dir, 'reviews.jsonl');
    const store = createRemediationReviewStore(path);
    store.record(mkRecord({ note: 'aws AKIAIOSFODNN7EXAMPLE here' }));
    const raw = readFileSync(path, 'utf-8');
    expect(raw).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(raw).toContain('[redacted:');
  });
});

describe('summarizeRemediationReviews', () => {
  it('counts judged + sound and surfaces the latest evaluator/owner', () => {
    const records: ReviewRecord[] = [
      mkRecord({ soakRef: 'a', sound: true, evaluator: 'alice' }),
      mkRecord({ soakRef: 'b', sound: false, evaluator: 'alice' }),
      mkRecord({ soakRef: 'c', sound: true, evaluator: 'bob', owner: 'carol' }),
    ];
    const summary = summarizeRemediationReviews(records);
    expect(summary.judgedSelections).toBe(3);
    expect(summary.judgedSound).toBe(2);
    expect(summary.evaluator).toBe('bob');
    expect(summary.owner).toBe('carol');
  });

  it('returns zeros and no evaluator/owner for an empty set (fail-closed)', () => {
    const summary = summarizeRemediationReviews([]);
    expect(summary.judgedSelections).toBe(0);
    expect(summary.judgedSound).toBe(0);
    expect(summary.evaluator).toBeUndefined();
    expect(summary.owner).toBeUndefined();
  });

  it('attributes evaluator/owner by latest reviewedAt, not append order', () => {
    // Out-of-order array: the newest review by reviewedAt is alice's. A later-
    // APPENDED but chronologically OLDER bob record must NOT become the gate's
    // named evaluator/owner (regression guard for the enforce readiness input).
    const records: ReviewRecord[] = [
      mkRecord({
        soakRef: 'a',
        evaluator: 'alice',
        owner: 'owner-new',
        reviewedAt: '2026-06-08T05:00:00.000Z',
      }),
      mkRecord({
        soakRef: 'b',
        evaluator: 'bob',
        owner: 'owner-old',
        reviewedAt: '2026-06-08T02:00:00.000Z',
      }),
    ];
    const summary = summarizeRemediationReviews(records);
    expect(summary.evaluator).toBe('alice');
    expect(summary.owner).toBe('owner-new');
  });

  it('dedupes by soakRef keeping the latest review per selection', () => {
    const records: ReviewRecord[] = [
      mkRecord({ soakRef: 'a', sound: false, reviewedAt: '2026-06-08T01:00:00.000Z' }),
      mkRecord({ soakRef: 'a', sound: true, reviewedAt: '2026-06-08T02:00:00.000Z' }),
    ];
    const summary = summarizeRemediationReviews(records);
    expect(summary.judgedSelections).toBe(1);
    expect(summary.judgedSound).toBe(1);
  });
});
