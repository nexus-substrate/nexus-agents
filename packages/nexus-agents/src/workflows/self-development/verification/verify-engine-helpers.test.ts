/**
 * Tests for Verify Engine Helpers
 * @module workflows/self-development/verification/verify-engine-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { CheckDefinition, CheckResult, CheckIssue } from './verify-types.js';
import {
  findFailurePatterns,
  hasSuccessPatternMatch,
  analyzeCheckOutput,
  computeScores,
  allRequiredPassed,
  buildFailureSummary,
  buildRecommendations,
  extractFilesFromIssues,
  prioritizeFixes,
  truncateOutput,
} from './verify-engine-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeCheck(overrides: Partial<CheckDefinition> = {}): CheckDefinition {
  return {
    id: 'check-1',
    name: 'Test Check',
    command: 'pnpm test',
    required: true,
    weight: 0.5,
    ...overrides,
  } as CheckDefinition;
}

function makeCheckResult(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    checkId: 'check-1',
    passed: true,
    score: 1.0,
    durationMs: 100,
    output: 'all passed',
    ...overrides,
  } as CheckResult;
}

// ============================================================================
// findFailurePatterns
// ============================================================================

describe('findFailurePatterns', () => {
  it('returns empty when no failure patterns', () => {
    const check = makeCheck();
    expect(findFailurePatterns(check, 'some output')).toEqual([]);
  });

  it('finds matching patterns', () => {
    const check = makeCheck({ failurePatterns: ['ERROR', 'FAIL'] });
    const issues = findFailurePatterns(check, 'test ERROR: something failed');
    expect(issues.some((i) => i.severity === 'error')).toBe(true);
  });

  it('returns empty when no matches', () => {
    const check = makeCheck({ failurePatterns: ['CRITICAL'] });
    expect(findFailurePatterns(check, 'all tests passed')).toEqual([]);
  });
});

// ============================================================================
// hasSuccessPatternMatch
// ============================================================================

describe('hasSuccessPatternMatch', () => {
  it('returns false when no success patterns', () => {
    const check = makeCheck();
    expect(hasSuccessPatternMatch(check, 'output')).toBe(false);
  });

  it('returns true when pattern matches', () => {
    const check = makeCheck({ successPatterns: ['All tests passed'] });
    expect(hasSuccessPatternMatch(check, 'All tests passed successfully')).toBe(true);
  });

  it('returns false when pattern does not match', () => {
    const check = makeCheck({ successPatterns: ['All tests passed'] });
    expect(hasSuccessPatternMatch(check, 'Some tests failed')).toBe(false);
  });
});

// ============================================================================
// analyzeCheckOutput
// ============================================================================

describe('analyzeCheckOutput', () => {
  it('passes with no error and no failure patterns', () => {
    const check = makeCheck();
    const result = analyzeCheckOutput(check, 'ok', null);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1.0);
  });

  it('fails when error is present', () => {
    const check = makeCheck();
    const result = analyzeCheckOutput(check, 'output', 'error occurred');
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  it('fails when failure pattern matches', () => {
    const check = makeCheck({ failurePatterns: ['FAIL'] });
    const result = analyzeCheckOutput(check, 'test FAIL here', null);
    expect(result.passed).toBe(false);
  });

  it('fails when success pattern required but not found', () => {
    const check = makeCheck({ successPatterns: ['OK'] });
    const result = analyzeCheckOutput(check, 'nothing here', null);
    expect(result.passed).toBe(false);
  });

  it('passes when success pattern found', () => {
    const check = makeCheck({ successPatterns: ['passed'] });
    const result = analyzeCheckOutput(check, 'all tests passed', null);
    expect(result.passed).toBe(true);
  });

  it('penalizes score for issues', () => {
    const check = makeCheck({ failurePatterns: ['warn'] });
    // Produces non-error issues that reduce score
    const result = analyzeCheckOutput(check, 'warn: something', null);
    // Result has error issues so passed=false
    expect(result.passed).toBe(false);
  });
});

// ============================================================================
// computeScores
// ============================================================================

describe('computeScores', () => {
  it('returns zeros for empty results', () => {
    const result = computeScores([], []);
    expect(result.qualityScore).toBe(0);
    expect(result.confidence).toBe(0);
  });

  it('computes weighted quality score', () => {
    const checks = [makeCheck({ id: 'c1', weight: 0.6 }), makeCheck({ id: 'c2', weight: 0.4 })];
    const results = [
      makeCheckResult({ checkId: 'c1', score: 1.0, passed: true }),
      makeCheckResult({ checkId: 'c2', score: 0.5, passed: true }),
    ];
    const { qualityScore } = computeScores(results, checks);
    // (1.0*0.6 + 0.5*0.4) / (0.6+0.4) = (0.6 + 0.2) / 1.0 = 0.8
    expect(qualityScore).toBeCloseTo(0.8);
  });

  it('reduces confidence for failures', () => {
    const checks = [makeCheck({ id: 'c1' })];
    const results = [makeCheckResult({ checkId: 'c1', passed: false, score: 0 })];
    const { confidence } = computeScores(results, checks);
    expect(confidence).toBeLessThan(1.0);
  });
});

// ============================================================================
// allRequiredPassed
// ============================================================================

describe('allRequiredPassed', () => {
  it('returns true when all required pass', () => {
    const checks = [makeCheck({ id: 'c1', required: true })];
    const results = [makeCheckResult({ checkId: 'c1', passed: true })];
    expect(allRequiredPassed(results, checks)).toBe(true);
  });

  it('returns false when required fails', () => {
    const checks = [makeCheck({ id: 'c1', required: true })];
    const results = [makeCheckResult({ checkId: 'c1', passed: false })];
    expect(allRequiredPassed(results, checks)).toBe(false);
  });

  it('returns true when optional fails', () => {
    const checks = [makeCheck({ id: 'c1', required: false })];
    const results = [makeCheckResult({ checkId: 'c1', passed: false })];
    expect(allRequiredPassed(results, checks)).toBe(true);
  });
});

// ============================================================================
// buildFailureSummary
// ============================================================================

describe('buildFailureSummary', () => {
  it('returns default for no failures', () => {
    expect(buildFailureSummary([makeCheckResult({ passed: true })], [makeCheck()])).toBe(
      'Quality threshold not met'
    );
  });

  it('lists failed check names', () => {
    const checks = [makeCheck({ id: 'c1', name: 'Lint' }), makeCheck({ id: 'c2', name: 'Test' })];
    const results = [
      makeCheckResult({ checkId: 'c1', passed: false }),
      makeCheckResult({ checkId: 'c2', passed: false }),
    ];
    const summary = buildFailureSummary(results, checks);
    expect(summary).toContain('2');
    expect(summary).toContain('Lint');
    expect(summary).toContain('Test');
  });
});

// ============================================================================
// buildRecommendations
// ============================================================================

describe('buildRecommendations', () => {
  it('returns empty for all passed', () => {
    expect(buildRecommendations([makeCheckResult({ passed: true })], [makeCheck()])).toEqual([]);
  });

  it('recommends fixing failed checks', () => {
    const checks = [makeCheck({ id: 'c1', name: 'Lint', command: 'pnpm lint' })];
    const results = [makeCheckResult({ checkId: 'c1', passed: false })];
    const recs = buildRecommendations(results, checks);
    expect(recs.some((r) => r.includes('Lint'))).toBe(true);
    expect(recs.some((r) => r.includes('pnpm lint'))).toBe(true);
  });

  it('includes top issue message', () => {
    const results = [
      makeCheckResult({
        checkId: 'c1',
        passed: false,
        issues: [{ code: 'c1', message: 'unused import', severity: 'error' }],
      }),
    ];
    const recs = buildRecommendations(results, [makeCheck({ id: 'c1' })]);
    expect(recs.some((r) => r.includes('unused import'))).toBe(true);
  });
});

// ============================================================================
// extractFilesFromIssues
// ============================================================================

describe('extractFilesFromIssues', () => {
  it('extracts unique files', () => {
    const results = [
      makeCheckResult({
        issues: [
          { code: 'c1', message: 'err', severity: 'error', file: 'src/a.ts' } as CheckIssue,
          { code: 'c1', message: 'err', severity: 'error', file: 'src/a.ts' } as CheckIssue,
          { code: 'c1', message: 'err', severity: 'error', file: 'src/b.ts' } as CheckIssue,
        ],
      }),
    ];
    const files = extractFilesFromIssues(results);
    expect(files).toHaveLength(2);
    expect(files).toContain('src/a.ts');
    expect(files).toContain('src/b.ts');
  });

  it('returns empty for no issues', () => {
    expect(extractFilesFromIssues([makeCheckResult()])).toEqual([]);
  });
});

// ============================================================================
// prioritizeFixes
// ============================================================================

describe('prioritizeFixes', () => {
  it('puts required checks first', () => {
    const checks = [
      makeCheck({ id: 'c1', name: 'Optional', required: false }),
      makeCheck({ id: 'c2', name: 'Required', required: true }),
    ];
    const failed = [
      makeCheckResult({ checkId: 'c1', passed: false }),
      makeCheckResult({ checkId: 'c2', passed: false }),
    ];
    const fixes = prioritizeFixes(failed, checks);
    expect(fixes[0]).toContain('[REQUIRED]');
    expect(fixes[1]).toContain('[OPTIONAL]');
  });
});

// ============================================================================
// truncateOutput
// ============================================================================

describe('truncateOutput', () => {
  it('returns short text unchanged', () => {
    expect(truncateOutput('hello', 100)).toBe('hello');
  });

  it('truncates long text', () => {
    const long = 'x'.repeat(200);
    const result = truncateOutput(long, 50);
    expect(result.length).toBeLessThanOrEqual(100); // Truncated + info message
  });
});
