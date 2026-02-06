/**
 * Tests for policy-distribution.ts
 *
 * Covers softmax, enforceMinProbability, generateReasoning,
 * scoresToDistribution, argmax, weightedSample, and sampleFromDistribution.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setRandomProvider, resetRandomProvider } from '../../core/index.js';
import type { IRandomProvider } from '../../core/random-provider.js';
import type { AgentScores } from './policy-scoring.js';
import type { AgentDistribution } from './puppeteer-types.js';
import {
  softmax,
  enforceMinProbability,
  generateReasoning,
  scoresToDistribution,
  argmax,
  weightedSample,
  sampleFromDistribution,
} from './policy-distribution.js';

// ============================================================================
// Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeScores(overrides: Partial<AgentScores> = {}) {
  return {
    capability: 0.5,
    recency: 0.5,
    patternMatch: 0.5,
    costEfficiency: 0.5,
    progressAdjust: 0.1,
    total: 0.5,
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeDistribution(probMap: Map<string, number>, rawMap?: Map<string, number>) {
  return {
    probabilities: probMap,
    rawScores: rawMap ?? new Map<string, number>(),
    reasoning: '',
  } as AgentDistribution;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeFakeRandom(value: number) {
  const provider: IRandomProvider = {
    random: () => value,
    randomInt: (min: number, max: number) => Math.floor(value * (max - min)) + min,
    randomString: () => '',
    randomChoice: <T>(items: readonly T[]) => items[0],
    shuffle: <T>(items: readonly T[]) => [...items],
    uuid: () => '00000000-0000-4000-8000-000000000000',
  };
  return provider;
}

function sumValues(map: Map<string, number>): number {
  let s = 0;
  for (const v of map.values()) s += v;
  return s;
}

// ============================================================================
// softmax
// ============================================================================

describe('softmax', () => {
  it('returns uniform distribution for equal scores', () => {
    const scores = new Map([
      ['a', 1],
      ['b', 1],
      ['c', 1],
    ]);
    const result = softmax(scores, 1.0);
    const tolerance = 1e-10;
    for (const prob of result.values()) {
      expect(Math.abs(prob - 1 / 3)).toBeLessThan(tolerance);
    }
  });

  it('probabilities sum to 1', () => {
    const scores = new Map([
      ['a', 2],
      ['b', 5],
      ['c', 1],
    ]);
    const result = softmax(scores, 1.0);
    expect(sumValues(result)).toBeCloseTo(1.0, 10);
  });

  it('higher score gets higher probability', () => {
    const scores = new Map([
      ['a', 1],
      ['b', 5],
    ]);
    const result = softmax(scores, 1.0);
    expect(result.get('b')!).toBeGreaterThan(result.get('a')!);
  });

  it('high temperature flattens distribution', () => {
    const scores = new Map([
      ['a', 1],
      ['b', 10],
    ]);
    const flat = softmax(scores, 100);
    const sharp = softmax(scores, 0.1);
    const flatDiff = Math.abs(flat.get('b')! - flat.get('a')!);
    const sharpDiff = Math.abs(sharp.get('b')! - sharp.get('a')!);
    expect(flatDiff).toBeLessThan(sharpDiff);
  });

  it('low temperature sharpens distribution', () => {
    const scores = new Map([
      ['a', 1],
      ['b', 3],
    ]);
    const result = softmax(scores, 0.01);
    expect(result.get('b')!).toBeGreaterThan(0.99);
  });

  it('handles single entry', () => {
    const scores = new Map([['only', 42]]);
    const result = softmax(scores, 1.0);
    expect(result.get('only')).toBeCloseTo(1.0, 10);
  });

  it('handles negative scores', () => {
    const scores = new Map([
      ['a', -5],
      ['b', -2],
      ['c', -10],
    ]);
    const result = softmax(scores, 1.0);
    expect(sumValues(result)).toBeCloseTo(1.0, 10);
    expect(result.get('b')!).toBeGreaterThan(result.get('a')!);
    expect(result.get('a')!).toBeGreaterThan(result.get('c')!);
  });

  it('handles very large scores without overflow (log-sum-exp trick)', () => {
    const scores = new Map([
      ['a', 1000],
      ['b', 1001],
    ]);
    const result = softmax(scores, 1.0);
    expect(sumValues(result)).toBeCloseTo(1.0, 10);
    expect(result.get('b')!).toBeGreaterThan(result.get('a')!);
  });
});

// ============================================================================
// enforceMinProbability
// ============================================================================

describe('enforceMinProbability', () => {
  it('boosts low probabilities to minimum', () => {
    const probs = new Map([
      ['a', 0.01],
      ['b', 0.99],
    ]);
    enforceMinProbability(probs, ['a', 'b'], 0.05);
    expect(probs.get('a')!).toBeCloseTo(0.05, 10);
  });

  it('preserves total probability near 1', () => {
    const probs = new Map([
      ['a', 0.01],
      ['b', 0.09],
      ['c', 0.9],
    ]);
    enforceMinProbability(probs, ['a', 'b', 'c'], 0.05);
    expect(sumValues(probs)).toBeCloseTo(1.0, 10);
  });

  it('does nothing when all probs already above minimum', () => {
    const probs = new Map([
      ['a', 0.5],
      ['b', 0.5],
    ]);
    enforceMinProbability(probs, ['a', 'b'], 0.05);
    expect(probs.get('a')).toBeCloseTo(0.5, 10);
    expect(probs.get('b')).toBeCloseTo(0.5, 10);
  });

  it('does nothing when minProb * agents >= 1', () => {
    const probs = new Map([
      ['a', 0.01],
      ['b', 0.99],
    ]);
    enforceMinProbability(probs, ['a', 'b'], 0.6);
    // Cannot enforce, so original values remain
    expect(probs.get('a')).toBe(0.01);
    expect(probs.get('b')).toBe(0.99);
  });

  it('handles agents not in probs map (defaults to 0)', () => {
    const probs = new Map([['a', 0.8]]);
    enforceMinProbability(probs, ['a', 'b'], 0.1);
    expect(probs.get('b')).toBeCloseTo(0.1, 10);
  });

  it('handles minProb of 0 (no-op)', () => {
    const probs = new Map([
      ['a', 0.3],
      ['b', 0.7],
    ]);
    enforceMinProbability(probs, ['a', 'b'], 0);
    expect(probs.get('a')).toBeCloseTo(0.3, 10);
    expect(probs.get('b')).toBeCloseTo(0.7, 10);
  });
});

// ============================================================================
// generateReasoning
// ============================================================================

describe('generateReasoning', () => {
  it('returns no-agents message for empty agents list', () => {
    const scores = new Map<string, AgentScores>();
    const result = generateReasoning(scores, []);
    expect(result).toBe('No agents available.');
  });

  it('returns no-scores message when top agent has no scores', () => {
    const scores = new Map<string, AgentScores>();
    const result = generateReasoning(scores, ['agentA']);
    expect(result).toBe('No scores computed.');
  });

  it('includes top choice agent name', () => {
    const scores = new Map([['agentA', makeScores({ total: 0.9 })]]);
    const result = generateReasoning(scores, ['agentA']);
    expect(result).toContain('Top choice: agentA');
  });

  it('sorts agents by total score and picks highest', () => {
    const scores = new Map([
      ['low', makeScores({ total: 0.1 })],
      ['high', makeScores({ total: 0.9 })],
    ]);
    const result = generateReasoning(scores, ['low', 'high']);
    expect(result).toContain('Top choice: high');
  });

  it('includes capability match when > 0.7', () => {
    const scores = new Map([['a', makeScores({ total: 1, capability: 0.8 })]]);
    expect(generateReasoning(scores, ['a'])).toContain('Good capability match');
  });

  it('excludes capability match when <= 0.7', () => {
    const scores = new Map([['a', makeScores({ total: 1, capability: 0.7 })]]);
    expect(generateReasoning(scores, ['a'])).not.toContain('Good capability match');
  });

  it('includes recency when > 0.8', () => {
    const scores = new Map([['a', makeScores({ total: 1, recency: 0.9 })]]);
    expect(generateReasoning(scores, ['a'])).toContain('Not recently used');
  });

  it('includes pattern match when > 0.7', () => {
    const scores = new Map([['a', makeScores({ total: 1, patternMatch: 0.8 })]]);
    expect(generateReasoning(scores, ['a'])).toContain('Follows expected pattern');
  });

  it('includes progress adjustment when > 0.2', () => {
    const scores = new Map([['a', makeScores({ total: 1, progressAdjust: 0.3 })]]);
    expect(generateReasoning(scores, ['a'])).toContain('Appropriate for current progress');
  });

  it('joins multiple reasons with dot separator', () => {
    const scores = new Map([
      [
        'a',
        makeScores({
          total: 1,
          capability: 0.9,
          recency: 0.9,
          patternMatch: 0.9,
          progressAdjust: 0.5,
        }),
      ],
    ]);
    const result = generateReasoning(scores, ['a']);
    const parts = result.split('. ');
    expect(parts.length).toBe(5);
  });
});

// ============================================================================
// scoresToDistribution
// ============================================================================

describe('scoresToDistribution', () => {
  it('returns AgentDistribution with probabilities, rawScores, and reasoning', () => {
    const scores = new Map([
      ['a', makeScores({ total: 1.0 })],
      ['b', makeScores({ total: 2.0 })],
    ]);
    const result = scoresToDistribution(scores, ['a', 'b'], 1.0, 0.05);
    expect(result.probabilities).toBeDefined();
    expect(result.rawScores).toBeDefined();
    expect(result.reasoning).toBeDefined();
  });

  it('probabilities sum to 1', () => {
    const scores = new Map([
      ['a', makeScores({ total: 3 })],
      ['b', makeScores({ total: 1 })],
    ]);
    const result = scoresToDistribution(scores, ['a', 'b'], 1.0, 0.05);
    let sum = 0;
    for (const p of result.probabilities.values()) sum += p;
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it('applies minimum probability', () => {
    const scores = new Map([
      ['a', makeScores({ total: 100 })],
      ['b', makeScores({ total: 0 })],
    ]);
    const result = scoresToDistribution(scores, ['a', 'b'], 0.1, 0.1);
    expect(result.probabilities.get('b')!).toBeGreaterThanOrEqual(0.1 - 1e-10);
  });

  it('rawScores contains total scores', () => {
    const scores = new Map([['x', makeScores({ total: 7.5 })]]);
    const result = scoresToDistribution(scores, ['x'], 1.0, 0);
    expect(result.rawScores.get('x')).toBe(7.5);
  });
});

// ============================================================================
// argmax
// ============================================================================

describe('argmax', () => {
  it('returns agent with highest probability', () => {
    const dist = makeDistribution(
      new Map([
        ['a', 0.2],
        ['b', 0.8],
      ])
    );
    expect(argmax(dist)).toBe('b');
  });

  it('returns first highest when tied', () => {
    const dist = makeDistribution(
      new Map([
        ['a', 0.5],
        ['b', 0.5],
      ])
    );
    // First one wins since > check (not >=)
    expect(argmax(dist)).toBe('a');
  });

  it('handles single agent', () => {
    const dist = makeDistribution(new Map([['only', 1.0]]));
    expect(argmax(dist)).toBe('only');
  });

  it('returns empty string for empty distribution', () => {
    const dist = makeDistribution(new Map());
    expect(argmax(dist)).toBe('');
  });
});

// ============================================================================
// weightedSample
// ============================================================================

describe('weightedSample', () => {
  beforeEach(() => {
    setRandomProvider(makeFakeRandom(0.0));
  });

  afterEach(() => {
    resetRandomProvider();
  });

  it('selects first agent when random is 0', () => {
    setRandomProvider(makeFakeRandom(0.0));
    const dist = makeDistribution(
      new Map([
        ['a', 0.5],
        ['b', 0.5],
      ])
    );
    expect(weightedSample(dist)).toBe('a');
  });

  it('selects second agent when random exceeds first cumulative', () => {
    setRandomProvider(makeFakeRandom(0.6));
    const dist = makeDistribution(
      new Map([
        ['a', 0.3],
        ['b', 0.7],
      ])
    );
    expect(weightedSample(dist)).toBe('b');
  });

  it('selects last agent at boundary', () => {
    setRandomProvider(makeFakeRandom(0.99));
    const dist = makeDistribution(
      new Map([
        ['a', 0.5],
        ['b', 0.5],
      ])
    );
    expect(weightedSample(dist)).toBe('b');
  });

  it('selects first agent when random equals its probability', () => {
    setRandomProvider(makeFakeRandom(0.3));
    const dist = makeDistribution(
      new Map([
        ['a', 0.3],
        ['b', 0.7],
      ])
    );
    expect(weightedSample(dist)).toBe('a');
  });

  it('falls back to last agent for empty distribution', () => {
    const dist = makeDistribution(new Map());
    expect(weightedSample(dist)).toBe('');
  });
});

// ============================================================================
// sampleFromDistribution
// ============================================================================

describe('sampleFromDistribution', () => {
  beforeEach(() => {
    setRandomProvider(makeFakeRandom(0.0));
  });

  afterEach(() => {
    resetRandomProvider();
  });

  it('uses argmax in deterministic mode', () => {
    const dist = makeDistribution(
      new Map([
        ['a', 0.2],
        ['b', 0.8],
      ])
    );
    expect(sampleFromDistribution(dist, true)).toBe('b');
  });

  it('uses weightedSample in stochastic mode', () => {
    setRandomProvider(makeFakeRandom(0.0));
    const dist = makeDistribution(
      new Map([
        ['a', 0.5],
        ['b', 0.5],
      ])
    );
    expect(sampleFromDistribution(dist, false)).toBe('a');
  });

  it('deterministic mode ignores random provider', () => {
    setRandomProvider(makeFakeRandom(0.99));
    const dist = makeDistribution(
      new Map([
        ['a', 0.1],
        ['b', 0.9],
      ])
    );
    expect(sampleFromDistribution(dist, true)).toBe('b');
  });
});
