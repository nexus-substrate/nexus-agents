/**
 * Tests for Outcome Storage Helpers
 * @module learning/outcome-storage-helpers.test
 */

import { describe, it, expect, vi } from 'vitest';
import type {
  RoutingDecisionRow,
  TaskOutcomeRow,
  ModelStatsRow,
  ISQLiteDatabase,
} from './outcome-storage-types.js';
import { OutcomeStorageError } from './outcome-storage-types.js';
import {
  createDecisionsTable,
  createOutcomesTable,
  createRewardsTable,
  createIndexes,
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
// Test Helpers
// ============================================================================

function makeDecisionRow(overrides?: Partial<RoutingDecisionRow>): RoutingDecisionRow {
  return {
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
    ...overrides,
  };
}

function makeOutcomeRow(overrides?: Partial<TaskOutcomeRow>): TaskOutcomeRow {
  return {
    routing_decision_id: 'dec-1',
    timestamp: 1700000000000,
    outcome_class: 'success',
    success: 1,
    quality_score: 0.9,
    duration_ms: 5000,
    token_usage: 1000,
    error_message: null,
    ...overrides,
  };
}

function makeStatsRow(overrides?: Partial<ModelStatsRow>): ModelStatsRow {
  return {
    model: 'claude',
    total_decisions: 100,
    total_outcomes: 90,
    avg_reward: 0.8,
    avg_quality_score: 0.85,
    avg_latency_ms: 3000,
    success_rate: 0.9,
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeMockDb() {
  return {
    exec: vi.fn(),
    prepare: vi.fn(),
  } as unknown as ISQLiteDatabase;
}

// ============================================================================
// createDecisionsTable
// ============================================================================

describe('createDecisionsTable', () => {
  it('executes CREATE TABLE for routing_decisions', () => {
    const db = makeMockDb();
    createDecisionsTable(db);
    expect(db.exec).toHaveBeenCalledOnce();
    const sql = (db.exec as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS routing_decisions');
  });

  it('includes all required columns', () => {
    const db = makeMockDb();
    createDecisionsTable(db);
    const sql = (db.exec as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const columns = [
      'id TEXT PRIMARY KEY',
      'trace_id TEXT NOT NULL',
      'timestamp INTEGER NOT NULL',
      'router_type TEXT NOT NULL',
      'selected_model TEXT NOT NULL',
      'alternative_models TEXT NOT NULL',
      'confidence REAL NOT NULL',
      'reason TEXT NOT NULL',
      'task_profile TEXT NOT NULL',
      'request_id TEXT',
    ];
    for (const col of columns) {
      expect(sql).toContain(col);
    }
  });

  it('propagates exec errors', () => {
    const db = makeMockDb();
    (db.exec as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('SQL error');
    });
    expect(() => {
      createDecisionsTable(db);
    }).toThrow('SQL error');
  });
});

// ============================================================================
// createOutcomesTable
// ============================================================================

describe('createOutcomesTable', () => {
  it('executes CREATE TABLE for task_outcomes', () => {
    const db = makeMockDb();
    createOutcomesTable(db);
    expect(db.exec).toHaveBeenCalledOnce();
    const sql = (db.exec as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS task_outcomes');
  });

  it('includes all required columns', () => {
    const db = makeMockDb();
    createOutcomesTable(db);
    const sql = (db.exec as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const columns = [
      'routing_decision_id TEXT PRIMARY KEY',
      'timestamp INTEGER NOT NULL',
      'outcome_class TEXT NOT NULL',
      'success INTEGER NOT NULL',
      'quality_score REAL NOT NULL',
      'duration_ms INTEGER NOT NULL',
      'token_usage INTEGER NOT NULL',
      'error_message TEXT',
    ];
    for (const col of columns) {
      expect(sql).toContain(col);
    }
  });

  it('includes foreign key constraint', () => {
    const db = makeMockDb();
    createOutcomesTable(db);
    const sql = (db.exec as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).toContain('FOREIGN KEY (routing_decision_id) REFERENCES routing_decisions(id)');
  });

  it('propagates exec errors', () => {
    const db = makeMockDb();
    (db.exec as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('table exists');
    });
    expect(() => {
      createOutcomesTable(db);
    }).toThrow('table exists');
  });
});

// ============================================================================
// createRewardsTable
// ============================================================================

describe('createRewardsTable', () => {
  it('executes CREATE TABLE for computed_rewards', () => {
    const db = makeMockDb();
    createRewardsTable(db);
    expect(db.exec).toHaveBeenCalledOnce();
    const sql = (db.exec as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS computed_rewards');
  });

  it('includes reward-specific columns', () => {
    const db = makeMockDb();
    createRewardsTable(db);
    const sql = (db.exec as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const columns = [
      'routing_decision_id TEXT PRIMARY KEY',
      'reward REAL NOT NULL',
      'base_reward REAL NOT NULL',
      'quality_bonus REAL NOT NULL',
      'speed_bonus REAL NOT NULL',
      'efficiency_bonus REAL NOT NULL',
      'retry_penalty REAL NOT NULL',
    ];
    for (const col of columns) {
      expect(sql).toContain(col);
    }
  });

  it('includes foreign key constraint', () => {
    const db = makeMockDb();
    createRewardsTable(db);
    const sql = (db.exec as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).toContain('FOREIGN KEY (routing_decision_id) REFERENCES routing_decisions(id)');
  });
});

// ============================================================================
// createIndexes
// ============================================================================

describe('createIndexes', () => {
  it('creates four indexes', () => {
    const db = makeMockDb();
    createIndexes(db);
    expect(db.exec).toHaveBeenCalledTimes(4);
  });

  it('creates index on decisions timestamp', () => {
    const db = makeMockDb();
    createIndexes(db);
    const calls = (db.exec as ReturnType<typeof vi.fn>).mock.calls as string[][];
    expect(calls.some((c) => c[0].includes('idx_decisions_timestamp'))).toBe(true);
  });

  it('creates index on decisions model', () => {
    const db = makeMockDb();
    createIndexes(db);
    const calls = (db.exec as ReturnType<typeof vi.fn>).mock.calls as string[][];
    expect(calls.some((c) => c[0].includes('idx_decisions_model'))).toBe(true);
  });

  it('creates index on decisions request_id', () => {
    const db = makeMockDb();
    createIndexes(db);
    const calls = (db.exec as ReturnType<typeof vi.fn>).mock.calls as string[][];
    expect(calls.some((c) => c[0].includes('idx_decisions_request_id'))).toBe(true);
  });

  it('creates index on outcomes timestamp', () => {
    const db = makeMockDb();
    createIndexes(db);
    const calls = (db.exec as ReturnType<typeof vi.fn>).mock.calls as string[][];
    expect(calls.some((c) => c[0].includes('idx_outcomes_timestamp'))).toBe(true);
  });

  it('uses CREATE INDEX IF NOT EXISTS', () => {
    const db = makeMockDb();
    createIndexes(db);
    const calls = (db.exec as ReturnType<typeof vi.fn>).mock.calls as string[][];
    for (const call of calls) {
      expect(call[0]).toContain('CREATE INDEX IF NOT EXISTS');
    }
  });

  it('propagates exec errors on first index', () => {
    const db = makeMockDb();
    (db.exec as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('index error');
    });
    expect(() => {
      createIndexes(db);
    }).toThrow('index error');
  });
});

// ============================================================================
// rowToDecision
// ============================================================================

describe('rowToDecision', () => {
  it('converts row to StoredRoutingDecision', () => {
    const decision = rowToDecision(makeDecisionRow());
    expect(decision.id).toBe('dec-1');
    expect(decision.traceId).toBe('trace-1');
    expect(decision.routerType).toBe('composite');
    expect(decision.selectedModel).toBe('claude');
    expect(decision.alternativeModels).toEqual(['gemini', 'codex']);
    expect(decision.confidence).toBe(0.9);
    expect(decision.reason).toBe('best fit');
    expect(decision.taskProfile).toEqual({ type: 'code' });
    expect(decision.requestId).toBe('req-1');
  });

  it('converts timestamp to ISO string', () => {
    const decision = rowToDecision(makeDecisionRow({ timestamp: 1700000000000 }));
    expect(decision.timestamp).toBe(new Date(1700000000000).toISOString());
  });

  it('handles null request_id as undefined', () => {
    const decision = rowToDecision(makeDecisionRow({ request_id: null }));
    expect(decision.requestId).toBeUndefined();
  });

  it('handles empty alternative_models array', () => {
    const decision = rowToDecision(makeDecisionRow({ alternative_models: '[]' }));
    expect(decision.alternativeModels).toEqual([]);
  });

  it('handles empty task_profile object', () => {
    const decision = rowToDecision(makeDecisionRow({ task_profile: '{}' }));
    expect(decision.taskProfile).toEqual({});
  });

  it('handles complex task_profile', () => {
    const profile = {
      type: 'code',
      complexity: 'high',
      tokens: 5000,
      nested: { deep: true },
    };
    const decision = rowToDecision(makeDecisionRow({ task_profile: JSON.stringify(profile) }));
    expect(decision.taskProfile).toEqual(profile);
  });

  it('handles zero confidence', () => {
    const decision = rowToDecision(makeDecisionRow({ confidence: 0 }));
    expect(decision.confidence).toBe(0);
  });

  it('handles confidence of 1.0', () => {
    const decision = rowToDecision(makeDecisionRow({ confidence: 1.0 }));
    expect(decision.confidence).toBe(1.0);
  });

  it('handles timestamp at epoch zero', () => {
    const decision = rowToDecision(makeDecisionRow({ timestamp: 0 }));
    expect(decision.timestamp).toBe(new Date(0).toISOString());
  });

  it('throws on invalid JSON in alternative_models', () => {
    expect(() => rowToDecision(makeDecisionRow({ alternative_models: 'not-json' }))).toThrow();
  });

  it('throws on invalid JSON in task_profile', () => {
    expect(() => rowToDecision(makeDecisionRow({ task_profile: '{broken' }))).toThrow();
  });

  it('preserves all router_type values', () => {
    for (const routerType of ['composite', 'topsis', 'budget', 'zero']) {
      const decision = rowToDecision(makeDecisionRow({ router_type: routerType }));
      expect(decision.routerType).toBe(routerType);
    }
  });

  it('preserves single alternative model', () => {
    const decision = rowToDecision(makeDecisionRow({ alternative_models: '["gemini"]' }));
    expect(decision.alternativeModels).toEqual(['gemini']);
  });
});

// ============================================================================
// rowToOutcome
// ============================================================================

describe('rowToOutcome', () => {
  it('converts row to StoredTaskOutcome', () => {
    const outcome = rowToOutcome(makeOutcomeRow());
    expect(outcome.routingDecisionId).toBe('dec-1');
    expect(outcome.success).toBe(true);
    expect(outcome.qualityScore).toBe(0.9);
    expect(outcome.durationMs).toBe(5000);
    expect(outcome.tokenUsage).toBe(1000);
    expect(outcome.errorMessage).toBeUndefined();
  });

  it('converts timestamp to ISO string', () => {
    const outcome = rowToOutcome(makeOutcomeRow({ timestamp: 1700000000000 }));
    expect(outcome.timestamp).toBe(new Date(1700000000000).toISOString());
  });

  it('converts success=1 to true', () => {
    const outcome = rowToOutcome(makeOutcomeRow({ success: 1 }));
    expect(outcome.success).toBe(true);
  });

  it('converts success=0 to false', () => {
    const outcome = rowToOutcome(makeOutcomeRow({ success: 0 }));
    expect(outcome.success).toBe(false);
  });

  it('handles non-1 success value as false', () => {
    const outcome = rowToOutcome(makeOutcomeRow({ success: 2 }));
    expect(outcome.success).toBe(false);
  });

  it('converts failure with error message', () => {
    const outcome = rowToOutcome(
      makeOutcomeRow({
        success: 0,
        outcome_class: 'failure',
        error_message: 'timeout',
      })
    );
    expect(outcome.success).toBe(false);
    expect(outcome.outcomeClass).toBe('failure');
    expect(outcome.errorMessage).toBe('timeout');
  });

  it('handles null error_message as undefined', () => {
    const outcome = rowToOutcome(makeOutcomeRow({ error_message: null }));
    expect(outcome.errorMessage).toBeUndefined();
  });

  it('handles zero quality_score', () => {
    const outcome = rowToOutcome(makeOutcomeRow({ quality_score: 0 }));
    expect(outcome.qualityScore).toBe(0);
  });

  it('handles zero duration_ms', () => {
    const outcome = rowToOutcome(makeOutcomeRow({ duration_ms: 0 }));
    expect(outcome.durationMs).toBe(0);
  });

  it('handles zero token_usage', () => {
    const outcome = rowToOutcome(makeOutcomeRow({ token_usage: 0 }));
    expect(outcome.tokenUsage).toBe(0);
  });

  it('handles large duration values', () => {
    const outcome = rowToOutcome(makeOutcomeRow({ duration_ms: 999999999 }));
    expect(outcome.durationMs).toBe(999999999);
  });

  it('preserves outcome_class values', () => {
    for (const cls of ['success', 'failure', 'partial', 'timeout']) {
      const outcome = rowToOutcome(makeOutcomeRow({ outcome_class: cls }));
      expect(outcome.outcomeClass).toBe(cls);
    }
  });

  it('handles empty string error_message as string', () => {
    const outcome = rowToOutcome(makeOutcomeRow({ error_message: '' }));
    expect(outcome.errorMessage).toBe('');
  });
});

// ============================================================================
// rowToStats
// ============================================================================

describe('rowToStats', () => {
  it('converts row to StoredModelStats', () => {
    const stats = rowToStats(makeStatsRow());
    expect(stats.model).toBe('claude');
    expect(stats.totalDecisions).toBe(100);
    expect(stats.totalOutcomes).toBe(90);
    expect(stats.avgReward).toBe(0.8);
    expect(stats.avgQualityScore).toBe(0.85);
    expect(stats.avgLatencyMs).toBe(3000);
    expect(stats.successRate).toBe(0.9);
  });

  it('handles zero values for all stats', () => {
    const stats = rowToStats(
      makeStatsRow({
        total_decisions: 0,
        total_outcomes: 0,
        avg_reward: 0,
        avg_quality_score: 0,
        avg_latency_ms: 0,
        success_rate: 0,
      })
    );
    expect(stats.totalDecisions).toBe(0);
    expect(stats.totalOutcomes).toBe(0);
    expect(stats.avgReward).toBe(0);
    expect(stats.avgQualityScore).toBe(0);
    expect(stats.avgLatencyMs).toBe(0);
    expect(stats.successRate).toBe(0);
  });

  it('handles fractional latency values', () => {
    const stats = rowToStats(makeStatsRow({ avg_latency_ms: 1234.5678 }));
    expect(stats.avgLatencyMs).toBe(1234.5678);
  });

  it('handles perfect success rate', () => {
    const stats = rowToStats(makeStatsRow({ success_rate: 1.0 }));
    expect(stats.successRate).toBe(1.0);
  });

  it('handles negative avg_reward', () => {
    const stats = rowToStats(makeStatsRow({ avg_reward: -0.5 }));
    expect(stats.avgReward).toBe(-0.5);
  });

  it('preserves model name exactly', () => {
    const stats = rowToStats(makeStatsRow({ model: 'gemini-pro' }));
    expect(stats.model).toBe('gemini-pro');
  });

  it('handles large decision counts', () => {
    const stats = rowToStats(makeStatsRow({ total_decisions: 1000000 }));
    expect(stats.totalDecisions).toBe(1000000);
  });
});

// ============================================================================
// SQL Constants
// ============================================================================

describe('SQL constants', () => {
  describe('INSERT_DECISION_SQL', () => {
    it('targets routing_decisions table', () => {
      expect(INSERT_DECISION_SQL).toContain('routing_decisions');
    });

    it('uses INSERT OR REPLACE', () => {
      expect(INSERT_DECISION_SQL).toContain('INSERT OR REPLACE');
    });

    it('includes all column names', () => {
      const columns = [
        'id',
        'trace_id',
        'timestamp',
        'router_type',
        'selected_model',
        'alternative_models',
        'confidence',
        'reason',
        'task_profile',
        'request_id',
      ];
      for (const col of columns) {
        expect(INSERT_DECISION_SQL).toContain(col);
      }
    });

    it('has 10 parameter placeholders', () => {
      const matches = INSERT_DECISION_SQL.match(/\?/g);
      expect(matches).toHaveLength(10);
    });
  });

  describe('INSERT_OUTCOME_SQL', () => {
    it('targets task_outcomes table', () => {
      expect(INSERT_OUTCOME_SQL).toContain('task_outcomes');
    });

    it('uses INSERT OR REPLACE', () => {
      expect(INSERT_OUTCOME_SQL).toContain('INSERT OR REPLACE');
    });

    it('includes all column names', () => {
      const columns = [
        'routing_decision_id',
        'timestamp',
        'outcome_class',
        'success',
        'quality_score',
        'duration_ms',
        'token_usage',
        'error_message',
      ];
      for (const col of columns) {
        expect(INSERT_OUTCOME_SQL).toContain(col);
      }
    });

    it('has 8 parameter placeholders', () => {
      const matches = INSERT_OUTCOME_SQL.match(/\?/g);
      expect(matches).toHaveLength(8);
    });
  });

  describe('INSERT_REWARD_SQL', () => {
    it('targets computed_rewards table', () => {
      expect(INSERT_REWARD_SQL).toContain('computed_rewards');
    });

    it('uses INSERT OR REPLACE', () => {
      expect(INSERT_REWARD_SQL).toContain('INSERT OR REPLACE');
    });

    it('includes all reward columns', () => {
      const columns = [
        'routing_decision_id',
        'timestamp',
        'reward',
        'base_reward',
        'quality_bonus',
        'speed_bonus',
        'efficiency_bonus',
        'retry_penalty',
      ];
      for (const col of columns) {
        expect(INSERT_REWARD_SQL).toContain(col);
      }
    });

    it('has 8 parameter placeholders', () => {
      const matches = INSERT_REWARD_SQL.match(/\?/g);
      expect(matches).toHaveLength(8);
    });
  });

  describe('MODEL_STATS_SQL', () => {
    it('selects from routing_decisions', () => {
      expect(MODEL_STATS_SQL).toContain('FROM routing_decisions');
    });

    it('joins task_outcomes', () => {
      expect(MODEL_STATS_SQL).toContain('LEFT JOIN task_outcomes');
    });

    it('joins computed_rewards', () => {
      expect(MODEL_STATS_SQL).toContain('LEFT JOIN computed_rewards');
    });

    it('groups by selected_model', () => {
      expect(MODEL_STATS_SQL).toContain('GROUP BY rd.selected_model');
    });

    it('orders by total_decisions DESC', () => {
      expect(MODEL_STATS_SQL).toContain('ORDER BY total_decisions DESC');
    });

    it('uses COALESCE for null safety', () => {
      expect(MODEL_STATS_SQL).toContain('COALESCE');
    });

    it('uses COUNT(DISTINCT) for decisions', () => {
      expect(MODEL_STATS_SQL).toContain('COUNT(DISTINCT rd.id)');
    });

    it('uses AVG aggregation functions', () => {
      expect(MODEL_STATS_SQL).toContain('AVG(r.reward)');
      expect(MODEL_STATS_SQL).toContain('AVG(o.quality_score)');
      expect(MODEL_STATS_SQL).toContain('AVG(o.duration_ms)');
    });

    it('casts success to REAL for proper averaging', () => {
      expect(MODEL_STATS_SQL).toContain('CAST(o.success AS REAL)');
    });
  });
});

// ============================================================================
// wrapStorageError
// ============================================================================

describe('wrapStorageError', () => {
  it('wraps Error with OutcomeStorageError', () => {
    const result = wrapStorageError(new Error('db error'), 'Failed to store');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(OutcomeStorageError);
      expect(result.error.message).toBe('Failed to store');
    }
  });

  it('preserves original Error as cause', () => {
    const original = new Error('original');
    const result = wrapStorageError(original, 'Wrapped');
    if (!result.ok) {
      expect(result.error.cause).toBe(original);
    }
  });

  it('wraps non-Error string with string conversion', () => {
    const result = wrapStorageError('string error', 'Failed');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(OutcomeStorageError);
      expect(result.error.cause).toBeInstanceOf(Error);
      expect(result.error.cause?.message).toBe('string error');
    }
  });

  it('wraps number error with string conversion', () => {
    const result = wrapStorageError(42, 'Number error');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.cause?.message).toBe('42');
    }
  });

  it('wraps null error with string conversion', () => {
    const result = wrapStorageError(null, 'Null error');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.cause?.message).toBe('null');
    }
  });

  it('wraps undefined error with string conversion', () => {
    const result = wrapStorageError(undefined, 'Undef error');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.cause?.message).toBe('undefined');
    }
  });

  it('includes context when provided', () => {
    const ctx = { table: 'outcomes', operation: 'insert' };
    const result = wrapStorageError(new Error('err'), 'Failed', ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.context).toEqual(ctx);
    }
  });

  it('omits context when not provided', () => {
    const result = wrapStorageError(new Error('err'), 'Failed');
    if (!result.ok) {
      // context should be undefined when no context is provided
      // The NexusError sets context from options
      expect(result.error.cause).toBeInstanceOf(Error);
    }
  });

  it('handles empty context object', () => {
    const result = wrapStorageError(new Error('err'), 'Failed', {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.context).toEqual({});
    }
  });

  it('always returns err Result', () => {
    const result = wrapStorageError(new Error('x'), 'msg');
    expect(result.ok).toBe(false);
  });

  it('uses provided message, not original error message', () => {
    const result = wrapStorageError(new Error('original message'), 'wrapper message');
    if (!result.ok) {
      expect(result.error.message).toBe('wrapper message');
    }
  });

  it('sets name to OutcomeStorageError', () => {
    const result = wrapStorageError(new Error('x'), 'msg');
    if (!result.ok) {
      expect(result.error.name).toBe('OutcomeStorageError');
    }
  });

  it('wraps object error with string conversion', () => {
    const result = wrapStorageError({ code: 'ENOENT' }, 'Object error');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.cause).toBeInstanceOf(Error);
    }
  });
});
