/**
 * Fixture tests for the per-voter pr_review eval scoring + report (#3848).
 *
 * Covers the precision/recall math and the verdict-scoring rubric application:
 * - perfect voter, zero-positive voter, missed-bug (FN) voter
 * - clean-case false positives, borderline exclusion
 * - aggregate folding, empty-window safety
 *
 * @module mcp/tools/pr-review-eval-scoring.test
 * (Source: #3848)
 */

import { describe, it, expect } from 'vitest';

import { scoreVoterCase, computePerVoterPrecisionRecall } from './pr-review-eval-scoring.js';
import type { VoterEvalVerdict } from './pr-review-eval-types.js';

const TS = '2026-06-17T00:00:00Z';

function verdict(over: Partial<VoterEvalVerdict>): VoterEvalVerdict {
  return {
    id: 'r1:c1:architect',
    runId: 'r1',
    caseNumber: 'c1',
    caseClass: 'buggy',
    role: 'architect',
    truePositives: 0,
    falsePositives: 0,
    falseNegatives: 0,
    rubricVersion: '1.0.0',
    timestamp: TS,
    ...over,
  };
}

describe('scoreVoterCase (#3848 rubric application)', () => {
  it('counts a verified finding matching a known bug as a true positive (buggy case)', () => {
    const v = scoreVoterCase({
      runId: 'r1',
      caseNumber: 'synthetic-redos',
      caseClass: 'buggy',
      role: 'security',
      knownBugCount: 1,
      matchedBugCount: 1,
      verifiedFindingCount: 1,
      rubricVersion: '1.0.0',
      timestamp: TS,
    });
    expect(v.truePositives).toBe(1);
    expect(v.falseNegatives).toBe(0);
    expect(v.falsePositives).toBe(0);
    expect(v.id).toBe('r1:synthetic-redos:security');
  });

  it('counts unmatched known bugs as false negatives (voter missed a bug)', () => {
    const v = scoreVoterCase({
      runId: 'r1',
      caseNumber: 'synthetic-redos',
      caseClass: 'buggy',
      role: 'devex',
      knownBugCount: 2,
      matchedBugCount: 0,
      verifiedFindingCount: 0,
      rubricVersion: '1.0.0',
      timestamp: TS,
    });
    expect(v.truePositives).toBe(0);
    expect(v.falseNegatives).toBe(2);
    expect(v.falsePositives).toBe(0);
  });

  it('counts verified findings on a clean case as false positives', () => {
    const v = scoreVoterCase({
      runId: 'r1',
      caseNumber: 'synthetic-clean-docs',
      caseClass: 'clean',
      role: 'catfish',
      knownBugCount: 0,
      matchedBugCount: 0,
      verifiedFindingCount: 3,
      rubricVersion: '1.0.0',
      timestamp: TS,
    });
    expect(v.falsePositives).toBe(3);
    expect(v.truePositives).toBe(0);
    expect(v.falseNegatives).toBe(0);
  });

  it('excludes borderline cases from all numerators (neither catch nor FP)', () => {
    const v = scoreVoterCase({
      runId: 'r1',
      caseNumber: 'synthetic-clean-refactor',
      caseClass: 'borderline',
      role: 'devex',
      knownBugCount: 0,
      matchedBugCount: 0,
      verifiedFindingCount: 2,
      rubricVersion: '1.0.0',
      timestamp: TS,
    });
    expect(v.truePositives).toBe(0);
    expect(v.falsePositives).toBe(0);
    expect(v.falseNegatives).toBe(0);
    expect(v.caseClass).toBe('borderline');
  });

  it('on a buggy case, extra verified findings beyond matched bugs are not false positives', () => {
    // Rubric: a finding either matches a known bug (catch) or is noise on a
    // buggy case; only clean-case findings are strict false positives. So on a
    // buggy case we count matched bugs as TP and unmatched bugs as FN — extra
    // unmatched findings do not inflate FP.
    const v = scoreVoterCase({
      runId: 'r1',
      caseNumber: 'synthetic-null-deref',
      caseClass: 'buggy',
      role: 'architect',
      knownBugCount: 1,
      matchedBugCount: 1,
      verifiedFindingCount: 4,
      rubricVersion: '1.0.0',
      timestamp: TS,
    });
    expect(v.truePositives).toBe(1);
    expect(v.falseNegatives).toBe(0);
    expect(v.falsePositives).toBe(0);
  });

  it('clamps matchedBugCount to knownBugCount (defensive)', () => {
    const v = scoreVoterCase({
      runId: 'r1',
      caseNumber: 'c',
      caseClass: 'buggy',
      role: 'security',
      knownBugCount: 1,
      matchedBugCount: 5,
      verifiedFindingCount: 5,
      rubricVersion: '1.0.0',
      timestamp: TS,
    });
    expect(v.truePositives).toBe(1);
    expect(v.falseNegatives).toBe(0);
  });
});

describe('computePerVoterPrecisionRecall (#3848 report)', () => {
  it('computes precision and recall per role and aggregate', () => {
    const verdicts: VoterEvalVerdict[] = [
      // security: 3 TP, 1 FP, 1 FN -> precision 3/4=0.75, recall 3/4=0.75
      verdict({
        role: 'security',
        caseNumber: 'a',
        truePositives: 2,
        falsePositives: 0,
        falseNegatives: 0,
      }),
      verdict({
        role: 'security',
        caseNumber: 'b',
        caseClass: 'buggy',
        truePositives: 1,
        falseNegatives: 1,
      }),
      verdict({ role: 'security', caseNumber: 'c', caseClass: 'clean', falsePositives: 1 }),
      // architect: 1 TP, 0 FP, 0 FN -> perfect
      verdict({ role: 'architect', caseNumber: 'a', truePositives: 1 }),
    ];
    const report = computePerVoterPrecisionRecall(verdicts);

    expect(report.byRole.security.truePositives).toBe(3);
    expect(report.byRole.security.falsePositives).toBe(1);
    expect(report.byRole.security.falseNegatives).toBe(1);
    expect(report.byRole.security.precision).toBeCloseTo(0.75);
    expect(report.byRole.security.recall).toBeCloseTo(0.75);
    expect(report.byRole.security.caseCount).toBe(3);

    expect(report.byRole.architect.precision).toBe(1);
    expect(report.byRole.architect.recall).toBe(1);

    // aggregate: tp=4, fp=1, fn=1 -> precision 4/5=0.8, recall 4/5=0.8
    expect(report.aggregate.truePositives).toBe(4);
    expect(report.aggregate.falsePositives).toBe(1);
    expect(report.aggregate.falseNegatives).toBe(1);
    expect(report.aggregate.precision).toBeCloseTo(0.8);
    expect(report.aggregate.recall).toBeCloseTo(0.8);
    expect(report.totalVerdicts).toBe(4);
  });

  it('a perfect voter (no FP, no FN) scores precision=1 recall=1', () => {
    const report = computePerVoterPrecisionRecall([
      verdict({ role: 'catfish', truePositives: 5, falsePositives: 0, falseNegatives: 0 }),
    ]);
    expect(report.byRole.catfish.precision).toBe(1);
    expect(report.byRole.catfish.recall).toBe(1);
  });

  it('a voter with zero positives reports precision=0 (not NaN)', () => {
    const report = computePerVoterPrecisionRecall([
      // only misses: 0 TP, 0 FP, 3 FN
      verdict({ role: 'scope_steward', caseClass: 'buggy', falseNegatives: 3 }),
    ]);
    expect(report.byRole.scope_steward.precision).toBe(0);
    expect(report.byRole.scope_steward.recall).toBe(0); // 0/(0+3)
    expect(Number.isNaN(report.byRole.scope_steward.precision)).toBe(false);
  });

  it('a voter with no known bugs to find reports recall=0 (not NaN)', () => {
    const report = computePerVoterPrecisionRecall([
      // only clean-case false positives: 0 TP, 2 FP, 0 FN
      verdict({ role: 'devex', caseClass: 'clean', falsePositives: 2 }),
    ]);
    expect(report.byRole.devex.recall).toBe(0); // 0/(0+0)
    expect(report.byRole.devex.precision).toBe(0); // 0/(0+2)
    expect(Number.isNaN(report.byRole.devex.recall)).toBe(false);
  });

  it('roles with no verdicts report all-zero entries (every role present)', () => {
    const report = computePerVoterPrecisionRecall([
      verdict({ role: 'security', truePositives: 1 }),
    ]);
    for (const role of ['architect', 'devex', 'catfish', 'scope_steward'] as const) {
      expect(report.byRole[role]).toEqual({
        truePositives: 0,
        falsePositives: 0,
        falseNegatives: 0,
        precision: 0,
        recall: 0,
        caseCount: 0,
      });
    }
  });

  it('empty window is safe: all zeros, no NaN', () => {
    const report = computePerVoterPrecisionRecall([]);
    expect(report.totalVerdicts).toBe(0);
    expect(report.aggregate.precision).toBe(0);
    expect(report.aggregate.recall).toBe(0);
    expect(report.byRole.architect.caseCount).toBe(0);
  });

  it('counts distinct case numbers per role for caseCount (dedupes within a role)', () => {
    const report = computePerVoterPrecisionRecall([
      verdict({ role: 'security', caseNumber: 'a', truePositives: 1 }),
      verdict({ role: 'security', caseNumber: 'a', falsePositives: 1, caseClass: 'clean' }),
      verdict({ role: 'security', caseNumber: 'b', truePositives: 1 }),
    ]);
    expect(report.byRole.security.caseCount).toBe(2);
  });

  it('is deterministic (same input -> identical output)', () => {
    const input = [verdict({ role: 'security', truePositives: 2, falseNegatives: 1 })];
    expect(computePerVoterPrecisionRecall(input)).toEqual(computePerVoterPrecisionRecall(input));
  });
});
