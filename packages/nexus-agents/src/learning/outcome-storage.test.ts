/**
 * Tests for SQLiteOutcomeStorage and createOutcomeStorage
 * @module learning/outcome-storage.test
 */

import { describe, it, expect, vi } from 'vitest';
import type {
  ISQLiteDatabase,
  StoredRoutingDecision,
  StoredTaskOutcome,
  StoredReward,
  RoutingDecisionRow,
  TaskOutcomeRow,
  ModelStatsRow,
} from './outcome-storage-types.js';
import { OutcomeStorageError } from './outcome-storage-types.js';
import {
  SQLiteOutcomeStorage,
  createOutcomeStorage,
  sanitizeErrorMessage,
} from './outcome-storage.js';

describe('sanitizeErrorMessage — secret redaction (security hardening)', () => {
  it('redacts the original sk- and keyword=value forms', () => {
    expect(sanitizeErrorMessage('failed with sk-abcdefghijklmnopqrstuvwxyz123')).toContain(
      '[REDACTED]'
    );
    expect(sanitizeErrorMessage('api_key=supersecretvalue123')).toContain('[REDACTED]');
  });

  it('redacts GitHub PATs, AWS keys, and space-separated Bearer tokens (newly covered)', () => {
    expect(sanitizeErrorMessage('token ghp_0123456789abcdefghijklmnopqrstuvwx')).toContain(
      '[REDACTED]'
    );
    expect(sanitizeErrorMessage('github_pat_11ABCDEFG0abcdefghij_KLMNOP')).toContain('[REDACTED]');
    expect(sanitizeErrorMessage('AWS key AKIAIOSFODNN7EXAMPLE denied')).toContain('[REDACTED]');
    expect(sanitizeErrorMessage('Authorization: Bearer eyJhbGciOi.JIUzI1.NiIs')).toContain(
      '[REDACTED]'
    );
  });

  it('leaves benign messages untouched', () => {
    expect(sanitizeErrorMessage('connection timed out after 30s')).toBe(
      'connection timed out after 30s'
    );
    expect(sanitizeErrorMessage(undefined)).toBeUndefined();
  });
});

// ============================================================================
// Mocks
// ============================================================================

vi.mock('../core/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ============================================================================
// Test Factories
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createMockStatement(overrides: Record<string, unknown> = {}) {
  return {
    run: vi.fn(() => ({ changes: 0, lastInsertRowid: 0 })),
    get: vi.fn(() => undefined),
    all: vi.fn(() => []),
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createMockDatabase(overrides: Partial<ISQLiteDatabase> = {}) {
  const db: ISQLiteDatabase = {
    exec: vi.fn(),
    prepare: vi.fn(() => createMockStatement()),
    close: vi.fn(),
    ...overrides,
  };
  return db;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createStorage(dbPath = '/tmp/test.db') {
  return new SQLiteOutcomeStorage({ dbPath });
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createInitializedStorage(db?: ISQLiteDatabase) {
  const storage = createStorage();
  const mockDb = db ?? createMockDatabase();
  storage.initializeWithDatabase(mockDb);
  return { storage, mockDb };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeDecision(overrides: Partial<StoredRoutingDecision> = {}) {
  return {
    id: 'dec-1',
    traceId: 'trace-1',
    timestamp: '2024-01-15T10:00:00.000Z',
    routerType: 'linucb' as const,
    selectedModel: 'claude' as const,
    alternativeModels: ['gemini' as const],
    confidence: 0.85,
    reason: 'Best match',
    taskProfile: { complexity: 'high' },
    requestId: 'req-1',
    ...overrides,
  } satisfies StoredRoutingDecision;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeOutcome(overrides: Partial<StoredTaskOutcome> = {}) {
  return {
    routingDecisionId: 'dec-1',
    timestamp: '2024-01-15T10:01:00.000Z',
    outcomeClass: 'success' as const,
    success: true,
    qualityScore: 0.9,
    durationMs: 3000,
    tokenUsage: 500,
    ...overrides,
  } satisfies StoredTaskOutcome;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeReward(overrides: Partial<StoredReward> = {}) {
  return {
    routingDecisionId: 'dec-1',
    timestamp: '2024-01-15T10:02:00.000Z',
    reward: 0.82,
    baseReward: 0.7,
    qualityBonus: 0.1,
    speedBonus: 0.05,
    efficiencyBonus: 0.02,
    retryPenalty: 0.05,
    ...overrides,
  } satisfies StoredReward;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeDecisionRow(overrides: Partial<RoutingDecisionRow> = {}) {
  return {
    id: 'dec-1',
    trace_id: 'trace-1',
    timestamp: 1705312800000,
    router_type: 'linucb',
    selected_model: 'claude',
    alternative_models: '["gemini"]',
    confidence: 0.85,
    reason: 'Best match',
    task_profile: '{"complexity":"high"}',
    request_id: 'req-1',
    ...overrides,
  } satisfies RoutingDecisionRow;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeOutcomeRow(overrides: Partial<TaskOutcomeRow> = {}) {
  return {
    routing_decision_id: 'dec-1',
    timestamp: 1705312860000,
    outcome_class: 'success',
    success: 1,
    quality_score: 0.9,
    duration_ms: 3000,
    token_usage: 500,
    error_message: null,
    ...overrides,
  } satisfies TaskOutcomeRow;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeStatsRow(overrides: Partial<ModelStatsRow> = {}) {
  return {
    model: 'claude',
    total_decisions: 10,
    total_outcomes: 8,
    avg_reward: 0.75,
    avg_quality_score: 0.88,
    avg_latency_ms: 2500,
    success_rate: 0.9,
    ...overrides,
  } satisfies ModelStatsRow;
}

// ============================================================================
// Constructor Tests
// ============================================================================

describe('SQLiteOutcomeStorage', () => {
  describe('constructor', () => {
    it('should create instance with valid config', () => {
      const storage = createStorage('/tmp/valid.db');
      expect(storage).toBeInstanceOf(SQLiteOutcomeStorage);
    });

    it('should throw ValidationError for empty dbPath', () => {
      expect(() => new SQLiteOutcomeStorage({ dbPath: '' })).toThrow(
        'Invalid OutcomeStorageConfig'
      );
    });

    it('should accept optional logger in config', () => {
      const logger = {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };
      const storage = new SQLiteOutcomeStorage({
        dbPath: '/tmp/test.db',
        logger: logger as never,
      });
      expect(storage).toBeInstanceOf(SQLiteOutcomeStorage);
    });

    it('should throw ValidationError for negative maxRecords', () => {
      expect(() => new SQLiteOutcomeStorage({ dbPath: '/tmp/test.db', maxRecords: -1 })).toThrow(
        'Invalid OutcomeStorageConfig'
      );
    });

    it('should throw ValidationError for zero autoPruneInterval', () => {
      expect(
        () => new SQLiteOutcomeStorage({ dbPath: '/tmp/test.db', autoPruneInterval: 0 })
      ).toThrow('Invalid OutcomeStorageConfig');
    });
  });

  // ============================================================================
  // Initialization Tests
  // ============================================================================

  describe('initializeWithDatabase', () => {
    it('should set up database and create tables', () => {
      const mockDb = createMockDatabase();
      const storage = createStorage();
      storage.initializeWithDatabase(mockDb);
      // exec is called for table creation + indexes
      expect(mockDb.exec).toHaveBeenCalled();
    });

    it('should mark storage as initialized', () => {
      const { storage } = createInitializedStorage();
      // Verify no error when calling a method that requires initialization
      const result = storage.getCounts();
      expect(result).toBeDefined();
    });
  });

  describe('initialize (async)', () => {
    it('should return ok if already initialized', async () => {
      const { storage } = createInitializedStorage();
      const result = await storage.initialize();
      expect(result.ok).toBe(true);
    });

    it('should return error if better-sqlite3 is not available', async () => {
      const storage = createStorage();
      // The dynamic import will fail since better-sqlite3 may not be installed
      const result = await storage.initialize();
      // Either succeeds (if installed) or returns an error result
      expect(result).toBeDefined();
      expect(typeof result.ok).toBe('boolean');
    });
  });

  // ============================================================================
  // Store Decision Tests
  // ============================================================================

  describe('storeDecision', () => {
    it('should store a routing decision successfully', async () => {
      const stmt = createMockStatement();
      const mockDb = createMockDatabase({
        prepare: vi.fn(() => stmt),
      });
      const { storage } = createInitializedStorage(mockDb);

      const result = await storage.storeDecision(makeDecision());

      expect(result.ok).toBe(true);
      expect(stmt.run).toHaveBeenCalledWith(
        'dec-1',
        'trace-1',
        expect.any(Number),
        'linucb',
        'claude',
        '["gemini"]',
        0.85,
        'Best match',
        '{"complexity":"high"}',
        'req-1'
      );
    });

    it('should store decision with null requestId when undefined', async () => {
      const stmt = createMockStatement();
      const mockDb = createMockDatabase({
        prepare: vi.fn(() => stmt),
      });
      const { storage } = createInitializedStorage(mockDb);
      const decision = makeDecision({ requestId: undefined });

      await storage.storeDecision(decision);

      const runArgs = (stmt.run as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(runArgs?.[9]).toBeNull();
    });

    it('should return error result when database throws', async () => {
      const mockDb = createMockDatabase({
        prepare: vi.fn(() => {
          throw new Error('DB write failed');
        }),
      });
      const { storage } = createInitializedStorage(mockDb);

      const result = await storage.storeDecision(makeDecision());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(OutcomeStorageError);
        expect(result.error.message).toContain('Failed to store routing decision');
      }
    });

    it('should return error result when storage not initialized', async () => {
      const storage = createStorage();
      const result = await storage.storeDecision(makeDecision());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(OutcomeStorageError);
        expect(result.error.message).toContain('Failed to store routing decision');
      }
    });
  });

  // ============================================================================
  // Store Outcome Tests
  // ============================================================================

  describe('storeOutcome', () => {
    it('should store a task outcome successfully', async () => {
      const stmt = createMockStatement();
      const mockDb = createMockDatabase({
        prepare: vi.fn(() => stmt),
      });
      const { storage } = createInitializedStorage(mockDb);

      const result = await storage.storeOutcome(makeOutcome());

      expect(result.ok).toBe(true);
      expect(stmt.run).toHaveBeenCalledWith(
        'dec-1',
        expect.any(Number),
        'success',
        1,
        0.9,
        3000,
        500,
        null
      );
    });

    it('should store outcome with error message', async () => {
      const stmt = createMockStatement();
      const mockDb = createMockDatabase({
        prepare: vi.fn(() => stmt),
      });
      const { storage } = createInitializedStorage(mockDb);
      const outcome = makeOutcome({
        success: false,
        outcomeClass: 'error' as const,
        errorMessage: 'Model timeout',
      });

      await storage.storeOutcome(outcome);

      const runArgs = (stmt.run as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(runArgs?.[3]).toBe(0); // success = false -> 0
      expect(runArgs?.[7]).toBe('Model timeout');
    });

    it('should return error result when database throws', async () => {
      const mockDb = createMockDatabase({
        prepare: vi.fn(() => {
          throw new Error('DB write failed');
        }),
      });
      const { storage } = createInitializedStorage(mockDb);

      const result = await storage.storeOutcome(makeOutcome());

      expect(result.ok).toBe(false);
    });
  });

  // ============================================================================
  // Store Reward Tests
  // ============================================================================

  describe('storeReward', () => {
    it('should store a reward successfully', async () => {
      const stmt = createMockStatement();
      const mockDb = createMockDatabase({
        prepare: vi.fn(() => stmt),
      });
      const { storage } = createInitializedStorage(mockDb);

      const result = await storage.storeReward(makeReward());

      expect(result.ok).toBe(true);
      expect(stmt.run).toHaveBeenCalledWith(
        'dec-1',
        expect.any(Number),
        0.82,
        0.7,
        0.1,
        0.05,
        0.02,
        0.05
      );
    });

    it('should return error result when database throws', async () => {
      const mockDb = createMockDatabase({
        prepare: vi.fn(() => {
          throw new Error('DB write failed');
        }),
      });
      const { storage } = createInitializedStorage(mockDb);

      const result = await storage.storeReward(makeReward());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Failed to store computed reward');
      }
    });
  });

  // ============================================================================
  // Get Decision Tests
  // ============================================================================

  describe('getDecision', () => {
    it('should return null when decision not found', async () => {
      const { storage } = createInitializedStorage();

      const result = await storage.getDecision('nonexistent');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it('should return decision when found', async () => {
      const row = makeDecisionRow();
      const stmt = createMockStatement({ get: vi.fn(() => row) });
      const mockDb = createMockDatabase({
        prepare: vi.fn(() => stmt),
      });
      const { storage } = createInitializedStorage(mockDb);

      const result = await storage.getDecision('dec-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).not.toBeNull();
        expect(result.value?.id).toBe('dec-1');
        expect(result.value?.selectedModel).toBe('claude');
      }
    });

    it('should return error result when database throws', async () => {
      const mockDb = createMockDatabase({
        prepare: vi.fn(() => {
          throw new Error('Query failed');
        }),
      });
      const { storage } = createInitializedStorage(mockDb);

      const result = await storage.getDecision('dec-1');

      expect(result.ok).toBe(false);
    });
  });

  // ============================================================================
  // Get Outcome Tests
  // ============================================================================

  describe('getOutcome', () => {
    it('should return null when outcome not found', async () => {
      const { storage } = createInitializedStorage();

      const result = await storage.getOutcome('nonexistent');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it('should return outcome when found', async () => {
      const row = makeOutcomeRow();
      const stmt = createMockStatement({ get: vi.fn(() => row) });
      const mockDb = createMockDatabase({
        prepare: vi.fn(() => stmt),
      });
      const { storage } = createInitializedStorage(mockDb);

      const result = await storage.getOutcome('dec-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).not.toBeNull();
        expect(result.value?.routingDecisionId).toBe('dec-1');
        expect(result.value?.success).toBe(true);
      }
    });

    it('should return error when database throws', async () => {
      const mockDb = createMockDatabase({
        prepare: vi.fn(() => {
          throw new Error('Query failed');
        }),
      });
      const { storage } = createInitializedStorage(mockDb);

      const result = await storage.getOutcome('dec-1');

      expect(result.ok).toBe(false);
    });
  });

  // ============================================================================
  // Get Model Stats Tests
  // ============================================================================

  describe('getModelStats', () => {
    it('should return empty array when no stats', async () => {
      const { storage } = createInitializedStorage();

      const result = await storage.getModelStats();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    it('should return mapped model stats', async () => {
      const rows = [makeStatsRow(), makeStatsRow({ model: 'gemini' })];
      const stmt = createMockStatement({ all: vi.fn(() => rows) });
      const mockDb = createMockDatabase({
        prepare: vi.fn(() => stmt),
      });
      const { storage } = createInitializedStorage(mockDb);

      const result = await storage.getModelStats();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0]?.model).toBe('claude');
        expect(result.value[1]?.model).toBe('gemini');
      }
    });

    it('should return error when database throws', async () => {
      const mockDb = createMockDatabase({
        prepare: vi.fn(() => {
          throw new Error('Query failed');
        }),
      });
      const { storage } = createInitializedStorage(mockDb);

      const result = await storage.getModelStats();

      expect(result.ok).toBe(false);
    });
  });

  // ============================================================================
  // Get Recent Decisions Tests
  // ============================================================================

  describe('getRecentDecisions', () => {
    it('should return empty array when no decisions', async () => {
      const { storage } = createInitializedStorage();

      const result = await storage.getRecentDecisions('claude', 10);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    it('should return mapped decisions for model', async () => {
      const rows = [makeDecisionRow(), makeDecisionRow({ id: 'dec-2' })];
      const stmt = createMockStatement({ all: vi.fn(() => rows) });
      const mockDb = createMockDatabase({
        prepare: vi.fn(() => stmt),
      });
      const { storage } = createInitializedStorage(mockDb);

      const result = await storage.getRecentDecisions('claude', 5);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
      }
      expect(stmt.all).toHaveBeenCalledWith('claude', 5);
    });

    it('should return error when database throws', async () => {
      const mockDb = createMockDatabase({
        prepare: vi.fn(() => {
          throw new Error('Query failed');
        }),
      });
      const { storage } = createInitializedStorage(mockDb);

      const result = await storage.getRecentDecisions('claude', 10);

      expect(result.ok).toBe(false);
    });
  });

  // ============================================================================
  // Get Decisions By Request ID Tests
  // ============================================================================

  describe('getDecisionsByRequestId', () => {
    it('should return empty array for unknown requestId', async () => {
      const { storage } = createInitializedStorage();

      const result = await storage.getDecisionsByRequestId('unknown');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    it('should return matched decisions', async () => {
      const rows = [makeDecisionRow({ request_id: 'req-42' })];
      const stmt = createMockStatement({ all: vi.fn(() => rows) });
      const mockDb = createMockDatabase({
        prepare: vi.fn(() => stmt),
      });
      const { storage } = createInitializedStorage(mockDb);

      const result = await storage.getDecisionsByRequestId('req-42');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
      }
      expect(stmt.all).toHaveBeenCalledWith('req-42');
    });

    it('should return error when database throws', async () => {
      const mockDb = createMockDatabase({
        prepare: vi.fn(() => {
          throw new Error('Query failed');
        }),
      });
      const { storage } = createInitializedStorage(mockDb);

      const result = await storage.getDecisionsByRequestId('req-1');

      expect(result.ok).toBe(false);
    });
  });

  // ============================================================================
  // Prune Tests
  // ============================================================================

  describe('prune', () => {
    it('should prune records older than cutoff date', async () => {
      const stmt = createMockStatement({
        run: vi.fn(() => ({ changes: 3, lastInsertRowid: 0 })),
      });
      const mockDb = createMockDatabase({
        prepare: vi.fn(() => stmt),
      });
      const { storage } = createInitializedStorage(mockDb);
      const cutoff = new Date('2024-01-01T00:00:00.000Z');

      const result = await storage.prune(cutoff);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // 3 DELETE statements, each returning changes: 3
        expect(result.value).toBe(9);
      }
      // prepare called 3 times: rewards, outcomes, decisions
      expect(mockDb.prepare).toHaveBeenCalledTimes(3);
    });

    it('should return 0 when no records pruned', async () => {
      const stmt = createMockStatement({
        run: vi.fn(() => ({ changes: 0, lastInsertRowid: 0 })),
      });
      const mockDb = createMockDatabase({
        prepare: vi.fn(() => stmt),
      });
      const { storage } = createInitializedStorage(mockDb);

      const result = await storage.prune(new Date());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(0);
      }
    });

    it('should return error when database throws', async () => {
      const mockDb = createMockDatabase({
        prepare: vi.fn(() => {
          throw new Error('Delete failed');
        }),
      });
      const { storage } = createInitializedStorage(mockDb);

      const result = await storage.prune(new Date());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Failed to prune records');
      }
    });
  });

  // ============================================================================
  // Get Counts Tests
  // ============================================================================

  describe('getCounts', () => {
    it('should return counts for all tables', async () => {
      const stmt = createMockStatement({
        get: vi.fn(() => ({ count: 42 })),
      });
      const mockDb = createMockDatabase({
        prepare: vi.fn(() => stmt),
      });
      const { storage } = createInitializedStorage(mockDb);

      const result = await storage.getCounts();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.decisions).toBe(42);
        expect(result.value.outcomes).toBe(42);
        expect(result.value.rewards).toBe(42);
      }
    });

    it('should return 0 when count row is undefined', async () => {
      const stmt = createMockStatement({
        get: vi.fn(() => undefined),
      });
      const mockDb = createMockDatabase({
        prepare: vi.fn(() => stmt),
      });
      const { storage } = createInitializedStorage(mockDb);

      const result = await storage.getCounts();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.decisions).toBe(0);
        expect(result.value.outcomes).toBe(0);
        expect(result.value.rewards).toBe(0);
      }
    });

    it('should return error when database throws', async () => {
      const mockDb = createMockDatabase({
        prepare: vi.fn(() => {
          throw new Error('Count failed');
        }),
      });
      const { storage } = createInitializedStorage(mockDb);

      const result = await storage.getCounts();

      expect(result.ok).toBe(false);
    });
  });

  // ============================================================================
  // Close Tests
  // ============================================================================

  describe('close', () => {
    it('should close the database connection', () => {
      const mockDb = createMockDatabase();
      const { storage } = createInitializedStorage(mockDb);

      storage.close();

      expect(mockDb.close).toHaveBeenCalledOnce();
    });

    it('should be safe to call close multiple times', () => {
      const mockDb = createMockDatabase();
      const { storage } = createInitializedStorage(mockDb);

      storage.close();
      storage.close();

      expect(mockDb.close).toHaveBeenCalledOnce();
    });

    it('should mark storage as uninitialized after close', async () => {
      const { storage } = createInitializedStorage();

      storage.close();

      const result = await storage.storeDecision(makeDecision());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(OutcomeStorageError);
      }
    });
  });

  // ============================================================================
  // createOutcomeStorage Factory Tests
  // ============================================================================

  describe('createOutcomeStorage', () => {
    it('should return an SQLiteOutcomeStorage instance', () => {
      const storage = createOutcomeStorage({ dbPath: '/tmp/factory.db' });
      expect(storage).toBeInstanceOf(SQLiteOutcomeStorage);
    });

    it('should throw for invalid config', () => {
      expect(() => createOutcomeStorage({ dbPath: '' })).toThrow('Invalid OutcomeStorageConfig');
    });
  });
});
