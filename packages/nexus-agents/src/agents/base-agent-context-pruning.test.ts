/**
 * nexus-agents/agents - BaseAgent Context Pruning Integration Tests (Issue #306)
 *
 * Tests for the ContextPruner integration in BaseAgent.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type {
  Result,
  ILogger,
  IModelAdapter,
  Task,
  CompletionRequest,
  CompletionResponse,
  Message,
  StreamChunk,
} from '../core/index.js';
import { ok, AgentError } from '../core/index.js';
import { BaseAgent, type BaseAgentOptions } from './base-agent.js';
import { PruningStrategy } from './context-pruner.js';

/**
 * Mock logger for testing.
 */
interface MockLogger extends ILogger {
  debug: Mock;
  info: Mock;
  warn: Mock;
  error: Mock;
  child: Mock;
  setLevel: Mock;
}

function createMockLogger(): MockLogger {
  const mock: MockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
    setLevel: vi.fn(),
  };
  mock.child.mockReturnThis();
  return mock;
}

/**
 * Mock model adapter for testing.
 */
function createMockAdapter(): IModelAdapter {
  const mockResponse: CompletionResponse = {
    content: [{ type: 'text', text: 'Test response' }],
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    stopReason: 'end_turn',
    model: 'test-model',
  };

  return {
    providerId: 'test-provider',
    modelId: 'test-model',
    capabilities: ['completion'],
    complete: vi.fn().mockResolvedValue(ok(mockResponse)),
    stream: vi.fn().mockImplementation(function* (): Iterable<StreamChunk> {
      yield { type: 'message_start', message: { model: 'test-model' } };
      yield { type: 'message_stop' };
    }),
    countTokens: vi.fn().mockResolvedValue(10),
    validateConfig: vi.fn().mockReturnValue(ok(undefined)),
  };
}

/**
 * Concrete test implementation of BaseAgent for context pruning tests.
 */
class TestPruningAgent extends BaseAgent {
  constructor(options: Partial<BaseAgentOptions> = {}) {
    const baseOptions: BaseAgentOptions = {
      id: options.id ?? 'test-pruning-agent',
      role: options.role ?? 'code_expert',
      capabilities: options.capabilities ?? ['task_execution'],
    };
    if (options.adapter !== undefined) {
      baseOptions.adapter = options.adapter;
    }
    if (options.logger !== undefined) {
      baseOptions.logger = options.logger;
    }
    if (options.contextPruning !== undefined) {
      baseOptions.contextPruning = options.contextPruning;
    }
    super(baseOptions);
  }

  protected async executeTask(task: Task): Promise<
    Result<
      {
        taskId: string;
        output: string;
        metadata: { durationMs: number; tokensUsed: number; toolsUsed: string[]; model: string };
      },
      AgentError
    >
  > {
    const messages = this.buildPrompt(task);
    const request: CompletionRequest = { messages };
    const result = await this.complete(request);
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    return {
      ok: true,
      value: {
        taskId: task.id,
        output: 'Test output',
        metadata: {
          durationMs: 100,
          tokensUsed: result.value.usage.totalTokens,
          toolsUsed: [],
          model: result.value.model,
        },
      },
    };
  }

  protected buildPrompt(task: Task): Message[] {
    return [{ role: 'user', content: task.description }];
  }

  // Expose protected methods for testing
  testComplete(request: CompletionRequest): Promise<Result<CompletionResponse, AgentError>> {
    return this.complete(request);
  }

  testAddContextItem(
    content: string,
    priority?: 100 | 80 | 60 | 40 | 20,
    category?: 'system' | 'task' | 'active'
  ): Promise<void> {
    return this.addContextItem(content, priority, category);
  }
}

describe('BaseAgent Context Pruning Integration (Issue #306)', () => {
  let mockLogger: MockLogger;
  let mockAdapter: IModelAdapter;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockAdapter = createMockAdapter();
  });

  describe('Configuration', () => {
    it('should default to enabled context pruning (Issue #479)', () => {
      const agent = new TestPruningAgent({ logger: mockLogger, adapter: mockAdapter });

      expect(agent.isContextPruningEnabled()).toBe(true);
    });

    it('should disable context pruning when explicitly configured', () => {
      const agent = new TestPruningAgent({
        logger: mockLogger,
        contextPruning: {
          enabled: false,
        },
      });

      expect(agent.isContextPruningEnabled()).toBe(false);
    });

    it('should use custom pruning configuration when provided', () => {
      const agent = new TestPruningAgent({
        logger: mockLogger,
        adapter: mockAdapter,
        contextPruning: {
          enabled: true,
          strategy: PruningStrategy.PRIORITY_WEIGHTED_AGE,
          maxTokens: 50_000,
          reserveTokens: 5_000,
          triggerThreshold: 0.85,
        },
      });

      expect(agent.isContextPruningEnabled()).toBe(true);
    });

    it('should log configuration when pruning is enabled', () => {
      new TestPruningAgent({
        logger: mockLogger,
        adapter: mockAdapter,
        contextPruning: {
          enabled: true,
          maxTokens: 50_000,
        },
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Context pruning enabled',
        expect.objectContaining({
          maxTokens: 50_000,
        })
      );
    });

    it('should use default values for unspecified config options', () => {
      const agent = new TestPruningAgent({
        logger: mockLogger,
        adapter: mockAdapter,
        contextPruning: {
          enabled: true,
        },
      });

      expect(agent.isContextPruningEnabled()).toBe(true);
      // Default maxTokens is 100_000 - verified through logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Context pruning enabled',
        expect.objectContaining({
          maxTokens: 100_000,
          reserveTokens: 10_000,
          triggerThreshold: 0.9,
          strategy: PruningStrategy.PRIORITY_WEIGHTED_AGE,
        })
      );
    });
  });

  describe('Metrics', () => {
    it('should return zero metrics when pruning is disabled', () => {
      const agent = new TestPruningAgent({ logger: mockLogger });
      const metrics = agent.getPruningMetrics();

      expect(metrics.pruningRounds).toBe(0);
      expect(metrics.totalTokensPruned).toBe(0);
      expect(metrics.lastPruningTokens).toBe(0);
      expect(metrics.lastPruningItemsRemoved).toBe(0);
      expect(metrics.lastPruningTargetReached).toBe(false);
    });

    it('should return readonly metrics object', () => {
      const agent = new TestPruningAgent({ logger: mockLogger });
      const metrics = agent.getPruningMetrics();

      // Verify it's a snapshot, not the live object
      const metrics2 = agent.getPruningMetrics();
      expect(metrics).not.toBe(metrics2);
      expect(metrics).toEqual(metrics2);
    });
  });

  describe('Context Item Addition', () => {
    it('should not fail when adding context item with pruning disabled', async () => {
      const agent = new TestPruningAgent({ logger: mockLogger });

      // Should not throw
      await agent.testAddContextItem('test content');
    });

    it('should add context item when pruning is enabled', async () => {
      const agent = new TestPruningAgent({
        logger: mockLogger,
        adapter: mockAdapter,
        contextPruning: {
          enabled: true,
        },
      });

      // Should not throw
      await agent.testAddContextItem('test content', 60, 'active');
    });
  });

  describe('Complete method integration', () => {
    it('should complete successfully when pruning is disabled', async () => {
      const agent = new TestPruningAgent({
        logger: mockLogger,
        adapter: mockAdapter,
      });

      const result = await agent.testComplete({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(result.ok).toBe(true);
    });

    it('should complete successfully when pruning is enabled', async () => {
      const agent = new TestPruningAgent({
        logger: mockLogger,
        adapter: mockAdapter,
        contextPruning: {
          enabled: true,
        },
      });

      const result = await agent.testComplete({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(result.ok).toBe(true);
    });
  });

  describe('Backward Compatibility', () => {
    it('should work without contextPruning option (now enabled by default per Issue #479)', () => {
      // This tests that agents created without contextPruning config still work
      // Note: Since Issue #479, context pruning is enabled by default
      const agent = new TestPruningAgent({
        id: 'legacy-agent',
        role: 'code_expert',
        capabilities: ['task_execution'],
        adapter: mockAdapter,
        logger: mockLogger,
      });

      // Context pruning is now enabled by default (Issue #479)
      expect(agent.isContextPruningEnabled()).toBe(true);
      expect(agent.getPruningMetrics()).toEqual({
        pruningRounds: 0,
        totalTokensPruned: 0,
        lastPruningTokens: 0,
        lastPruningItemsRemoved: 0,
        lastPruningTargetReached: false,
      });
    });
  });

  describe('Schema Validation', () => {
    it('should accept valid contextPruning config', () => {
      // Should not throw
      const agent = new TestPruningAgent({
        logger: mockLogger,
        adapter: mockAdapter,
        contextPruning: {
          enabled: true,
          strategy: PruningStrategy.OLDEST_FIRST,
          maxTokens: 200_000,
          reserveTokens: 20_000,
          triggerThreshold: 0.75,
        },
      });

      expect(agent.isContextPruningEnabled()).toBe(true);
    });

    it('should reject invalid triggerThreshold', () => {
      expect(() => {
        new TestPruningAgent({
          logger: mockLogger,
          contextPruning: {
            enabled: true,
            triggerThreshold: 1.5, // Invalid: must be 0-1
          },
        });
      }).toThrow();
    });

    it('should reject negative maxTokens', () => {
      expect(() => {
        new TestPruningAgent({
          logger: mockLogger,
          contextPruning: {
            enabled: true,
            maxTokens: -100, // Invalid: must be positive
          },
        });
      }).toThrow();
    });
  });
});
