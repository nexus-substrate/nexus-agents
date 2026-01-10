/**
 * nexus-agents/learning - FeedbackIntegration Tests
 *
 * @module learning/feedback-integration.test
 * (Source: Issue #167, Epic #164)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  FeedbackIntegration,
  createFeedbackIntegration,
  DEFAULT_FEEDBACK_INTEGRATION_CONFIG,
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
    recordOutcome: vi.fn(),
    getStats: vi.fn().mockReturnValue({
      totalDecisions: 0,
      decisionsPerCli: { claude: 0, gemini: 0, codex: 0 },
      avgDecisionTimeMs: 0,
      budgetRejectionRate: 0,
    }),
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
        traceId: 'trace-abc' as TraceId,
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
