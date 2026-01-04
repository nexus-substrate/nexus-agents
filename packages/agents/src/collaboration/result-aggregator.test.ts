/**
 * @nexus-agents/agents - Result Aggregator Tests
 */

/* eslint-disable @typescript-eslint/unbound-method */

import { describe, it, expect, vi } from 'vitest';
import type { TaskResult, ILogger } from '@nexus-agents/core';
import {
  ResultAggregator,
  createResultAggregator,
  aggregateResults,
  type AggregatorInput,
  type ExpertResult,
} from './result-aggregator.js';
import type { VoteMessage, ReviewResponseMessage } from './collaboration-types.js';

/**
 * Creates a test task result.
 */
function createTestResult(taskId: string, output: unknown = 'Test output'): TaskResult {
  return {
    taskId,
    output,
    metadata: {
      durationMs: 100,
      tokensUsed: 50,
      toolsUsed: [],
      model: 'test-model',
    },
  };
}

/**
 * Creates an expert result.
 */
function createExpertResult(
  expertId: string,
  output: unknown,
  confidence?: number,
  order?: number
): ExpertResult {
  const base: ExpertResult = {
    expertId,
    result: createTestResult('task-1', output),
  };
  if (confidence !== undefined) {
    return { ...base, confidence, order } as ExpertResult;
  }
  if (order !== undefined) {
    return { ...base, order };
  }
  return base;
}

describe('ResultAggregator', () => {
  describe('constructor', () => {
    it('should create with default options', () => {
      const aggregator = createResultAggregator();
      expect(aggregator).toBeInstanceOf(ResultAggregator);
    });

    it('should accept custom logger', () => {
      const mockLogger: ILogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn().mockReturnThis(),
        setLevel: vi.fn(),
      };

      const aggregator = createResultAggregator({ logger: mockLogger });
      aggregator.aggregate({
        pattern: 'parallel',
        results: [createExpertResult('e1', 'output')],
      });

      expect(mockLogger.info).toHaveBeenCalled();
    });
  });

  describe('aggregate', () => {
    it('should fail with empty results', () => {
      const aggregator = createResultAggregator();
      const result = aggregator.aggregate({
        pattern: 'parallel',
        results: [],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('No results to aggregate');
      }
    });

    it('should return single result unchanged', () => {
      const aggregator = createResultAggregator();
      const input: AggregatorInput = {
        pattern: 'parallel',
        results: [createExpertResult('e1', 'single output')],
      };

      const result = aggregator.aggregate(input);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.output).toBe('single output');
      }
    });

    it('should include metadata', () => {
      const aggregator = createResultAggregator();
      const input: AggregatorInput = {
        pattern: 'parallel',
        results: [createExpertResult('e1', 'output1'), createExpertResult('e2', 'output2')],
      };

      const result = aggregator.aggregate(input);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.metadata.resultCount).toBe(2);
        expect(result.value.metadata.totalTokensUsed).toBe(100);
        expect(result.value.metadata.aggregatedAt).toBeDefined();
      }
    });

    it('should calculate quality score', () => {
      const aggregator = createResultAggregator();
      const input: AggregatorInput = {
        pattern: 'parallel',
        results: [createExpertResult('e1', 'output', 0.9), createExpertResult('e2', 'output', 0.8)],
      };

      const result = aggregator.aggregate(input);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.qualityScore).toBeGreaterThan(0);
        expect(result.value.qualityScore).toBeLessThanOrEqual(1);
      }
    });

    it('should fail if quality below threshold', () => {
      const aggregator = createResultAggregator({ minQualityScore: 0.99 });
      const input: AggregatorInput = {
        pattern: 'parallel',
        results: [createExpertResult('e1', 'output', 0.5)],
      };

      const result = aggregator.aggregate(input);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('quality below threshold');
      }
    });
  });

  describe('strategy determination', () => {
    it('should use merge for parallel pattern', () => {
      const aggregator = createResultAggregator();
      const result = aggregator.aggregate({
        pattern: 'parallel',
        results: [createExpertResult('e1', 'output')],
      });

      if (result.ok) {
        expect(result.value.strategy).toBe('merge');
      }
    });

    it('should use sequential_chain for sequential pattern', () => {
      const aggregator = createResultAggregator();
      const result = aggregator.aggregate({
        pattern: 'sequential',
        results: [createExpertResult('e1', 'output')],
      });

      if (result.ok) {
        expect(result.value.strategy).toBe('sequential_chain');
      }
    });

    it('should use select_best for review pattern', () => {
      const aggregator = createResultAggregator();
      const result = aggregator.aggregate({
        pattern: 'review',
        results: [createExpertResult('e1', 'output')],
      });

      if (result.ok) {
        expect(result.value.strategy).toBe('select_best');
      }
    });

    it('should use consensus for consensus pattern', () => {
      const aggregator = createResultAggregator();
      const result = aggregator.aggregate({
        pattern: 'consensus',
        results: [createExpertResult('e1', 'output')],
      });

      if (result.ok) {
        expect(result.value.strategy).toBe('consensus');
      }
    });
  });

  describe('merge strategy', () => {
    it('should merge string outputs by combining unique lines', () => {
      const aggregator = createResultAggregator();
      const result = aggregator.aggregate({
        pattern: 'parallel',
        results: [
          createExpertResult('e1', 'line 1\nline 2'),
          createExpertResult('e2', 'line 2\nline 3'),
        ],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as string;
        expect(output).toContain('line 1');
        expect(output).toContain('line 2');
        expect(output).toContain('line 3');
      }
    });

    it('should merge object outputs with conflict detection', () => {
      const aggregator = createResultAggregator();
      const result = aggregator.aggregate({
        pattern: 'parallel',
        results: [
          createExpertResult('e1', { key1: 'value1', shared: 'a' }),
          createExpertResult('e2', { key2: 'value2', shared: 'b' }),
        ],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as Record<string, unknown>;
        expect(output.key1).toBe('value1');
        expect(output.key2).toBe('value2');
        expect(result.value.conflicts).toHaveLength(1);
      }
    });

    it('should merge array outputs by deduplication', () => {
      const aggregator = createResultAggregator();
      const result = aggregator.aggregate({
        pattern: 'parallel',
        results: [createExpertResult('e1', [1, 2, 3]), createExpertResult('e2', [2, 3, 4])],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as number[];
        expect(output).toEqual([1, 2, 3, 4]);
      }
    });

    it('should wrap mixed type outputs', () => {
      const aggregator = createResultAggregator();
      const result = aggregator.aggregate({
        pattern: 'parallel',
        results: [
          createExpertResult('e1', 'string output'),
          createExpertResult('e2', { object: 'output' }),
        ],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as {
          sources: Array<{ expertId: string; output: unknown }>;
        };
        expect(output.sources).toHaveLength(2);
      }
    });
  });

  describe('select_best strategy', () => {
    it('should select by approved review', () => {
      const aggregator = createResultAggregator();
      const reviews: ReviewResponseMessage[] = [
        {
          type: 'review_response',
          reviewerId: 'reviewer',
          requesterId: 'e1',
          approved: true,
          feedback: 'LGTM',
        },
      ];

      const result = aggregator.aggregate({
        pattern: 'review',
        results: [
          createExpertResult('e1', 'approved output'),
          createExpertResult('e2', 'other output'),
        ],
        reviews,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.output).toBe('approved output');
      }
    });

    it('should select by confidence when no reviews', () => {
      const aggregator = createResultAggregator();
      const result = aggregator.aggregate({
        pattern: 'review',
        results: [
          createExpertResult('e1', 'low confidence', 0.5),
          createExpertResult('e2', 'high confidence', 0.9),
        ],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.output).toBe('high confidence');
      }
    });
  });

  describe('consensus strategy', () => {
    it('should aggregate votes', () => {
      const aggregator = createResultAggregator();
      const votes: VoteMessage[] = [
        { type: 'vote', expertId: 'e1', decision: 'approve', reasoning: 'Good' },
        { type: 'vote', expertId: 'e2', decision: 'approve', reasoning: 'Fine' },
        { type: 'vote', expertId: 'e3', decision: 'reject', reasoning: 'Bad' },
      ];

      const result = aggregator.aggregate({
        pattern: 'consensus',
        results: [
          createExpertResult('e1', 'output1'),
          createExpertResult('e2', 'output2'),
          createExpertResult('e3', 'output3'),
        ],
        votes,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as {
          decision: string;
          approveCount: number;
          rejectCount: number;
        };
        expect(output.decision).toBe('approved');
        expect(output.approveCount).toBe(2);
        expect(output.rejectCount).toBe(1);
      }
    });

    it('should include all reasonings', () => {
      const aggregator = createResultAggregator();
      const votes: VoteMessage[] = [
        { type: 'vote', expertId: 'e1', decision: 'approve', reasoning: 'Reason 1' },
        { type: 'vote', expertId: 'e2', decision: 'reject', reasoning: 'Reason 2' },
        { type: 'vote', expertId: 'e3', decision: 'abstain', reasoning: 'Reason 3' },
      ];

      const result = aggregator.aggregate({
        pattern: 'consensus',
        results: [
          createExpertResult('e1', 'output1'),
          createExpertResult('e2', 'output2'),
          createExpertResult('e3', 'output3'),
        ],
        votes,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as { reasonings: Array<{ reasoning: string }> };
        expect(output.reasonings).toHaveLength(3);
      }
    });
  });

  describe('sequential_chain strategy', () => {
    it('should chain results in order', () => {
      const aggregator = createResultAggregator();
      const result = aggregator.aggregate({
        pattern: 'sequential',
        results: [
          createExpertResult('e1', 'step 1 output', undefined, 0),
          createExpertResult('e2', 'step 2 output', undefined, 1),
          createExpertResult('e3', 'step 3 output', undefined, 2),
        ],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as {
          finalOutput: unknown;
          chain: Array<{ step: number; output: unknown }>;
        };
        expect(output.finalOutput).toBe('step 3 output');
        expect(output.chain).toHaveLength(3);
        expect(output.chain[0]?.step).toBe(1);
      }
    });

    it('should sort by order', () => {
      const aggregator = createResultAggregator();
      const result = aggregator.aggregate({
        pattern: 'sequential',
        results: [
          createExpertResult('e2', 'second', undefined, 1),
          createExpertResult('e1', 'first', undefined, 0),
          createExpertResult('e3', 'third', undefined, 2),
        ],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as {
          chain: Array<{ expertId: string }>;
        };
        expect(output.chain[0]?.expertId).toBe('e1');
        expect(output.chain[1]?.expertId).toBe('e2');
        expect(output.chain[2]?.expertId).toBe('e3');
      }
    });
  });

  describe('conflict resolution', () => {
    it('should detect conflicts in object values', () => {
      const aggregator = createResultAggregator();
      const result = aggregator.aggregate({
        pattern: 'parallel',
        results: [
          createExpertResult('e1', { value: 'one' }),
          createExpertResult('e2', { value: 'two' }),
        ],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.conflicts).toHaveLength(1);
        expect(result.value.conflicts[0]?.field).toBe('value');
      }
    });

    it('should use custom conflict resolver', () => {
      const customResolver = vi.fn().mockReturnValue('expert2');
      const aggregator = createResultAggregator({
        conflictResolver: customResolver,
      });

      const result = aggregator.aggregate({
        pattern: 'parallel',
        results: [
          createExpertResult('e1', { key: 'value1' }),
          createExpertResult('e2', { key: 'value2' }),
        ],
      });

      expect(customResolver).toHaveBeenCalled();
      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as Record<string, unknown>;
        expect(output.key).toBe('value2');
      }
    });

    it('should prefer higher confidence by default', () => {
      const aggregator = createResultAggregator();
      const result = aggregator.aggregate({
        pattern: 'parallel',
        results: [
          createExpertResult('e1', { key: 'low' }, 0.3),
          createExpertResult('e2', { key: 'high' }, 0.9),
        ],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as Record<string, unknown>;
        expect(output.key).toBe('high');
      }
    });

    it('should not flag non-conflicting values', () => {
      const aggregator = createResultAggregator();
      const result = aggregator.aggregate({
        pattern: 'parallel',
        results: [
          createExpertResult('e1', { key: 'same' }),
          createExpertResult('e2', { key: 'same' }),
        ],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.conflicts).toHaveLength(0);
      }
    });
  });

  describe('custom quality scorer', () => {
    it('should use custom quality scorer', () => {
      const customScorer = vi.fn().mockReturnValue(0.75);
      const aggregator = createResultAggregator({
        qualityScorer: customScorer,
      });

      const result = aggregator.aggregate({
        pattern: 'parallel',
        results: [createExpertResult('e1', 'output')],
      });

      expect(customScorer).toHaveBeenCalled();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.qualityScore).toBe(0.75);
      }
    });
  });

  describe('aggregateResults convenience function', () => {
    it('should aggregate results', () => {
      const result = aggregateResults({
        pattern: 'parallel',
        results: [createExpertResult('e1', 'output1'), createExpertResult('e2', 'output2')],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.metadata.resultCount).toBe(2);
      }
    });

    it('should accept options', () => {
      const result = aggregateResults(
        {
          pattern: 'parallel',
          results: [createExpertResult('e1', 'output', 0.3)],
        },
        { minQualityScore: 0.9 }
      );

      expect(result.ok).toBe(false);
    });
  });
});
