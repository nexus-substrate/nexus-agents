/**
 * Tests for difficulty-estimators.ts
 *
 * Covers all five exported estimator functions:
 * - estimateReasoningDifficulty
 * - estimateKnowledgeDifficulty
 * - estimateCreativityDifficulty
 * - estimatePrecisionDifficulty
 * - estimateContextLengthDifficulty
 */
import { describe, it, expect } from 'vitest';
import type { TaskProfile } from '../core/index.js';

import {
  estimateReasoningDifficulty,
  estimateKnowledgeDifficulty,
  estimateCreativityDifficulty,
  estimatePrecisionDifficulty,
  estimateContextLengthDifficulty,
} from './difficulty-estimators.js';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeProfile(overrides: Partial<TaskProfile> = {}) {
  return {
    contextRequired: 1000,
    reasoningComplexity: 5,
    codeGeneration: false,
    multimodal: false,
    parallelizable: false,
    budgetSensitive: false,
    taskType: 'general' as const,
    ...overrides,
  } satisfies TaskProfile;
}

// ---------------------------------------------------------------------------
// estimateReasoningDifficulty
// ---------------------------------------------------------------------------
describe('estimateReasoningDifficulty', () => {
  it('returns a value in [0,1] for empty content without profile', () => {
    const result = estimateReasoningDifficulty('');
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  it('uses default 0.5 base when no profile provided', () => {
    // No keywords, no profile → base is 0.5
    const result = estimateReasoningDifficulty('hello world');
    expect(result).toBeCloseTo(0.5 * 0.5 + 0 * 0.35 + 0 + 0.15 * 0.5, 5);
  });

  it('increases with reasoning keywords', () => {
    const low = estimateReasoningDifficulty('write a poem');
    const high = estimateReasoningDifficulty(
      'analyze the algorithm and optimize the strategy to debug'
    );
    expect(high).toBeGreaterThan(low);
  });

  it('applies task type bonus for architecture', () => {
    const profile = makeProfile({ taskType: 'architecture', reasoningComplexity: 5 });
    const withBonus = estimateReasoningDifficulty('task', profile);
    const profileGeneral = makeProfile({ taskType: 'general', reasoningComplexity: 5 });
    const withoutBonus = estimateReasoningDifficulty('task', profileGeneral);
    expect(withBonus).toBeGreaterThan(withoutBonus);
  });

  it('applies task type bonus for code_review', () => {
    const profile = makeProfile({ taskType: 'code_review', reasoningComplexity: 5 });
    const result = estimateReasoningDifficulty('task', profile);
    expect(result).toBeGreaterThan(0);
  });

  it('applies task type bonus for large_codebase', () => {
    const profile = makeProfile({ taskType: 'large_codebase', reasoningComplexity: 5 });
    const result = estimateReasoningDifficulty('task', profile);
    const general = estimateReasoningDifficulty('task', makeProfile({ reasoningComplexity: 5 }));
    expect(result).toBeGreaterThan(general);
  });

  it('scales with reasoningComplexity from profile', () => {
    const low = estimateReasoningDifficulty('task', makeProfile({ reasoningComplexity: 1 }));
    const high = estimateReasoningDifficulty('task', makeProfile({ reasoningComplexity: 9 }));
    expect(high).toBeGreaterThan(low);
  });

  it('clamps output to [0,1] even with max inputs', () => {
    const allKeywords =
      'analyze reason logic infer deduce prove theorem algorithm optimize trade-off compare evaluate decision strategy plan debug diagnose investigate';
    const profile = makeProfile({ taskType: 'architecture', reasoningComplexity: 10 });
    const result = estimateReasoningDifficulty(allKeywords, profile);
    expect(result).toBeLessThanOrEqual(1);
    expect(result).toBeGreaterThanOrEqual(0);
  });

  it('handles zero complexity profile', () => {
    const profile = makeProfile({ reasoningComplexity: 0 });
    const result = estimateReasoningDifficulty('nothing here', profile);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// estimateKnowledgeDifficulty
// ---------------------------------------------------------------------------
describe('estimateKnowledgeDifficulty', () => {
  it('returns 0 for empty content with no keywords or profile', () => {
    expect(estimateKnowledgeDifficulty('')).toBe(0);
  });

  it('increases with knowledge keywords', () => {
    const low = estimateKnowledgeDifficulty('write a poem');
    const high = estimateKnowledgeDifficulty(
      'domain expert specialist technical advanced regulation'
    );
    expect(high).toBeGreaterThan(low);
  });

  it('applies documentation task type bonus', () => {
    const profile = makeProfile({ taskType: 'documentation' });
    const withBonus = estimateKnowledgeDifficulty('technical', profile);
    const withoutBonus = estimateKnowledgeDifficulty('technical');
    expect(withBonus).toBeGreaterThan(withoutBonus);
  });

  it('applies architecture task type bonus', () => {
    const profile = makeProfile({ taskType: 'architecture' });
    const withBonus = estimateKnowledgeDifficulty('technical', profile);
    const withoutBonus = estimateKnowledgeDifficulty('technical');
    expect(withBonus).toBeGreaterThan(withoutBonus);
  });

  it('adds 0.1 for long content (>2000 chars)', () => {
    const longContent = 'x'.repeat(2001);
    const shortContent = 'x'.repeat(100);
    const longResult = estimateKnowledgeDifficulty(longContent);
    const shortResult = estimateKnowledgeDifficulty(shortContent);
    expect(longResult).toBeGreaterThan(shortResult);
  });

  it('caps at 1.0 with all bonuses', () => {
    const keywords =
      'domain expert specialist technical advanced specific industry ' +
      'regulation compliance standard protocol specification scientific medical legal financial';
    const profile = makeProfile({ taskType: 'documentation' });
    const longContent = keywords + ' ' + 'x'.repeat(2001);
    const result = estimateKnowledgeDifficulty(longContent, profile);
    expect(result).toBeLessThanOrEqual(1);
  });

  it('does not apply task bonus for unrelated types', () => {
    const profile = makeProfile({ taskType: 'test_generation' });
    const withProfile = estimateKnowledgeDifficulty('hello', profile);
    const withoutProfile = estimateKnowledgeDifficulty('hello');
    expect(withProfile).toBe(withoutProfile);
  });
});

// ---------------------------------------------------------------------------
// estimateCreativityDifficulty
// ---------------------------------------------------------------------------
describe('estimateCreativityDifficulty', () => {
  it('returns 0 for empty content with no keywords or profile', () => {
    expect(estimateCreativityDifficulty('')).toBe(0);
  });

  it('increases with creativity keywords', () => {
    const low = estimateCreativityDifficulty('fix the bug');
    const high = estimateCreativityDifficulty(
      'creative novel innovative unique original design brainstorm'
    );
    expect(high).toBeGreaterThan(low);
  });

  it('applies code_implementation + codeGeneration bonus', () => {
    const profile = makeProfile({ taskType: 'code_implementation', codeGeneration: true });
    const withBonus = estimateCreativityDifficulty('build something', profile);
    const withoutBonus = estimateCreativityDifficulty('build something');
    expect(withBonus).toBeGreaterThan(withoutBonus);
  });

  it('does not apply code_implementation bonus without codeGeneration flag', () => {
    const profile = makeProfile({ taskType: 'code_implementation', codeGeneration: false });
    const withProfile = estimateCreativityDifficulty('hello', profile);
    const withoutProfile = estimateCreativityDifficulty('hello');
    // architecture bonus doesn't apply, codeGeneration is false → no bonus
    expect(withProfile).toBe(withoutProfile);
  });

  it('applies architecture task type bonus', () => {
    const profile = makeProfile({ taskType: 'architecture' });
    const withBonus = estimateCreativityDifficulty('design', profile);
    const withoutBonus = estimateCreativityDifficulty('design');
    expect(withBonus).toBeGreaterThan(withoutBonus);
  });

  it('stacks architecture and code_implementation bonuses are separate branches', () => {
    // architecture profile (gets +0.2)
    const archProfile = makeProfile({ taskType: 'architecture', codeGeneration: true });
    const archResult = estimateCreativityDifficulty('create', archProfile);
    // code_implementation + codeGeneration (gets +0.25)
    const codeProfile = makeProfile({ taskType: 'code_implementation', codeGeneration: true });
    const codeResult = estimateCreativityDifficulty('create', codeProfile);
    // Both should be above baseline
    const baseline = estimateCreativityDifficulty('create');
    expect(archResult).toBeGreaterThan(baseline);
    expect(codeResult).toBeGreaterThan(baseline);
  });

  it('caps at 1.0', () => {
    const keywords =
      'creative novel innovative unique original design brainstorm ' +
      'ideate imagine invent generate create compose write story artistic';
    const profile = makeProfile({ taskType: 'architecture', codeGeneration: true });
    const result = estimateCreativityDifficulty(keywords, profile);
    expect(result).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// estimatePrecisionDifficulty
// ---------------------------------------------------------------------------
describe('estimatePrecisionDifficulty', () => {
  it('returns 0 for empty content with no keywords or profile', () => {
    expect(estimatePrecisionDifficulty('')).toBe(0);
  });

  it('increases with precision keywords', () => {
    const low = estimatePrecisionDifficulty('write a poem');
    const high = estimatePrecisionDifficulty(
      'exact precise accurate correct verify validate test error'
    );
    expect(high).toBeGreaterThan(low);
  });

  it('applies test_generation task type bonus', () => {
    const profile = makeProfile({ taskType: 'test_generation' });
    const withBonus = estimatePrecisionDifficulty('test', profile);
    const withoutBonus = estimatePrecisionDifficulty('test');
    expect(withBonus).toBeGreaterThan(withoutBonus);
  });

  it('applies code_review task type bonus', () => {
    const profile = makeProfile({ taskType: 'code_review' });
    const withBonus = estimatePrecisionDifficulty('review', profile);
    const withoutBonus = estimatePrecisionDifficulty('review');
    expect(withBonus).toBeGreaterThan(withoutBonus);
  });

  it('applies codeGeneration bonus', () => {
    const profile = makeProfile({ codeGeneration: true });
    const withBonus = estimatePrecisionDifficulty('task', profile);
    const withoutBonus = estimatePrecisionDifficulty('task');
    expect(withBonus).toBeGreaterThan(withoutBonus);
  });

  it('stacks task type and codeGeneration bonuses', () => {
    const profile = makeProfile({ taskType: 'test_generation', codeGeneration: true });
    const stacked = estimatePrecisionDifficulty('test', profile);
    const taskOnly = estimatePrecisionDifficulty(
      'test',
      makeProfile({ taskType: 'test_generation', codeGeneration: false })
    );
    expect(stacked).toBeGreaterThan(taskOnly);
  });

  it('caps at 1.0 with all bonuses', () => {
    const keywords =
      'exact precise accurate correct verify validate test error ' +
      'bug fix security critical production reliable robust type-safe';
    const profile = makeProfile({ taskType: 'test_generation', codeGeneration: true });
    const result = estimatePrecisionDifficulty(keywords, profile);
    expect(result).toBeLessThanOrEqual(1);
  });

  it('does not apply task bonus for unrelated types', () => {
    const profile = makeProfile({ taskType: 'documentation' });
    const withProfile = estimatePrecisionDifficulty('hello', profile);
    const withoutProfile = estimatePrecisionDifficulty('hello');
    expect(withProfile).toBe(withoutProfile);
  });
});

// ---------------------------------------------------------------------------
// estimateContextLengthDifficulty
// ---------------------------------------------------------------------------
describe('estimateContextLengthDifficulty', () => {
  it('returns 0 for empty content without profile', () => {
    expect(estimateContextLengthDifficulty('')).toBe(0);
  });

  it('uses profile contextRequired when available', () => {
    const lowCtx = makeProfile({ contextRequired: 100 });
    const highCtx = makeProfile({ contextRequired: 40000 });
    const low = estimateContextLengthDifficulty('task', lowCtx);
    const high = estimateContextLengthDifficulty('task', highCtx);
    expect(high).toBeGreaterThan(low);
  });

  it('estimates tokens from content length when no profile', () => {
    const short = estimateContextLengthDifficulty('hi');
    const long = estimateContextLengthDifficulty('x'.repeat(10000));
    expect(long).toBeGreaterThan(short);
  });

  it('applies large_codebase bonus', () => {
    const profile = makeProfile({ taskType: 'large_codebase', contextRequired: 10000 });
    const withBonus = estimateContextLengthDifficulty('task', profile);
    const profileGeneral = makeProfile({ taskType: 'general', contextRequired: 10000 });
    const withoutBonus = estimateContextLengthDifficulty('task', profileGeneral);
    expect(withBonus).toBeGreaterThan(withoutBonus);
  });

  it('applies long content bonus (>5000 chars) without profile', () => {
    const longContent = 'a'.repeat(5001);
    const shortContent = 'a'.repeat(100);
    const longResult = estimateContextLengthDifficulty(longContent);
    const shortResult = estimateContextLengthDifficulty(shortContent);
    expect(longResult).toBeGreaterThan(shortResult);
  });

  it('caps at 1.0 with max context and bonus', () => {
    const profile = makeProfile({ taskType: 'large_codebase', contextRequired: 100000 });
    const result = estimateContextLengthDifficulty('task', profile);
    expect(result).toBeLessThanOrEqual(1);
  });

  it('returns value in [0,1] range for all inputs', () => {
    const cases = [
      estimateContextLengthDifficulty(''),
      estimateContextLengthDifficulty('x'.repeat(100000)),
      estimateContextLengthDifficulty('task', makeProfile({ contextRequired: 0 })),
      estimateContextLengthDifficulty('task', makeProfile({ contextRequired: 999999 })),
    ];
    for (const val of cases) {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(1);
    }
  });

  it('large_codebase bonus takes priority over long content bonus', () => {
    const longContent = 'a'.repeat(6000);
    const profile = makeProfile({ taskType: 'large_codebase', contextRequired: 5000 });
    const result = estimateContextLengthDifficulty(longContent, profile);
    // With profile present, contextRequired is used for tokens, not content.length
    // large_codebase path triggers, not the >5000 chars path
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting: keyword detection behavior
// ---------------------------------------------------------------------------
describe('keyword detection', () => {
  it('is case-insensitive', () => {
    const lower = estimateReasoningDifficulty('analyze');
    const upper = estimateReasoningDifficulty('ANALYZE');
    const mixed = estimateReasoningDifficulty('AnAlYzE');
    expect(lower).toBe(upper);
    expect(lower).toBe(mixed);
  });

  it('matches keywords as substrings', () => {
    // "analyze" is contained in "reanalyze"
    const result = estimateReasoningDifficulty('reanalyze');
    const direct = estimateReasoningDifficulty('analyze');
    expect(result).toBe(direct);
  });

  it('counts multiple distinct keyword matches', () => {
    const one = estimateKnowledgeDifficulty('domain');
    const three = estimateKnowledgeDifficulty('domain expert technical');
    expect(three).toBeGreaterThan(one);
  });
});

// ---------------------------------------------------------------------------
// normalizeKeywordCount behavior (tested indirectly)
// ---------------------------------------------------------------------------
describe('normalizeKeywordCount (indirect)', () => {
  it('returns minimum 0.2 when at least one keyword matches', () => {
    // Single keyword → count=1, saturation=5 for reasoning
    // ratio=0.2, raw=0.2*(2-0.2)=0.36, clamp(0.36,0.2,1)=0.36
    const result = estimateKnowledgeDifficulty('domain');
    expect(result).toBeGreaterThanOrEqual(0.2);
  });

  it('peaks near saturation point then clamps at 0.2 beyond it', () => {
    // normalizeKeywordCount uses ratio*(2-ratio) which peaks at ratio=1
    // Past ratio=2 the raw value goes negative, clamped to 0.2
    // With saturationPoint=4, 4 keywords → ratio=1, raw=1.0 (peak)
    const fourKeywords = estimateKnowledgeDifficulty('domain expert specialist technical');
    expect(fourKeywords).toBeCloseTo(1, 1);
    // Many keywords overshoot → ratio>2 → negative → clamped to 0.2
    const manyKeywords =
      'domain expert specialist technical advanced specific industry ' +
      'regulation compliance standard protocol specification scientific medical legal financial';
    const result = estimateKnowledgeDifficulty(manyKeywords);
    expect(result).toBeCloseTo(0.2, 5);
  });
});
