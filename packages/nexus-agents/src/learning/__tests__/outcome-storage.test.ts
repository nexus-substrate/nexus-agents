/**
 * Tests for SQLite Outcome Storage.
 * (Source: Issue #188)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SQLiteOutcomeStorage,
  createOutcomeStorage,
  type StoredRoutingDecision,
  type StoredTaskOutcome,
  type StoredReward,
  type ISQLiteDatabase,
  type ISQLiteStatement,
} from '../index.js';

// In-memory mock database for testing
class MockStatement<T> implements ISQLiteStatement<T> {
  private readonly data: Map<string, T>;
  private readonly type: 'insert' | 'select' | 'delete';

  constructor(data: Map<string, T>, type: 'insert' | 'select' | 'delete' = 'select') {
    this.data = data;
    this.type = type;
  }

  run(...params: unknown[]): { changes: number } {
    if (this.type === 'delete') {
      const key = String(params[0]);
      const deleted = this.data.has(key) ? 1 : 0;
      this.data.delete(key);
      return { changes: deleted };
    }
    return { changes: 1 };
  }

  get(...params: unknown[]): T | undefined {
    return this.data.get(String(params[0]));
  }

  all(): T[] {
    return [...this.data.values()];
  }
}

class MockDatabase implements ISQLiteDatabase {
  private readonly decisions: Map<string, unknown> = new Map();
  private readonly outcomes: Map<string, unknown> = new Map();
  private readonly rewards: Map<string, unknown> = new Map();

  exec(): void {
    // No-op for CREATE TABLE statements
  }

  prepare<T>(sql: string): ISQLiteStatement<T> {
    const isCount = sql.includes('COUNT(*)');
    if (isCount) {
      return {
        run: () => ({ changes: 0 }),
        get: () => ({ count: this.decisions.size }) as T,
        all: () => [],
      };
    }

    if (sql.includes('routing_decisions')) {
      return new MockStatement(
        this.decisions,
        sql.includes('INSERT') ? 'insert' : 'select'
      ) as ISQLiteStatement<T>;
    }
    if (sql.includes('task_outcomes')) {
      return new MockStatement(
        this.outcomes,
        sql.includes('INSERT') ? 'insert' : 'select'
      ) as ISQLiteStatement<T>;
    }
    if (sql.includes('computed_rewards')) {
      return new MockStatement(
        this.rewards,
        sql.includes('INSERT') ? 'insert' : 'select'
      ) as ISQLiteStatement<T>;
    }

    return new MockStatement(new Map()) as ISQLiteStatement<T>;
  }

  close(): void {
    this.decisions.clear();
    this.outcomes.clear();
    this.rewards.clear();
  }
}

describe('SQLiteOutcomeStorage', () => {
  let storage: SQLiteOutcomeStorage;
  let mockDb: MockDatabase;

  beforeEach(() => {
    mockDb = new MockDatabase();
    storage = createOutcomeStorage({ dbPath: ':memory:' });
    storage.initializeWithDatabase(mockDb);
  });

  afterEach(() => {
    storage.close();
  });

  describe('constructor', () => {
    it('should create instance with valid config', () => {
      expect(storage).toBeInstanceOf(SQLiteOutcomeStorage);
    });

    it('should throw on invalid config', () => {
      expect(() => createOutcomeStorage({ dbPath: '' })).toThrow('Invalid OutcomeStorageConfig');
    });
  });

  describe('storeDecision', () => {
    it('should store a routing decision', async () => {
      const decision: StoredRoutingDecision = {
        id: 'dec-001',
        traceId: 'trace-001',
        timestamp: new Date().toISOString(),
        routerType: 'linucb',
        selectedModel: 'claude',
        alternativeModels: ['gemini', 'codex'],
        confidence: 0.85,
        reason: 'Best expected reward',
        taskProfile: { taskType: 'code_review' },
        requestId: 'req_abc123',
      };

      const result = await storage.storeDecision(decision);
      expect(result.ok).toBe(true);
    });

    it('should store decision without requestId', async () => {
      const decision: StoredRoutingDecision = {
        id: 'dec-002',
        traceId: 'trace-002',
        timestamp: new Date().toISOString(),
        routerType: 'topsis',
        selectedModel: 'gemini',
        alternativeModels: ['claude'],
        confidence: 0.72,
        reason: 'Best TOPSIS score',
        taskProfile: {},
      };

      const result = await storage.storeDecision(decision);
      expect(result.ok).toBe(true);
    });
  });

  describe('storeOutcome', () => {
    it('should store a task outcome', async () => {
      const outcome: StoredTaskOutcome = {
        routingDecisionId: 'dec-001',
        timestamp: new Date().toISOString(),
        outcomeClass: 'success',
        success: true,
        qualityScore: 0.92,
        durationMs: 1500,
        tokenUsage: 2000,
      };

      const result = await storage.storeOutcome(outcome);
      expect(result.ok).toBe(true);
    });

    it('should store outcome with error message', async () => {
      const outcome: StoredTaskOutcome = {
        routingDecisionId: 'dec-002',
        timestamp: new Date().toISOString(),
        outcomeClass: 'error',
        success: false,
        qualityScore: 0,
        durationMs: 500,
        tokenUsage: 100,
        errorMessage: 'Connection timeout',
      };

      const result = await storage.storeOutcome(outcome);
      expect(result.ok).toBe(true);
    });
  });

  describe('storeReward', () => {
    it('should store a computed reward', async () => {
      const reward: StoredReward = {
        routingDecisionId: 'dec-001',
        timestamp: new Date().toISOString(),
        reward: 0.87,
        baseReward: 1.0,
        qualityBonus: 0.18,
        speedBonus: 0.12,
        efficiencyBonus: 0.08,
        retryPenalty: 0,
      };

      const result = await storage.storeReward(reward);
      expect(result.ok).toBe(true);
    });
  });

  describe('getCounts', () => {
    it('should return record counts', async () => {
      const result = await storage.getCounts();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.decisions).toBeDefined();
        expect(result.value.outcomes).toBeDefined();
        expect(result.value.rewards).toBeDefined();
      }
    });
  });

  describe('close', () => {
    it('should close the database connection', () => {
      expect(() => {
        storage.close();
      }).not.toThrow();
    });

    it('should be idempotent', () => {
      storage.close();
      expect(() => {
        storage.close();
      }).not.toThrow();
    });
  });
});
