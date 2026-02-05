/**
 * Tests for Self-Eval Aggregation Helpers
 * @module self-eval/aggregation-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { AggregatedResult } from './aggregation-types.js';
import { formatSummary, formatVerbose, formatResults } from './aggregation-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeResult(overrides: Partial<AggregatedResult> = {}): AggregatedResult {
  return {
    component: 'test-component',
    finalRecommendation: 'retain',
    confidence: 0.85,
    evidenceQuality: 0.9,
    isRecommendation: true as const,
    timestamp: new Date(),
    votes: [
      {
        agent: 'code-quality',
        recommendation: 'retain',
        confidence: 0.9,
        concerns: [],
        metrics: [],
        isRecommendation: true as const,
        component: 'test-component',
        timestamp: new Date(),
      },
      {
        agent: 'architecture-fit',
        recommendation: 'retain',
        confidence: 0.8,
        concerns: ['minor issue'],
        metrics: [],
        isRecommendation: true as const,
        component: 'test-component',
        timestamp: new Date(),
      },
    ],
    dissent: [],
    auditTrail: [
      {
        agent: 'code-quality',
        claim: 'Code is clean',
        evidence: 'lint passed',
        verified: true,
        timestamp: new Date(),
      },
    ],
    ...overrides,
  } as AggregatedResult;
}

// ============================================================================
// formatSummary
// ============================================================================

describe('formatSummary', () => {
  it('formats basic summary line', () => {
    const result = formatSummary(makeResult());
    expect(result).toContain('[RETAIN]');
    expect(result).toContain('test-component');
    expect(result).toContain('confidence');
  });

  it('includes dissent count when present', () => {
    const result = formatSummary(
      makeResult({
        dissent: [
          {
            agent: 'practical-value' as const,
            recommendation: 'deprecate' as const,
            confidence: 0.6,
            concerns: [],
            metrics: [],
            isRecommendation: true as const,
            component: 'test-component',
            timestamp: new Date(),
          },
        ],
      })
    );
    expect(result).toContain('1 dissent');
  });

  it('omits dissent when none', () => {
    const result = formatSummary(makeResult({ dissent: [] }));
    expect(result).not.toContain('dissent');
  });

  it('uppercases recommendation', () => {
    const result = formatSummary(makeResult({ finalRecommendation: 'deprecate' }));
    expect(result).toContain('[DEPRECATE]');
  });
});

// ============================================================================
// formatVerbose
// ============================================================================

describe('formatVerbose', () => {
  it('includes component name', () => {
    const output = formatVerbose(makeResult(), false);
    expect(output).toContain('Component: test-component');
  });

  it('includes recommendation', () => {
    const output = formatVerbose(makeResult(), false);
    expect(output).toContain('RETAIN');
  });

  it('includes votes', () => {
    const output = formatVerbose(makeResult(), false);
    expect(output).toContain('code-quality');
    expect(output).toContain('architecture-fit');
  });

  it('includes vote concerns', () => {
    const output = formatVerbose(makeResult(), false);
    expect(output).toContain('minor issue');
  });

  it('includes dissenting opinions when present', () => {
    const output = formatVerbose(
      makeResult({
        dissent: [
          {
            agent: 'practical-value' as const,
            recommendation: 'deprecate' as const,
            confidence: 0.7,
            concerns: [],
            metrics: [],
            isRecommendation: true as const,
            component: 'test-component',
            timestamp: new Date(),
          },
        ],
      }),
      false
    );
    expect(output).toContain('Dissenting Opinions');
    expect(output).toContain('practical-value');
  });

  it('includes audit trail when requested', () => {
    const output = formatVerbose(makeResult(), true);
    expect(output).toContain('Audit Trail');
    expect(output).toContain('Code is clean');
    expect(output).toContain('lint passed');
  });

  it('omits audit trail when not requested', () => {
    const output = formatVerbose(makeResult(), false);
    expect(output).not.toContain('Audit Trail');
  });

  it('shows verified status', () => {
    const output = formatVerbose(makeResult(), true);
    expect(output).toContain('[v]');
  });
});

// ============================================================================
// formatResults
// ============================================================================

describe('formatResults', () => {
  it('formats multiple results as summaries by default', () => {
    const results = [makeResult(), makeResult({ component: 'other' })];
    const output = formatResults(results);
    expect(output).toContain('test-component');
    expect(output).toContain('other');
  });

  it('formats verbose when requested', () => {
    const output = formatResults([makeResult()], { verbose: true });
    expect(output).toContain('Component:');
    expect(output).toContain('Votes:');
  });

  it('includes audit trail in verbose mode when requested', () => {
    const output = formatResults([makeResult()], {
      verbose: true,
      includeAuditTrail: true,
    });
    expect(output).toContain('Audit Trail');
  });

  it('returns empty string for empty results', () => {
    expect(formatResults([])).toBe('');
  });
});
