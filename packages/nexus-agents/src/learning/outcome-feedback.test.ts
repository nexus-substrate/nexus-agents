/**
 * nexus-agents/learning - Outcome Feedback Tests
 *
 * Tests for the outcome feedback collector.
 *
 * @module learning/outcome-feedback.test
 * (Source: Issue #160)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  OutcomeFeedbackCollector,
  createRoutingDecision,
  createTaskOutcome,
  createOutcomeFeedbackCollector,
} from './outcome-feedback.js';
import type { RoutingDecision, TaskOutcome } from './outcome-feedback-types.js';

describe('OutcomeFeedbackCollector', () => {
  let collector: OutcomeFeedbackCollector;

  const createTestDecision = (overrides?: Partial<RoutingDecision>): RoutingDecision =>
    createRoutingDecision({
      query: 'Write a function to sort an array',
      routerType: 'linucb',
      selectedModel: 'claude',
      armIndex: 0,
      traceId: `trace-${String(Date.now())}`,
      banditContext: {
        taskComplexity: 0.5,
        contextLengthNormalized: 0.3,
        isCodeTask: 1,
        isReasoningTask: 0,
        budgetUtilization: 0.2,
        timePressure: 0.1,
      },
      ...overrides,
    });

  const createTestOutcome = (
    routingDecisionId: string,
    overrides?: Partial<TaskOutcome>
  ): TaskOutcome =>
    createTaskOutcome({
      routingDecisionId,
      outcomeClass: 'success',
      success: true,
      qualityScore: 0.9,
      durationMs: 2000,
      tokenUsage: 1500,
      traceId: `trace-${String(Date.now())}`,
      qualitySignals: {
        testsPass: true,
        lintErrors: 0,
        retryCount: 0,
        completionRatio: 1.0,
      },
      ...overrides,
    });

  beforeEach(() => {
    collector = new OutcomeFeedbackCollector();
  });

  describe('recordRoutingDecision', () => {
    it('should record a routing decision', () => {
      const decision = createTestDecision();
      collector.recordRoutingDecision(decision);

      const pending = collector.getPendingDecisions();
      expect(pending).toHaveLength(1);
      expect(pending[0]?.id).toBe(decision.id);
    });

    it('should track multiple decisions', () => {
      const decision1 = createTestDecision({ traceId: 'trace-1' });
      const decision2 = createTestDecision({ traceId: 'trace-2' });

      collector.recordRoutingDecision(decision1);
      collector.recordRoutingDecision(decision2);

      const pending = collector.getPendingDecisions();
      expect(pending).toHaveLength(2);
    });

    it('should enforce max pending decisions limit', () => {
      const smallCollector = new OutcomeFeedbackCollector({
        maxPendingDecisions: 2,
      });

      for (let i = 0; i < 5; i++) {
        smallCollector.recordRoutingDecision(createTestDecision({ traceId: `trace-${String(i)}` }));
      }

      const pending = smallCollector.getPendingDecisions();
      expect(pending.length).toBeLessThanOrEqual(2);
    });
  });

  describe('recordOutcome', () => {
    it('should record an outcome and remove from pending', () => {
      const decision = createTestDecision();
      collector.recordRoutingDecision(decision);

      const outcome = createTestOutcome(decision.id);
      collector.recordOutcome(outcome);

      const pending = collector.getPendingDecisions();
      expect(pending).toHaveLength(0);
    });

    it('should include outcome in stats', () => {
      const decision = createTestDecision();
      collector.recordRoutingDecision(decision);

      const outcome = createTestOutcome(decision.id);
      collector.recordOutcome(outcome);

      const stats = collector.getStats();
      expect(stats.totalOutcomes).toBe(1);
      expect(stats.outcomesByClass.success).toBe(1);
    });
  });

  describe('processOutcome', () => {
    it('should process outcome by trace ID', () => {
      const traceId = 'test-trace-123';
      const decision = createTestDecision({ traceId });
      collector.recordRoutingDecision(decision);

      collector.processOutcome(traceId, {
        timestamp: new Date().toISOString(),
        outcomeClass: 'success',
        success: true,
        qualityScore: 0.85,
        durationMs: 3000,
        tokenUsage: 2000,
        traceId,
        qualitySignals: {
          retryCount: 0,
          completionRatio: 1.0,
        },
      });

      const pending = collector.getPendingDecisions();
      expect(pending).toHaveLength(0);

      const stats = collector.getStats();
      expect(stats.totalOutcomes).toBe(1);
    });

    it('should handle missing trace ID gracefully', () => {
      collector.processOutcome('non-existent-trace', {
        timestamp: new Date().toISOString(),
        outcomeClass: 'success',
        success: true,
        qualityScore: 0.85,
        durationMs: 3000,
        tokenUsage: 2000,
        traceId: 'non-existent-trace',
        qualitySignals: {
          retryCount: 0,
          completionRatio: 1.0,
        },
      });

      const stats = collector.getStats();
      expect(stats.totalOutcomes).toBe(0);
    });
  });

  describe('computeReward', () => {
    it('should compute high reward for successful task', () => {
      const decision = createTestDecision();
      collector.recordRoutingDecision(decision);

      const outcome = createTestOutcome(decision.id);
      const reward = collector.computeReward(outcome);

      expect(reward.reward).toBeGreaterThan(0.7);
      expect(reward.components.baseReward).toBe(1.0);
    });

    it('should compute low reward for failed task', () => {
      const decision = createTestDecision();
      collector.recordRoutingDecision(decision);

      const outcome = createTestOutcome(decision.id, {
        outcomeClass: 'failure',
        success: false,
        qualityScore: 0.1,
        durationMs: 30000, // slow
        tokenUsage: 10000, // high token usage
      });
      const reward = collector.computeReward(outcome);

      expect(reward.reward).toBeLessThan(0.4);
      expect(reward.components.baseReward).toBe(0);
    });

    it('should compute partial reward for partial completion', () => {
      const decision = createTestDecision();
      collector.recordRoutingDecision(decision);

      const outcome = createTestOutcome(decision.id, {
        outcomeClass: 'partial',
        success: false,
        qualityScore: 0.5,
        qualitySignals: {
          retryCount: 0,
          completionRatio: 0.6,
        },
      });
      const reward = collector.computeReward(outcome);

      expect(reward.components.baseReward).toBe(0.6);
    });

    it('should apply retry penalty', () => {
      const decision = createTestDecision();
      collector.recordRoutingDecision(decision);

      // Test penalty component directly, since overall reward is clamped
      const outcomeWithRetry = createTestOutcome(decision.id, {
        qualityScore: 0.6,
        durationMs: 10000,
        tokenUsage: 5000,
        qualitySignals: {
          retryCount: 3,
          completionRatio: 1.0,
        },
      });

      const rewardWithRetry = collector.computeReward(outcomeWithRetry);

      // Verify retry penalty is applied (3 retries * 0.1 penalty = 0.3)
      expect(rewardWithRetry.components.retryPenalty).toBeCloseTo(0.3, 5);
      expect(rewardWithRetry.components.retryPenalty).toBeGreaterThan(0);
    });

    it('should apply speed bonus', () => {
      const decision = createTestDecision();
      collector.recordRoutingDecision(decision);

      const fastOutcome = createTestOutcome(decision.id, { durationMs: 1000 });
      const slowOutcome = createTestOutcome(decision.id, { durationMs: 20000 });

      const fastReward = collector.computeReward(fastOutcome);
      const slowReward = collector.computeReward(slowOutcome);

      expect(fastReward.components.speedBonus).toBeGreaterThan(slowReward.components.speedBonus);
    });

    it('should apply efficiency bonus', () => {
      const decision = createTestDecision();
      collector.recordRoutingDecision(decision);

      const efficientOutcome = createTestOutcome(decision.id, { tokenUsage: 500 });
      const inefficientOutcome = createTestOutcome(decision.id, { tokenUsage: 10000 });

      const efficientReward = collector.computeReward(efficientOutcome);
      const inefficientReward = collector.computeReward(inefficientOutcome);

      expect(efficientReward.components.efficiencyBonus).toBeGreaterThan(
        inefficientReward.components.efficiencyBonus
      );
    });

    it('should clamp reward to 0-1 range', () => {
      const decision = createTestDecision();
      collector.recordRoutingDecision(decision);

      // Create outcome with many retries to push reward negative
      const badOutcome = createTestOutcome(decision.id, {
        outcomeClass: 'failure',
        success: false,
        qualityScore: 0,
        qualitySignals: {
          retryCount: 20,
          completionRatio: 0,
        },
      });
      const reward = collector.computeReward(badOutcome);

      expect(reward.reward).toBeGreaterThanOrEqual(0);
      expect(reward.reward).toBeLessThanOrEqual(1);
    });
  });

  describe('getStats', () => {
    it('should return empty stats initially', () => {
      const stats = collector.getStats();

      expect(stats.totalDecisions).toBe(0);
      expect(stats.totalOutcomes).toBe(0);
      expect(stats.pendingOutcomes).toBe(0);
      expect(stats.avgQualityScore).toBe(0);
      expect(stats.avgReward).toBe(0);
    });

    it('should track decisions by router type', () => {
      const linucbDecision = createTestDecision({ routerType: 'linucb', traceId: 'trace-1' });
      const preferenceDecision = createTestDecision({
        routerType: 'preference',
        traceId: 'trace-2',
      });

      collector.recordRoutingDecision(linucbDecision);
      collector.recordRoutingDecision(preferenceDecision);

      const stats = collector.getStats();
      expect(stats.decisionsByRouter.linucb).toBe(1);
      expect(stats.decisionsByRouter.preference).toBe(1);
    });

    it('should calculate average quality score', () => {
      const decision1 = createTestDecision({ traceId: 'trace-1' });
      const decision2 = createTestDecision({ traceId: 'trace-2' });

      collector.recordRoutingDecision(decision1);
      collector.recordRoutingDecision(decision2);

      collector.recordOutcome(createTestOutcome(decision1.id, { qualityScore: 0.8 }));
      collector.recordOutcome(createTestOutcome(decision2.id, { qualityScore: 0.6 }));

      const stats = collector.getStats();
      expect(stats.avgQualityScore).toBe(0.7);
    });
  });

  describe('clearExpiredDecisions', () => {
    it('should clear expired pending decisions', () => {
      const shortTimeoutCollector = new OutcomeFeedbackCollector({
        pendingTimeoutMs: 100,
      });

      // Manually create old decision with backdated timestamp
      const oldDecision: RoutingDecision = {
        id: 'old-id',
        query: 'old query',
        routerType: 'linucb',
        selectedModel: 'claude',
        traceId: 'old-trace',
        timestamp: new Date(Date.now() - 1000).toISOString(), // 1 second ago
      };

      // Use a fresh decision that won't be expired
      const newDecision = createTestDecision({ traceId: 'new-trace' });

      shortTimeoutCollector.recordRoutingDecision(oldDecision);
      shortTimeoutCollector.recordRoutingDecision(newDecision);

      const cleared = shortTimeoutCollector.clearExpiredDecisions();

      expect(cleared).toBe(1);
      expect(shortTimeoutCollector.getPendingDecisions()).toHaveLength(1);
    });
  });

  describe('onOutcomeProcessed', () => {
    it('should notify callbacks when outcome is processed', () => {
      const callback = vi.fn();
      collector.onOutcomeProcessed(callback);

      const decision = createTestDecision();
      collector.recordRoutingDecision(decision);

      const outcome = createTestOutcome(decision.id);
      collector.recordOutcome(outcome);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ id: decision.id }),
        expect.objectContaining({ routingDecisionId: decision.id }),
        expect.objectContaining({ reward: expect.any(Number) })
      );
    });

    it('should support unsubscribing from callbacks', () => {
      const callback = vi.fn();
      const unsubscribe = collector.onOutcomeProcessed(callback);

      const decision1 = createTestDecision({ traceId: 'trace-1' });
      collector.recordRoutingDecision(decision1);
      collector.recordOutcome(createTestOutcome(decision1.id));

      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();

      const decision2 = createTestDecision({ traceId: 'trace-2' });
      collector.recordRoutingDecision(decision2);
      collector.recordOutcome(createTestOutcome(decision2.id));

      expect(callback).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    it('should handle callback errors gracefully', () => {
      const errorCallback = vi.fn(() => {
        throw new Error('Callback error');
      });
      const successCallback = vi.fn();

      collector.onOutcomeProcessed(errorCallback);
      collector.onOutcomeProcessed(successCallback);

      const decision = createTestDecision();
      collector.recordRoutingDecision(decision);

      expect(() => {
        collector.recordOutcome(createTestOutcome(decision.id));
      }).not.toThrow();

      expect(successCallback).toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('should clear all state', () => {
      const decision = createTestDecision();
      collector.recordRoutingDecision(decision);
      collector.recordOutcome(createTestOutcome(decision.id));

      collector.reset();

      const stats = collector.getStats();
      expect(stats.totalDecisions).toBe(0);
      expect(stats.totalOutcomes).toBe(0);
      expect(stats.pendingOutcomes).toBe(0);
    });
  });

  describe('createOutcomeFeedbackCollector', () => {
    it('should create collector with default config', () => {
      const c = createOutcomeFeedbackCollector();
      expect(c).toBeInstanceOf(OutcomeFeedbackCollector);
    });

    it('should create collector with custom config', () => {
      const c = createOutcomeFeedbackCollector({
        maxPendingDecisions: 500,
        qualityWeight: 0.8,
      });

      expect(c).toBeInstanceOf(OutcomeFeedbackCollector);
    });
  });
});

describe('createRoutingDecision', () => {
  it('should create decision with generated ID and timestamp', () => {
    const decision = createRoutingDecision({
      query: 'test query',
      routerType: 'preference',
      selectedModel: 'gemini',
      traceId: 'trace-123',
    });

    expect(decision.id).toBeDefined();
    expect(decision.timestamp).toBeDefined();
    expect(decision.query).toBe('test query');
    expect(decision.routerType).toBe('preference');
  });
});

describe('createTaskOutcome', () => {
  it('should create outcome with generated timestamp', () => {
    const outcome = createTaskOutcome({
      routingDecisionId: 'decision-123',
      outcomeClass: 'success',
      success: true,
      qualityScore: 0.9,
      durationMs: 1000,
      tokenUsage: 500,
      traceId: 'trace-123',
      qualitySignals: {
        retryCount: 0,
        completionRatio: 1.0,
      },
    });

    expect(outcome.timestamp).toBeDefined();
    expect(outcome.routingDecisionId).toBe('decision-123');
    expect(outcome.success).toBe(true);
  });
});
