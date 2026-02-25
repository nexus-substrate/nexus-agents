/**
 * nexus-agents/mcp - Tool Memory Integration Tests
 * (Source: Issue #690 - Wire memory system into MCP tool execution pipeline)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ILogger } from '../../core/index.js';

/**
 * These tests verify the ToolMemoryManager API surface and singleton behavior.
 * SessionMemory is mocked at the module level to avoid filesystem side effects.
 */

// Mock SessionMemory before importing ToolMemoryManager
const mockSessionMemory = {
  startSession: vi.fn().mockReturnValue({ ok: true, value: [] }),
  endSession: vi.fn().mockReturnValue({
    ok: true,
    value: { learnings: [], tasksCompleted: [], errorsResolved: [] },
  }),
  recordTask: vi.fn().mockReturnValue({ ok: true, value: undefined }),
  recordLearning: vi.fn().mockReturnValue({ ok: true, value: undefined }),
  recordError: vi.fn().mockReturnValue({ ok: true, value: undefined }),
  isSessionActive: vi.fn().mockReturnValue(true),
  searchLearnings: vi.fn().mockReturnValue([]),
  getRecentErrorSolutions: vi.fn().mockReturnValue([]),
};

vi.mock('../../context/session-memory.js', () => ({
  SessionMemory: vi.fn(() => mockSessionMemory),
}));

import { ToolMemoryManager, getToolMemory, shutdownToolMemory } from './tool-memory.js';
import { SessionMemory } from '../../context/session-memory.js';

/** Reset all mock return values after vi.clearAllMocks() clears them. */
function resetMockDefaults(): void {
  mockSessionMemory.startSession.mockReturnValue({ ok: true, value: [] });
  mockSessionMemory.endSession.mockReturnValue({
    ok: true,
    value: { learnings: [], tasksCompleted: [], errorsResolved: [] },
  });
  mockSessionMemory.recordTask.mockReturnValue({ ok: true, value: undefined });
  mockSessionMemory.recordLearning.mockReturnValue({ ok: true, value: undefined });
  mockSessionMemory.recordError.mockReturnValue({ ok: true, value: undefined });
  mockSessionMemory.isSessionActive.mockReturnValue(true);
  mockSessionMemory.searchLearnings.mockReturnValue([]);
  mockSessionMemory.getRecentErrorSolutions.mockReturnValue([]);
}

function createMockLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
    setLevel: vi.fn(),
  };
}

describe('ToolMemoryManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockDefaults();
    shutdownToolMemory();
  });

  afterEach(() => {
    shutdownToolMemory();
  });

  describe('constructor', () => {
    it('should create a SessionMemory and start a session', () => {
      const logger = createMockLogger();
      new ToolMemoryManager(logger);

      expect(SessionMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          memoryDir: expect.stringContaining('memory'),
          logger,
        })
      );
      expect(mockSessionMemory.startSession).toHaveBeenCalledWith(expect.stringContaining('mcp-'));
    });

    it('should handle session start failure gracefully', () => {
      mockSessionMemory.startSession.mockReturnValueOnce({
        ok: false,
        error: { message: 'disk full' },
      });

      const logger = createMockLogger();
      new ToolMemoryManager(logger);

      expect(logger.warn).toHaveBeenCalledWith('Tool memory session start failed', {
        error: 'disk full',
      });
    });

    it('should store past learnings from session start', () => {
      const pastLearnings = [{ pattern: 'test pattern', context: 'test ctx', confidence: 0.8 }];
      mockSessionMemory.startSession.mockReturnValueOnce({
        ok: true,
        value: pastLearnings,
      });

      const manager = new ToolMemoryManager(createMockLogger());
      expect(manager.getPastLearnings()).toEqual(pastLearnings);
    });
  });

  describe('recordTask', () => {
    it('should record a task to session memory', () => {
      const manager = new ToolMemoryManager(createMockLogger());
      manager.recordTask({
        approach: 'Test approach',
        challenges: ['challenge 1'],
        durationMs: 1000,
      });

      expect(mockSessionMemory.recordTask).toHaveBeenCalledWith({
        approach: 'Test approach',
        challenges: ['challenge 1'],
        durationMs: 1000,
      });
    });

    it('should silently skip if session is inactive', () => {
      mockSessionMemory.isSessionActive.mockReturnValue(false);

      const manager = new ToolMemoryManager(createMockLogger());
      manager.recordTask({ approach: 'Test', challenges: [] });

      expect(mockSessionMemory.recordTask).not.toHaveBeenCalled();
    });
  });

  describe('recordLearning', () => {
    it('should record a learning to session memory', () => {
      const manager = new ToolMemoryManager(createMockLogger());
      manager.recordLearning({
        pattern: 'Orchestration completed',
        context: 'task=123',
        confidence: 0.7,
        source: 'test',
      });

      expect(mockSessionMemory.recordLearning).toHaveBeenCalledWith({
        pattern: 'Orchestration completed',
        context: 'task=123',
        confidence: 0.7,
        source: 'test',
      });
    });
  });

  describe('recordError', () => {
    it('should record an error to session memory', () => {
      const manager = new ToolMemoryManager(createMockLogger());
      manager.recordError({
        error: 'Test error',
        solution: 'Test solution',
        filePattern: 'test/*.ts',
      });

      expect(mockSessionMemory.recordError).toHaveBeenCalledWith({
        error: 'Test error',
        solution: 'Test solution',
        filePattern: 'test/*.ts',
      });
    });
  });

  describe('searchLearnings', () => {
    it('should delegate search to session memory', () => {
      const expected = [{ pattern: 'found', context: 'ctx', confidence: 0.9 }];
      mockSessionMemory.searchLearnings.mockReturnValueOnce(expected);

      const manager = new ToolMemoryManager(createMockLogger());
      const result = manager.searchLearnings('test query');

      expect(mockSessionMemory.searchLearnings).toHaveBeenCalledWith('test query');
      expect(result).toEqual(expected);
    });
  });

  describe('getRecentErrorSolutions', () => {
    it('should delegate to session memory', () => {
      const expected = [{ error: 'err', solution: 'fix' }];
      mockSessionMemory.getRecentErrorSolutions.mockReturnValueOnce(expected);

      const manager = new ToolMemoryManager(createMockLogger());
      const result = manager.getRecentErrorSolutions(5);

      expect(mockSessionMemory.getRecentErrorSolutions).toHaveBeenCalledWith(5);
      expect(result).toEqual(expected);
    });
  });

  describe('endSession', () => {
    it('should end the session and persist data', () => {
      const manager = new ToolMemoryManager(createMockLogger());
      manager.endSession();

      expect(mockSessionMemory.endSession).toHaveBeenCalledWith('MCP session ended');
    });

    it('should skip if session is inactive', () => {
      mockSessionMemory.isSessionActive.mockReturnValue(false);

      const manager = new ToolMemoryManager(createMockLogger());
      manager.endSession();

      expect(mockSessionMemory.endSession).not.toHaveBeenCalled();
    });
  });
});

describe('getToolMemory singleton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockDefaults();
    shutdownToolMemory();
  });

  afterEach(() => {
    shutdownToolMemory();
  });

  it('should return the same instance on multiple calls', () => {
    const a = getToolMemory();
    const b = getToolMemory();
    expect(a).toBe(b);
  });

  it('should create a new instance after shutdown', () => {
    const a = getToolMemory();
    shutdownToolMemory();
    const b = getToolMemory();
    expect(a).not.toBe(b);
  });
});

describe('getRelevantLearnings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockDefaults();
    shutdownToolMemory();
  });

  afterEach(() => {
    shutdownToolMemory();
  });

  it('should return undefined when no past learnings exist', () => {
    const manager = new ToolMemoryManager(createMockLogger());
    expect(manager.getRelevantLearnings('some task')).toBeUndefined();
  });

  it('should return search results when learnings match', () => {
    const pastLearnings = [
      { pattern: 'orchestration pattern', context: 'task=1', confidence: 0.8 },
    ];
    mockSessionMemory.startSession.mockReturnValueOnce({ ok: true, value: pastLearnings });
    mockSessionMemory.searchLearnings.mockReturnValueOnce(pastLearnings);

    const manager = new ToolMemoryManager(createMockLogger());
    const result = manager.getRelevantLearnings('run orchestration');

    expect(result).toContain('orchestration pattern');
    expect(result).toContain('0.8');
  });

  it('should fall back to highest-confidence learnings when search returns empty', () => {
    const pastLearnings = [
      { pattern: 'low confidence', context: 'ctx1', confidence: 0.3 },
      { pattern: 'high confidence', context: 'ctx2', confidence: 0.9 },
    ];
    mockSessionMemory.startSession.mockReturnValueOnce({ ok: true, value: pastLearnings });
    mockSessionMemory.searchLearnings.mockReturnValueOnce([]);

    const manager = new ToolMemoryManager(createMockLogger());
    const result = manager.getRelevantLearnings('unrelated task');

    expect(result).toContain('high confidence');
    // High confidence should appear before low confidence
    const highIdx = result?.indexOf('high confidence') ?? -1;
    const lowIdx = result?.indexOf('low confidence') ?? -1;
    expect(highIdx).toBeLessThan(lowIdx);
  });

  it('should limit results to maxResults', () => {
    const pastLearnings = Array.from({ length: 10 }, (_, i) => ({
      pattern: `pattern ${String(i)}`,
      context: `ctx ${String(i)}`,
      confidence: 0.5 + i * 0.05,
    }));
    mockSessionMemory.startSession.mockReturnValueOnce({ ok: true, value: pastLearnings });
    mockSessionMemory.searchLearnings.mockReturnValueOnce(pastLearnings);

    const manager = new ToolMemoryManager(createMockLogger());
    const result = manager.getRelevantLearnings('test', 2);

    const lines = result?.split('\n') ?? [];
    expect(lines.length).toBe(2);
  });
});

describe('getRelevantErrorHints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockDefaults();
    shutdownToolMemory();
  });

  afterEach(() => {
    shutdownToolMemory();
  });

  it('should return undefined when no error solutions exist', () => {
    const manager = new ToolMemoryManager(createMockLogger());
    expect(manager.getRelevantErrorHints('code_expert')).toBeUndefined();
  });

  it('should return hints for matching role errors', () => {
    mockSessionMemory.getRecentErrorSolutions.mockReturnValueOnce([
      {
        error: 'Expert code_expert failed: timeout',
        solution: 'Increase timeout',
        filePattern: 'execute-expert',
      },
    ]);

    const manager = new ToolMemoryManager(createMockLogger());
    const result = manager.getRelevantErrorHints('code_expert');

    expect(result).toContain('timeout');
    expect(result).toContain('Increase timeout');
  });

  it('should return undefined when no errors match the role', () => {
    mockSessionMemory.getRecentErrorSolutions.mockReturnValueOnce([
      { error: 'Unrelated error', solution: 'Fix something', filePattern: 'other-module' },
    ]);

    const manager = new ToolMemoryManager(createMockLogger());
    expect(manager.getRelevantErrorHints('code_expert')).toBeUndefined();
  });

  it('should limit results to maxResults', () => {
    const errors = Array.from({ length: 5 }, (_, i) => ({
      error: `Expert code_expert error ${String(i)}`,
      solution: `Fix ${String(i)}`,
      filePattern: 'execute-expert',
    }));
    mockSessionMemory.getRecentErrorSolutions.mockReturnValueOnce(errors);

    const manager = new ToolMemoryManager(createMockLogger());
    const result = manager.getRelevantErrorHints('code_expert', 2);

    const lines = result?.split('\n') ?? [];
    expect(lines.length).toBe(2);
  });
});

describe('shutdownToolMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockDefaults();
    shutdownToolMemory();
  });

  it('should call endSession on the singleton', () => {
    getToolMemory();
    vi.clearAllMocks();
    mockSessionMemory.isSessionActive.mockReturnValue(true);

    shutdownToolMemory();

    expect(mockSessionMemory.endSession).toHaveBeenCalled();
  });

  it('should be safe to call multiple times', () => {
    shutdownToolMemory();
    shutdownToolMemory();
    // Should not throw
  });
});

// ============================================================================
// Phase 2: SQLite Backend Tests (AgenticMemory + AdaptiveMemory)
// ============================================================================

describe('ToolMemoryManager Phase 2 advanced memory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockDefaults();
    shutdownToolMemory();
  });

  afterEach(() => {
    shutdownToolMemory();
  });

  it('should report advanced memory as unavailable when SQLite is not installed', () => {
    const manager = new ToolMemoryManager(createMockLogger());
    // SQLite is not installed in test environment, so advanced memory is unavailable
    // (initSqliteBackends fires async and will fail gracefully)
    expect(manager.isAdvancedMemoryAvailable()).toBe(false);
  });

  it('should return undefined from queryKnowledge when advanced memory is unavailable', async () => {
    const manager = new ToolMemoryManager(createMockLogger());
    const result = await manager.queryKnowledge('test query');
    expect(result).toBeUndefined();
  });

  it('should silently skip recordKnowledge when advanced memory is unavailable', async () => {
    const manager = new ToolMemoryManager(createMockLogger());
    // Should not throw
    await manager.recordKnowledge(
      'key',
      { data: 'test' },
      {
        importance: 'high',
        tags: ['test'],
      }
    );
  });

  it('should close SQLite backends on endSession', () => {
    const manager = new ToolMemoryManager(createMockLogger());
    // endSession should not throw even when backends are null
    manager.endSession();
  });
});

// ============================================================================
// Belief Memory Integration Tests
// ============================================================================

describe('ToolMemoryManager belief integration', () => {
  let manager: ToolMemoryManager;

  beforeEach(() => {
    vi.clearAllMocks();
    resetMockDefaults();
    shutdownToolMemory();
    manager = new ToolMemoryManager();
  });

  afterEach(() => {
    shutdownToolMemory();
  });

  it('should record a belief without errors', async () => {
    await manager.recordBelief('routing', 'prefers', 'claude-for-code', 'high');
    // No exception thrown = success
  });

  it('should return undefined for beliefs with no matching subject', async () => {
    const result = await manager.getRelevantBeliefs('nonexistent-subject');
    expect(result).toBeUndefined();
  });

  it('should retrieve beliefs after recording', async () => {
    await manager.recordBelief('orchestration', 'requires', 'task-analysis', 'high');
    const result = await manager.getRelevantBeliefs('orchestration');
    expect(result).toBeDefined();
    expect(result).toContain('orchestration');
    expect(result).toContain('requires');
    expect(result).toContain('task-analysis');
  });

  it('should auto-create belief from high-confidence learning', async () => {
    manager.recordLearning({
      pattern: 'SQLite requires better-sqlite3',
      context: 'memory-backends',
      confidence: 0.9,
    });
    // Give async belief creation a tick to complete
    await new Promise((r) => setTimeout(r, 50));
    const beliefs = await manager.getRelevantBeliefs('memory-backends');
    expect(beliefs).toBeDefined();
    expect(beliefs).toContain('memory-backends');
  });

  it('should NOT create belief from low-confidence learning', async () => {
    manager.recordLearning({
      pattern: 'uncertain pattern',
      context: 'test-context',
      confidence: 0.5,
    });
    await new Promise((r) => setTimeout(r, 50));
    const beliefs = await manager.getRelevantBeliefs('test-context');
    expect(beliefs).toBeUndefined();
  });
});
