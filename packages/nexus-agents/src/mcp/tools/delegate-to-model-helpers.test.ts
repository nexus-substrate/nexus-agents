/**
 * Tests for Delegate to Model Helpers
 * @module mcp/tools/delegate-to-model-helpers.test
 */

import { describe, it, expect, vi } from 'vitest';
import type { TaskRequirements, CapabilityProfile } from './delegate-to-model-types.js';
import { MODEL_CAPABILITIES } from './delegate-to-model-types.js';
import {
  hasKeyword,
  analyzeTask,
  calcRequirementsScore,
  calcContextScore,
  calcPreferenceScore,
  scoreModel,
  scoreAllModels,
  buildReasons,
  getTradeoff,
  selectModel,
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
    needsExploration: false,
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

// ============================================================================
// Billing Mode — scoreModel
// ============================================================================

describe('scoreModel billing mode', () => {
  it('zeroes cost in plan mode', () => {
    const profile = makeProfile({ reasoning: 9, speed: 5, cost: 4 });
    const planScore = scoreModel('test', profile, makeRequirements(), undefined, 'plan');
    // base = 9 + 5 + 0 = 14
    expect(planScore).toBe(14);
  });

  it('includes cost in api mode', () => {
    const apiScore = scoreModel(
      'test',
      makeProfile({ reasoning: 9, speed: 5, cost: 4 }),
      makeRequirements(),
      undefined,
      'api'
    );
    // base = 9 + 5 + 4 = 18
    expect(apiScore).toBe(18);
  });

  it('defaults to api mode', () => {
    const profile = makeProfile({ reasoning: 9, speed: 5, cost: 4 });
    const defaultScore = scoreModel('test', profile, makeRequirements());
    const apiScore = scoreModel('test', profile, makeRequirements(), undefined, 'api');
    expect(defaultScore).toBe(apiScore);
  });

  it('plan mode causes opus to outscore haiku when reasoning required', () => {
    const opus = MODEL_CAPABILITIES['claude-opus']!;
    const haiku = MODEL_CAPABILITIES['claude-haiku']!;
    const req = makeRequirements({ needsReasoning: true });
    const opusScore = scoreModel('claude-opus', opus, req, undefined, 'plan');
    const haikuScore = scoreModel('claude-haiku', haiku, req, undefined, 'plan');
    // Opus: base(10+5+0) + reasoning(10*2) = 35
    // Haiku: base(7+9+0) + reasoning(7*2) = 30
    expect(opusScore).toBeGreaterThan(haikuScore);
  });

  it('api mode allows haiku to outscore opus via cost', () => {
    const opus = MODEL_CAPABILITIES['claude-opus']!;
    const haiku = MODEL_CAPABILITIES['claude-haiku']!;
    const req = makeRequirements();
    const opusScore = scoreModel('claude-opus', opus, req, undefined, 'api');
    const haikuScore = scoreModel('claude-haiku', haiku, req, undefined, 'api');
    expect(haikuScore).toBeGreaterThan(opusScore);
  });
});

// ============================================================================
// Billing Mode — calcRequirementsScore
// ============================================================================

describe('calcRequirementsScore billing mode', () => {
  it('suppresses cost-sensitive bonus in plan mode', () => {
    const profile = makeProfile({ cost: 9 });
    const req = makeRequirements({ isCostSensitive: true });
    expect(calcRequirementsScore(profile, req, 'plan')).toBe(0);
  });

  it('includes cost-sensitive bonus in api mode', () => {
    const profile = makeProfile({ cost: 9 });
    const req = makeRequirements({ isCostSensitive: true });
    expect(calcRequirementsScore(profile, req, 'api')).toBe(18); // 9 * 2
  });
});

// ============================================================================
// Billing Mode — buildReasons
// ============================================================================

describe('buildReasons billing mode', () => {
  it('includes plan billing reason in plan mode', () => {
    const reasons = buildReasons(makeRequirements(), undefined, 'plan');
    expect(reasons).toContain('plan billing (cost ignored)');
  });

  it('excludes plan billing reason in api mode', () => {
    const reasons = buildReasons(makeRequirements(), undefined, 'api');
    expect(reasons).not.toContain('plan billing (cost ignored)');
  });
});

// ============================================================================
// Billing Mode — scoreAllModels
// ============================================================================

describe('scoreAllModels billing mode', () => {
  it('ranks quality models higher in plan mode', () => {
    const req = makeRequirements();
    const planRanked = scoreAllModels(req, undefined, 'plan');
    expect(planRanked.length).toBeGreaterThan(0);
    // Top models in plan mode: strong reasoning + speed (cost zeroed)
    expect(['claude-opus', 'codex-5.3', 'gemini-pro']).toContain(planRanked[0]!.name);
  });

  it('ranks cheap models higher in api mode', () => {
    const req = makeRequirements();
    const apiRanked = scoreAllModels(req, undefined, 'api');
    expect(apiRanked.length).toBeGreaterThan(0);
    expect(['gemini-flash', 'claude-haiku', 'codex-5.1-mini']).toContain(apiRanked[0]!.name);
  });
});

// ============================================================================
// Billing Mode — selectModel
// ============================================================================

describe('selectModel billing mode', () => {
  it('selects stronger model in plan mode', () => {
    const input = { task: 'analyze architecture', estimate_tokens: false };
    const req = makeRequirements({ needsReasoning: true });
    const result = selectModel(input, req, 'plan');
    expect(result.reasoning).toContain('plan billing (cost ignored)');
  });

  it('preserves model hint regardless of billing mode', () => {
    const input = { task: 'test', model_hint: 'gemini-flash', estimate_tokens: false };
    const req = makeRequirements();
    const result = selectModel(input, req, 'plan');
    expect(result.model).toBe('gemini-flash');
  });
});

// ============================================================================
// codex-5.3 model capabilities
// ============================================================================

describe('codex-5.3 model', () => {
  it('exists in MODEL_CAPABILITIES', () => {
    expect(MODEL_CAPABILITIES['codex-5.3']).toBeDefined();
  });

  it('has high reasoning and code generation scores', () => {
    const caps = MODEL_CAPABILITIES['codex-5.3']!;
    expect(caps.reasoning).toBe(10);
    expect(caps.codeGeneration).toBe(10);
  });
});
