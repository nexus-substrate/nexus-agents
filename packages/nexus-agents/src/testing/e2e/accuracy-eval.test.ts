/**
 * Tests for AccuracyEval (Layer 2 E2E Testing)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AccuracyEval,
  createAccuracyEval,
  DefaultQualityEvaluator,
  type IQualityEvaluator,
} from './accuracy-eval.js';
import type { AccuracyEvalConfig } from './types.js';
import { WORKFLOW_QUALITY_THRESHOLDS } from './types.js';

describe('AccuracyEval', () => {
  let evaluator: AccuracyEval;

  beforeEach(() => {
    evaluator = new AccuracyEval();
  });

  describe('evaluate', () => {
    const basicConfig: AccuracyEvalConfig = {
      name: 'test-evaluation',
      workflow: 'code-review',
      input: { code: 'const x = 1;' },
      expectedOutput: 'Good code structure with clear separation of concerns',
      qualityThreshold: 7.0,
      numRuns: 3,
    };

    it('should evaluate workflow and return results', async () => {
      const result = await evaluator.evaluate(basicConfig);

      expect(result.name).toBe('test-evaluation');
      expect(result.scores).toHaveLength(3);
      expect(result.avgScore).toBeGreaterThanOrEqual(0);
      expect(result.avgScore).toBeLessThanOrEqual(10);
      expect(result.threshold).toBe(7.0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should pass when average score meets threshold', async () => {
      // The default evaluator for code-review returns high scores
      const result = await evaluator.evaluate(basicConfig);

      // Default mock for code-review should pass
      expect(result.passed).toBe(true);
      expect(result.avgScore).toBeGreaterThanOrEqual(basicConfig.qualityThreshold);
    });

    it('should fail when average score is below threshold', async () => {
      const highThresholdConfig: AccuracyEvalConfig = {
        ...basicConfig,
        qualityThreshold: 10.0, // Impossible to meet
      };

      const result = await evaluator.evaluate(highThresholdConfig);

      expect(result.passed).toBe(false);
    });

    it('should run multiple evaluation rounds', async () => {
      const config: AccuracyEvalConfig = {
        ...basicConfig,
        numRuns: 5,
      };

      const result = await evaluator.evaluate(config);

      expect(result.scores).toHaveLength(5);
      expect(result.feedback).toHaveLength(5);
    });

    it('should collect feedback for each run', async () => {
      const result = await evaluator.evaluate(basicConfig);

      for (let i = 0; i < result.feedback.length; i++) {
        const feedback = result.feedback[i];
        expect(feedback?.runIndex).toBe(i);
        expect(feedback?.score).toBeGreaterThanOrEqual(0);
        expect(feedback?.reasoning).toBeDefined();
        expect(Array.isArray(feedback?.issues)).toBe(true);
        expect(Array.isArray(feedback?.strengths)).toBe(true);
      }
    });

    it('should track token usage and cost', async () => {
      const result = await evaluator.evaluate(basicConfig);

      expect(result.totalTokens).toBeGreaterThan(0);
      expect(result.totalCostUsd).toBeGreaterThanOrEqual(0);
    });

    it('should handle different workflow types', async () => {
      const workflows = ['code-review', 'bug-fix', 'feature-implementation'];

      for (const workflow of workflows) {
        const config: AccuracyEvalConfig = {
          ...basicConfig,
          workflow,
          numRuns: 1,
        };
        const result = await evaluator.evaluate(config);

        expect(result.scores).toHaveLength(1);
        expect(result.name).toBe('test-evaluation');
      }
    });
  });

  describe('recordFeedback', () => {
    it('should record feedback without throwing', () => {
      const result = {
        name: 'test',
        avgScore: 8.0,
        scores: [8.0],
        passed: true,
        threshold: 7.0,
        feedback: [],
        totalTokens: 100,
        totalCostUsd: 0.003,
        durationMs: 1000,
      };

      expect(() => {
        evaluator.recordFeedback(result);
      }).not.toThrow();
    });

    it('should record feedback with routing ID', () => {
      const result = {
        name: 'test',
        avgScore: 8.0,
        scores: [8.0],
        passed: true,
        threshold: 7.0,
        feedback: [],
        totalTokens: 100,
        totalCostUsd: 0.003,
        durationMs: 1000,
      };

      expect(() => {
        evaluator.recordFeedback(result, 'routing-123');
      }).not.toThrow();
    });
  });

  describe('getThreshold', () => {
    it('should return correct threshold for code-review', () => {
      expect(AccuracyEval.getThreshold('code-review')).toBe(8.5);
    });

    it('should return correct threshold for bug-fix', () => {
      expect(AccuracyEval.getThreshold('bug-fix')).toBe(8.0);
    });

    it('should return correct threshold for security-audit', () => {
      expect(AccuracyEval.getThreshold('security-audit')).toBe(9.0);
    });

    it('should return default threshold for unknown workflow', () => {
      expect(AccuracyEval.getThreshold('unknown-workflow')).toBe(7.0);
    });
  });

  describe('createAccuracyEval', () => {
    it('should create evaluator via factory function', () => {
      const e = createAccuracyEval();
      expect(e).toBeDefined();
    });

    it('should accept custom quality evaluator', () => {
      const customEvaluator: IQualityEvaluator = {
        evaluate: () =>
          Promise.resolve({
            score: 9.5,
            reasoning: 'Custom evaluation',
            issues: [],
            strengths: ['Excellent'],
            tokensUsed: 50,
          }),
      };

      const e = createAccuracyEval(customEvaluator);
      expect(e).toBeDefined();
    });
  });

  describe('WORKFLOW_QUALITY_THRESHOLDS', () => {
    it('should have threshold for code-review', () => {
      expect(WORKFLOW_QUALITY_THRESHOLDS['code-review']).toBe(8.5);
    });

    it('should have threshold for feature-implementation', () => {
      expect(WORKFLOW_QUALITY_THRESHOLDS['feature-implementation']).toBe(7.5);
    });

    it('should have threshold for bug-fix', () => {
      expect(WORKFLOW_QUALITY_THRESHOLDS['bug-fix']).toBe(8.0);
    });

    it('should have threshold for security-audit', () => {
      expect(WORKFLOW_QUALITY_THRESHOLDS['security-audit']).toBe(9.0);
    });

    it('should have threshold for test-generation', () => {
      expect(WORKFLOW_QUALITY_THRESHOLDS['test-generation']).toBe(7.5);
    });

    it('should have threshold for documentation-update', () => {
      expect(WORKFLOW_QUALITY_THRESHOLDS['documentation-update']).toBe(7.0);
    });

    it('should have threshold for refactoring', () => {
      expect(WORKFLOW_QUALITY_THRESHOLDS['refactoring']).toBe(7.5);
    });
  });
});

describe('DefaultQualityEvaluator', () => {
  let evaluator: DefaultQualityEvaluator;

  beforeEach(() => {
    evaluator = new DefaultQualityEvaluator();
  });

  describe('evaluate', () => {
    it('should score high for matching content', async () => {
      const result = await evaluator.evaluate({
        workflowOutput: 'The analysis shows good code structure and naming conventions',
        expectedOutput: 'Good code structure with clear naming conventions',
      });

      expect(result.score).toBeGreaterThanOrEqual(6);
      expect(result.strengths.length).toBeGreaterThan(0);
    });

    it('should score low for mismatched content', async () => {
      const result = await evaluator.evaluate({
        workflowOutput: 'Error: something went wrong',
        expectedOutput: 'Success with detailed analysis',
      });

      expect(result.score).toBeLessThan(6);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should detect error indicators', async () => {
      const result = await evaluator.evaluate({
        workflowOutput: 'The operation failed with an error',
        expectedOutput: 'Success',
      });

      expect(result.issues).toContain('Output contains error indicators');
    });

    it('should reward structured output', async () => {
      const result = await evaluator.evaluate({
        workflowOutput: '{"result": "success", "data": {}}',
        expectedOutput: 'structured output',
      });

      expect(result.strengths).toContain('Output appears structured');
    });

    it('should reward detailed output', async () => {
      const longOutput = 'This is a detailed analysis with many words. '.repeat(10);
      const result = await evaluator.evaluate({
        workflowOutput: longOutput,
        expectedOutput: 'detailed analysis',
      });

      expect(result.strengths).toContain('Output has sufficient detail');
    });

    it('should estimate token usage', async () => {
      const result = await evaluator.evaluate({
        workflowOutput: 'short',
        expectedOutput: 'expected',
      });

      expect(result.tokensUsed).toBeGreaterThan(0);
    });

    it('should clamp score to 0-10 range', async () => {
      // Very good match
      const goodResult = await evaluator.evaluate({
        workflowOutput: 'exact match exact match exact match exact match',
        expectedOutput: 'exact match',
      });
      expect(goodResult.score).toBeLessThanOrEqual(10);

      // Very poor match with errors
      const badResult = await evaluator.evaluate({
        workflowOutput: 'error failed error failed',
        expectedOutput: 'completely different unrelated content',
      });
      expect(badResult.score).toBeGreaterThanOrEqual(0);
    });
  });
});
