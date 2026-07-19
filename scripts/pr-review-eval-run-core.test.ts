/**
 * Tests for the pure v6 eval-run core (#4311, epic #3845; unblocks #3849).
 *
 * Covers the two load-bearing pure pieces:
 * - {@link matchesKnownBug}: rubric Rule 2 location-tolerance matching.
 * - {@link scoreCaseVoters}: per-case, per-voter verdict scoring (buggy catch,
 *   clean false-positive, borderline exclusion, errored-voter exclusion).
 * - {@link renderResultsDoc}: results-doc shape (frontmatter, per-voter table,
 *   per-case table, reproduction command).
 *
 * Zero I/O, zero live model calls — a deterministic stub panel feeds every
 * scenario (never `simulateVotes` standing in for a live run: this is
 * explicitly test-only plumbing, not a pretend measurement).
 *
 * @module scripts/pr-review-eval-run-core.test
 */

import { describe, it, expect } from 'vitest';

import {
  matchesKnownBug,
  scoreCaseVoters,
  renderResultsDoc,
  type PanelFinding,
  type PanelVoterOutcome,
  type EvalCaseResult,
} from './pr-review-eval-run-core.js';
import { computePerVoterPrecisionRecall } from '../packages/nexus-agents/src/mcp/tools/pr-review-eval-scoring.js';
import type { KnownBug } from './curate-pr-review-dataset-schema.js';

const TS = '2026-07-17T00:00:00Z';

function finding(over: Partial<PanelFinding>): PanelFinding {
  return {
    summary: 'issue',
    location: 'packages/nexus-agents/src/foo.ts:100',
    severity: 'medium',
    verified: true,
    ...over,
  };
}

function bug(over: Partial<KnownBug>): KnownBug {
  return {
    summary: 'a known bug',
    severity: 'medium',
    location: 'packages/nexus-agents/src/foo.ts:100',
    locationTolerance: 'line',
    fixReference: 'synthetic',
    ...over,
  };
}

function outcome(over: Partial<PanelVoterOutcome>): PanelVoterOutcome {
  return {
    role: 'architect',
    decision: 'approve',
    findings: [],
    source: 'llm',
    ...over,
  };
}

// ============================================================================
// matchesKnownBug — rubric Rule 2
// ============================================================================

describe('matchesKnownBug (rubric Rule 2 location tolerance)', () => {
  it('matches a line-tolerance bug when file matches and line is within ±5', () => {
    const b = bug({ location: 'src/foo.ts:100', locationTolerance: 'line' });
    expect(matchesKnownBug(finding({ location: 'src/foo.ts:104' }), b)).toBe(true);
    expect(matchesKnownBug(finding({ location: 'src/foo.ts:95' }), b)).toBe(true);
    expect(matchesKnownBug(finding({ location: 'src/foo.ts:100' }), b)).toBe(true);
  });

  it('does not match a line-tolerance bug when the line is more than ±5 away', () => {
    const b = bug({ location: 'src/foo.ts:100', locationTolerance: 'line' });
    expect(matchesKnownBug(finding({ location: 'src/foo.ts:106' }), b)).toBe(false);
    expect(matchesKnownBug(finding({ location: 'src/foo.ts:1' }), b)).toBe(false);
  });

  it('does not match a line-tolerance bug on a different file', () => {
    const b = bug({ location: 'src/foo.ts:100', locationTolerance: 'line' });
    expect(matchesKnownBug(finding({ location: 'src/bar.ts:100' }), b)).toBe(false);
  });

  it('matches a structural-tolerance bug on file alone, regardless of line', () => {
    const b = bug({ location: 'src/voter-execution.ts', locationTolerance: 'structural' });
    expect(matchesKnownBug(finding({ location: 'src/voter-execution.ts:9999' }), b)).toBe(true);
    expect(matchesKnownBug(finding({ location: 'src/voter-execution.ts' }), b)).toBe(true);
  });

  it('does not match a structural-tolerance bug on a different file', () => {
    const b = bug({ location: 'src/voter-execution.ts', locationTolerance: 'structural' });
    expect(matchesKnownBug(finding({ location: 'src/other.ts:1' }), b)).toBe(false);
  });

  it('tolerates repo-root-relative vs monorepo-relative path citations of the same file', () => {
    const b = bug({
      location: 'packages/nexus-agents/src/foo.ts:100',
      locationTolerance: 'line',
    });
    expect(matchesKnownBug(finding({ location: 'src/foo.ts:100' }), b)).toBe(true);
  });
});

// ============================================================================
// scoreCaseVoters — per-case, per-voter scoring
// ============================================================================

describe('scoreCaseVoters (per-case, per-voter verdict scoring)', () => {
  it('a buggy case: a verified finding matching the known bug scores as a true positive', () => {
    const knownBugs = [bug({ location: 'src/foo.ts:100', locationTolerance: 'line' })];
    const outcomes = [
      outcome({
        role: 'security',
        decision: 'request_changes',
        findings: [finding({ location: 'src/foo.ts:101', verified: true })],
      }),
    ];
    const verdicts = scoreCaseVoters(
      {
        runId: 'run-1',
        caseNumber: 'synthetic-redos',
        caseClass: 'buggy',
        knownBugs,
        rubricVersion: '1.0.0',
        timestamp: TS,
      },
      outcomes
    );
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]).toMatchObject({
      role: 'security',
      caseClass: 'buggy',
      truePositives: 1,
      falsePositives: 0,
      falseNegatives: 0,
    });
  });

  it('a buggy case: a voter with no matching verified finding scores a false negative', () => {
    const knownBugs = [bug({ location: 'src/foo.ts:100', locationTolerance: 'line' })];
    const outcomes = [outcome({ role: 'devex', decision: 'approve', findings: [] })];
    const verdicts = scoreCaseVoters(
      {
        runId: 'run-1',
        caseNumber: 'c',
        caseClass: 'buggy',
        knownBugs,
        rubricVersion: '1.0.0',
        timestamp: TS,
      },
      outcomes
    );
    expect(verdicts[0]).toMatchObject({ truePositives: 0, falseNegatives: 1, falsePositives: 0 });
  });

  it('a clean case: any verified finding is a strict false positive', () => {
    const outcomes = [
      outcome({
        role: 'catfish',
        decision: 'request_changes',
        findings: [finding({ location: 'src/anything.ts:1', verified: true })],
      }),
    ];
    const verdicts = scoreCaseVoters(
      {
        runId: 'run-1',
        caseNumber: 'synthetic-clean-docs',
        caseClass: 'clean',
        knownBugs: [],
        rubricVersion: '1.0.0',
        timestamp: TS,
      },
      outcomes
    );
    expect(verdicts[0]).toMatchObject({ truePositives: 0, falsePositives: 1, falseNegatives: 0 });
  });

  it('a clean case: an UNVERIFIED finding is not a false positive', () => {
    const outcomes = [
      outcome({
        role: 'catfish',
        decision: 'request_changes',
        findings: [finding({ verified: false })],
      }),
    ];
    const verdicts = scoreCaseVoters(
      {
        runId: 'run-1',
        caseNumber: 'c',
        caseClass: 'clean',
        knownBugs: [],
        rubricVersion: '1.0.0',
        timestamp: TS,
      },
      outcomes
    );
    expect(verdicts[0]).toMatchObject({ truePositives: 0, falsePositives: 0, falseNegatives: 0 });
  });

  it('a borderline case: verified findings are excluded from all numerators', () => {
    const outcomes = [
      outcome({
        role: 'devex',
        decision: 'request_changes',
        findings: [finding({ verified: true })],
      }),
    ];
    const verdicts = scoreCaseVoters(
      {
        runId: 'run-1',
        caseNumber: 'synthetic-clean-refactor',
        caseClass: 'borderline',
        knownBugs: [],
        rubricVersion: '1.0.0',
        timestamp: TS,
      },
      outcomes
    );
    expect(verdicts[0]).toMatchObject({ truePositives: 0, falsePositives: 0, falseNegatives: 0 });
  });

  it('excludes errored voters entirely (no verdict emitted for that role)', () => {
    const knownBugs = [bug({})];
    const outcomes = [
      outcome({ role: 'architect', source: 'error', findings: [] }),
      outcome({
        role: 'security',
        source: 'llm',
        findings: [finding({ verified: true })],
      }),
    ];
    const verdicts = scoreCaseVoters(
      {
        runId: 'run-1',
        caseNumber: 'c',
        caseClass: 'buggy',
        knownBugs,
        rubricVersion: '1.0.0',
        timestamp: TS,
      },
      outcomes
    );
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]?.role).toBe('security');
  });

  it('multiple known bugs: only bugs with a matching verified finding count as TP, rest as FN', () => {
    const knownBugs = [
      bug({ location: 'src/a.ts:10', locationTolerance: 'line' }),
      bug({ location: 'src/b.ts:20', locationTolerance: 'line' }),
    ];
    const outcomes = [
      outcome({
        role: 'architect',
        findings: [finding({ location: 'src/a.ts:11', verified: true })],
      }),
    ];
    const verdicts = scoreCaseVoters(
      {
        runId: 'run-1',
        caseNumber: 'c',
        caseClass: 'buggy',
        knownBugs,
        rubricVersion: '1.0.0',
        timestamp: TS,
      },
      outcomes
    );
    expect(verdicts[0]).toMatchObject({ truePositives: 1, falseNegatives: 1 });
  });

  it('produces verdicts whose caseNumber/runId/id round-trip through the #3848 report', () => {
    const knownBugs = [bug({})];
    const outcomes = [
      outcome({ role: 'architect', findings: [finding({ verified: true })] }),
      outcome({ role: 'security', findings: [] }),
    ];
    const verdicts = scoreCaseVoters(
      {
        runId: 'v6-run',
        caseNumber: 'synthetic-redos',
        caseClass: 'buggy',
        knownBugs,
        rubricVersion: '1.0.0',
        timestamp: TS,
      },
      outcomes
    );
    const report = computePerVoterPrecisionRecall(verdicts);
    expect(report.byRole.architect.truePositives).toBe(1);
    expect(report.byRole.security.falseNegatives).toBe(1);
    expect(verdicts.every((v) => v.id.startsWith('v6-run:synthetic-redos:'))).toBe(true);
  });
});

// ============================================================================
// renderResultsDoc — v6 doc shape
// ============================================================================

describe('renderResultsDoc (v6 results doc shape)', () => {
  it('renders frontmatter, per-voter table, per-case table, and the reproduction command', () => {
    const caseResults: EvalCaseResult[] = [
      {
        number: 'synthetic-redos',
        class: 'buggy',
        title: 'a buggy case',
        outcomes: [outcome({ role: 'architect', findings: [finding({ verified: true })] })],
        verdicts: [],
      },
      {
        number: 'synthetic-clean-docs',
        class: 'clean',
        title: 'a clean case',
        outcomes: [outcome({ role: 'architect', findings: [] })],
        verdicts: [],
      },
    ];
    const report = computePerVoterPrecisionRecall([]);
    const doc = renderResultsDoc({
      runId: 'v6-2026-07-17T00-00-00',
      timestamp: TS,
      dataset: { rubricVersion: '1.0.0' },
      report,
      caseResults,
    });

    expect(doc.startsWith('---\n')).toBe(true);
    expect(doc).toContain('title: pr_review experiment v6');
    expect(doc).toContain('#4311');
    expect(doc).toContain('n=2: 1 buggy / 1 clean / 0 borderline');
    expect(doc).toContain('| Role | TP | FP | FN | Precision | Recall | Cases |');
    expect(doc).toContain('| architect |');
    expect(doc).toContain('| security |');
    expect(doc).toContain('| devex |');
    expect(doc).toContain('| catfish |');
    expect(doc).toContain('| scope_steward |');
    expect(doc).toContain('| **aggregate** |');
    expect(doc).toContain('| Case | Class | Verified findings (all voters) |');
    expect(doc).toContain('| synthetic-redos | buggy | 1 |');
    expect(doc).toContain('| synthetic-clean-docs | clean | 0 |');
    expect(doc).toContain('npm run eval:run');
    expect(doc).toContain('#3903');
  });

  it('is deterministic for identical input', () => {
    const report = computePerVoterPrecisionRecall([]);
    const params = {
      runId: 'r',
      timestamp: TS,
      dataset: { rubricVersion: '1.0.0' },
      report,
      caseResults: [] as EvalCaseResult[],
    };
    expect(renderResultsDoc(params)).toBe(renderResultsDoc(params));
  });
});
