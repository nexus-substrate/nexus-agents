/**
 * Tests for Outcome Storage Helpers
 * @module learning/outcome-storage-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { CliName } from '../cli-adapters/types.js';
import type { RoutingDecisionRow, TaskOutcomeRow, ModelStatsRow } from './outcome-storage-types.js';
import { OutcomeStorageError } from './outcome-storage-types.js';
import {
  rowToDecision,
  rowToOutcome,
  rowToStats,
  INSERT_DECISION_SQL,
  INSERT_OUTCOME_SQL,
  INSERT_REWARD_SQL,
  MODEL_STATS_SQL,
  wrapStorageError,
} from './outcome-storage-helpers.js';

// ============================================================================
// rowToDecision
// ============================================================================

describe('rowToDecision', () => {
  it('converts row to StoredRoutingDecision', () => {
    const row: RoutingDecisionRow = {
      id: 'dec-1',
      trace_id: 'trace-1',
      timestamp: 1700000000000,
      router_type: 'composite',
      selected_model: 'claude',
      alternative_models: '["gemini","codex"]',
      confidence: 0.9,
      reason: 'best fit',
      task_profile: '{"type":"code"}',
      request_id: 'req-1',
    };
    const decision = rowToDecision(row);
    expect(decision.id).toBe('dec-1');
    expect(decision.traceId).toBe('trace-1');
    expect(decision.routerType).toBe('composite');
    expect(decision.selectedModel).toBe('claude');
    expect(decision.alternativeModels).toEqual(['gemini', 'codex']);
    expect(decision.confidence).toBe(0.9);
    expect(decision.taskProfile).toEqual({ type: 'code' });
    expect(decision.requestId).toBe('req-1');
  });

  it('handles null request_id', () => {
    const row: RoutingDecisionRow = {
      id: 'dec-1',
      trace_id: 'trace-1',
      timestamp: 1700000000000,
      router_type: 'composite',
      selected_model: 'claude',
      alternative_models: '[]',
      confidence: 0.8,
      reason: 'test',
      task_profile: '{}',
      request_id: null,
    };
    expect(rowToDecision(row).requestId).toBeUndefined();
  });
});

// ============================================================================
// rowToOutcome
// ============================================================================

describe('rowToOutcome', () => {
  it('converts row to StoredTaskOutcome', () => {
    const row: TaskOutcomeRow = {
      routing_decision_id: 'dec-1',
      timestamp: 1700000000000,
      outcome_class: 'success',
      success: 1,
      quality_score: 0.9,
      duration_ms: 5000,
      token_usage: 1000,
      error_message: null,
    };
    const outcome = rowToOutcome(row);
    expect(outcome.routingDecisionId).toBe('dec-1');
    expect(outcome.success).toBe(true);
    expect(outcome.qualityScore).toBe(0.9);
    expect(outcome.durationMs).toBe(5000);
    expect(outcome.tokenUsage).toBe(1000);
    expect(outcome.errorMessage).toBeUndefined();
  });

  it('converts failure with error message', () => {
    const row: TaskOutcomeRow = {
      routing_decision_id: 'dec-1',
      timestamp: 1700000000000,
      outcome_class: 'failure',
      success: 0,
      quality_score: 0,
      duration_ms: 100,
      token_usage: 50,
      error_message: 'timeout',
    };
    const outcome = rowToOutcome(row);
    expect(outcome.success).toBe(false);
    expect(outcome.errorMessage).toBe('timeout');
  });
});

// ============================================================================
// rowToStats
// ============================================================================

describe('rowToStats', () => {
  it('converts row to StoredModelStats', () => {
    const row: ModelStatsRow = {
      model: 'claude' as CliName,
      total_decisions: 100,
      total_outcomes: 90,
      avg_reward: 0.8,
      avg_quality_score: 0.85,
      avg_latency_ms: 3000,
      success_rate: 0.9,
    };
    const stats = rowToStats(row);
    expect(stats.model).toBe('claude');
    expect(stats.totalDecisions).toBe(100);
    expect(stats.totalOutcomes).toBe(90);
    expect(stats.avgReward).toBe(0.8);
    expect(stats.successRate).toBe(0.9);
  });
});

// ============================================================================
// SQL Constants
// ============================================================================

describe('SQL constants', () => {
  it('INSERT_DECISION_SQL contains table and columns', () => {
    expect(INSERT_DECISION_SQL).toContain('routing_decisions');
    expect(INSERT_DECISION_SQL).toContain('trace_id');
    expect(INSERT_DECISION_SQL).toContain('selected_model');
  });

  it('INSERT_OUTCOME_SQL contains table', () => {
    expect(INSERT_OUTCOME_SQL).toContain('task_outcomes');
    expect(INSERT_OUTCOME_SQL).toContain('quality_score');
  });

  it('INSERT_REWARD_SQL contains table', () => {
    expect(INSERT_REWARD_SQL).toContain('computed_rewards');
    expect(INSERT_REWARD_SQL).toContain('reward');
  });

  it('MODEL_STATS_SQL contains aggregations', () => {
    expect(MODEL_STATS_SQL).toContain('AVG');
    expect(MODEL_STATS_SQL).toContain('COUNT');
    expect(MODEL_STATS_SQL).toContain('GROUP BY');
  });
});

// ============================================================================
// wrapStorageError
// ============================================================================

describe('wrapStorageError', () => {
  it('wraps error with OutcomeStorageError', () => {
    const result = wrapStorageError(new Error('db error'), 'Failed to store');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(OutcomeStorageError);
      expect(result.error.message).toBe('Failed to store');
    }
  });

  it('wraps non-Error with string conversion', () => {
    const result = wrapStorageError('string error', 'Failed');
    expect(result.ok).toBe(false);
  });

  it('includes context when provided', () => {
    const result = wrapStorageError(new Error('err'), 'Failed', { table: 'outcomes' });
    expect(result.ok).toBe(false);
  });
});
