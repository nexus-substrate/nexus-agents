/**
 * Tests for the readiness-evidence collector (#3764) — builds
 * EnforceReadinessEvidence from the durable soak (#3762) + review (#3765)
 * summaries, and proves the fail-closed default.
 */

import { describe, it, expect } from 'vitest';

import {
  assessSoakStaleness,
  buildEnforceReadinessEvidence,
} from './remediation-readiness-collector.js';
import { evaluateEnforceReadiness } from './improvement-enforce-readiness.js';
import type { RemediationSoakSummary } from './improvement-remediation-shadow.js';
import type { RemediationReviewSummary } from './remediation-review.js';

function soak(total: number): RemediationSoakSummary {
  return {
    total,
    voted: total,
    approved: total,
    rejected: 0,
    approvalRate: total === 0 ? 0 : 1,
    dryRunsCaptured: 0,
    byCategory: {},
    byPriority: {},
  };
}

describe('buildEnforceReadinessEvidence', () => {
  it('maps soak total → shadowSelections and review counts/evaluator/owner', () => {
    const reviews: RemediationReviewSummary = {
      namedEvaluatorJudgments: 1,
      judgedSelections: 18,
      judgedSound: 17,
      evaluator: 'alice',
      owner: 'carol',
      human: { n: 0, disagreements: 0 },
      panel: { n: 18, disagreements: 1 },
      rawPanelRows: 18,
      rawOwnerSampleRows: 0,
      evictedPanelRows: 0,
      sample: { n: 10, disagreements: 0 },
      sampleExists: true,
      sampleFresh: true,
      evictedReviewRows: 2,
      unverifiablePanelRows: 3,
      sampledSelections: 10,
    };
    const evidence = buildEnforceReadinessEvidence(soak(20), reviews);
    expect(evidence.shadowSelections).toBe(20);
    expect(evidence.judgedSelections).toBe(18);
    expect(evidence.judgedSound).toBe(17);
    expect(evidence.evaluator).toBe('alice');
    expect(evidence.namedEvaluatorJudgments).toBe(1);
    expect(evidence.owner).toBe('carol');
    expect(evidence.evictedReviewRows).toBe(2);
    expect(evidence.unverifiablePanelRows).toBe(3);
    expect(evidence.rawPanelRows).toBe(18);
    expect(evidence.rawOwnerSampleRows).toBe(0);
    expect(evidence.evictedPanelRows).toBe(0);
  });

  it('produces evidence that PASSES the readiness gate when criteria are met', () => {
    // #4158: the volume bar is now ≥100 shadow selections.
    const reviews: RemediationReviewSummary = {
      namedEvaluatorJudgments: 1,
      judgedSelections: 110, // 91.7% ≥ 80%
      judgedSound: 105, // 95.5% ≥ 90%
      evaluator: 'alice',
      owner: 'carol',
      human: { n: 0, disagreements: 0 },
      panel: { n: 110, disagreements: 5 },
      rawPanelRows: 110,
      rawOwnerSampleRows: 0,
      evictedPanelRows: 0,
      sample: { n: 10, disagreements: 0 },
      sampleExists: true,
      sampleFresh: true,
      evictedReviewRows: 0,
      unverifiablePanelRows: 0,
      sampledSelections: 10,
    };
    const evidence = buildEnforceReadinessEvidence(soak(120), reviews);
    expect(evaluateEnforceReadiness(evidence).ready).toBe(true);
  });

  it('keeps panel, human, and owner sample counts separate in the evidence', () => {
    const evidence = buildEnforceReadinessEvidence(soak(120), {
      namedEvaluatorJudgments: 1,
      judgedSelections: 110,
      judgedSound: 105,
      human: { n: 30, disagreements: 1 },
      panel: { n: 80, disagreements: 4 },
      rawPanelRows: 80,
      rawOwnerSampleRows: 0,
      evictedPanelRows: 0,
      sample: { n: 10, disagreements: 0 },
      sampleExists: true,
      sampleFresh: true,
      evictedReviewRows: 0,
      unverifiablePanelRows: 0,
      sampledSelections: 10,
    });
    expect(evidence.human).toEqual({ n: 30, disagreements: 1 });
    expect(evidence.panel).toEqual({ n: 80, disagreements: 4 });
    expect(evidence.sample).toEqual({ n: 10, disagreements: 0 });
    expect(evidence.sampleExists).toBe(true);
  });

  it('carries stale sample evidence through to a blocked owner-agreement criterion', () => {
    const reviews = {
      namedEvaluatorJudgments: 1,
      judgedSelections: 110,
      judgedSound: 105,
      evaluator: 'alice',
      owner: 'carol',
      human: { n: 0, disagreements: 0 },
      panel: { n: 110, disagreements: 5 },
      rawPanelRows: 110,
      rawOwnerSampleRows: 0,
      evictedPanelRows: 0,
      sample: { n: 10, disagreements: 0 },
      sampleExists: true,
      sampledSelections: 10,
      sampleFresh: false,
      evictedReviewRows: 0,
      unverifiablePanelRows: 0,
    };
    const evidence = buildEnforceReadinessEvidence(soak(120), reviews);
    expect(evidence).toHaveProperty('sampleFresh', false);
    const report = evaluateEnforceReadiness(evidence);
    expect(report.blockers).toContain('owner-agreement');
    expect(report.criteria.find((c) => c.name === 'owner-agreement')?.detail).toContain('stale');
  });

  it('keeps all-human review ready without requiring any panel owner sample', () => {
    const evidence = buildEnforceReadinessEvidence(soak(120), {
      namedEvaluatorJudgments: 1,
      judgedSelections: 110,
      judgedSound: 105,
      evaluator: 'alice',
      owner: 'carol',
      human: { n: 110, disagreements: 5 },
      panel: { n: 0, disagreements: 0 },
      rawPanelRows: 0,
      rawOwnerSampleRows: 0,
      evictedPanelRows: 0,
      sample: { n: 0, disagreements: 0 },
      sampleExists: false,
      sampleFresh: false,
      evictedReviewRows: 0,
      unverifiablePanelRows: 0,
      sampledSelections: 0,
    });
    expect(evaluateEnforceReadiness(evidence).ready).toBe(true);
  });

  it('FAIL-CLOSED: no reviews → judged 0 → readiness not ready', () => {
    const reviews: RemediationReviewSummary = {
      namedEvaluatorJudgments: 0,
      judgedSelections: 0,
      judgedSound: 0,
      human: { n: 0, disagreements: 0 },
      panel: { n: 0, disagreements: 0 },
      rawPanelRows: 0,
      rawOwnerSampleRows: 0,
      evictedPanelRows: 0,
      sample: { n: 0, disagreements: 0 },
      sampleExists: false,
      sampleFresh: false,
      evictedReviewRows: 0,
      unverifiablePanelRows: 0,
      sampledSelections: 0,
    };
    const evidence = buildEnforceReadinessEvidence(soak(20), reviews);
    expect(evidence.judgedSelections).toBe(0);
    const report = evaluateEnforceReadiness(evidence);
    expect(report.ready).toBe(false);
    expect(report.blockers).toContain('judged-coverage');
  });

  it('FAIL-CLOSED: empty soak + empty reviews → not ready', () => {
    const evidence = buildEnforceReadinessEvidence(soak(0), {
      namedEvaluatorJudgments: 0,
      judgedSelections: 0,
      judgedSound: 0,
      human: { n: 0, disagreements: 0 },
      panel: { n: 0, disagreements: 0 },
      rawPanelRows: 0,
      rawOwnerSampleRows: 0,
      evictedPanelRows: 0,
      sample: { n: 0, disagreements: 0 },
      sampleExists: false,
      sampleFresh: false,
      evictedReviewRows: 0,
      unverifiablePanelRows: 0,
      sampledSelections: 0,
    });
    expect(evidence.shadowSelections).toBe(0);
    expect(evaluateEnforceReadiness(evidence).ready).toBe(false);
  });

  it('omits evaluator/owner when reviews carry none', () => {
    const evidence = buildEnforceReadinessEvidence(soak(5), {
      namedEvaluatorJudgments: 0,
      judgedSelections: 0,
      judgedSound: 0,
      human: { n: 0, disagreements: 0 },
      panel: { n: 0, disagreements: 0 },
      rawPanelRows: 0,
      rawOwnerSampleRows: 0,
      evictedPanelRows: 0,
      sample: { n: 0, disagreements: 0 },
      sampleExists: false,
      sampleFresh: false,
      evictedReviewRows: 0,
      unverifiablePanelRows: 0,
      sampledSelections: 0,
    });
    expect(evidence.evaluator).toBeUndefined();
    expect(evidence.owner).toBeUndefined();
  });
});

/**
 * #4279 item 3 — staleness/flatline alarm on the operator soak store. A store
 * that has stopped accruing (1 record for five weeks went unnoticed behind a
 * green CI job) must be a visible signal in the readiness report, and an EMPTY
 * store must read as unmeasured, never as a quiet pass.
 */
describe('assessSoakStaleness (#4279)', () => {
  const NOW = Date.parse('2026-09-14T12:00:00.000Z');
  const daysAgo = (d: number): string => new Date(NOW - d * 86_400_000).toISOString();

  it('empty store → unmeasured (not fresh, not alarm), with no idle measurement', () => {
    const s = assessSoakStaleness(soak(0), NOW);
    expect(s.status).toBe('unmeasured');
    expect(s.recordCount).toBe(0);
    expect(s.idleDays).toBeUndefined();
    expect(s.reasons.join(' ')).toMatch(/empty/i);
  });

  it('a single record → alarm: flatlined (even when it is recent)', () => {
    const s = assessSoakStaleness({ ...soak(1), lastTimestamp: daysAgo(1) }, NOW);
    expect(s.status).toBe('alarm');
    expect(s.reasons.some((r) => /flatlined/i.test(r))).toBe(true);
    expect(s.reasons.some((r) => /no new record/i.test(r))).toBe(false);
  });

  it('no new record for the alarm window → alarm: stale, naming the idle days and the threshold', () => {
    const s = assessSoakStaleness({ ...soak(3), lastTimestamp: daysAgo(20) }, NOW);
    expect(s.status).toBe('alarm');
    expect(s.idleDays).toBe(20);
    expect(s.alarmAfterDays).toBe(14);
    expect(s.reasons).toContain('no new record for 20 days (alarm at ≥ 14 days)');
    expect(s.reasons.some((r) => /flatlined/i.test(r))).toBe(false);
  });

  it('one record AND stale → BOTH reasons are rendered (never else-if)', () => {
    const s = assessSoakStaleness({ ...soak(1), lastTimestamp: daysAgo(97) }, NOW);
    expect(s.status).toBe('alarm');
    expect(s.reasons.some((r) => /flatlined/i.test(r))).toBe(true);
    expect(s.reasons.some((r) => /no new record for 97 days/.test(r))).toBe(true);
  });

  it('exactly at the alarm boundary is stale; one day inside is fresh', () => {
    expect(assessSoakStaleness({ ...soak(3), lastTimestamp: daysAgo(14) }, NOW).status).toBe(
      'alarm'
    );
    const fresh = assessSoakStaleness({ ...soak(3), lastTimestamp: daysAgo(13) }, NOW);
    expect(fresh.status).toBe('fresh');
    expect(fresh.idleDays).toBe(13);
    expect(fresh.reasons).toEqual([]);
  });

  it('an unreadable last timestamp is an alarm, not a silent fresh', () => {
    const s = assessSoakStaleness({ ...soak(5), lastTimestamp: 'not-a-date' }, NOW);
    expect(s.status).toBe('alarm');
    expect(s.idleDays).toBeUndefined();
    expect(s.reasons.some((r) => /unreadable/i.test(r))).toBe(true);
  });

  it('a last record in the future (clock skew) measures as 0 idle days, fresh', () => {
    const s = assessSoakStaleness({ ...soak(5), lastTimestamp: daysAgo(-2) }, NOW);
    expect(s.idleDays).toBe(0);
    expect(s.status).toBe('fresh');
  });
});
