/**
 * nexus-agents/agents - SimpleAgent Tests
 *
 * Tests for SimpleAgent, a concrete BaseAgent implementation that sends tasks
 * directly to the model adapter and returns responses.
 */

import { describe, it, expect, vi, afterEach, type Mock } from 'vitest';
import type {
  Result,
  ILogger,
  IModelAdapter,
  Task,
  CompletionResponse,
  CompletionRequest,
  StreamChunk,
} from '../core/index.js';
import { ok, err, ModelError } from '../core/index.js';
import { SimpleAgent } from './simple-agent.js';
import type { BaseAgentOptions } from './base-agent-types.js';

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
 * Creates a mock model adapter with configurable complete result.
 */
function createMockAdapter(
  response?: CompletionResponse
): IModelAdapter & { completeResult: Result<CompletionResponse, ModelError> } {
  const defaultResponse: CompletionResponse = {
    content: [{ type: 'text', text: 'Test response' }],
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    stopReason: 'end_turn',
    model: 'test-model',
  };

  return {
    providerId: 'test-provider',
    modelId: 'test-model',
    capabilities: ['completion'],
    completeResult: ok(response ?? defaultResponse),
    complete: vi.fn().mockImplementation(function (this: {
      completeResult: Result<CompletionResponse, ModelError>;
    }) {
      return Promise.resolve(this.completeResult);
    }),
    stream: vi.fn().mockImplementation(function* (): Iterable<StreamChunk> {
      yield { type: 'message_start', message: { model: 'test-model' } };
      yield { type: 'message_stop' };
    }),
    countTokens: vi.fn().mockResolvedValue(10),
    validateConfig: vi.fn().mockReturnValue(ok(undefined)),
  };
}

/**
 * Creates a SimpleAgent with sensible defaults for testing.
 */
function createTestAgent(overrides: Partial<BaseAgentOptions> = {}): SimpleAgent {
  const defaults: BaseAgentOptions = {
    id: 'simple-test-agent',
    role: 'code_expert',
    capabilities: ['task_execution'],
    logger: createMockLogger(),
    ...overrides,
  };
  return new SimpleAgent(defaults);
}

/**
 * Creates a valid task for testing.
 */
function createTestTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    description: 'Describe the weather',
    context: {},
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SimpleAgent', () => {
  describe('executeTask via execute()', () => {
    it('should execute task and return text output', async () => {
      const adapter = createMockAdapter();
      const agent = createTestAgent({ adapter });

      const result = await agent.execute(createTestTask());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.taskId).toBe('task-1');
        expect(result.value.output).toBe('Test response');
      }
    });

    it('should include tokens used from adapter response', async () => {
      const adapter = createMockAdapter({
        content: [{ type: 'text', text: 'output' }],
        usage: { inputTokens: 50, outputTokens: 75, totalTokens: 125 },
        stopReason: 'end_turn',
        model: 'large-model',
      });
      const agent = createTestAgent({ adapter });

      const result = await agent.execute(createTestTask());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.metadata.tokensUsed).toBe(125);
      }
    });

    // #4734: `tokensUsed` stays 0 here because the field is required on a
    // public type. `tokensMeasured: false` is what tells the ledger that 0 is a
    // placeholder, not a count — without it the unmeasured-step branch is
    // unreachable from any real run.
    it('marks tokens unmeasured when the adapter reports no usage', async () => {
      const adapter = createMockAdapter({
        content: [{ type: 'text', text: 'output' }],
        stopReason: 'end_turn',
        model: 'large-model',
      });
      const agent = createTestAgent({ adapter });

      const result = await agent.execute(createTestTask());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.metadata.tokensMeasured).toBe(false);
        expect(result.value.metadata.tokensUsed).toBe(0);
      }
    });

    it('marks tokens measured when the adapter does report usage', async () => {
      const adapter = createMockAdapter({
        content: [{ type: 'text', text: 'output' }],
        usage: { inputTokens: 50, outputTokens: 75, totalTokens: 125 },
        stopReason: 'end_turn',
        model: 'large-model',
      });
      const agent = createTestAgent({ adapter });

      const result = await agent.execute(createTestTask());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.metadata.tokensMeasured).toBe(true);
      }
    });

    // The retry path is a SECOND producer in the same file. The first-attempt
    // test cannot reach it, because its response has text and never retries.
    it('marks tokens unmeasured when a successful RETRY reports no usage', async () => {
      const emptyResponse: CompletionResponse = {
        content: [{ type: 'text', text: '' }],
        usage: { inputTokens: 1, outputTokens: 0, totalTokens: 1 },
        stopReason: 'end_turn',
        model: 'test-model',
      };
      const adapter = createMockAdapter(emptyResponse);
      adapter.complete = vi
        .fn()
        .mockResolvedValueOnce(ok(emptyResponse))
        .mockResolvedValueOnce(
          ok({
            content: [{ type: 'text', text: 'recovered' }],
            stopReason: 'end_turn',
            model: 'test-model',
          })
        );
      const agent = createTestAgent({ adapter });

      const result = await agent.execute(createTestTask());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.output).toBe('recovered');
        expect(result.value.metadata.tokensMeasured).toBe(false);
      }
    });

    it('should include model name from adapter response', async () => {
      const adapter = createMockAdapter({
        content: [{ type: 'text', text: 'output' }],
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        stopReason: 'end_turn',
        model: 'claude-sonnet-4-20250514',
      });
      const agent = createTestAgent({ adapter });

      const result = await agent.execute(createTestTask());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.metadata.model).toBe('claude-sonnet-4-20250514');
      }
    });

    it('should report durationMs greater than or equal to zero', async () => {
      const adapter = createMockAdapter();
      const agent = createTestAgent({ adapter });

      const result = await agent.execute(createTestTask());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.metadata.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should return empty toolsUsed array', async () => {
      const adapter = createMockAdapter();
      const agent = createTestAgent({ adapter });

      const result = await agent.execute(createTestTask());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.metadata.toolsUsed).toEqual([]);
      }
    });

    it('should concatenate multiple text content blocks with newline', async () => {
      const adapter = createMockAdapter({
        content: [
          { type: 'text', text: 'Line one' },
          { type: 'text', text: 'Line two' },
          { type: 'text', text: 'Line three' },
        ],
        usage: { inputTokens: 5, outputTokens: 15, totalTokens: 20 },
        stopReason: 'end_turn',
        model: 'test-model',
      });
      const agent = createTestAgent({ adapter });

      const result = await agent.execute(createTestTask());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.output).toBe('Line one\nLine two\nLine three');
      }
    });

    it('should filter out non-text content blocks', async () => {
      const adapter = createMockAdapter({
        content: [
          { type: 'text', text: 'Only text' },
          { type: 'tool_use', id: 'tool-1', name: 'search', input: {} },
        ],
        usage: { inputTokens: 5, outputTokens: 10, totalTokens: 15 },
        stopReason: 'end_turn',
        model: 'test-model',
      });
      const agent = createTestAgent({ adapter });

      const result = await agent.execute(createTestTask());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.output).toBe('Only text');
      }
    });

    it('should return empty string when only tool_use content blocks', async () => {
      const adapter = createMockAdapter({
        content: [{ type: 'tool_use', id: 'tool-1', name: 'search', input: {} }],
        usage: { inputTokens: 5, outputTokens: 10, totalTokens: 15 },
        stopReason: 'tool_use',
        model: 'test-model',
      });
      const agent = createTestAgent({ adapter });

      const result = await agent.execute(createTestTask());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.output).toBe('');
      }
    });

    it('should retry once on empty response before failing (#1528)', async () => {
      const emptyResponse: CompletionResponse = {
        content: [],
        usage: { inputTokens: 5, outputTokens: 0, totalTokens: 5 },
        stopReason: 'end_turn',
        model: 'test-model',
      };
      const adapter = createMockAdapter(emptyResponse);
      const agent = createTestAgent({ adapter });

      const result = await agent.execute(createTestTask());

      // Should have called complete twice (original + 1 retry)
      expect(adapter.complete).toHaveBeenCalledTimes(2);
      // Still fails after retry returns empty again
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('Model returned empty response');
      }
    });

    it('should succeed on retry if second attempt returns content (#1528)', async () => {
      const emptyResponse: CompletionResponse = {
        content: [],
        usage: { inputTokens: 5, outputTokens: 0, totalTokens: 5 },
        stopReason: 'end_turn',
        model: 'test-model',
      };
      const goodResponse: CompletionResponse = {
        content: [{ type: 'text', text: 'Recovered' }],
        usage: { inputTokens: 5, outputTokens: 10, totalTokens: 15 },
        stopReason: 'end_turn',
        model: 'test-model',
      };
      const adapter = createMockAdapter(emptyResponse);
      // First call returns empty, second returns content
      (adapter.complete as Mock)
        .mockResolvedValueOnce(ok(emptyResponse))
        .mockResolvedValueOnce(ok(goodResponse));
      const agent = createTestAgent({ adapter });

      const result = await agent.execute(createTestTask());

      expect(adapter.complete).toHaveBeenCalledTimes(2);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.output).toBe('Recovered');
      }
    });

    it('should return error when adapter fails', async () => {
      const adapter = createMockAdapter();
      adapter.completeResult = err(
        new ModelError('API rate limit exceeded', {
          context: { retryAfterMs: 5000 },
        })
      );
      const agent = createTestAgent({ adapter });

      const result = await agent.execute(createTestTask());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('rate limit');
      }
    });

    it('should return error when no adapter is configured', async () => {
      const agent = createTestAgent();

      const result = await agent.execute(createTestTask());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('adapter');
      }
    });
  });

  describe('buildPrompt via adapter.complete call inspection', () => {
    it('should use task description as last user message', async () => {
      const adapter = createMockAdapter();
      const agent = createTestAgent({ adapter });

      await agent.execute(createTestTask({ description: 'Explain recursion' }));

      expect(adapter.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: 'user', content: 'Explain recursion' }],
        })
      );
    });

    it('should include task history in messages before description', async () => {
      const adapter = createMockAdapter();
      const agent = createTestAgent({ adapter });

      const task = createTestTask({
        description: 'Follow up',
        context: {
          history: [
            {
              role: 'user',
              content: 'What is TypeScript?',
              timestamp: '2025-01-01T00:00:00Z',
            },
            {
              role: 'assistant',
              content: 'A typed superset of JavaScript.',
              timestamp: '2025-01-01T00:00:01Z',
            },
          ],
        },
      });

      await agent.execute(task);

      expect(adapter.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'user', content: 'What is TypeScript?' },
            { role: 'assistant', content: 'A typed superset of JavaScript.' },
            { role: 'user', content: 'Follow up' },
          ],
        })
      );
    });

    it('should skip system role messages from history', async () => {
      const adapter = createMockAdapter();
      const agent = createTestAgent({ adapter });

      const task = createTestTask({
        description: 'Continue',
        context: {
          history: [
            {
              role: 'system',
              content: 'System message to ignore',
              timestamp: '2025-01-01T00:00:00Z',
            },
            {
              role: 'user',
              content: 'User message',
              timestamp: '2025-01-01T00:00:01Z',
            },
          ],
        },
      });

      await agent.execute(task);

      expect(adapter.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'user', content: 'User message' },
            { role: 'user', content: 'Continue' },
          ],
        })
      );
    });

    it('should handle empty history', async () => {
      const adapter = createMockAdapter();
      const agent = createTestAgent({ adapter });

      const task = createTestTask({
        description: 'No history',
        context: { history: [] },
      });

      await agent.execute(task);

      expect(adapter.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: 'user', content: 'No history' }],
        })
      );
    });

    it('should handle undefined history', async () => {
      const adapter = createMockAdapter();
      const agent = createTestAgent({ adapter });

      const task = createTestTask({
        description: 'No context history',
        context: {},
      });

      await agent.execute(task);

      expect(adapter.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: 'user', content: 'No context history' }],
        })
      );
    });
  });

  describe('systemPrompt configuration', () => {
    it('should include systemPrompt in request when configured', async () => {
      const adapter = createMockAdapter();
      const agent = createTestAgent({
        adapter,
        systemPrompt: 'You are a code reviewer.',
      });

      await agent.execute(createTestTask());

      expect(adapter.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          systemPrompt: 'You are a code reviewer.',
        })
      );
    });

    it('should not include systemPrompt when not configured', async () => {
      const adapter = createMockAdapter();
      const agent = createTestAgent({ adapter });

      await agent.execute(createTestTask());

      const callArg = (adapter.complete as Mock).mock.calls[0]?.[0] as
        CompletionRequest | undefined;
      expect(callArg).toBeDefined();
      expect(callArg).not.toHaveProperty('systemPrompt');
    });
  });

  describe('maxTokens configuration', () => {
    it('should use maxTokens from task constraints when provided', async () => {
      const adapter = createMockAdapter();
      const agent = createTestAgent({ adapter, maxTokens: 2048 });

      const task = createTestTask({
        constraints: { maxTokens: 512 },
      });

      await agent.execute(task);

      expect(adapter.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          maxTokens: 512,
        })
      );
    });

    it('should fall back to agent maxTokens when task has no constraints', async () => {
      const adapter = createMockAdapter();
      const agent = createTestAgent({ adapter, maxTokens: 2048 });

      await agent.execute(createTestTask());

      expect(adapter.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          maxTokens: 2048,
        })
      );
    });

    it('should use default maxTokens (4096) when neither is set', async () => {
      const adapter = createMockAdapter();
      const agent = createTestAgent({ adapter });

      await agent.execute(createTestTask());

      expect(adapter.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          maxTokens: 4096,
        })
      );
    });
  });

  describe('temperature configuration', () => {
    it('should pass configured temperature to adapter', async () => {
      const adapter = createMockAdapter();
      const agent = createTestAgent({ adapter, temperature: 0.7 });

      await agent.execute(createTestTask());

      expect(adapter.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.7,
        })
      );
    });

    it('should use default temperature (0.3) when not configured', async () => {
      const adapter = createMockAdapter();
      const agent = createTestAgent({ adapter });

      await agent.execute(createTestTask());

      expect(adapter.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.3,
        })
      );
    });
  });
});
