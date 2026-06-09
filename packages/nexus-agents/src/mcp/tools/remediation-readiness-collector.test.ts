/**
 * Tests for the readiness-evidence collector (#3764) — builds
 * EnforceReadinessEvidence from the durable soak (#3762) + review (#3765)
 * summaries, and proves the fail-closed default.
 */

import { describe, it, expect } from 'vitest';

import { buildEnforceReadinessEvidence } from './remediation-readiness-collector.js';
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
      judgedSelections: 18,
      judgedSound: 17,
      evaluator: 'alice',
      owner: 'carol',
    };
    const evidence = buildEnforceReadinessEvidence(soak(20), reviews);
    expect(evidence.shadowSelections).toBe(20);
    expect(evidence.judgedSelections).toBe(18);
    expect(evidence.judgedSound).toBe(17);
    expect(evidence.evaluator).toBe('alice');
    expect(evidence.owner).toBe('carol');
  });

  it('produces evidence that PASSES the readiness gate when criteria are met', () => {
    const reviews: RemediationReviewSummary = {
      judgedSelections: 18,
      judgedSound: 17,
      evaluator: 'alice',
      owner: 'carol',
    };
    const evidence = buildEnforceReadinessEvidence(soak(20), reviews);
    expect(evaluateEnforceReadiness(evidence).ready).toBe(true);
  });

  it('FAIL-CLOSED: no reviews → judged 0 → readiness not ready', () => {
    const reviews: RemediationReviewSummary = { judgedSelections: 0, judgedSound: 0 };
    const evidence = buildEnforceReadinessEvidence(soak(20), reviews);
    expect(evidence.judgedSelections).toBe(0);
    const report = evaluateEnforceReadiness(evidence);
    expect(report.ready).toBe(false);
    expect(report.blockers).toContain('judged-coverage');
  });

  it('FAIL-CLOSED: empty soak + empty reviews → not ready', () => {
    const evidence = buildEnforceReadinessEvidence(soak(0), {
      judgedSelections: 0,
      judgedSound: 0,
    });
    expect(evidence.shadowSelections).toBe(0);
    expect(evaluateEnforceReadiness(evidence).ready).toBe(false);
  });

  it('omits evaluator/owner when reviews carry none', () => {
    const evidence = buildEnforceReadinessEvidence(soak(5), {
      judgedSelections: 0,
      judgedSound: 0,
    });
    expect(evidence.evaluator).toBeUndefined();
    expect(evidence.owner).toBeUndefined();
  });
});
