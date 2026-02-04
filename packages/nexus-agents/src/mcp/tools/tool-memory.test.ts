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
