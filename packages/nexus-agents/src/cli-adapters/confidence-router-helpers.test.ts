/**
 * Tests for Confidence Router Helpers
 * @module cli-adapters/confidence-router-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { CliTask, CliResponse, ConfidenceFactors } from './types.js';
import {
  estimateTaskComplexity,
  calculateLengthFactor,
  calculateHedgingFactor,
  calculateStructureFactor,
  calculateUncertaintyFactor,
  calculateConfidenceScore,
  generateConfidenceReason,
  estimateConfidence,
} from './confidence-router-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeTask(content: string): CliTask {
  return { content, type: 'general' } as CliTask;
}

function makeResponse(text: string): CliResponse {
  return { text, tokenCount: text.split(/\s+/).length } as CliResponse;
}

// ============================================================================
// estimateTaskComplexity
// ============================================================================

describe('estimateTaskComplexity', () => {
  it('returns simple for short tasks', () => {
    expect(estimateTaskComplexity(makeTask('fix the bug'))).toBe('simple');
  });

  it('returns complex for long tasks (>100 words)', () => {
    const longContent = Array(101).fill('word').join(' ');
    expect(estimateTaskComplexity(makeTask(longContent))).toBe('complex');
  });

  it('returns moderate for medium-length tasks', () => {
    const moderateContent = Array(50).fill('word').join(' ');
    expect(estimateTaskComplexity(makeTask(moderateContent))).toBe('moderate');
  });
});

// ============================================================================
// calculateLengthFactor
// ============================================================================

describe('calculateLengthFactor', () => {
  it('returns 0.4 for very short responses', () => {
    // For simple: min=20, so 0.5*20=10. Anything < 10 is very short.
    expect(calculateLengthFactor(5, 'simple')).toBe(0.4);
  });

  it('returns 0.7 for slightly short responses', () => {
    // For simple: min=20. Between 10 and 20 is slightly short.
    expect(calculateLengthFactor(15, 'simple')).toBe(0.7);
  });

  it('returns 1.0 for optimal range', () => {
    // For moderate: optimal range
    expect(calculateLengthFactor(100, 'moderate')).toBe(1.0);
  });

  it('returns 0.6 for very long responses', () => {
    // For simple: max varies. Very long = > max * 1.5
    expect(calculateLengthFactor(10000, 'simple')).toBe(0.6);
  });
});

// ============================================================================
// calculateHedgingFactor
// ============================================================================

describe('calculateHedgingFactor', () => {
  it('returns 1.0 for no hedging', () => {
    expect(calculateHedgingFactor('This is a clear response')).toBe(1.0);
  });

  it('reduces for hedging phrases', () => {
    const result = calculateHedgingFactor('I think maybe this might work perhaps');
    expect(result).toBeLessThan(1.0);
  });

  it('clamps to 0 minimum', () => {
    // Many hedging phrases should clamp to 0
    const manyHedges = 'I think maybe perhaps possibly it seems might could arguably likely';
    expect(calculateHedgingFactor(manyHedges)).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// calculateStructureFactor
// ============================================================================

describe('calculateStructureFactor', () => {
  it('returns base 0.5 for unstructured text', () => {
    expect(calculateStructureFactor('just some plain text')).toBe(0.5);
  });

  it('adds for code blocks', () => {
    expect(calculateStructureFactor('here is ```code```')).toBe(0.65);
  });

  it('adds for bullet points', () => {
    expect(calculateStructureFactor('- item one\n- item two')).toBe(0.6);
  });

  it('adds for numbered lists', () => {
    expect(calculateStructureFactor('1. first\n2. second')).toBe(0.6);
  });

  it('adds for headers', () => {
    expect(calculateStructureFactor('# Title\nContent')).toBe(0.6);
  });

  it('caps at 1.0', () => {
    const structured = '# Title\n\n```code```\n\n- bullet\n1. numbered\n\nparagraph break';
    expect(calculateStructureFactor(structured)).toBeLessThanOrEqual(1.0);
  });
});

// ============================================================================
// calculateUncertaintyFactor
// ============================================================================

describe('calculateUncertaintyFactor', () => {
  it('returns 1.0 for no uncertainty indicators', () => {
    expect(calculateUncertaintyFactor('The answer is clear and definitive')).toBe(1.0);
  });

  it('reduces for uncertainty indicators', () => {
    // Uses actual indicators: 'however', 'although', 'caveat', 'note that'
    const result = calculateUncertaintyFactor(
      'however, although there is a caveat, note that this matters'
    );
    expect(result).toBeLessThan(1.0);
  });
});

// ============================================================================
// calculateConfidenceScore
// ============================================================================

describe('calculateConfidenceScore', () => {
  it('returns weighted sum of factors', () => {
    const factors: ConfidenceFactors = {
      lengthFactor: 1.0,
      hedgingFactor: 1.0,
      structureFactor: 1.0,
      uncertaintyFactor: 1.0,
    };
    // All 1.0 * their weights should sum to ~1.0
    expect(calculateConfidenceScore(factors)).toBeCloseTo(1.0, 1);
  });

  it('produces lower score for low factors', () => {
    const factors: ConfidenceFactors = {
      lengthFactor: 0.4,
      hedgingFactor: 0.5,
      structureFactor: 0.5,
      uncertaintyFactor: 0.5,
    };
    const score = calculateConfidenceScore(factors);
    expect(score).toBeLessThan(0.6);
  });
});

// ============================================================================
// generateConfidenceReason
// ============================================================================

describe('generateConfidenceReason', () => {
  it('returns high confidence for good factors', () => {
    const factors: ConfidenceFactors = {
      lengthFactor: 1.0,
      hedgingFactor: 1.0,
      structureFactor: 1.0,
      uncertaintyFactor: 1.0,
    };
    const reason = generateConfidenceReason(factors, 0.95);
    expect(reason).toContain('High confidence');
    expect(reason).toContain('95.0%');
  });

  it('lists issues for low factors', () => {
    const factors: ConfidenceFactors = {
      lengthFactor: 0.4,
      hedgingFactor: 0.5,
      structureFactor: 0.4,
      uncertaintyFactor: 0.5,
    };
    const reason = generateConfidenceReason(factors, 0.45);
    expect(reason).toContain('response length concerns');
    expect(reason).toContain('hedging language');
    expect(reason).toContain('limited structure');
    expect(reason).toContain('uncertainty indicators');
  });
});

// ============================================================================
// estimateConfidence
// ============================================================================

describe('estimateConfidence', () => {
  it('returns estimate with all fields', () => {
    const task = makeTask('simple task');
    const response = makeResponse('Here is the answer with some detail and structure.');
    const estimate = estimateConfidence(task, response, 0.5);
    expect(estimate.score).toBeGreaterThan(0);
    expect(estimate.factors).toBeDefined();
    expect(estimate.reason).toBeDefined();
    expect(typeof estimate.shouldEscalate).toBe('boolean');
  });

  it('escalates when score below threshold', () => {
    const task = makeTask('simple task');
    const response = makeResponse('maybe');
    const estimate = estimateConfidence(task, response, 0.99);
    expect(estimate.shouldEscalate).toBe(true);
  });

  it('does not escalate when score above threshold', () => {
    const task = makeTask('simple question');
    const response = makeResponse(
      'Here is a comprehensive answer with detailed explanation and code examples:\n\n```typescript\nconst x = 1;\n```\n\n- Point 1\n- Point 2\n\n1. Step one\n2. Step two'
    );
    const estimate = estimateConfidence(task, response, 0.3);
    expect(estimate.shouldEscalate).toBe(false);
  });
});
