/**
 * nexus-agents/agents - BaseAgent Tests
 */

import { describe, it, expect, vi, type Mock } from 'vitest';
import type {
  Result,
  ILogger,
  IModelAdapter,
  Task,
  TaskResult,
  AgentMessage,
  AgentContext,
  AgentCapability,
  CompletionRequest,
  CompletionResponse,
  Message,
  StreamChunk,
  ModelCapability,
} from '../core/index.js';
import { ok, err, AgentError, ModelError, ErrorCode } from '../core/index.js';
import {
  BaseAgent,
  TaskSchema,
  AgentMessageSchema,
  BaseAgentOptionsSchema,
  type BaseAgentOptions,
} from './base-agent.js';
import { SimpleAgent } from './simple-agent.js';
import type { IEventBus, TypedEvent } from './collaboration/event-bus-types.js';

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
function createMockAdapter(): IModelAdapter & {
  completeResult: Result<CompletionResponse, ModelError>;
} {
  const mockResponse: CompletionResponse = {
    content: [{ type: 'text', text: 'Test response' }],
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    stopReason: 'end_turn',
    model: 'test-model',
  };

  return {
    providerId: 'test-provider',
    modelId: 'test-model',
    capabilities: ['completion' as ModelCapability],
    completeResult: ok(mockResponse),
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
 * Concrete test implementation of BaseAgent.
 */
class TestAgent extends BaseAgent {
  executeTaskResult: Result<TaskResult, AgentError> | null = null;
  builtPrompts: Message[] = [];

  constructor(options: Partial<BaseAgentOptions> = {}) {
    const baseOptions: BaseAgentOptions = {
      id: options.id ?? 'test-agent',
      role: options.role ?? 'code_expert',
      capabilities: options.capabilities ?? ['task_execution' as AgentCapability],
    };
    if (options.adapter !== undefined) {
      baseOptions.adapter = options.adapter;
    }
    if (options.logger !== undefined) {
      baseOptions.logger = options.logger;
    }
    if (options.systemPrompt !== undefined) {
      baseOptions.systemPrompt = options.systemPrompt;
    }
    if (options.temperature !== undefined) {
      baseOptions.temperature = options.temperature;
    }
    if (options.maxTokens !== undefined) {
      baseOptions.maxTokens = options.maxTokens;
    }
    super(baseOptions);
  }

  protected async executeTask(task: Task): Promise<Result<TaskResult, AgentError>> {
    if (this.executeTaskResult !== null) {
      return this.executeTaskResult;
    }

    const messages = this.buildPrompt(task);
    const request: CompletionRequest = {
      messages,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
    };
    if (this.systemPrompt !== undefined) {
      request.systemPrompt = this.systemPrompt;
    }

    const result = await this.complete(request);
    if (!result.ok) {
      return err(result.error);
    }

    return ok({
      taskId: task.id,
      output: 'Test output',
      metadata: {
        durationMs: 100,
        tokensUsed: result.value.usage.totalTokens,
        toolsUsed: [],
        model: result.value.model,
      },
    });
  }

  protected buildPrompt(task: Task): Message[] {
    const messages: Message[] = [{ role: 'user', content: task.description }];
    this.builtPrompts = messages;
    return messages;
  }

  // Expose protected methods for testing
  testTransformError(error: unknown, taskId: string): AgentError {
    return this.transformError(error, taskId);
  }

  testComplete(request: CompletionRequest): Promise<Result<CompletionResponse, AgentError>> {
    return this.complete(request);
  }

  testAddToHistory(message: Message): void {
    this.addToHistory(message);
  }

  testGetHistory(): Message[] {
    return this.getHistory();
  }

  testClearHistory(): void {
    this.clearHistory();
  }

  testHasCapability(capability: AgentCapability): boolean {
    return this.hasCapability(capability);
  }

  testSetState(state: 'idle' | 'thinking' | 'acting' | 'waiting' | 'error'): void {
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- Test helper for deprecated method
    this.setState(state);
  }
}

/**
 * Creates a valid task for testing.
 */
function createTestTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'test-task-1',
    description: 'Test task description',
    context: {},
    ...overrides,
  };
}

/**
 * Creates a valid agent message for testing.
 */
function createTestMessage(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id: 'msg-1',
    from: 'sender-agent',
    to: 'test-agent',
    type: 'query',
    payload: {},
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('BaseAgent', () => {
  describe('constructor', () => {
    it('should initialize with required options', () => {
      const agent = new TestAgent({
        id: 'agent-1',
        role: 'tech_lead',
        capabilities: ['task_execution', 'delegation'] as AgentCapability[],
      });

      expect(agent.id).toBe('agent-1');
      expect(agent.role).toBe('tech_lead');
      expect(agent.capabilities).toContain('task_execution');
      expect(agent.capabilities).toContain('delegation');
      expect(agent.state).toBe('idle');
    });

    it('should use custom logger when provided', () => {
      const mockLogger = createMockLogger();
      const agent = new TestAgent({ logger: mockLogger });

      agent.testSetState('thinking');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'State transition',
        expect.objectContaining({ from: 'idle', to: 'thinking' })
      );
    });

    it('should throw AgentError for invalid options', () => {
      expect(() => {
        new TestAgent({ id: '' });
      }).toThrow(AgentError);
    });

    it('should throw AgentError with validation details for empty ID', () => {
      try {
        new TestAgent({ id: '' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AgentError);
        expect((error as AgentError).message).toContain('Agent ID is required');
      }
    });

    it('should use default temperature and maxTokens', () => {
      const agent = new TestAgent();
      // Access via protected property through the test agent
      expect(agent['temperature']).toBe(0.3);
      expect(agent['maxTokens']).toBe(4096);
    });

    it('should accept custom temperature and maxTokens', () => {
      const agent = new TestAgent({ temperature: 0.7, maxTokens: 2048 });
      expect(agent['temperature']).toBe(0.7);
      expect(agent['maxTokens']).toBe(2048);
    });
  });

  describe('state management', () => {
    it('should start in idle state', () => {
      expect(new TestAgent().state).toBe('idle');
    });

    it('should transition states with logging', () => {
      const mockLogger = createMockLogger();
      const agent = new TestAgent({ logger: mockLogger });

      agent.testSetState('thinking');
      expect(agent.state).toBe('thinking');
      expect(mockLogger.debug).toHaveBeenCalledWith('State transition', {
        from: 'idle',
        to: 'thinking',
        event: 'task_assigned',
      });

      agent.testSetState('acting');
      expect(agent.state).toBe('acting');
      expect(mockLogger.debug).toHaveBeenCalledWith('State transition', {
        from: 'thinking',
        to: 'acting',
        event: 'plan_completed',
      });
    });
  });

  describe('initialize', () => {
    it('should initialize with context', async () => {
      const agent = new TestAgent();
      const context: AgentContext = {
        config: { modelId: 'claude-sonnet-4' },
        tools: ['read_file', 'write_file'],
        sharedState: { projectPath: '/test' },
      };

      const result = await agent.initialize(context);
      expect(result.ok).toBe(true);
    });

    it('should log initialization', async () => {
      const mockLogger = createMockLogger();
      const agent = new TestAgent({ logger: mockLogger });

      await agent.initialize({
        config: { modelId: 'test-model' },
        tools: ['tool1'],
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Initializing agent',
        expect.objectContaining({ modelId: 'test-model', hasTools: true })
      );
    });

    it('should fail if already initialized', async () => {
      const agent = new TestAgent();
      const context: AgentContext = { config: { modelId: 'test-model' } };

      await agent.initialize(context);
      const result = await agent.initialize(context);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('already initialized');
      }
    });
  });

  describe('execute', () => {
    it('should execute a valid task', async () => {
      const mockAdapter = createMockAdapter();
      const agent = new TestAgent({ adapter: mockAdapter });
      const task = createTestTask();

      const result = await agent.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.taskId).toBe(task.id);
        expect(result.value.metadata.model).toBe('test-model');
      }
    });

    it('should return to idle state after successful execution', async () => {
      const mockAdapter = createMockAdapter();
      const agent = new TestAgent({ adapter: mockAdapter });

      await agent.execute(createTestTask());

      expect(agent.state).toBe('idle');
    });

    it('should transition to error state on failure', async () => {
      const agent = new TestAgent();
      agent.executeTaskResult = err(new AgentError('Execution failed'));

      const result = await agent.execute(createTestTask());

      expect(result.ok).toBe(false);
      expect(agent.state).toBe('error');
    });

    it('should fail if not in idle state', async () => {
      const agent = new TestAgent();
      agent.testSetState('thinking');

      const result = await agent.execute(createTestTask());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('not idle');
      }
    });

    it('should validate task before execution', async () => {
      const agent = new TestAgent();
      const invalidTask = { id: '', description: '', context: {} } as Task;

      const result = await agent.execute(invalidTask);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.AGENT_ERROR);
        expect(result.error.message).toContain('Invalid task');
      }
    });

    it('should log task execution', async () => {
      const mockLogger = createMockLogger();
      const mockAdapter = createMockAdapter();
      const agent = new TestAgent({ logger: mockLogger, adapter: mockAdapter });

      await agent.execute(createTestTask({ id: 'task-123', priority: 5 }));

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Executing task',
        expect.objectContaining({ taskId: 'task-123', priority: 5 })
      );
    });

    it('should log task completion', async () => {
      const mockLogger = createMockLogger();
      const mockAdapter = createMockAdapter();
      const agent = new TestAgent({ logger: mockLogger, adapter: mockAdapter });

      await agent.execute(createTestTask({ id: 'task-123' }));

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Task completed',
        expect.objectContaining({ taskId: 'task-123' })
      );
    });

    it('should respect task constraints maxDuration', async () => {
      const agent = new TestAgent();
      // Create a task that will timeout
      agent.executeTaskResult = new Promise((resolve) => {
        setTimeout(() => {
          resolve(
            ok({
              taskId: 'test',
              output: 'done',
              metadata: { durationMs: 0, tokensUsed: 0, toolsUsed: [], model: 'test' },
            })
          );
        }, 200);
      }) as unknown as Result<TaskResult, AgentError>;

      const task = createTestTask({ constraints: { maxDuration: 50 } });
      const result = await agent.execute(task);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.AGENT_ERROR);
        expect(result.error.message).toContain('timed out');
      }
    });
  });

  describe('handleMessage', () => {
    it('should handle query message', async () => {
      const agent = new TestAgent({
        id: 'query-agent',
        role: 'code_expert',
        capabilities: ['task_execution'] as AgentCapability[],
      });
      const message = createTestMessage({ type: 'query' });

      const result = await agent.handleMessage(message);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('completed');
        expect(result.value.data).toEqual(
          expect.objectContaining({
            agentId: 'query-agent',
            role: 'code_expert',
            state: 'idle',
          })
        );
      }
    });

    it('should handle status message', async () => {
      const agent = new TestAgent({ id: 'status-agent' });
      const message = createTestMessage({ type: 'status' });

      const result = await agent.handleMessage(message);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.data).toEqual(
          expect.objectContaining({
            agentId: 'status-agent',
            state: 'idle',
          })
        );
      }
    });

    it('should handle feedback message', async () => {
      const mockLogger = createMockLogger();
      const agent = new TestAgent({ logger: mockLogger });
      const message = createTestMessage({
        type: 'feedback',
        payload: { rating: 5 },
      });

      const result = await agent.handleMessage(message);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('accepted');
      }
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Received feedback',
        expect.objectContaining({ payload: { rating: 5 } })
      );
    });

    it('should handle result message', async () => {
      const agent = new TestAgent();
      const message = createTestMessage({ type: 'result' });

      const result = await agent.handleMessage(message);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('accepted');
      }
    });

    it('should handle task message with valid payload', async () => {
      const mockAdapter = createMockAdapter();
      const agent = new TestAgent({ adapter: mockAdapter });
      const message = createTestMessage({
        type: 'task',
        payload: {
          id: 'task-from-message',
          description: 'Do something',
          context: {},
        },
      });

      const result = await agent.handleMessage(message);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('completed');
      }
    });

    it('should reject task message with invalid payload', async () => {
      const agent = new TestAgent();
      const message = createTestMessage({
        type: 'task',
        payload: { invalid: 'payload' },
      });

      const result = await agent.handleMessage(message);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('rejected');
        expect(result.value.error).toContain('missing id or description');
      }
    });

    it('should validate message before handling', async () => {
      const agent = new TestAgent();
      const invalidMessage = {
        id: '',
        from: '',
        to: '',
        type: 'query',
        payload: {},
        timestamp: '',
      };

      const result = await agent.handleMessage(invalidMessage as AgentMessage);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.AGENT_ERROR);
        expect(result.error.message).toContain('Invalid message');
      }
    });

    it('should log message handling', async () => {
      const mockLogger = createMockLogger();
      const agent = new TestAgent({ logger: mockLogger });

      await agent.handleMessage(
        createTestMessage({ id: 'msg-123', from: 'sender', type: 'query' })
      );

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Handling message',
        expect.objectContaining({ messageId: 'msg-123', from: 'sender', type: 'query' })
      );
    });
  });

  describe('cleanup', () => {
    it('should reset agent state', async () => {
      const mockLogger = createMockLogger();
      const mockAdapter = createMockAdapter();
      const agent = new TestAgent({ logger: mockLogger, adapter: mockAdapter });

      await agent.initialize({ config: { modelId: 'test' } });
      agent.testAddToHistory({ role: 'user', content: 'test' });
      agent.testSetState('thinking');

      await agent.cleanup();

      expect(agent.state).toBe('idle');
      expect(agent.testGetHistory()).toHaveLength(0);
    });

    it('should log cleanup', async () => {
      const mockLogger = createMockLogger();
      const agent = new TestAgent({ logger: mockLogger });

      await agent.cleanup();

      expect(mockLogger.info).toHaveBeenCalledWith('Cleaning up agent');
    });
  });

  describe('hasCapability', () => {
    it('should return true for existing capability', () => {
      const agent = new TestAgent({
        capabilities: ['task_execution', 'code_generation'] as AgentCapability[],
      });

      expect(agent.testHasCapability('task_execution' as AgentCapability)).toBe(true);
      expect(agent.testHasCapability('code_generation' as AgentCapability)).toBe(true);
    });

    it('should return false for non-existing capability', () => {
      const agent = new TestAgent({
        capabilities: ['task_execution'] as AgentCapability[],
      });

      expect(agent.testHasCapability('delegation' as AgentCapability)).toBe(false);
    });
  });

  describe('complete (protected)', () => {
    it('should call adapter complete method', async () => {
      const mockAdapter = createMockAdapter();
      const agent = new TestAgent({ adapter: mockAdapter });
      const request: CompletionRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
      };

      await agent.testComplete(request);

      expect(mockAdapter.complete).toHaveBeenCalledWith(request);
    });

    it('should return error if no adapter configured', async () => {
      const agent = new TestAgent();
      const request: CompletionRequest = { messages: [] };

      const result = await agent.testComplete(request);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('No model adapter configured');
      }
    });

    it('should transform adapter errors to AgentError', async () => {
      const mockAdapter = createMockAdapter();
      mockAdapter.completeResult = err(new ModelError('API error'));
      const agent = new TestAgent({ adapter: mockAdapter });

      const result = await agent.testComplete({ messages: [] });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(AgentError);
        expect(result.error.message).toContain('Model completion failed');
      }
    });

    it('should transition to acting state during completion', async () => {
      const mockAdapter = createMockAdapter();
      const statesDuringComplete: string[] = [];

      mockAdapter.complete = vi.fn().mockImplementation(() => {
        statesDuringComplete.push(agent.state);
        return Promise.resolve(mockAdapter.completeResult);
      });

      const agent = new TestAgent({ adapter: mockAdapter });
      // Agent must be in thinking state for complete() to transition to acting
      // (Issue #302: validated state transitions via AgentStateMachine)
      agent.testSetState('thinking');
      await agent.testComplete({ messages: [] });

      expect(statesDuringComplete).toContain('acting');
    });
  });

  describe('history management', () => {
    it('should add messages to history', () => {
      const agent = new TestAgent();

      agent.testAddToHistory({ role: 'user', content: 'Hello' });
      agent.testAddToHistory({ role: 'assistant', content: 'Hi!' });

      const history = agent.testGetHistory();
      expect(history).toHaveLength(2);
      expect(history[0]).toEqual({ role: 'user', content: 'Hello' });
    });

    it('should return copy of history', () => {
      const agent = new TestAgent();
      agent.testAddToHistory({ role: 'user', content: 'Hello' });

      const history = agent.testGetHistory();
      history.push({ role: 'user', content: 'Modified' });

      expect(agent.testGetHistory()).toHaveLength(1);
    });

    it('should clear history', () => {
      const agent = new TestAgent();
      agent.testAddToHistory({ role: 'user', content: 'Hello' });
      agent.testAddToHistory({ role: 'assistant', content: 'Hi!' });

      agent.testClearHistory();

      expect(agent.testGetHistory()).toHaveLength(0);
    });

    it('should prune history when exceeding max items', () => {
      const agent = new TestAgent();

      // Add more than MAX_HISTORY_ITEMS (100)
      for (let i = 0; i < 110; i++) {
        agent.testAddToHistory({ role: 'user', content: `Message ${String(i)}` });
      }

      const history = agent.testGetHistory();
      expect(history.length).toBeLessThanOrEqual(100);
      // First 10 pruned
      const firstContent = history[0]?.content;
      expect(firstContent).toBe('Message 10');
    });
  });

  describe('transformError', () => {
    it('should return existing AgentError unchanged', () => {
      const agent = new TestAgent();
      const originalError = new AgentError('Original');

      const result = agent.testTransformError(originalError, 'task-1');

      expect(result).toBe(originalError);
    });

    it('should wrap Error in AgentError', () => {
      const agent = new TestAgent();
      const genericError = new Error('Something went wrong');

      const result = agent.testTransformError(genericError, 'task-1');

      expect(result).toBeInstanceOf(AgentError);
      expect(result.message).toContain('Task execution failed');
      expect(result.message).toContain('Something went wrong');
      expect(result.cause).toBe(genericError);
    });

    it('should handle non-Error objects', () => {
      const agent = new TestAgent();

      const result = agent.testTransformError('String error', 'task-1');

      expect(result).toBeInstanceOf(AgentError);
      expect(result.message).toContain('String error');
    });

    it('should include context in error', () => {
      const agent = new TestAgent({ id: 'error-agent' });

      const result = agent.testTransformError(new Error('Test'), 'task-123');

      expect(result.context).toEqual(
        expect.objectContaining({
          agentId: 'error-agent',
          taskId: 'task-123',
        })
      );
    });
  });
});

describe('SimpleAgent', () => {
  it('should execute task and return text output', async () => {
    const mockAdapter = createMockAdapter();
    const agent = new SimpleAgent({
      id: 'simple-agent',
      role: 'code_expert',
      capabilities: ['task_execution'] as AgentCapability[],
      adapter: mockAdapter,
      systemPrompt: 'You are a helpful assistant.',
    });

    const task = createTestTask({ description: 'Write a function' });
    const result = await agent.execute(task);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.output).toBe('Test response');
      expect(result.value.metadata.tokensUsed).toBe(30);
    }
  });

  it('should build prompt from task', async () => {
    const mockAdapter = createMockAdapter();
    const agent = new SimpleAgent({
      id: 'simple-agent',
      role: 'code_expert',
      capabilities: ['task_execution'] as AgentCapability[],
      adapter: mockAdapter,
    });

    await agent.execute(createTestTask({ description: 'Test description' }));

    expect(mockAdapter.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', content: 'Test description' }],
      })
    );
  });

  it('should include history in prompt', async () => {
    const mockAdapter = createMockAdapter();
    const agent = new SimpleAgent({
      id: 'simple-agent',
      role: 'code_expert',
      capabilities: ['task_execution'] as AgentCapability[],
      adapter: mockAdapter,
    });

    const task = createTestTask({
      description: 'Follow up question',
      context: {
        history: [
          { role: 'user', content: 'Initial question', timestamp: '2024-01-01T00:00:00Z' },
          { role: 'assistant', content: 'Initial answer', timestamp: '2024-01-01T00:00:01Z' },
        ],
      },
    });

    await agent.execute(task);

    expect(mockAdapter.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'user', content: 'Initial question' },
          { role: 'assistant', content: 'Initial answer' },
          { role: 'user', content: 'Follow up question' },
        ],
      })
    );
  });
});

describe('TaskSchema', () => {
  it('should validate valid task', () => {
    const task = {
      id: 'task-1',
      description: 'Do something',
      context: {},
    };

    expect(TaskSchema.safeParse(task).success).toBe(true);
  });

  it('should reject empty id', () => {
    const task = { id: '', description: 'Do something', context: {} };
    const result = TaskSchema.safeParse(task);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('required');
    }
  });

  it('should reject empty description', () => {
    const task = { id: 'task-1', description: '', context: {} };
    const result = TaskSchema.safeParse(task);

    expect(result.success).toBe(false);
  });

  it('should validate optional constraints', () => {
    const task = {
      id: 'task-1',
      description: 'Do something',
      context: {},
      constraints: {
        maxDuration: 5000,
        maxTokens: 1000,
        outputFormat: 'json',
        allowedTools: ['read', 'write'],
      },
    };

    expect(TaskSchema.safeParse(task).success).toBe(true);
  });

  it('should reject negative maxDuration', () => {
    const task = {
      id: 'task-1',
      description: 'Do something',
      context: {},
      constraints: { maxDuration: -1 },
    };

    expect(TaskSchema.safeParse(task).success).toBe(false);
  });
});

describe('AgentMessageSchema', () => {
  it('should validate valid message', () => {
    const message = {
      id: 'msg-1',
      from: 'agent-1',
      to: 'agent-2',
      type: 'query',
      payload: {},
      timestamp: '2024-01-01T00:00:00Z',
    };

    expect(AgentMessageSchema.safeParse(message).success).toBe(true);
  });

  it('should reject invalid type', () => {
    const message = {
      id: 'msg-1',
      from: 'agent-1',
      to: 'agent-2',
      type: 'invalid',
      payload: {},
      timestamp: '2024-01-01T00:00:00Z',
    };

    expect(AgentMessageSchema.safeParse(message).success).toBe(false);
  });

  it('should validate all message types', () => {
    const types = ['task', 'result', 'query', 'feedback', 'status'];

    for (const type of types) {
      const message = {
        id: 'msg-1',
        from: 'agent-1',
        to: 'agent-2',
        type,
        payload: {},
        timestamp: '2024-01-01T00:00:00Z',
      };

      expect(AgentMessageSchema.safeParse(message).success).toBe(true);
    }
  });
});

describe('BaseAgentOptionsSchema', () => {
  it('should validate valid options', () => {
    const options = {
      id: 'agent-1',
      role: 'tech_lead',
      capabilities: ['task_execution', 'delegation'],
    };

    expect(BaseAgentOptionsSchema.safeParse(options).success).toBe(true);
  });

  it('should validate all roles', () => {
    const roles = [
      'tech_lead',
      'code_expert',
      'architecture_expert',
      'security_expert',
      'documentation_expert',
      'testing_expert',
      'custom',
    ];

    for (const role of roles) {
      const options = { id: 'agent-1', role, capabilities: [] };
      expect(BaseAgentOptionsSchema.safeParse(options).success).toBe(true);
    }
  });

  it('should reject invalid role', () => {
    const options = { id: 'agent-1', role: 'invalid_role', capabilities: [] };
    expect(BaseAgentOptionsSchema.safeParse(options).success).toBe(false);
  });

  it('should validate temperature bounds', () => {
    expect(
      BaseAgentOptionsSchema.safeParse({
        id: 'agent-1',
        role: 'tech_lead',
        capabilities: [],
        temperature: 0.5,
      }).success
    ).toBe(true);

    expect(
      BaseAgentOptionsSchema.safeParse({
        id: 'agent-1',
        role: 'tech_lead',
        capabilities: [],
        temperature: 1.5, // Over max
      }).success
    ).toBe(false);

    expect(
      BaseAgentOptionsSchema.safeParse({
        id: 'agent-1',
        role: 'tech_lead',
        capabilities: [],
        temperature: -0.1, // Under min
      }).success
    ).toBe(false);
  });

  it('should reject non-positive maxTokens', () => {
    const options = {
      id: 'agent-1',
      role: 'tech_lead',
      capabilities: [],
      maxTokens: 0,
    };

    expect(BaseAgentOptionsSchema.safeParse(options).success).toBe(false);
  });
});

// =============================================================================
// EventBus Integration Tests (Issue #223)
// =============================================================================

/** Creates a mock EventBus for testing event emission. */
function createMockEventBus(): IEventBus & { emittedEvents: TypedEvent[] } {
  const emittedEvents: TypedEvent[] = [];
  return {
    emittedEvents,
    emit: vi.fn((event: TypedEvent) => {
      emittedEvents.push(event);
    }),
    emitAsync: vi.fn((event: TypedEvent) => {
      emittedEvents.push(event);
      return Promise.resolve();
    }),
    subscribe: vi.fn(() => ({ id: 'sub-1', pattern: '*', unsubscribe: vi.fn() })),
    unsubscribe: vi.fn(),
    getHistory: vi.fn(() => []),
    clearHistory: vi.fn(),
    getStats: vi.fn(() => ({
      eventsEmitted: emittedEvents.length,
      subscriptionsCreated: 0,
      activeSubscriptions: 0,
      historySize: 0,
      errorCount: 0,
    })),
    hasSubscribers: vi.fn(() => false),
  };
}

describe('BaseAgent EventBus integration', () => {
  it('should use provided eventBus', () => {
    const mockEventBus = createMockEventBus();
    const agent = new SimpleAgent({
      id: 'test-agent',
      role: 'custom',
      capabilities: [],
      eventBus: mockEventBus,
    });

    expect(agent).toBeDefined();
    // The eventBus is protected, so we verify it works via handleMessage
  });

  it('should emit message.received event when handling message', async () => {
    const mockEventBus = createMockEventBus();
    const agent = new SimpleAgent({
      id: 'test-agent',
      role: 'custom',
      capabilities: [],
      eventBus: mockEventBus,
    });

    const message: AgentMessage = {
      id: 'msg-1',
      type: 'query',
      from: 'sender-agent',
      to: 'test-agent',
      payload: {},
      timestamp: new Date().toISOString(),
    };

    await agent.handleMessage(message);

    expect(mockEventBus.emit).toHaveBeenCalled();
    const messageEvents = mockEventBus.emittedEvents.filter((e) => e.topic === 'message.received');
    expect(messageEvents.length).toBe(1);
    expect(messageEvents[0]?.payload).toMatchObject({
      message: expect.objectContaining({ type: 'query' }),
      by: 'test-agent',
    });
  });

  it('should not emit events when emitMessageEvents is false', async () => {
    const mockEventBus = createMockEventBus();
    const agent = new SimpleAgent({
      id: 'test-agent',
      role: 'custom',
      capabilities: [],
      eventBus: mockEventBus,
      emitMessageEvents: false,
    });

    const message: AgentMessage = {
      id: 'msg-2',
      type: 'status',
      from: 'sender-agent',
      to: 'test-agent',
      payload: {},
      timestamp: new Date().toISOString(),
    };

    await agent.handleMessage(message);

    const messageEvents = mockEventBus.emittedEvents.filter((e) => e.topic === 'message.received');
    expect(messageEvents.length).toBe(0);
  });

  it('should emit message.received for different message types', async () => {
    const mockEventBus = createMockEventBus();
    const agent = new SimpleAgent({
      id: 'test-agent',
      role: 'custom',
      capabilities: [],
      eventBus: mockEventBus,
    });

    const messageTypes: AgentMessage['type'][] = ['query', 'feedback', 'status', 'result'];

    for (const type of messageTypes) {
      const message: AgentMessage = {
        id: `msg-${type}`,
        type,
        from: 'sender-agent',
        to: 'test-agent',
        payload: {},
        timestamp: new Date().toISOString(),
      };

      await agent.handleMessage(message);
    }

    const messageEvents = mockEventBus.emittedEvents.filter((e) => e.topic === 'message.received');
    expect(messageEvents.length).toBe(messageTypes.length);
  });
});
