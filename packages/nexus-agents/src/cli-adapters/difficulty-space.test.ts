/**
 * Tests for nexus-agents/cli-adapters - Difficulty Space
 *
 * Tests normalization, difficulty estimation, aggregation, classification,
 * confidence calculation, and summarization functions.
 *
 * @module cli-adapters/difficulty-space.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalize,
  estimateDifficultySpace,
  aggregateDifficulty,
  findDominantDimension,
  classifyDifficultyLevel,
  calculateEstimateConfidence,
  summarizeDifficultySpace,
} from './difficulty-space.js';
import type {
  DifficultySpace,
  DifficultyWeights,
  DifficultyThresholds,
} from './zero-router-types.js';
import { DEFAULT_DIFFICULTY_THRESHOLDS } from './zero-router-types.js';
import type { CliTask } from './types-capability.js';
import type { TaskProfile } from '../core/index.js';

// Mock external dependencies
vi.mock('./difficulty-estimators.js', () => ({
  estimateReasoningDifficulty: vi.fn(),
  estimateKnowledgeDifficulty: vi.fn(),
  estimateCreativityDifficulty: vi.fn(),
  estimatePrecisionDifficulty: vi.fn(),
  estimateContextLengthDifficulty: vi.fn(),
}));

vi.mock('../utils/math-utils.js', () => ({
  clamp01: vi.fn((v: number) => Math.max(0, Math.min(1, v))),
}));

import {
  estimateReasoningDifficulty,
  estimateKnowledgeDifficulty,
  estimateCreativityDifficulty,
  estimatePrecisionDifficulty,
  estimateContextLengthDifficulty,
} from './difficulty-estimators.js';

describe('normalize', () => {
  it('returns 0.5 when min equals max', () => {
    expect(normalize(5, 10, 10)).toBe(0.5);
    expect(normalize(100, 50, 50)).toBe(0.5);
  });

  it('normalizes value in normal range', () => {
    expect(normalize(5, 0, 10)).toBe(0.5);
    expect(normalize(0, 0, 10)).toBe(0);
    expect(normalize(10, 0, 10)).toBe(1);
    expect(normalize(0, -10, 10)).toBe(0.5);
  });

  it('clamps out of range values', () => {
    expect(normalize(-5, 0, 10)).toBe(0);
    expect(normalize(15, 0, 10)).toBe(1);
  });

  it('handles fractional ranges', () => {
    expect(normalize(0.5, 0, 1)).toBe(0.5);
    expect(normalize(0.25, 0, 1)).toBe(0.25);
  });
});

describe('estimateDifficultySpace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(estimateReasoningDifficulty).mockReturnValue(0.5);
    vi.mocked(estimateKnowledgeDifficulty).mockReturnValue(0.3);
    vi.mocked(estimateCreativityDifficulty).mockReturnValue(0.7);
    vi.mocked(estimatePrecisionDifficulty).mockReturnValue(0.4);
    vi.mocked(estimateContextLengthDifficulty).mockReturnValue(0.6);
  });

  it('calls all dimension estimators with task content', () => {
    const task: CliTask = {
      content: 'Analyze this system',
      systemPrompt: ' with careful reasoning',
    };

    estimateDifficultySpace(task);

    const expectedContent = 'Analyze this system with careful reasoning';
    expect(estimateReasoningDifficulty).toHaveBeenCalledWith(expectedContent, undefined);
    expect(estimateKnowledgeDifficulty).toHaveBeenCalledWith(expectedContent, undefined);
    expect(estimateCreativityDifficulty).toHaveBeenCalledWith(expectedContent, undefined);
    expect(estimatePrecisionDifficulty).toHaveBeenCalledWith(expectedContent, undefined);
    expect(estimateContextLengthDifficulty).toHaveBeenCalledWith(expectedContent, undefined);
  });

  it('passes task profile to estimators when provided', () => {
    const task: CliTask = { content: 'test task' };
    const profile = {
      complexity: 5,
      domain: 'test',
      estimatedTokens: 100,
    } as unknown as TaskProfile;

    estimateDifficultySpace(task, profile);

    expect(estimateReasoningDifficulty).toHaveBeenCalledWith('test task', profile);
  });

  it('returns difficulty space with all dimensions', () => {
    const task: CliTask = { content: 'test' };
    const space = estimateDifficultySpace(task);

    expect(space).toEqual({
      reasoning: 0.5,
      knowledge: 0.3,
      creativity: 0.7,
      precision: 0.4,
      context_length: 0.6,
    });
  });

  it('handles empty system prompt', () => {
    const task: CliTask = { content: 'test content' };
    estimateDifficultySpace(task);

    expect(estimateReasoningDifficulty).toHaveBeenCalledWith('test content', undefined);
  });
});

describe('aggregateDifficulty', () => {
  const space: DifficultySpace = {
    reasoning: 0.6,
    knowledge: 0.4,
    creativity: 0.2,
    precision: 0.8,
    context_length: 0.5,
  };

  it('aggregates with default weights', () => {
    const result = aggregateDifficulty(space);
    const expected = 0.6 * 0.3 + 0.4 * 0.15 + 0.2 * 0.15 + 0.8 * 0.25 + 0.5 * 0.15;
    expect(result).toBeCloseTo(expected, 5);
  });

  it('aggregates with custom weights', () => {
    const weights: DifficultyWeights = {
      reasoning: 0.5,
      knowledge: 0.2,
      creativity: 0.1,
      precision: 0.1,
      context_length: 0.1,
    };
    const result = aggregateDifficulty(space, weights);
    expect(result).toBeCloseTo(0.6 * 0.5 + 0.4 * 0.2 + 0.2 * 0.1 + 0.8 * 0.1 + 0.5 * 0.1, 5);
  });

  it('handles non-normalized weights by normalizing', () => {
    const weights: DifficultyWeights = {
      reasoning: 2,
      knowledge: 1,
      creativity: 1,
      precision: 1,
      context_length: 1,
    };
    const result = aggregateDifficulty(space, weights);
    expect(result).toBeCloseTo((0.6 * 2 + 0.4 + 0.2 + 0.8 + 0.5) / 6, 5);
  });

  it('returns 0 when all weights are zero', () => {
    const weights: DifficultyWeights = {
      reasoning: 0,
      knowledge: 0,
      creativity: 0,
      precision: 0,
      context_length: 0,
    };
    expect(aggregateDifficulty(space, weights)).toBe(0);
  });

  it('handles uniform difficulty', () => {
    const uniformSpace: DifficultySpace = {
      reasoning: 0.5,
      knowledge: 0.5,
      creativity: 0.5,
      precision: 0.5,
      context_length: 0.5,
    };
    expect(aggregateDifficulty(uniformSpace)).toBeCloseTo(0.5, 5);
  });
});

describe('findDominantDimension', () => {
  it('finds clear dominant dimension', () => {
    const space: DifficultySpace = {
      reasoning: 0.3,
      knowledge: 0.9,
      creativity: 0.2,
      precision: 0.4,
      context_length: 0.1,
    };
    expect(findDominantDimension(space)).toBe('knowledge');
  });

  it('returns first dimension when all equal', () => {
    const space: DifficultySpace = {
      reasoning: 0.5,
      knowledge: 0.5,
      creativity: 0.5,
      precision: 0.5,
      context_length: 0.5,
    };
    expect(findDominantDimension(space)).toBe('reasoning');
  });

  it('finds each dimension type when highest', () => {
    expect(
      findDominantDimension({
        reasoning: 0.95,
        knowledge: 0.2,
        creativity: 0.3,
        precision: 0.4,
        context_length: 0.1,
      })
    ).toBe('reasoning');
    expect(
      findDominantDimension({
        reasoning: 0.1,
        knowledge: 0.2,
        creativity: 0.3,
        precision: 0.4,
        context_length: 0.85,
      })
    ).toBe('context_length');
  });

  it('handles ties by returning first occurrence', () => {
    const space: DifficultySpace = {
      reasoning: 0.8,
      knowledge: 0.8,
      creativity: 0.2,
      precision: 0.3,
      context_length: 0.1,
    };
    expect(findDominantDimension(space)).toBe('reasoning');
  });
});

describe('classifyDifficultyLevel', () => {
  it('classifies as easy below threshold', () => {
    expect(classifyDifficultyLevel(0.2)).toBe('easy');
    expect(classifyDifficultyLevel(0.29)).toBe('easy');
    expect(classifyDifficultyLevel(0)).toBe('easy');
  });

  it('classifies as medium in middle range', () => {
    expect(classifyDifficultyLevel(0.3)).toBe('medium');
    expect(classifyDifficultyLevel(0.5)).toBe('medium');
    expect(classifyDifficultyLevel(0.7)).toBe('medium');
  });

  it('classifies as hard above threshold', () => {
    expect(classifyDifficultyLevel(0.71)).toBe('hard');
    expect(classifyDifficultyLevel(0.9)).toBe('hard');
    expect(classifyDifficultyLevel(1.0)).toBe('hard');
  });

  it('uses custom thresholds when provided', () => {
    const thresholds: DifficultyThresholds = {
      easyUpperBound: 0.4,
      hardLowerBound: 0.8,
    };
    expect(classifyDifficultyLevel(0.35, thresholds)).toBe('easy');
    expect(classifyDifficultyLevel(0.5, thresholds)).toBe('medium');
    expect(classifyDifficultyLevel(0.85, thresholds)).toBe('hard');
  });

  it('handles boundary values correctly with defaults', () => {
    expect(classifyDifficultyLevel(DEFAULT_DIFFICULTY_THRESHOLDS.easyUpperBound)).toBe('medium');
    expect(classifyDifficultyLevel(DEFAULT_DIFFICULTY_THRESHOLDS.hardLowerBound)).toBe('medium');
  });
});

describe('calculateEstimateConfidence', () => {
  it('returns high confidence when all dimensions are equal', () => {
    const space: DifficultySpace = {
      reasoning: 0.5,
      knowledge: 0.5,
      creativity: 0.5,
      precision: 0.5,
      context_length: 0.5,
    };
    const confidence = calculateEstimateConfidence(space);
    expect(confidence).toBeGreaterThan(0.9);
    expect(confidence).toBeLessThanOrEqual(1);
  });

  it('returns low confidence when dimensions vary widely', () => {
    const space: DifficultySpace = {
      reasoning: 0,
      knowledge: 1,
      creativity: 0,
      precision: 1,
      context_length: 0,
    };
    expect(calculateEstimateConfidence(space)).toBeLessThan(0.5);
  });

  it('returns medium confidence for moderate variance', () => {
    const space: DifficultySpace = {
      reasoning: 0.4,
      knowledge: 0.6,
      creativity: 0.5,
      precision: 0.55,
      context_length: 0.45,
    };
    const confidence = calculateEstimateConfidence(space);
    expect(confidence).toBeGreaterThan(0.5);
    expect(confidence).toBeLessThan(0.9);
  });

  it('clamps confidence between 0 and 1', () => {
    const confidence = calculateEstimateConfidence({
      reasoning: 0,
      knowledge: 0,
      creativity: 1,
      precision: 1,
      context_length: 0,
    });
    expect(confidence).toBeGreaterThanOrEqual(0);
    expect(confidence).toBeLessThanOrEqual(1);
  });
});

describe('summarizeDifficultySpace', () => {
  it('summarizes low difficulty dimensions', () => {
    const summary = summarizeDifficultySpace({
      reasoning: 0.1,
      knowledge: 0.2,
      creativity: 0.15,
      precision: 0.25,
      context_length: 0.05,
    });
    expect(summary).toContain('reasoning:low');
    expect(summary).toContain('knowledge:low');
    expect(summary).toContain('context_length:low');
  });

  it('summarizes high difficulty dimensions', () => {
    const summary = summarizeDifficultySpace({
      reasoning: 0.8,
      knowledge: 0.9,
      creativity: 0.75,
      precision: 0.85,
      context_length: 0.95,
    });
    expect(summary).toContain('reasoning:high');
    expect(summary).toContain('knowledge:high');
    expect(summary).toContain('context_length:high');
  });

  it('summarizes medium difficulty dimensions', () => {
    const summary = summarizeDifficultySpace({
      reasoning: 0.5,
      knowledge: 0.4,
      creativity: 0.6,
      precision: 0.45,
      context_length: 0.55,
    });
    expect(summary).toContain('reasoning:med');
    expect(summary).toContain('knowledge:med');
  });

  it('uses pipe separators between dimensions', () => {
    const summary = summarizeDifficultySpace({
      reasoning: 0.5,
      knowledge: 0.5,
      creativity: 0.5,
      precision: 0.5,
      context_length: 0.5,
    });
    expect(summary.split(' | ')).toHaveLength(5);
  });

  it('handles boundary values correctly', () => {
    const summary = summarizeDifficultySpace({
      reasoning: 0.3,
      knowledge: 0.7,
      creativity: 0.299,
      precision: 0.701,
      context_length: 0.5,
    });
    expect(summary).toContain('reasoning:med');
    expect(summary).toContain('creativity:low');
    expect(summary).toContain('precision:high');
  });

  it('formats all dimensions in order', () => {
    const summary = summarizeDifficultySpace({
      reasoning: 0.1,
      knowledge: 0.5,
      creativity: 0.9,
      precision: 0.2,
      context_length: 0.6,
    });
    const parts = summary.split(' | ');
    expect(parts[0]).toBe('reasoning:low');
    expect(parts[1]).toBe('knowledge:med');
    expect(parts[2]).toBe('creativity:high');
    expect(parts[3]).toBe('precision:low');
    expect(parts[4]).toBe('context_length:med');
  });
});
