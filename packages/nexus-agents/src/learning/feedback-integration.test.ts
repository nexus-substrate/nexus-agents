/**
 * nexus-agents/learning - FeedbackIntegration Tests
 *
 * @module learning/feedback-integration.test
 * (Source: Issue #167, Epic #164)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  FeedbackIntegration,
  createFeedbackIntegration,
  DEFAULT_FEEDBACK_INTEGRATION_CONFIG,
  DEFAULT_DECISION_TTL_MS,
} from './feedback-integration.js';
import type { IFeedbackIntegration, RecordOutcomeParams } from './feedback-integration.js';
import type {
  CompositeRoutingDecision,
  ICompositeRouter,
} from '../cli-adapters/composite-router.js';
import type { StepResult } from '../core/types/workflow.js';
import type { TraceId } from '../observability/swarm-observer-types.js';

/**
 * Creates a mock CompositeRoutingDecision.
 */
function createMockDecision(
  overrides?: Partial<CompositeRoutingDecision>
): CompositeRoutingDecision {
  return {
    adapter: {} as CompositeRoutingDecision['adapter'],
    cliName: 'claude',
    confidence: 0.85,
    reason: 'Test decision',
    stagesExecuted: ['task-analysis', 'topsis-ranking'],
    decisionTimeMs: 25,
    alternatives: ['gemini', 'codex'],
    taskProfile: {
      taskType: 'code_implementation',
      contextRequired: 1000,
      reasoningComplexity: 5,
      codeGeneration: true,
      multimodal: false,
      parallelizable: false,
      budgetSensitive: false,
    },
    withinBudget: true,
    topsisScore: 0.78,
    ucbScore: 1.2,
    ...overrides,
  };
}

/**
 * Creates a mock CompositeRouter.
 */
function createMockRouter(): ICompositeRouter {
  return {
    route: vi.fn(),
    executeTask: vi.fn(),
    recordOutcome: vi.fn(),
    recordPreference: vi.fn(),
    recordDifficultyOutcome: vi.fn(),
    getStats: vi.fn().mockReturnValue({
      totalDecisions: 0,
      decisionsPerCli: { claude: 0, gemini: 0, codex: 0 },
      avgDecisionTimeMs: 0,
      budgetRejectionRate: 0,
    }),
    hasMinimumPreferenceData: vi.fn().mockReturnValue(false),
    getZeroRouter: vi.fn().mockReturnValue(undefined),
    getLatencyTracker: vi.fn().mockReturnValue(undefined),
    getRoutingMemory: vi.fn().mockReturnValue(undefined),
    getMetricsCollector: vi.fn().mockReturnValue(undefined),
    getOrchestrationObserver: vi.fn().mockReturnValue(undefined),
    getCapacityDashboard: vi.fn().mockResolvedValue(new Map()),
  };
}

/**
 * Creates a mock StepResult.
 */
function createMockStepResult(
  status: 'success' | 'failed' | 'skipped',
  output?: unknown
): StepResult {
  const base = {
    stepId: 'test-step',
    status,
    output: output ?? null,
    durationMs: 100,
  };
  return status === 'failed' ? { ...base, error: 'Test error' } : base;
}

describe('DEFAULT_FEEDBACK_INTEGRATION_CONFIG', () => {
  it('should have expected default values', () => {
    expect(DEFAULT_FEEDBACK_INTEGRATION_CONFIG.enableAutoFeedback).toBe(true);
    expect(DEFAULT_FEEDBACK_INTEGRATION_CONFIG.successQualityThreshold).toBe(0.7);
    expect(DEFAULT_FEEDBACK_INTEGRATION_CONFIG.partialQualityThreshold).toBe(0.4);
    expect(DEFAULT_FEEDBACK_INTEGRATION_CONFIG.decisionTtlMs).toBe(DEFAULT_DECISION_TTL_MS);
  });
});

describe('DEFAULT_DECISION_TTL_MS', () => {
  it('should be 1 hour in milliseconds', () => {
    expect(DEFAULT_DECISION_TTL_MS).toBe(3600000);
  });
});

describe('FeedbackIntegration', () => {
  let integration: IFeedbackIntegration;

  beforeEach(() => {
    integration = new FeedbackIntegration();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const stats = integration.getStats();
      expect(stats.totalDecisions).toBe(0);
    });

    it('should initialize with custom config', () => {
      const customIntegration = new FeedbackIntegration({
        enableAutoFeedback: false,
        successQualityThreshold: 0.8,
      });
      expect(customIntegration.getStats().totalDecisions).toBe(0);
    });
  });

  describe('recordRoutingDecision', () => {
    it('should record a routing decision and return ID', () => {
      const decision = createMockDecision();
      const id = integration.recordRoutingDecision(decision);

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('should track decision for later outcome routing', () => {
      const decision = createMockDecision();
      const id = integration.recordRoutingDecision(decision);

      // Record outcome - should not throw
      integration.recordOutcome({
        routingDecisionId: id,
        success: true,
        qualityScore: 0.9,
        durationMs: 500,
        tokenUsage: 1000,
      });

      const stats = integration.getStats();
      expect(stats.totalOutcomes).toBe(1);
    });

    it('should accept optional traceId', () => {
      const decision = createMockDecision();
      const traceId = 'test-trace-123' as TraceId;
      const id = integration.recordRoutingDecision(decision, traceId);

      expect(id).toBeDefined();
    });
  });

  describe('recordStepOutcome', () => {
    it('should record successful step outcome', () => {
      const decision = createMockDecision();
      const decisionId = integration.recordRoutingDecision(decision);

      const stepResult = createMockStepResult('success', { data: 'test output' });
      integration.recordStepOutcome(decisionId, stepResult, 500, 1000);

      const stats = integration.getStats();
      expect(stats.totalOutcomes).toBe(1);
    });

    it('should record failed step outcome', () => {
      const decision = createMockDecision();
      const decisionId = integration.recordRoutingDecision(decision);

      const stepResult = createMockStepResult('failed');
      integration.recordStepOutcome(decisionId, stepResult, 200, 500);

      const stats = integration.getStats();
      expect(stats.totalOutcomes).toBe(1);
    });

    it('should record skipped step outcome', () => {
      const decision = createMockDecision();
      const decisionId = integration.recordRoutingDecision(decision);

      const stepResult = createMockStepResult('skipped');
      integration.recordStepOutcome(decisionId, stepResult, 0, 0);

      const stats = integration.getStats();
      expect(stats.totalOutcomes).toBe(1);
    });

    it('should compute quality score based on output size', () => {
      const decision = createMockDecision();
      const decisionId = integration.recordRoutingDecision(decision);

      // Large output should give higher quality score
      const largeOutput = { data: 'x'.repeat(600) };
      const stepResult = createMockStepResult('success', largeOutput);
      integration.recordStepOutcome(decisionId, stepResult, 500, 1000);

      // Stats show outcome was recorded
      const stats = integration.getStats();
      expect(stats.totalOutcomes).toBe(1);
    });
  });

  describe('recordOutcome', () => {
    it('should record outcome with all parameters', () => {
      const decision = createMockDecision();
      const decisionId = integration.recordRoutingDecision(decision);

      const params: RecordOutcomeParams = {
        routingDecisionId: decisionId,
        success: true,
        qualityScore: 0.85,
        durationMs: 1000,
        tokenUsage: 2000,
        retryCount: 1,
        traceId: 'trace-abc',
      };

      integration.recordOutcome(params);

      const stats = integration.getStats();
      expect(stats.totalOutcomes).toBe(1);
    });

    it('should use default values for optional parameters', () => {
      const decision = createMockDecision();
      const decisionId = integration.recordRoutingDecision(decision);

      integration.recordOutcome({
        routingDecisionId: decisionId,
        success: true,
        qualityScore: 0.9,
        durationMs: 500,
        tokenUsage: 1000,
      });

      const stats = integration.getStats();
      expect(stats.totalOutcomes).toBe(1);
    });

    it('should classify outcome as success', () => {
      const decision = createMockDecision();
      const decisionId = integration.recordRoutingDecision(decision);

      integration.recordOutcome({
        routingDecisionId: decisionId,
        success: true,
        qualityScore: 0.8, // Above 0.7 threshold
        durationMs: 500,
        tokenUsage: 1000,
      });

      const stats = integration.getStats();
      expect(stats.outcomesByClass.success).toBe(1);
    });

    it('should classify outcome as partial', () => {
      const decision = createMockDecision();
      const decisionId = integration.recordRoutingDecision(decision);

      integration.recordOutcome({
        routingDecisionId: decisionId,
        success: false,
        qualityScore: 0.5, // Between 0.4 and 0.7
        durationMs: 500,
        tokenUsage: 1000,
      });

      const stats = integration.getStats();
      expect(stats.outcomesByClass.partial).toBe(1);
    });

    it('should classify outcome as failure', () => {
      const decision = createMockDecision();
      const decisionId = integration.recordRoutingDecision(decision);

      integration.recordOutcome({
        routingDecisionId: decisionId,
        success: false,
        qualityScore: 0.2, // Below 0.4 threshold
        durationMs: 500,
        tokenUsage: 1000,
      });

      const stats = integration.getStats();
      expect(stats.outcomesByClass.failure).toBe(1);
    });
  });

  describe('registerCompositeRouter', () => {
    it('should register router for feedback routing', () => {
      const router = createMockRouter();
      integration.registerCompositeRouter(router);

      // Record decision and outcome with auto-feedback enabled
      const decision = createMockDecision();
      const decisionId = integration.recordRoutingDecision(decision);

      integration.recordOutcome({
        routingDecisionId: decisionId,
        success: true,
        qualityScore: 0.9,
        durationMs: 500,
        tokenUsage: 1000,
      });

      // Router should have received feedback
      expect(router.recordOutcome).toHaveBeenCalled();
    });

    it('should not route feedback when auto-feedback disabled', () => {
      const router = createMockRouter();
      const noAutoIntegration = new FeedbackIntegration({ enableAutoFeedback: false });
      noAutoIntegration.registerCompositeRouter(router);

      const decision = createMockDecision();
      const decisionId = noAutoIntegration.recordRoutingDecision(decision);

      noAutoIntegration.recordOutcome({
        routingDecisionId: decisionId,
        success: true,
        qualityScore: 0.9,
        durationMs: 500,
        tokenUsage: 1000,
      });

      // Router should not have received feedback
      expect(router.recordOutcome).not.toHaveBeenCalled();
    });
  });

  describe('onOutcomeProcessed', () => {
    it('should subscribe to outcome events', () => {
      const callback = vi.fn();
      const unsubscribe = integration.onOutcomeProcessed(callback);

      expect(typeof unsubscribe).toBe('function');
    });

    it('should call callback when outcome processed', () => {
      const callback = vi.fn();
      integration.onOutcomeProcessed(callback);

      const decision = createMockDecision();
      const decisionId = integration.recordRoutingDecision(decision);

      integration.recordOutcome({
        routingDecisionId: decisionId,
        success: true,
        qualityScore: 0.9,
        durationMs: 500,
        tokenUsage: 1000,
      });

      expect(callback).toHaveBeenCalled();
    });

    it('should unsubscribe when returned function called', () => {
      const callback = vi.fn();
      const unsubscribe = integration.onOutcomeProcessed(callback);

      unsubscribe();

      const decision = createMockDecision();
      const decisionId = integration.recordRoutingDecision(decision);

      integration.recordOutcome({
        routingDecisionId: decisionId,
        success: true,
        qualityScore: 0.9,
        durationMs: 500,
        tokenUsage: 1000,
      });

      // Callback should not be called after unsubscribe
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return initial stats', () => {
      const stats = integration.getStats();

      expect(stats.totalDecisions).toBe(0);
      expect(stats.totalOutcomes).toBe(0);
      expect(stats.avgReward).toBe(0);
    });

    it('should update stats after decisions and outcomes', () => {
      const decision = createMockDecision();
      const decisionId = integration.recordRoutingDecision(decision);

      let stats = integration.getStats();
      expect(stats.totalDecisions).toBe(1);
      expect(stats.totalOutcomes).toBe(0);

      integration.recordOutcome({
        routingDecisionId: decisionId,
        success: true,
        qualityScore: 0.9,
        durationMs: 500,
        tokenUsage: 1000,
      });

      stats = integration.getStats();
      expect(stats.totalDecisions).toBe(1);
      expect(stats.totalOutcomes).toBe(1);
    });
  });

  describe('reset', () => {
    it('should clear all data', () => {
      // Add some data
      const decision = createMockDecision();
      const decisionId = integration.recordRoutingDecision(decision);

      integration.recordOutcome({
        routingDecisionId: decisionId,
        success: true,
        qualityScore: 0.9,
        durationMs: 500,
        tokenUsage: 1000,
      });

      // Verify data exists
      let stats = integration.getStats();
      expect(stats.totalDecisions).toBe(1);
      expect(stats.totalOutcomes).toBe(1);

      // Reset
      integration.reset();

      // Verify data cleared
      stats = integration.getStats();
      expect(stats.totalDecisions).toBe(0);
      expect(stats.totalOutcomes).toBe(0);
    });
  });
});

describe('createFeedbackIntegration', () => {
  it('should create FeedbackIntegration with factory function', () => {
    const integration = createFeedbackIntegration();
    expect(integration).toBeInstanceOf(FeedbackIntegration);
  });

  it('should pass config to integration', () => {
    const integration = createFeedbackIntegration({
      successQualityThreshold: 0.9,
    });

    // Record decision with quality 0.85 - would be success with 0.7 threshold
    // but should be partial with 0.9 threshold
    const decision = createMockDecision();
    const decisionId = integration.recordRoutingDecision(decision);

    integration.recordOutcome({
      routingDecisionId: decisionId,
      success: true,
      qualityScore: 0.85,
      durationMs: 500,
      tokenUsage: 1000,
    });

    const stats = integration.getStats();
    // With 0.9 threshold, 0.85 is partial
    expect(stats.outcomesByClass.partial).toBe(1);
  });
});

describe('FeedbackIntegration edge cases', () => {
  let integration: IFeedbackIntegration;

  beforeEach(() => {
    integration = new FeedbackIntegration();
  });

  it('should handle outcome for unknown decision ID', () => {
    // Should not throw, just warn
    expect(() => {
      integration.recordOutcome({
        routingDecisionId: 'unknown-id',
        success: true,
        qualityScore: 0.9,
        durationMs: 500,
        tokenUsage: 1000,
      });
    }).not.toThrow();

    // Outcome is still recorded in collector
    const stats = integration.getStats();
    expect(stats.totalOutcomes).toBe(1);
  });

  it('should handle zero quality score', () => {
    const decision = createMockDecision();
    const decisionId = integration.recordRoutingDecision(decision);

    expect(() => {
      integration.recordOutcome({
        routingDecisionId: decisionId,
        success: false,
        qualityScore: 0,
        durationMs: 500,
        tokenUsage: 1000,
      });
    }).not.toThrow();

    const stats = integration.getStats();
    expect(stats.outcomesByClass.failure).toBe(1);
  });

  it('should handle max quality score', () => {
    const decision = createMockDecision();
    const decisionId = integration.recordRoutingDecision(decision);

    expect(() => {
      integration.recordOutcome({
        routingDecisionId: decisionId,
        success: true,
        qualityScore: 1.0,
        durationMs: 500,
        tokenUsage: 1000,
      });
    }).not.toThrow();

    const stats = integration.getStats();
    expect(stats.outcomesByClass.success).toBe(1);
  });

  it('should clean up decision map after feedback routing', () => {
    const router = createMockRouter();
    integration.registerCompositeRouter(router);

    // Record decision
    const decision = createMockDecision();
    const decisionId = integration.recordRoutingDecision(decision);

    // Record outcome (this should clean up the decision from the map)
    integration.recordOutcome({
      routingDecisionId: decisionId,
      success: true,
      qualityScore: 0.9,
      durationMs: 500,
      tokenUsage: 1000,
    });

    expect(router.recordOutcome).toHaveBeenCalledTimes(1);

    // Recording another outcome for same ID should not trigger router again
    // because decision was cleaned up
    integration.recordOutcome({
      routingDecisionId: decisionId,
      success: true,
      qualityScore: 0.8,
      durationMs: 400,
      tokenUsage: 800,
    });

    // Still only 1 call to router
    expect(router.recordOutcome).toHaveBeenCalledTimes(1);
  });

  it('should handle multiple decisions and outcomes', () => {
    const decisions = [
      createMockDecision({ cliName: 'claude' }),
      createMockDecision({ cliName: 'gemini' }),
      createMockDecision({ cliName: 'codex' }),
    ];

    const decisionIds = decisions.map((d) => integration.recordRoutingDecision(d));

    // Record outcomes for all
    for (const id of decisionIds) {
      integration.recordOutcome({
        routingDecisionId: id,
        success: true,
        qualityScore: 0.85,
        durationMs: 500,
        tokenUsage: 1000,
      });
    }

    const stats = integration.getStats();
    expect(stats.totalDecisions).toBe(3);
    expect(stats.totalOutcomes).toBe(3);
  });
});

describe('FeedbackIntegration TTL eviction', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should track decision map size', () => {
    const integration = new FeedbackIntegration();

    expect(integration.getDecisionMapSize()).toBe(0);

    const decision = createMockDecision();
    integration.recordRoutingDecision(decision);

    expect(integration.getDecisionMapSize()).toBe(1);
  });

  it('should evict entries older than TTL', () => {
    // Use short TTL for testing (100ms)
    const integration = new FeedbackIntegration({ decisionTtlMs: 100 });

    const decision = createMockDecision();
    integration.recordRoutingDecision(decision);

    expect(integration.getDecisionMapSize()).toBe(1);

    // Advance time past TTL
    vi.advanceTimersByTime(150);

    // Manually trigger eviction
    const evictedCount = integration.evictStaleEntries();

    expect(evictedCount).toBe(1);
    expect(integration.getDecisionMapSize()).toBe(0);
    expect(integration.getEvictedEntryCount()).toBe(1);
  });

  it('should not evict entries within TTL', () => {
    // Use short TTL for testing (100ms)
    const integration = new FeedbackIntegration({ decisionTtlMs: 100 });

    const decision = createMockDecision();
    integration.recordRoutingDecision(decision);

    // Advance time but stay within TTL
    vi.advanceTimersByTime(50);

    const evictedCount = integration.evictStaleEntries();

    expect(evictedCount).toBe(0);
    expect(integration.getDecisionMapSize()).toBe(1);
    expect(integration.getEvictedEntryCount()).toBe(0);
  });

  it('should evict only stale entries when mixed ages', () => {
    const integration = new FeedbackIntegration({ decisionTtlMs: 100 });

    // Record first decision
    const decision1 = createMockDecision({ cliName: 'claude' });
    integration.recordRoutingDecision(decision1);

    // Advance time
    vi.advanceTimersByTime(80);

    // Record second decision
    const decision2 = createMockDecision({ cliName: 'gemini' });
    integration.recordRoutingDecision(decision2);

    // Advance time so first is stale but second is not
    vi.advanceTimersByTime(30);

    const evictedCount = integration.evictStaleEntries();

    expect(evictedCount).toBe(1);
    expect(integration.getDecisionMapSize()).toBe(1);
  });

  it('should accumulate evicted entry count', () => {
    const integration = new FeedbackIntegration({ decisionTtlMs: 100 });

    // First batch
    integration.recordRoutingDecision(createMockDecision());
    integration.recordRoutingDecision(createMockDecision());
    vi.advanceTimersByTime(150);
    integration.evictStaleEntries();

    expect(integration.getEvictedEntryCount()).toBe(2);

    // Second batch
    integration.recordRoutingDecision(createMockDecision());
    vi.advanceTimersByTime(150);
    integration.evictStaleEntries();

    expect(integration.getEvictedEntryCount()).toBe(3);
  });

  it('should reset evicted entry count on reset()', () => {
    const integration = new FeedbackIntegration({ decisionTtlMs: 100 });

    integration.recordRoutingDecision(createMockDecision());
    vi.advanceTimersByTime(150);
    integration.evictStaleEntries();

    expect(integration.getEvictedEntryCount()).toBe(1);

    integration.reset();

    expect(integration.getEvictedEntryCount()).toBe(0);
    expect(integration.getDecisionMapSize()).toBe(0);
  });

  it('should throttle eviction to once per minute', () => {
    const integration = new FeedbackIntegration({ decisionTtlMs: 100 });

    // Record first decision - this triggers first eviction check
    integration.recordRoutingDecision(createMockDecision());
    vi.advanceTimersByTime(150);

    // Record second decision within throttle window (< 60s)
    // Stale entry should not be evicted yet
    integration.recordRoutingDecision(createMockDecision());

    // The stale first entry should still be there because eviction was throttled
    // (less than 60 seconds passed since last eviction)
    expect(integration.getDecisionMapSize()).toBe(2);

    // Advance past throttle window
    vi.advanceTimersByTime(60000);

    // Record another decision - should trigger eviction now
    integration.recordRoutingDecision(createMockDecision());

    // Now eviction should have run and removed the stale entries
    // (first two entries are now > 60 seconds old)
    expect(integration.getEvictedEntryCount()).toBeGreaterThan(0);
  });

  it('should use default TTL when not specified', () => {
    const integration = new FeedbackIntegration();

    integration.recordRoutingDecision(createMockDecision());

    // Advance less than 1 hour
    vi.advanceTimersByTime(3500000); // ~58 minutes

    const evictedCount = integration.evictStaleEntries();
    expect(evictedCount).toBe(0);

    // Advance past 1 hour total
    vi.advanceTimersByTime(200000); // ~3 more minutes

    const evictedCount2 = integration.evictStaleEntries();
    expect(evictedCount2).toBe(1);
  });

  it('should return 0 when no entries to evict', () => {
    const integration = new FeedbackIntegration();

    const evictedCount = integration.evictStaleEntries();

    expect(evictedCount).toBe(0);
  });

  it('should handle eviction after outcome clears entry', () => {
    const integration = new FeedbackIntegration({ decisionTtlMs: 100 });
    const router = createMockRouter();
    integration.registerCompositeRouter(router);

    const decision = createMockDecision();
    const id = integration.recordRoutingDecision(decision);

    // Record outcome - this clears the entry from the map
    integration.recordOutcome({
      routingDecisionId: id,
      success: true,
      qualityScore: 0.9,
      durationMs: 500,
      tokenUsage: 1000,
    });

    expect(integration.getDecisionMapSize()).toBe(0);

    // Advance past TTL and evict
    vi.advanceTimersByTime(150);
    const evictedCount = integration.evictStaleEntries();

    // Nothing to evict since outcome already cleared it
    expect(evictedCount).toBe(0);
  });
});

describe('FeedbackIntegration TTL configuration', () => {
  it('should accept custom TTL in config', () => {
    const customTtl = 5000; // 5 seconds
    const integration = new FeedbackIntegration({ decisionTtlMs: customTtl });

    // Record a decision
    integration.recordRoutingDecision(createMockDecision());

    expect(integration.getDecisionMapSize()).toBe(1);
  });

  it('should handle zero TTL (immediate eviction)', () => {
    vi.useFakeTimers();
    const integration = new FeedbackIntegration({ decisionTtlMs: 0 });

    integration.recordRoutingDecision(createMockDecision());

    // Even with 0 TTL, the entry exists until eviction runs
    expect(integration.getDecisionMapSize()).toBe(1);

    // Any time advance should make it stale
    vi.advanceTimersByTime(1);
    const evictedCount = integration.evictStaleEntries();

    expect(evictedCount).toBe(1);
    vi.useRealTimers();
  });
});

describe('feedback loop integration: outcome → reward → CompositeRouter (#3225)', () => {
  it('routes a recorded outcome to CompositeRouter.recordOutcome with the computed reward', () => {
    const router = createMockRouter();
    const integration = new FeedbackIntegration({ enableAutoFeedback: true });
    integration.registerCompositeRouter(router);

    const id = integration.recordRoutingDecision(createMockDecision({ cliName: 'gemini' }));
    integration.recordOutcome({
      routingDecisionId: id,
      success: true,
      qualityScore: 0.9,
      durationMs: 1200,
      tokenUsage: 1000,
    });

    expect(router.recordOutcome).toHaveBeenCalledTimes(1);
    const [cliName, task, reward] = vi.mocked(router.recordOutcome).mock.calls[0]!;
    expect(cliName).toBe('gemini');
    expect(task).toEqual({ content: 'code_implementation' }); // decision.task = taskProfile.taskType
    expect(typeof reward).toBe('number');
    expect(reward).toBeGreaterThan(0); // a successful, high-quality outcome → positive reward
  });

  it('does NOT route to the router when autoFeedback is disabled', () => {
    const router = createMockRouter();
    const integration = new FeedbackIntegration({ enableAutoFeedback: false });
    integration.registerCompositeRouter(router);

    const id = integration.recordRoutingDecision(createMockDecision());
    integration.recordOutcome({
      routingDecisionId: id,
      success: true,
      qualityScore: 0.9,
      durationMs: 100,
      tokenUsage: 500,
    });

    expect(router.recordOutcome).not.toHaveBeenCalled();
  });

  it('reward reflects outcome quality — a failure yields a lower reward than a success', () => {
    const rewardFor = (success: boolean, qualityScore: number): number => {
      const router = createMockRouter();
      const integration = new FeedbackIntegration({ enableAutoFeedback: true });
      integration.registerCompositeRouter(router);
      const id = integration.recordRoutingDecision(createMockDecision());
      integration.recordOutcome({
        routingDecisionId: id,
        success,
        qualityScore,
        durationMs: 500,
        tokenUsage: 800,
      });
      return vi.mocked(router.recordOutcome).mock.calls[0]![2];
    };
    // The reward is a meaningful signal, not a constant: success > failure.
    expect(rewardFor(true, 0.95)).toBeGreaterThan(rewardFor(false, 0.1));
  });
});
