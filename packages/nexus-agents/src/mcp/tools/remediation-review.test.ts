/**
 * Tests for the soundness-review surface (#3765) — durable review-record store,
 * secret-scrub, and the summarize surface the readiness collector (#3764) reads.
 */

import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as review from './remediation-review.js';

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
    dir = mkdtempSync(join(process.cwd(), '.review-store-'));
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

  it('does not expose a judgment when its durable append fails', () => {
    const path = join(dir, 'directory.jsonl');
    mkdirSync(path);
    const store = createRemediationReviewStore(path);
    expect(store.record(mkRecord())).toBe(false);
    expect(store.getRecords()).toEqual([]);
    expect(summarizeRemediationReviews(store.getRecords()).judgedSelections).toBe(0);
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

describe('panel and owner-sample fidelity', () => {
  const raw = JSON.stringify({
    signalKey: 'a',
    timestamp: 't',
    category: 'testing',
    priority: 'p2',
    severity: 'warning',
    planStepCount: 3,
    reason: 'higher_order: approved (100%)',
    voteOutcome: { approved: true, approvalPercentage: 100 },
  });
  function panel(over: Record<string, unknown> = {}): ReviewRecord {
    return {
      ...mkRecord({ soakRef: 'a::t' }),
      judgeKind: 'panel',
      voteRecordId: 'vote-1',
      soakRecordHash: createHash('sha256').update(raw).digest('hex'),
      evaluator: 'panel:vote-1',
      ...over,
    };
  }

  it('reads legacy rows as human', () => {
    expect(ReviewRecordSchema.parse(mkRecord()).judgeKind).toBe('human');
  });

  it('rejects a panel row without voteRecordId', () => {
    expect(ReviewRecordSchema.safeParse({ ...panel(), voteRecordId: undefined }).success).toBe(
      false
    );
  });

  it('rejects panel owners and evaluator impersonation', () => {
    expect(ReviewRecordSchema.safeParse(panel({ owner: 'owner' })).success).toBe(false);
    expect(ReviewRecordSchema.safeParse(panel({ evaluator: 'human' })).success).toBe(false);
  });

  it('never counts a panel row or owner sample as a human judgment', () => {
    const sample = review.drawRemediationReviewSample([panel()], 1, 'alice', 'seed');
    const summary = summarizeRemediationReviews(
      [
        panel(),
        mkRecord({ soakRef: 'a::t', judgeKind: 'owner-sample', sampleId: sample.id, sound: false }),
      ],
      sample
    );
    expect(summary.human).toEqual({ n: 0, disagreements: 0 });
    expect(summary.panel).toEqual({ n: 1, disagreements: 0 });
    expect(summary.sample).toEqual({ n: 1, disagreements: 1 });
    expect(summary.judgedSelections).toBe(1);
    expect(summary.judgedSound).toBe(1);
  });

  it('rejects a soak hash mismatch without appending', () => {
    const dir = mkdtempSync(join(process.cwd(), '.review-hash-'));
    try {
      const store = createRemediationReviewStore(join(dir, 'reviews.jsonl'));
      expect(() => store.record(panel(), raw + ' ')).toThrow('soak hash mismatch');
      expect(store.getRecords()).toHaveLength(0);
      expect(store.record(panel(), raw)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a panel judgment attached to a different soak ref', () => {
    const dir = mkdtempSync(join(process.cwd(), '.review-ref-'));
    try {
      const store = createRemediationReviewStore(join(dir, 'reviews.jsonl'));
      expect(() => store.record(panel({ soakRef: 'different::t' }), raw)).toThrow(
        'soak reference mismatch'
      );
      expect(store.getRecords()).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps human precedence even with stale or unverifiable later panel evidence', () => {
    const validRaw = JSON.stringify({
      signalKey: 'a',
      timestamp: 't',
      category: 'testing',
      priority: 'p2',
      severity: 'medium',
      planStepCount: 1,
      reason: 'higher_order: approved (100%)',
    });
    const records = [
      mkRecord({ soakRef: 'a::t' }),
      panel({ soakRecordHash: review.hashSoakRecordLine(validRaw) }),
    ];
    const store: review.RemediationReviewStore = { record: () => false, getRecords: () => records };
    // Human outranks panel: a later unverifiable panel cannot revoke the human judgment.
    expect(review.readRemediationReviewRecords(store, [validRaw])).toEqual([records[0]]);
    expect(review.readRemediationReviewRecords(store, [validRaw + ' '])).toEqual([records[0]]);
    expect(
      review.pendingSoakSelections(
        [{ signalKey: 'a', timestamp: 't' }],
        review.readRemediationReviewRecords(store, [validRaw + ' '])
      )
    ).toHaveLength(0);
    const sample = review.drawRemediationReviewSample([records[1]!], 1, 'alice', 'seed');
    const samples: review.RemediationReviewSampleStore = {
      record: () => false,
      getRecords: () => [sample],
    };
    expect(review.readRemediationReviewSummary(store, samples, [validRaw + ' ']).panel.n).toBe(0);
  });

  it('does not count historical human reviews of refs absent from the current soak', () => {
    const record = mkRecord();
    const store: review.RemediationReviewStore = {
      record: () => false,
      getRecords: () => [record],
    };
    expect(review.readRemediationReviewRecords(store, [])).toEqual([]);
    expect(review.ReviewRecordSchema.parse(record).judgeKind).toBe('human');
  });

  it('requires the active sample itself to carry complete consistent owner sign-off', () => {
    const panels = [panel(), panel({ soakRef: 'b::t' })];
    const sample = review.drawRemediationReviewSample(panels, 2, 'active-owner', 'seed');
    const oldOwner = mkRecord({ soakRef: 'historical', owner: 'old-owner' });
    const marks = sample.refs.map((soakRef) =>
      mkRecord({
        soakRef,
        judgeKind: 'owner-sample',
        sampleId: sample.id,
        evaluator: 'active-owner',
      })
    );
    expect(
      summarizeRemediationReviews([...panels, oldOwner, ...marks], sample).owner
    ).toBeUndefined();
    const signed = marks.map((mark) => ({ ...mark, owner: 'active-owner', ownerSignedOff: true }));
    expect(summarizeRemediationReviews([...panels, oldOwner, ...signed], sample).owner).toBe(
      'active-owner'
    );
    expect(
      summarizeRemediationReviews([...panels, oldOwner, signed[0]!], sample).owner
    ).toBeUndefined();
    expect(
      summarizeRemediationReviews(
        [...panels, oldOwner, signed[0]!, { ...signed[1]!, owner: 'other-owner' }],
        sample
      ).owner
    ).toBeUndefined();
  });

  it('draws a reproducible distinct sample from a recorded seed', () => {
    const panels = Array.from({ length: 20 }, (_, n) => panel({ soakRef: `ref-${String(n)}` }));
    const first = review.drawRemediationReviewSample(panels, 10, 'alice');
    const repeat = review.drawRemediationReviewSample(
      [...panels].reverse(),
      10,
      'alice',
      first.seed
    );
    expect(repeat.refs).toEqual(first.refs);
    expect(new Set(first.refs).size).toBe(10);
    expect(first.panels).toHaveLength(10);
  });

  it('persists samples and leaves empty samples explicitly empty', () => {
    const dir = mkdtempSync(join(process.cwd(), '.review-sample-'));
    try {
      const path = join(dir, 'samples.jsonl');
      const sample = review.drawRemediationReviewSample([], 10, 'alice', 'empty');
      expect(sample.refs).toEqual([]);
      expect(review.pendingSampleRefs(sample, [])).toEqual([]);
      review.createRemediationReviewSampleStore(path).record(sample);
      expect(review.createRemediationReviewSampleStore(path).getRecords()).toEqual([sample]);
      expect(summarizeRemediationReviews([], sample).sample).toEqual({ n: 0, disagreements: 0 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('judges the current ref after panel replacement but excludes unrelated sample marks', () => {
    const sample = review.drawRemediationReviewSample([panel()], 1, 'alice', 'seed');
    const owner = mkRecord({ soakRef: 'a::t', judgeKind: 'owner-sample', sampleId: sample.id });
    expect(
      review.pendingSampleRefs(sample, [
        panel({ voteRecordId: 'vote-2', evaluator: 'panel:vote-2' }),
        owner,
      ])
    ).toEqual([]); // Mark follows the current row; draw freshness is checked separately.
    expect(
      summarizeRemediationReviews([panel(), { ...owner, sampleId: 'different' }], sample).sample.n
    ).toBe(0);
  });
});
