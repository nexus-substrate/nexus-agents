/**
 * nexus-agents/workflows - LATTS Tests
 *
 * Tests for Locally Adaptive Test-Time Scaling (LATTS).
 *
 * @module workflows/latts.test
 * (Source: Issue #153)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StepResult } from '../core/index.js';
import {
  LattsExecutor,
  HeuristicVerifier,
  AdaptiveLattsController,
  createLattsExecutor,
} from './latts.js';
import type { IVerifier, VerificationResult, VerifierContext } from './latts-types.js';

describe('LATTS', () => {
  describe('HeuristicVerifier', () => {
    let verifier: HeuristicVerifier;

    beforeEach(() => {
      verifier = new HeuristicVerifier();
    });

    it('should reject failed steps', async () => {
      const result: StepResult = {
        stepId: 'test-step',
        output: null,
        durationMs: 100,
        status: 'failed',
        error: 'Something went wrong',
      };

      const context: VerifierContext = {
        stepId: 'test-step',
        taskDescription: 'Test task',
        previousAttempts: [],
        stepResults: new Map(),
        totalAttempts: 1,
      };

      const verification = await verifier.verify(result, context);

      expect(verification.accepted).toBe(false);
      expect(verification.confidence).toBeGreaterThan(0.9);
      expect(verification.qualityScore).toBe(0);
    });

    it('should accept skipped steps', async () => {
      const result: StepResult = {
        stepId: 'test-step',
        output: null,
        durationMs: 10,
        status: 'skipped',
      };

      const context: VerifierContext = {
        stepId: 'test-step',
        taskDescription: 'Test task',
        previousAttempts: [],
        stepResults: new Map(),
        totalAttempts: 1,
      };

      const verification = await verifier.verify(result, context);

      expect(verification.accepted).toBe(true);
      expect(verification.confidence).toBe(1.0);
    });

    it('should reject steps with no output', async () => {
      const result: StepResult = {
        stepId: 'test-step',
        output: null,
        durationMs: 100,
        status: 'success',
      };

      const context: VerifierContext = {
        stepId: 'test-step',
        taskDescription: 'Test task',
        previousAttempts: [],
        stepResults: new Map(),
        totalAttempts: 1,
      };

      const verification = await verifier.verify(result, context);

      expect(verification.accepted).toBe(false);
      expect(verification.issues).toContain('No output produced');
    });

    it('should detect error patterns in output', async () => {
      const result: StepResult = {
        stepId: 'test-step',
        output: 'Error: Failed to connect to database',
        durationMs: 100,
        status: 'success',
      };

      const context: VerifierContext = {
        stepId: 'test-step',
        taskDescription: 'Test task',
        previousAttempts: [],
        stepResults: new Map(),
        totalAttempts: 1,
      };

      const verification = await verifier.verify(result, context);

      expect(verification.accepted).toBe(false);
      expect(verification.issues).toBeDefined();
      expect(verification.issues?.some((i) => i.includes('error'))).toBe(true);
    });

    it('should accept clean output', async () => {
      const result: StepResult = {
        stepId: 'test-step',
        output: { data: [1, 2, 3], success: true },
        durationMs: 100,
        status: 'success',
      };

      const context: VerifierContext = {
        stepId: 'test-step',
        taskDescription: 'Test task',
        previousAttempts: [],
        stepResults: new Map(),
        totalAttempts: 1,
      };

      const verification = await verifier.verify(result, context);

      expect(verification.accepted).toBe(true);
      expect(verification.qualityScore).toBeGreaterThan(0.5);
    });

    it('should reduce confidence with more attempts', async () => {
      const result: StepResult = {
        stepId: 'test-step',
        output: 'Valid output',
        durationMs: 100,
        status: 'success',
      };

      const contextNoAttempts: VerifierContext = {
        stepId: 'test-step',
        taskDescription: 'Test task',
        previousAttempts: [],
        stepResults: new Map(),
        totalAttempts: 1,
      };

      const contextManyAttempts: VerifierContext = {
        stepId: 'test-step',
        taskDescription: 'Test task',
        previousAttempts: new Array(5).fill({
          attempt: 1,
          result,
          verification: { accepted: false, confidence: 0.5, reason: 'test' },
          decision: { type: 'resample', reason: 'test' },
          durationMs: 100,
        }),
        stepResults: new Map(),
        totalAttempts: 6,
      };

      const v1 = await verifier.verify(result, contextNoAttempts);
      const v2 = await verifier.verify(result, contextManyAttempts);

      expect(v1.confidence).toBeGreaterThan(v2.confidence);
    });
  });

  describe('AdaptiveLattsController', () => {
    let controller: AdaptiveLattsController;

    beforeEach(() => {
      controller = new AdaptiveLattsController({
        acceptanceThreshold: 0.7,
        qualityThreshold: 0.6,
        earlyStopThreshold: 0.95,
        maxAttemptsPerStep: 5,
      });
    });

    it('should accept high confidence verification', () => {
      const verification: VerificationResult = {
        accepted: true,
        confidence: 0.98,
        reason: 'High quality output',
        qualityScore: 0.95,
      };

      const decision = controller.decide(verification, [], {
        stepId: 'test',
        maxAttempts: 20,
        currentAttempt: 1,
        backtrackableSteps: [],
        allowRestart: true,
        elapsedMs: 1000,
        maxTimeMs: 300000,
      });

      expect(decision.type).toBe('accept');
    });

    it('should accept when meeting thresholds', () => {
      const verification: VerificationResult = {
        accepted: true,
        confidence: 0.75,
        reason: 'Good output',
        qualityScore: 0.7,
      };

      const decision = controller.decide(verification, [], {
        stepId: 'test',
        maxAttempts: 20,
        currentAttempt: 1,
        backtrackableSteps: [],
        allowRestart: true,
        elapsedMs: 1000,
        maxTimeMs: 300000,
      });

      expect(decision.type).toBe('accept');
    });

    it('should resample when not meeting thresholds', () => {
      const verification: VerificationResult = {
        accepted: false,
        confidence: 0.5,
        reason: 'Low quality',
        qualityScore: 0.3,
      };

      const decision = controller.decide(verification, [], {
        stepId: 'test',
        maxAttempts: 20,
        currentAttempt: 1,
        backtrackableSteps: [],
        allowRestart: true,
        elapsedMs: 1000,
        maxTimeMs: 300000,
      });

      expect(decision.type).toBe('resample');
    });

    it('should stop when time budget nearly exceeded', () => {
      const verification: VerificationResult = {
        accepted: false,
        confidence: 0.5,
        reason: 'Low quality',
        qualityScore: 0.3,
      };

      const decision = controller.decide(verification, [], {
        stepId: 'test',
        maxAttempts: 20,
        currentAttempt: 1,
        backtrackableSteps: [],
        allowRestart: true,
        elapsedMs: 280000, // 93% of budget
        maxTimeMs: 300000,
      });

      expect(decision.type).toBe('stop');
    });

    it('should backtrack when max attempts reached with backtrack available', () => {
      const verification: VerificationResult = {
        accepted: false,
        confidence: 0.4,
        reason: 'Still failing',
        qualityScore: 0.2,
      };

      const decision = controller.decide(verification, [], {
        stepId: 'test',
        maxAttempts: 20,
        currentAttempt: 6, // > maxAttemptsPerStep (5)
        backtrackableSteps: ['previous-step'],
        allowRestart: true,
        elapsedMs: 1000,
        maxTimeMs: 300000,
      });

      expect(decision.type).toBe('backtrack');
      if (decision.type === 'backtrack') {
        expect(decision.toStepId).toBe('previous-step');
      }
    });

    it('should restart when max attempts reached and no backtrack available', () => {
      const controller2 = new AdaptiveLattsController({
        maxAttemptsPerStep: 5,
        allowBacktrack: false,
        allowRestart: true,
      });

      const verification: VerificationResult = {
        accepted: false,
        confidence: 0.4,
        reason: 'Still failing',
        qualityScore: 0.2,
      };

      const decision = controller2.decide(verification, [], {
        stepId: 'test',
        maxAttempts: 20,
        currentAttempt: 6,
        backtrackableSteps: [],
        allowRestart: true,
        elapsedMs: 1000,
        maxTimeMs: 300000,
      });

      expect(decision.type).toBe('restart');
    });
  });

  describe('LattsExecutor', () => {
    let executor: LattsExecutor;

    beforeEach(() => {
      executor = new LattsExecutor({
        maxAttemptsPerStep: 3,
        maxTotalAttempts: 10,
        acceptanceThreshold: 0.6,
        qualityThreshold: 0.5,
      });
    });

    it('should accept on first try for good output', async () => {
      const executeStep = vi.fn().mockResolvedValue({
        stepId: 'test-step',
        output: { data: 'valid result' },
        durationMs: 100,
        status: 'success',
      } as StepResult);

      const result = await executor.execute(executeStep, 'test-step', 'Test task', new Map());

      expect(result.success).toBe(true);
      expect(result.totalAttempts).toBe(1);
      expect(executeStep).toHaveBeenCalledTimes(1);
    });

    it('should retry on failures', async () => {
      let callCount = 0;
      const executeStep = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.resolve({
            stepId: 'test-step',
            output: 'Error: temporary failure',
            durationMs: 100,
            status: 'success',
          } as StepResult);
        }
        return Promise.resolve({
          stepId: 'test-step',
          output: { data: 'success' },
          durationMs: 100,
          status: 'success',
        } as StepResult);
      });

      const result = await executor.execute(executeStep, 'test-step', 'Test task', new Map());

      expect(result.success).toBe(true);
      expect(result.totalAttempts).toBe(3);
      expect(executeStep).toHaveBeenCalledTimes(3);
    });

    it('should stop after max attempts', async () => {
      const executeStep = vi.fn().mockResolvedValue({
        stepId: 'test-step',
        output: 'Error: persistent failure',
        durationMs: 100,
        status: 'success',
      } as StepResult);

      const result = await executor.execute(executeStep, 'test-step', 'Test task', new Map());

      expect(result.totalAttempts).toBeLessThanOrEqual(10);
      expect(result.history.length).toBeGreaterThan(0);
    });

    it('should track statistics', async () => {
      executor.resetStats();

      // Successful execution
      const executeStep = vi.fn().mockResolvedValue({
        stepId: 'test-step',
        output: { data: 'valid' },
        durationMs: 100,
        status: 'success',
      } as StepResult);

      await executor.execute(executeStep, 'test-step', 'Test task', new Map());

      const stats = executor.getStats();

      expect(stats.totalExecutions).toBe(1);
      expect(stats.successfulExecutions).toBe(1);
      expect(stats.avgAttemptsPerStep).toBeGreaterThan(0);
    });

    it('should reset statistics', () => {
      executor.resetStats();
      const stats = executor.getStats();

      expect(stats.totalExecutions).toBe(0);
      expect(stats.successfulExecutions).toBe(0);
    });

    it('should work with custom verifier', async () => {
      const customVerifier: IVerifier = {
        verify: () =>
          Promise.resolve({
            accepted: true,
            confidence: 1.0,
            reason: 'Always accept',
            qualityScore: 1.0,
          }),
      };

      const customExecutor = new LattsExecutor({}, customVerifier);

      const executeStep = vi.fn().mockResolvedValue({
        stepId: 'test-step',
        output: null,
        durationMs: 100,
        status: 'success',
      } as StepResult);

      const result = await customExecutor.execute(executeStep, 'test-step', 'Test task', new Map());

      expect(result.success).toBe(true);
      expect(result.totalAttempts).toBe(1);
    });

    it('should record early stop when high confidence', async () => {
      const highConfidenceVerifier: IVerifier = {
        verify: () =>
          Promise.resolve({
            accepted: true,
            confidence: 0.99,
            reason: 'High confidence',
            qualityScore: 0.99,
          }),
      };

      const earlyStopExecutor = new LattsExecutor(
        { earlyStopThreshold: 0.95 },
        highConfidenceVerifier
      );
      earlyStopExecutor.resetStats();

      const executeStep = vi.fn().mockResolvedValue({
        stepId: 'test-step',
        output: { data: 'valid' },
        durationMs: 100,
        status: 'success',
      } as StepResult);

      const result = await earlyStopExecutor.execute(
        executeStep,
        'test-step',
        'Test task',
        new Map()
      );

      expect(result.earlyStop).toBe(true);
      expect(earlyStopExecutor.getStats().earlyStopRate).toBeGreaterThan(0);
    });
  });

  describe('createLattsExecutor', () => {
    it('should create executor with default config', () => {
      const executor = createLattsExecutor();
      expect(executor).toBeInstanceOf(LattsExecutor);
    });

    it('should create executor with custom config', () => {
      const executor = createLattsExecutor({
        maxAttemptsPerStep: 10,
        acceptanceThreshold: 0.8,
      });
      expect(executor).toBeInstanceOf(LattsExecutor);
    });

    it('should create executor with custom verifier and controller', () => {
      const customVerifier: IVerifier = {
        verify: () =>
          Promise.resolve({
            accepted: true,
            confidence: 1.0,
            reason: 'test',
          }),
      };

      const customController = new AdaptiveLattsController();

      const executor = createLattsExecutor({}, customVerifier, customController);
      expect(executor).toBeInstanceOf(LattsExecutor);
    });
  });
});
