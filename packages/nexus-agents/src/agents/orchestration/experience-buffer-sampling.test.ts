/**
 * Tests for Experience Buffer Sampling Strategies
 *
 * @module agents/orchestration/experience-buffer-sampling.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  flattenStepsWithEpisodeIds,
  computePriorities,
  prioritiesToProbabilities,
  computeImportanceWeights,
  weightedRandomIndex,
  sampleUniformly,
  sampleWithPriority,
} from './experience-buffer-sampling.js';
import type { Episode } from './experience-buffer-types.js';
import type { PolicyTrajectoryStep } from './policy-types.js';
import type { PuppeteerState } from './puppeteer-state-types.js';

// ============================================================================
// Helpers
// ============================================================================

function makeState(step = 0): PuppeteerState {
  return {
    step,
    task: { id: 't1', description: 'test', type: 'code' },
    agentOutputs: [],
    context: '',
    metadata: { progress: 0, totalCost: 0, totalTokens: 0, elapsedMs: 0, startedAt: '' },
    sessionId: 'sess-1',
  };
}

function makeStep(reward: number, action = 'agent-1'): PolicyTrajectoryStep {
  return { state: makeState(), action, reward, logProb: -1 };
}

function makeEpisode(id: string, rewards: number[]): Episode {
  return {
    id,
    sessionId: 'sess-1',
    steps: rewards.map((r, i) => makeStep(r, `agent-${String(i)}`)),
    totalReward: rewards.reduce((s, r) => s + r, 0),
    timestamp: new Date('2026-01-01'),
  };
}

// ============================================================================
// flattenStepsWithEpisodeIds
// ============================================================================

describe('flattenStepsWithEpisodeIds', () => {
  it('returns empty array for no episodes', () => {
    expect(flattenStepsWithEpisodeIds([])).toEqual([]);
  });

  it('flattens single episode', () => {
    const ep = makeEpisode('ep-1', [1, 2, 3]);
    const result = flattenStepsWithEpisodeIds([ep]);

    expect(result).toHaveLength(3);
    expect(result[0]?.episodeId).toBe('ep-1');
    expect(result[0]?.step.reward).toBe(1);
    expect(result[2]?.step.reward).toBe(3);
  });

  it('flattens multiple episodes preserving order', () => {
    const ep1 = makeEpisode('ep-1', [10, 20]);
    const ep2 = makeEpisode('ep-2', [30]);
    const result = flattenStepsWithEpisodeIds([ep1, ep2]);

    expect(result).toHaveLength(3);
    expect(result[0]?.episodeId).toBe('ep-1');
    expect(result[1]?.episodeId).toBe('ep-1');
    expect(result[2]?.episodeId).toBe('ep-2');
  });

  it('handles episode with no steps', () => {
    const ep: Episode = {
      id: 'empty',
      sessionId: 'sess-1',
      steps: [],
      totalReward: 0,
      timestamp: new Date(),
    };
    expect(flattenStepsWithEpisodeIds([ep])).toEqual([]);
  });
});

// ============================================================================
// computePriorities
// ============================================================================

describe('computePriorities', () => {
  it('adds epsilon to prevent zero priority', () => {
    const steps = [{ step: makeStep(0), episodeId: 'ep-1' }];
    const priorities = computePriorities(steps, 1.0);

    // |0| + 0.01 = 0.01, raised to power 1.0
    expect(priorities[0]).toBeCloseTo(0.01, 5);
  });

  it('uses absolute reward magnitude', () => {
    const steps = [
      { step: makeStep(-5), episodeId: 'ep-1' },
      { step: makeStep(5), episodeId: 'ep-1' },
    ];
    const priorities = computePriorities(steps, 1.0);

    // Both should be equal: |±5| + 0.01 = 5.01
    expect(priorities[0]).toBeCloseTo(priorities[1] ?? 0, 5);
  });

  it('applies priority exponent', () => {
    const steps = [{ step: makeStep(4), episodeId: 'ep-1' }];
    const priorities = computePriorities(steps, 0.5);

    // (|4| + 0.01) ^ 0.5 = sqrt(4.01) ≈ 2.0025
    expect(priorities[0]).toBeCloseTo(Math.sqrt(4.01), 5);
  });

  it('higher rewards get higher priority', () => {
    const steps = [
      { step: makeStep(1), episodeId: 'ep-1' },
      { step: makeStep(10), episodeId: 'ep-1' },
    ];
    const priorities = computePriorities(steps, 1.0);

    expect(priorities[1]).toBeGreaterThan(priorities[0] ?? 0);
  });
});

// ============================================================================
// prioritiesToProbabilities
// ============================================================================

describe('prioritiesToProbabilities', () => {
  it('sums to 1', () => {
    const probs = prioritiesToProbabilities([1, 2, 3]);
    const sum = probs.reduce((s, p) => s + p, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it('distributes proportionally', () => {
    const probs = prioritiesToProbabilities([1, 3]);

    expect(probs[0]).toBeCloseTo(0.25, 5);
    expect(probs[1]).toBeCloseTo(0.75, 5);
  });

  it('handles equal priorities', () => {
    const probs = prioritiesToProbabilities([5, 5, 5]);

    expect(probs[0]).toBeCloseTo(1 / 3, 5);
    expect(probs[1]).toBeCloseTo(1 / 3, 5);
    expect(probs[2]).toBeCloseTo(1 / 3, 5);
  });

  it('handles single element', () => {
    const probs = prioritiesToProbabilities([42]);
    expect(probs[0]).toBe(1);
  });
});

// ============================================================================
// computeImportanceWeights
// ============================================================================

describe('computeImportanceWeights', () => {
  it('normalizes to [0, 1] range', () => {
    const sampled = [
      { step: makeStep(1), episodeId: 'ep-1', prob: 0.5 },
      { step: makeStep(2), episodeId: 'ep-1', prob: 0.3 },
      { step: makeStep(3), episodeId: 'ep-1', prob: 0.2 },
    ];
    const weights = computeImportanceWeights(sampled, 10);

    for (const w of weights) {
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1.0 + 1e-10);
    }
  });

  it('max weight is 1.0', () => {
    const sampled = [
      { step: makeStep(1), episodeId: 'ep-1', prob: 0.2 },
      { step: makeStep(2), episodeId: 'ep-1', prob: 0.8 },
    ];
    const weights = computeImportanceWeights(sampled, 5);

    // The smallest probability gets weight 1.0
    expect(Math.max(...weights)).toBeCloseTo(1.0, 10);
  });

  it('lower probability gets higher weight', () => {
    const sampled = [
      { step: makeStep(1), episodeId: 'ep-1', prob: 0.1 },
      { step: makeStep(2), episodeId: 'ep-1', prob: 0.9 },
    ];
    const weights = computeImportanceWeights(sampled, 10);

    expect(weights[0]).toBeGreaterThan(weights[1] ?? 0);
  });

  it('equal probabilities give equal weights', () => {
    const sampled = [
      { step: makeStep(1), episodeId: 'ep-1', prob: 0.5 },
      { step: makeStep(2), episodeId: 'ep-1', prob: 0.5 },
    ];
    const weights = computeImportanceWeights(sampled, 4);

    expect(weights[0]).toBeCloseTo(weights[1] ?? 0, 10);
  });
});

// ============================================================================
// weightedRandomIndex
// ============================================================================

describe('weightedRandomIndex', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns last index when random is near 1', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const idx = weightedRandomIndex([0.25, 0.25, 0.25, 0.25]);
    expect(idx).toBe(3);
  });

  it('returns first index when random is 0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    // r=0 < cumulative=0.5 is false (not strictly <), but with 0 it depends
    // Actually: cumulative starts at 0, r=0, 0 < 0 is false, so it continues
    // After adding 0.5: 0 < 0.5 is true, returns index 0
    const idx = weightedRandomIndex([0.5, 0.5]);
    expect(idx).toBe(0);
  });

  it('returns correct index for mid-range random', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.6);
    // Cumulative: [0.3, 0.6, 0.9, 1.0]
    // r=0.6, 0.6 < 0.3 false, 0.6 < 0.6 false, 0.6 < 0.9 true → index 2
    const idx = weightedRandomIndex([0.3, 0.3, 0.3, 0.1]);
    expect(idx).toBe(2);
  });
});

// ============================================================================
// sampleUniformly
// ============================================================================

describe('sampleUniformly', () => {
  it('returns correct batch size when enough steps', () => {
    const ep = makeEpisode('ep-1', [1, 2, 3, 4, 5]);
    const batch = sampleUniformly([ep], 3);

    expect(batch.steps).toHaveLength(3);
    expect(batch.episodeIds).toHaveLength(3);
    expect(batch.weights).toHaveLength(3);
  });

  it('returns all steps when batch size exceeds total', () => {
    const ep = makeEpisode('ep-1', [1, 2]);
    const batch = sampleUniformly([ep], 10);

    expect(batch.steps).toHaveLength(2);
  });

  it('assigns uniform weights of 1.0', () => {
    const ep = makeEpisode('ep-1', [1, 2, 3]);
    const batch = sampleUniformly([ep], 2);

    for (const w of batch.weights) {
      expect(w).toBe(1.0);
    }
  });

  it('handles empty episodes', () => {
    const batch = sampleUniformly([], 5);

    expect(batch.steps).toHaveLength(0);
    expect(batch.episodeIds).toHaveLength(0);
    expect(batch.weights).toHaveLength(0);
  });

  it('samples from multiple episodes', () => {
    const ep1 = makeEpisode('ep-1', [1, 2]);
    const ep2 = makeEpisode('ep-2', [3, 4]);
    const batch = sampleUniformly([ep1, ep2], 4);

    expect(batch.steps).toHaveLength(4);
  });
});

// ============================================================================
// sampleWithPriority
// ============================================================================

describe('sampleWithPriority', () => {
  it('returns correct batch size', () => {
    const ep = makeEpisode('ep-1', [1, 2, 3, 4, 5]);
    const batch = sampleWithPriority([ep], 3, 0.6, 5);

    expect(batch.steps).toHaveLength(3);
    expect(batch.episodeIds).toHaveLength(3);
    expect(batch.weights).toHaveLength(3);
  });

  it('produces importance weights in [0, 1]', () => {
    const ep = makeEpisode('ep-1', [0.5, 1, 2, 5, 10]);
    const batch = sampleWithPriority([ep], 4, 0.6, 5);

    for (const w of batch.weights) {
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1.0 + 1e-10);
    }
  });

  it('handles single-step episode', () => {
    const ep = makeEpisode('ep-1', [1]);
    const batch = sampleWithPriority([ep], 1, 0.6, 1);

    expect(batch.steps).toHaveLength(1);
    expect(batch.weights[0]).toBeCloseTo(1.0, 5);
  });

  it('handles empty episodes', () => {
    const batch = sampleWithPriority([], 3, 0.6, 0);

    expect(batch.steps).toHaveLength(0);
  });
});
