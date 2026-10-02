import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RemediationSoakRecordSchema } from './improvement-remediation-shadow.js';
import {
  hashSoakRecordLine,
  soakRefOf,
  summarizeRemediationReviews,
  type ReviewRecord,
} from './remediation-review.js';
import {
  drawRemediationReviewSample,
  createRemediationReviewSampleStore,
  ownerSampleSignOff,
  pendingSampleRefs,
  summarizeOwnerSample,
  type ReviewSample,
} from './remediation-review-sample.js';

function panel(key = 'test-coverage', sound = true, voteRecordId = 'vote-1'): ReviewRecord {
  const soak = RemediationSoakRecordSchema.parse({
    signalKey: key,
    timestamp: '2026-10-01T00:00:00.000Z',
    category: 'testing',
    priority: 'p2',
    severity: 'medium',
    planStepCount: 1,
    reason: 'higher_order: approved (100%)',
    voteOutcome: { approved: true, approvalPercentage: 100 },
  });
  return {
    judgeKind: 'panel',
    soakRef: soakRefOf(soak),
    soakRecordHash: hashSoakRecordLine(JSON.stringify(soak)),
    reviewedAt: '2026-10-01T01:00:00.000Z',
    reviewed: true,
    sound,
    voteRecordId,
    evaluator: `panel:${voteRecordId}`,
  };
}

function mark(sample: ReviewSample, sound = false, minute = '02'): ReviewRecord {
  return {
    judgeKind: 'owner-sample',
    sampleId: sample.id,
    soakRef: sample.refs[0]!,
    reviewedAt: `2026-10-01T01:${minute}:00.000Z`,
    reviewed: true,
    sound,
    evaluator: sample.owner,
    owner: sample.owner,
  };
}

function disagreements(samples: readonly ReviewSample[], records: readonly ReviewRecord[]): number {
  return summarizeRemediationReviews(records, samples.at(-1), samples).sample.disagreements;
}

describe('owner sample judgment history', () => {
  it('retains disagreement evidence beyond the old 10k sample cap', () => {
    const dir = mkdtempSync(join(tmpdir(), 'owner-sample-history-'));
    try {
      const first = panel();
      const other = panel('dependency-drift');
      const original = drawRemediationReviewSample([first], 1, 'Alice Reviewer', 'original');
      const redraw = drawRemediationReviewSample([other], 1, 'Alice Reviewer', 'redraw');
      const stored = [
        original,
        ...Array.from({ length: 10_000 }, (_, index) => ({
          ...redraw,
          id: `redraw-${String(index)}`,
        })),
      ];
      const path = join(dir, 'samples.jsonl');
      writeFileSync(path, stored.map((sample) => JSON.stringify(sample)).join('\n') + '\n');
      const samples = createRemediationReviewSampleStore(path).getRecords();
      expect(samples).toHaveLength(10_001);
      expect(disagreements(samples, [first, other, mark(original)])).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('preserves a disagreement when a redraw selects another ref', () => {
    const first = panel();
    const other = panel('dependency-drift');
    const original = drawRemediationReviewSample([first], 1, 'Alice Reviewer', 'original');
    const redraw = drawRemediationReviewSample([other], 1, 'Alice Reviewer', 'redraw');
    expect(
      disagreements([original, redraw], [first, other, mark(original), mark(redraw, true)])
    ).toBe(1);
  });

  it('preserves a disagreement after an unjudged redraw of the same ref', () => {
    const first = panel();
    const original = drawRemediationReviewSample([first], 1, 'Alice Reviewer', 'original');
    const redraw = drawRemediationReviewSample([first], 1, 'Alice Reviewer', 'redraw');
    expect(disagreements([original, redraw], [first, mark(original)])).toBe(1);
  });

  it('keeps disagreement after a later owner agreement in a different sample', () => {
    const first = panel();
    const original = drawRemediationReviewSample([first], 1, 'Alice Reviewer', 'original');
    const redraw = drawRemediationReviewSample([first], 1, 'Alice Reviewer', 'redraw');
    expect(
      disagreements([original, redraw], [first, mark(original), mark(redraw, true, '03')])
    ).toBe(1); // Resolution is bound to sampleId, even for the same owner.
  });

  it('retains disagreement when a later agreeing sample mark has no named owner', () => {
    const first = panel();
    const original = drawRemediationReviewSample([first], 1, 'Alice Reviewer', 'original');
    const redraw = drawRemediationReviewSample([first], 1, 'Alice Reviewer', 'redraw');
    const evaluatorMark = { ...mark(redraw, true, '03'), owner: undefined };
    expect(disagreements([original, redraw], [first, mark(original), evaluatorMark])).toBe(1);
  });

  it('resolves in the same sample without an owner annotation', () => {
    const first = panel();
    const sample = drawRemediationReviewSample([first], 1, 'Alice Reviewer', 'original');
    const agreement = { ...mark(sample, true, '03'), owner: undefined };
    expect(disagreements([sample], [first, mark(sample), agreement])).toBe(0);
  });

  it('retains carol disagreement when mallory names herself owner of carol sample', () => {
    const first = panel();
    const sample = drawRemediationReviewSample([first], 1, 'carol', 'original');
    const carol = { ...mark(sample), evaluator: 'carol', owner: 'carol' };
    const mallory = { ...mark(sample, true, '03'), evaluator: 'mallory', owner: 'mallory' };
    expect(disagreements([sample], [first, carol, mallory])).toBe(1);
    expect(summarizeOwnerSample(sample, [first, mallory])).toEqual({ n: 0, disagreements: 0 });
    expect(pendingSampleRefs(sample, [first, mallory])).toEqual(sample.refs);
    expect(summarizeOwnerSample(sample, [first, carol, mallory])).toEqual({
      n: 1,
      disagreements: 1,
    });
  });

  it('does not create owner disagreement from another evaluators mark', () => {
    const first = panel();
    const sample = drawRemediationReviewSample([first], 1, 'carol', 'original');
    const mallory = { ...mark(sample), evaluator: 'mallory', owner: 'mallory' };
    expect(disagreements([sample], [first, mallory])).toBe(0);
  });

  it('retains disagreement when an evaluator annotates another owner on an agreeing mark', () => {
    const first = panel();
    const original = drawRemediationReviewSample([first], 1, 'Alice Reviewer', 'original');
    const redraw = drawRemediationReviewSample([first], 1, 'Alice Reviewer', 'redraw');
    const evaluatorMark = { ...mark(redraw, true, '03'), evaluator: 'Bob Reviewer' };
    expect(disagreements([original, redraw], [first, mark(original), evaluatorMark])).toBe(1);
  });

  it('does not erase a disagreement when the panel changes to agree with the earlier owner', () => {
    const first = panel();
    const sample = drawRemediationReviewSample([first], 1, 'Alice Reviewer', 'original');
    const replacement = {
      ...panel('test-coverage', false, 'vote-2'),
      reviewedAt: '2026-10-01T02:00:00.000Z',
    };
    expect(disagreements([sample], [first, mark(sample), replacement])).toBe(1);
  });

  it('reports a superseded-panel disagreement as moot after human rejudgment', () => {
    const first = panel();
    const sample = drawRemediationReviewSample([first], 1, 'Alice Reviewer', 'original');
    const human: ReviewRecord = {
      judgeKind: 'human',
      soakRef: first.soakRef,
      reviewedAt: '2026-10-01T02:00:00.000Z',
      reviewed: true,
      sound: false,
      evaluator: 'Bob Reviewer',
    };
    const summary = summarizeRemediationReviews([first, mark(sample), human], sample, [sample]);
    expect(summary.sample.disagreements).toBe(0);
    expect(summary.mootOwnerDisagreements).toBe(1); // Superseded panels no longer require sampling.
    expect(summary.human).toEqual({ n: 1, disagreements: 1 });
    expect(summary.panel.n).toBe(0);
  });

  it('ignores marks outside the recorded sample refs', () => {
    const first = panel();
    const sample = drawRemediationReviewSample([first], 1, 'Alice Reviewer', 'original');
    expect(disagreements([sample], [first, { ...mark(sample), soakRef: 'unrelated::ref' }])).toBe(
      0
    );
  });

  it('ignores marks whose sample was never recorded', () => {
    const first = panel();
    const sample = drawRemediationReviewSample([first], 1, 'Alice Reviewer', 'original');
    expect(disagreements([], [first, mark(sample)])).toBe(0);
  });

  it('names no sample judgments as no historical disagreement', () => {
    expect(disagreements([], [])).toBe(0);
  });

  it('orders owner rejudgments by timestamp instead of append position', () => {
    const first = panel();
    const sample = drawRemediationReviewSample([first], 1, 'Alice Reviewer', 'original');
    expect(
      disagreements([sample], [first, mark(sample, false, '03'), mark(sample, true, '02')])
    ).toBe(1);
  });

  it('uses append order when owner rejudgments share a timestamp', () => {
    const first = panel();
    const sample = drawRemediationReviewSample([first], 1, 'Alice Reviewer', 'original');
    expect(disagreements([sample], [first, mark(sample), mark(sample, true)])).toBe(0);
  });

  it('counts each sample/ref disagreement independently', () => {
    const first = panel();
    const original = drawRemediationReviewSample([first], 1, 'Alice Reviewer', 'original');
    const redraw = drawRemediationReviewSample([first], 1, 'Alice Reviewer', 'redraw');
    expect(
      disagreements([original, redraw], [first, mark(original), mark(redraw, false, '03')])
    ).toBe(2); // A ref does not collapse disagreements from distinct draws.
  });
});

describe('owner sample explicit sign-off', () => {
  it('rejects sign-off that rebrands the recorded sample owner', () => {
    const first = panel();
    const sample = drawRemediationReviewSample([first], 1, 'carol', 'original');
    const renamed = {
      ...mark(sample, true),
      evaluator: 'carol',
      owner: 'mallory',
      ownerSignedOff: true,
    };
    expect(ownerSampleSignOff(sample, [first, renamed])).toBeUndefined();
  });

  it('does not accept an owner annotation as sign-off', () => {
    const first = panel();
    const sample = drawRemediationReviewSample([first], 1, 'Alice Owner', 'original');
    const annotation = { ...mark(sample, true), owner: 'Alice Owner', ownerSignedOff: false };
    expect(ownerSampleSignOff(sample, [first, annotation])).toBeUndefined();
    expect(ownerSampleSignOff(sample, [first, { ...annotation, ownerSignedOff: true }])).toBe(
      'Alice Owner'
    );
  });
});
