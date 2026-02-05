/**
 * Tests for Delegate to Model Helpers
 * @module mcp/tools/delegate-to-model-helpers.test
 */

import { describe, it, expect, vi } from 'vitest';
import type { TaskRequirements, CapabilityProfile } from './delegate-to-model-types.js';
import {
  hasKeyword,
  analyzeTask,
  calcRequirementsScore,
  calcContextScore,
  calcPreferenceScore,
  scoreModel,
  buildReasons,
  getTradeoff,
  errorResult,
  successResult,
  checkRateLimit,
} from './delegate-to-model-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeProfile(overrides: Partial<CapabilityProfile> = {}): CapabilityProfile {
  return {
    reasoning: 9,
    speed: 5,
    cost: 4,
    codeGeneration: 8,
    contextWindow: 200000,
    ...overrides,
  };
}

function makeRequirements(overrides: Partial<TaskRequirements> = {}): TaskRequirements {
  return {
    estimatedTokens: 500,
    needsReasoning: false,
    needsLargeContext: false,
    needsSpeed: false,
    needsCodeGen: false,
    isCostSensitive: false,
    needsImageGen: false,
    needsAudioOutput: false,
    needsMcp: false,
    ...overrides,
  };
}

// ============================================================================
// hasKeyword
// ============================================================================

describe('hasKeyword', () => {
  it('returns true when keyword found', () => {
    expect(hasKeyword('analyze this complex problem', ['analyze', 'complex'])).toBe(true);
  });

  it('returns false when no keyword found', () => {
    expect(hasKeyword('simple task', ['analyze', 'complex'])).toBe(false);
  });

  it('returns false for empty keywords', () => {
    expect(hasKeyword('anything', [])).toBe(false);
  });
});

// ============================================================================
// analyzeTask
// ============================================================================

describe('analyzeTask', () => {
  it('estimates tokens from task length', () => {
    const result = analyzeTask('test task');
    // "test task" = 9 chars, ceil(9/4) * 2 = 6
    expect(result.estimatedTokens).toBe(6);
  });

  it('detects reasoning keywords', () => {
    const result = analyzeTask('analyze this complex problem');
    expect(result.needsReasoning).toBe(true);
  });

  it('detects code keywords', () => {
    const result = analyzeTask('write a function to sort arrays');
    expect(result.needsCodeGen).toBe(true);
  });

  it('returns all false for generic task', () => {
    const result = analyzeTask('hello');
    expect(result.needsReasoning).toBe(false);
    expect(result.needsSpeed).toBe(false);
    expect(result.needsCodeGen).toBe(false);
  });
});

// ============================================================================
// calcRequirementsScore
// ============================================================================

describe('calcRequirementsScore', () => {
  it('returns 0 for no requirements', () => {
    expect(calcRequirementsScore(makeProfile(), makeRequirements())).toBe(0);
  });

  it('adds reasoning bonus', () => {
    const profile = makeProfile({ reasoning: 9 });
    const req = makeRequirements({ needsReasoning: true });
    expect(calcRequirementsScore(profile, req)).toBe(18); // 9 * 2
  });

  it('adds speed bonus', () => {
    const profile = makeProfile({ speed: 7 });
    const req = makeRequirements({ needsSpeed: true });
    expect(calcRequirementsScore(profile, req)).toBe(14); // 7 * 2
  });

  it('accumulates multiple bonuses', () => {
    const profile = makeProfile({ reasoning: 9, speed: 5 });
    const req = makeRequirements({ needsReasoning: true, needsSpeed: true });
    expect(calcRequirementsScore(profile, req)).toBe(28); // 18 + 10
  });
});

// ============================================================================
// calcContextScore
// ============================================================================

describe('calcContextScore', () => {
  it('returns 0 when context not needed', () => {
    expect(calcContextScore(makeProfile(), makeRequirements())).toBe(0);
  });

  it('returns 20 when context window >= 2x estimated tokens', () => {
    const profile = makeProfile({ contextWindow: 200000 });
    const req = makeRequirements({ needsLargeContext: true, estimatedTokens: 50000 });
    // 200k >= 100k (2x tokens) → +20, but 200k < 500k → no +10
    expect(calcContextScore(profile, req)).toBe(20);
  });

  it('returns 10 for large context window', () => {
    const profile = makeProfile({ contextWindow: 600000 });
    const req = makeRequirements({ needsLargeContext: true, estimatedTokens: 400000 });
    // 600k >= 800k? No. 600k >= 500k? Yes. = 10
    expect(calcContextScore(profile, req)).toBe(10);
  });
});

// ============================================================================
// calcPreferenceScore
// ============================================================================

describe('calcPreferenceScore', () => {
  it('returns 0 when no preference', () => {
    expect(calcPreferenceScore(makeProfile())).toBe(0);
  });

  it('applies reasoning preference', () => {
    expect(calcPreferenceScore(makeProfile({ reasoning: 9 }), 'reasoning')).toBe(27);
  });

  it('applies speed preference', () => {
    expect(calcPreferenceScore(makeProfile({ speed: 8 }), 'speed')).toBe(24);
  });

  it('applies context preference', () => {
    expect(calcPreferenceScore(makeProfile({ contextWindow: 200000 }), 'context')).toBe(2);
  });
});

// ============================================================================
// scoreModel
// ============================================================================

describe('scoreModel', () => {
  it('returns base score for no requirements', () => {
    const profile = makeProfile({ reasoning: 9, speed: 5, cost: 4 });
    const score = scoreModel('test', profile, makeRequirements());
    expect(score).toBe(18); // 9 + 5 + 4
  });

  it('includes requirement and preference bonuses', () => {
    const profile = makeProfile({ reasoning: 9, speed: 5, cost: 4 });
    const req = makeRequirements({ needsReasoning: true });
    const score = scoreModel('test', profile, req, 'reasoning');
    // base(18) + req(18) + pref(27) = 63
    expect(score).toBe(63);
  });
});

// ============================================================================
// buildReasons
// ============================================================================

describe('buildReasons', () => {
  it('returns empty for no requirements', () => {
    expect(buildReasons(makeRequirements())).toEqual([]);
  });

  it('includes active requirements', () => {
    const req = makeRequirements({ needsReasoning: true, needsCodeGen: true });
    const reasons = buildReasons(req);
    expect(reasons).toContain('complex reasoning required');
    expect(reasons).toContain('code generation task');
  });

  it('includes preference', () => {
    const reasons = buildReasons(makeRequirements(), 'reasoning');
    expect(reasons).toContain('preferred: reasoning');
  });

  it('ignores empty preference', () => {
    const reasons = buildReasons(makeRequirements(), '');
    expect(reasons).toEqual([]);
  });
});

// ============================================================================
// getTradeoff
// ============================================================================

describe('getTradeoff', () => {
  it('detects faster alternative', () => {
    expect(getTradeoff(makeProfile({ speed: 5 }), makeProfile({ speed: 8 }))).toBe(
      'faster but less capable'
    );
  });

  it('detects cheaper alternative', () => {
    expect(
      getTradeoff(makeProfile({ cost: 3, speed: 5 }), makeProfile({ cost: 8, speed: 5 }))
    ).toBe('cheaper but less capable');
  });

  it('detects larger context', () => {
    expect(
      getTradeoff(
        makeProfile({ contextWindow: 100000, speed: 5, cost: 5 }),
        makeProfile({ contextWindow: 500000, speed: 5, cost: 5 })
      )
    ).toBe('larger context but slower');
  });

  it('falls back to different tradeoffs', () => {
    expect(getTradeoff(makeProfile(), makeProfile())).toBe('different tradeoffs');
  });
});

// ============================================================================
// errorResult / successResult
// ============================================================================

describe('errorResult', () => {
  it('creates error result', () => {
    const result = errorResult('bad');
    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual({ type: 'text', text: 'bad' });
  });
});

describe('successResult', () => {
  it('creates success result', () => {
    const result = successResult('good');
    expect(result.isError).toBeUndefined();
    expect(result.content[0]).toEqual({ type: 'text', text: 'good' });
  });
});

// ============================================================================
// checkRateLimit
// ============================================================================

describe('checkRateLimit', () => {
  it('returns null when rate limit not exceeded', () => {
    const limiter = { tryAcquire: () => true, getState: vi.fn() };
    expect(checkRateLimit(limiter as never)).toBeNull();
  });

  it('returns error when rate limit exceeded', () => {
    const limiter = { tryAcquire: () => false, getState: () => ({ nextTokenMs: 5000 }) };
    const result = checkRateLimit(limiter as never);
    expect(result).not.toBeNull();
    expect(result!.isError).toBe(true);
  });
});
