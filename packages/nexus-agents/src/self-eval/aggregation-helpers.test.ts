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
    finalRecommendation: 'approve',
    confidence: 0.85,
    evidenceQuality: 0.9,
    votes: [
      { agent: 'agent-1', recommendation: 'approve', confidence: 0.9, concerns: [] },
      { agent: 'agent-2', recommendation: 'approve', confidence: 0.8, concerns: ['minor issue'] },
    ],
    dissent: [],
    auditTrail: [
      { agent: 'agent-1', claim: 'Code is clean', evidence: 'lint passed', verified: true },
    ],
    ...overrides,
  };
}

// ============================================================================
// formatSummary
// ============================================================================

describe('formatSummary', () => {
  it('formats basic summary line', () => {
    const result = formatSummary(makeResult());
    expect(result).toContain('[APPROVE]');
    expect(result).toContain('test-component');
    expect(result).toContain('confidence');
  });

  it('includes dissent count when present', () => {
    const result = formatSummary(
      makeResult({
        dissent: [{ agent: 'agent-3', recommendation: 'reject', confidence: 0.6, concerns: [] }],
      })
    );
    expect(result).toContain('1 dissent');
  });

  it('omits dissent when none', () => {
    const result = formatSummary(makeResult({ dissent: [] }));
    expect(result).not.toContain('dissent');
  });

  it('uppercases recommendation', () => {
    const result = formatSummary(makeResult({ finalRecommendation: 'reject' }));
    expect(result).toContain('[REJECT]');
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
    expect(output).toContain('APPROVE');
  });

  it('includes votes', () => {
    const output = formatVerbose(makeResult(), false);
    expect(output).toContain('agent-1');
    expect(output).toContain('agent-2');
  });

  it('includes vote concerns', () => {
    const output = formatVerbose(makeResult(), false);
    expect(output).toContain('minor issue');
  });

  it('includes dissenting opinions when present', () => {
    const output = formatVerbose(
      makeResult({
        dissent: [{ agent: 'dissenter', recommendation: 'reject', confidence: 0.7, concerns: [] }],
      }),
      false
    );
    expect(output).toContain('Dissenting Opinions');
    expect(output).toContain('dissenter');
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
