/**
 * Tests for Agreement-Based Cascade Router.
 * (Source: Issue #121, arXiv:2410.10347)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AgreementCascadeRouter,
  createAgreementCascadeRouter,
  createDefaultCascadeStages,
  type CascadeStage,
} from './agreement-cascade-router.js';
import type { ICliAdapter, CliName, CliResponse, CliTask } from './types.js';
import { ok, err } from '../core/index.js';

/** Creates a mock CLI adapter. */
function createMockAdapter(name: CliName, response: string): ICliAdapter {
  return {
    name,
    transport: 'mcp',
    capabilities: {
      reasoning: 7,
      contextWindow: 100000,
      codeGeneration: 8,
      speed: 7,
      cost: 5,
    },
    execute: vi.fn().mockResolvedValue(
      ok({
        text: response,
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        durationMs: 500,
        model: 'test-model',
      } as CliResponse)
    ),
    healthCheck: vi.fn().mockResolvedValue({
      healthy: true,
      version: '1.0.0',
      versionStatus: 'supported' as const,
      lastChecked: new Date(),
    }),
    getCapacity: vi.fn().mockResolvedValue({
      remainingTokens: 100000,
      remainingRequests: 1000,
      resetTime: new Date(),
      utilizationPercent: 10,
      exhausted: false,
    }),
    getVersion: vi.fn().mockResolvedValue('1.0.0'),
    getModelInfo: vi.fn().mockReturnValue({
      id: 'test-model',
      name: 'Test Model',
      contextWindow: 100000,
    }),
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
}

/** Creates a test task. */
function createTestTask(content: string = 'Test task'): CliTask {
  return {
    content,
    timeoutMs: 30000,
  };
}

describe('AgreementCascadeRouter', () => {
  let adapters: Map<CliName, ICliAdapter>;

  beforeEach(() => {
    adapters = new Map();
  });

  describe('configuration', () => {
    it('should use default config when none provided', () => {
      const router = createAgreementCascadeRouter(adapters);
      expect(router).toBeDefined();
    });

    it('should accept custom config', () => {
      const router = createAgreementCascadeRouter(adapters, {
        agreementThreshold: 0.8,
        maxStages: 2,
      });
      expect(router).toBeDefined();
    });

    it('should throw on invalid config', () => {
      expect(() =>
        createAgreementCascadeRouter(adapters, {
          agreementThreshold: 1.5, // Invalid: > 1
        })
      ).toThrow('Invalid cascade config');
    });
  });

  describe('execute', () => {
    it('should return early when single model agrees with itself', async () => {
      adapters.set('gemini' as CliName, createMockAdapter('gemini' as CliName, 'Response A'));

      const router = new AgreementCascadeRouter(adapters);
      const stages: CascadeStage[] = [
        { name: 'fast', models: ['gemini'] as CliName[], costWeight: 1 },
      ];

      const result = await router.execute(createTestTask(), stages);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.consensusReached).toBe(true);
        expect(result.value.resolvedAtStage).toBe(0);
        expect(result.value.stagesExecuted).toBe(1);
      }
    });

    it('should reach consensus when models agree', async () => {
      // Two models returning similar responses
      adapters.set(
        'gemini' as CliName,
        createMockAdapter('gemini' as CliName, 'The answer is forty two')
      );
      adapters.set(
        'codex' as CliName,
        createMockAdapter('codex' as CliName, 'The answer is forty two exactly')
      );

      const router = new AgreementCascadeRouter(adapters, { agreementThreshold: 0.5 });
      const stages: CascadeStage[] = [
        { name: 'fast', models: ['gemini', 'codex'] as CliName[], costWeight: 1 },
      ];

      const result = await router.execute(createTestTask(), stages);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.consensusReached).toBe(true);
        // Agreement score is in the stage history
        expect(result.value.stageHistory[0]?.agreementScore).toBeGreaterThan(0);
      }
    });

    it('should escalate when models disagree', async () => {
      // First stage: disagreeing models
      adapters.set('gemini' as CliName, createMockAdapter('gemini' as CliName, 'Answer is A'));
      adapters.set(
        'codex' as CliName,
        createMockAdapter('codex' as CliName, 'Completely different B')
      );
      // Second stage: agreeing models
      adapters.set(
        'claude' as CliName,
        createMockAdapter('claude' as CliName, 'The correct answer is definitely A')
      );

      const router = new AgreementCascadeRouter(adapters, { agreementThreshold: 0.7 });
      const stages: CascadeStage[] = [
        { name: 'fast', models: ['gemini', 'codex'] as CliName[], costWeight: 1 },
        { name: 'powerful', models: ['claude', 'gemini'] as CliName[], costWeight: 5 },
      ];

      const result = await router.execute(createTestTask(), stages);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.stagesExecuted).toBeGreaterThanOrEqual(1);
      }
    });

    it('should handle adapter failures gracefully', async () => {
      const failingAdapter: ICliAdapter = {
        ...createMockAdapter('gemini' as CliName, ''),
        execute: vi.fn().mockResolvedValue(
          err({
            code: 'EXECUTION_ERROR',
            message: 'Model failed',
            cli: 'gemini' as CliName,
            retryable: true,
          })
        ),
      };
      adapters.set('gemini' as CliName, failingAdapter);
      adapters.set('codex' as CliName, createMockAdapter('codex' as CliName, 'Valid response'));

      const router = new AgreementCascadeRouter(adapters);
      const stages: CascadeStage[] = [
        { name: 'fast', models: ['gemini', 'codex'] as CliName[], costWeight: 1 },
      ];

      const result = await router.execute(createTestTask(), stages);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.stageHistory[0]?.failures.size).toBeGreaterThan(0);
      }
    });

    it('should return error when all models fail', async () => {
      const failingAdapter: ICliAdapter = {
        ...createMockAdapter('gemini' as CliName, ''),
        execute: vi.fn().mockResolvedValue(
          err({
            code: 'EXECUTION_ERROR',
            message: 'Model failed',
            cli: 'gemini' as CliName,
            retryable: true,
          })
        ),
      };
      adapters.set('gemini' as CliName, failingAdapter);

      const router = new AgreementCascadeRouter(adapters);
      const stages: CascadeStage[] = [
        { name: 'fast', models: ['gemini'] as CliName[], costWeight: 1 },
      ];

      const result = await router.execute(createTestTask(), stages);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('All models failed');
      }
    });

    it('should calculate cost savings correctly', async () => {
      adapters.set('gemini' as CliName, createMockAdapter('gemini' as CliName, 'Quick answer'));

      const router = new AgreementCascadeRouter(adapters);
      const stages: CascadeStage[] = [
        { name: 'fast', models: ['gemini'] as CliName[], costWeight: 1 },
        { name: 'balanced', models: ['gemini'] as CliName[], costWeight: 3 },
        { name: 'powerful', models: ['gemini'] as CliName[], costWeight: 10 },
      ];

      const result = await router.execute(createTestTask(), stages);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Resolved at stage 0, total cost weight = 14, used = 1
        // Savings = (14 - 1) / 14 = 0.928...
        expect(result.value.estimatedCostSavings).toBeGreaterThan(0.9);
      }
    });
  });

  describe('checkAgreement', () => {
    it('should return 0 score for empty responses', () => {
      const router = new AgreementCascadeRouter(adapters);
      const result = router.checkAgreement(new Map());

      expect(result.score).toBe(0);
      expect(result.hasAgreement).toBe(false);
    });

    it('should return 1 score for single response', () => {
      const router = new AgreementCascadeRouter(adapters);
      const responses = new Map<CliName, CliResponse>();
      responses.set('gemini' as CliName, {
        text: 'Single response',
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        durationMs: 500,
        model: 'test',
      });

      const result = router.checkAgreement(responses);

      expect(result.score).toBe(1);
      expect(result.hasAgreement).toBe(true);
    });

    it('should detect agreement between similar responses', () => {
      const router = new AgreementCascadeRouter(adapters, { agreementThreshold: 0.5 });
      const responses = new Map<CliName, CliResponse>();
      responses.set('gemini' as CliName, {
        text: 'The implementation uses a recursive algorithm to solve the problem efficiently',
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        durationMs: 500,
        model: 'test',
      });
      responses.set('codex' as CliName, {
        text: 'A recursive algorithm is used to solve this problem in an efficient manner',
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        durationMs: 500,
        model: 'test',
      });

      const result = router.checkAgreement(responses);

      expect(result.score).toBeGreaterThan(0);
      expect(result.clusters.length).toBeGreaterThan(0);
    });

    it('should detect disagreement between different responses', () => {
      const router = new AgreementCascadeRouter(adapters, { agreementThreshold: 0.9 });
      const responses = new Map<CliName, CliResponse>();
      responses.set('gemini' as CliName, {
        text: 'Use a recursive algorithm',
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        durationMs: 500,
        model: 'test',
      });
      responses.set('codex' as CliName, {
        text: 'Use an iterative approach',
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        durationMs: 500,
        model: 'test',
      });
      responses.set('claude' as CliName, {
        text: 'Apply dynamic programming',
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        durationMs: 500,
        model: 'test',
      });

      const result = router.checkAgreement(responses);

      // With 3 completely different responses and 0.9 threshold, no agreement
      expect(result.hasAgreement).toBe(false);
    });
  });

  describe('createDefaultCascadeStages', () => {
    it('should create valid default stages', () => {
      const stages = createDefaultCascadeStages();

      expect(stages.length).toBe(3);
      expect(stages[0]?.name).toBe('fast');
      expect(stages[1]?.name).toBe('balanced');
      expect(stages[2]?.name).toBe('powerful');

      // Cost should increase
      expect(stages[0]?.costWeight).toBeLessThan(stages[1]?.costWeight ?? 0);
      expect(stages[1]?.costWeight).toBeLessThan(stages[2]?.costWeight ?? 0);
    });
  });
});
