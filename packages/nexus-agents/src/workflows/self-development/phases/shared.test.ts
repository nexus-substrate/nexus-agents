/**
 * Tests for Shared Utilities in Phase Executors.
 *
 * Tests the createSimpleAgent helper that bridges IModelAdapter to IAgent interface.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSimpleAgent } from './shared.js';
import type { SelfDevWorkflowDependencies } from '../interfaces.js';
import type {
  IModelAdapter,
  CompletionResponse,
  Task,
  AgentMessage,
  AgentContext,
} from '../../../core/index.js';
import { AgentCapability, ok, err } from '../../../core/index.js';
import { ModelError } from '../../../core/errors.js';

/** Creates a mock model adapter with configurable responses. */
function createMockAdapter(completeResponse?: CompletionResponse): IModelAdapter {
  const defaultResponse: CompletionResponse = {
    content: [{ type: 'text', text: 'Mock response output' }],
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    stopReason: 'end_turn',
    model: 'mock-model',
  };

  return {
    providerId: 'mock',
    modelId: 'mock-model',
    capabilities: ['completion'],
    complete: vi.fn().mockResolvedValue(ok(completeResponse ?? defaultResponse)),
    stream: vi.fn(),
    countTokens: vi.fn().mockResolvedValue(10),
    validateConfig: vi.fn().mockReturnValue(ok(undefined)),
  };
}

/** Creates mock dependencies with a given adapter. */
function createMockDependencies(adapter: IModelAdapter): SelfDevWorkflowDependencies {
  return {
    modelAdapter: adapter,
  };
}

/** Creates a test task. */
function createTestTask(description: string): Task {
  return {
    id: 'test-task-123',
    description,
    context: {},
  };
}

/** Creates a test agent message. */
function createTestMessage(): AgentMessage {
  return {
    id: 'msg-123',
    from: 'agent-1',
    to: 'agent-2',
    type: 'task',
    payload: { data: 'test' },
    timestamp: new Date().toISOString(),
  };
}

/** Creates a test agent context. */
function createTestContext(): AgentContext {
  return {
    config: {
      modelId: 'test-model',
      temperature: 0.7,
    },
  };
}

describe('createSimpleAgent', () => {
  let mockAdapter: IModelAdapter;
  let deps: SelfDevWorkflowDependencies;

  beforeEach(() => {
    mockAdapter = createMockAdapter();
    deps = createMockDependencies(mockAdapter);
  });

  describe('agent creation', () => {
    it('should create agent with correct id', () => {
      const agent = createSimpleAgent(deps, 'test-agent-id', 'code_expert');

      expect(agent.id).toBe('test-agent-id');
    });

    it('should create agent with correct role', () => {
      const agent = createSimpleAgent(deps, 'agent-1', 'security_expert');

      expect(agent.role).toBe('security_expert');
    });

    it('should create agent with idle state', () => {
      const agent = createSimpleAgent(deps, 'agent-1', 'code_expert');

      expect(agent.state).toBe('idle');
    });

    it('should create agent with TASK_EXECUTION capability', () => {
      const agent = createSimpleAgent(deps, 'agent-1', 'code_expert');

      expect(agent.capabilities).toContain(AgentCapability.TASK_EXECUTION);
      expect(agent.capabilities).toHaveLength(1);
    });

    it('should handle custom role strings', () => {
      const agent = createSimpleAgent(deps, 'agent-1', 'custom_role');

      expect(agent.role).toBe('custom_role');
    });
  });

  describe('execute', () => {
    it('should return proper Result with mocked adapter response', async () => {
      const customResponse: CompletionResponse = {
        content: [{ type: 'text', text: 'Custom output from model' }],
        usage: { inputTokens: 5, outputTokens: 15, totalTokens: 20 },
        stopReason: 'end_turn',
        model: 'test-model',
      };
      const customAdapter = createMockAdapter(customResponse);
      const customDeps = createMockDependencies(customAdapter);
      const agent = createSimpleAgent(customDeps, 'agent-1', 'code_expert');
      const task = createTestTask('Analyze this code');

      const result = await agent.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.taskId).toBe('test-task-123');
        expect(result.value.output).toBe('Custom output from model');
        expect(result.value.metadata.tokensUsed).toBe(20);
        expect(result.value.metadata.durationMs).toBe(0);
        expect(result.value.metadata.toolsUsed).toEqual([]);
        expect(result.value.metadata.model).toBe('self-dev');
      }
    });

    it('should call adapter complete with correct messages', async () => {
      const agent = createSimpleAgent(deps, 'agent-1', 'code_expert');
      const task = createTestTask('Review this function');

      await agent.execute(task);

      expect(mockAdapter.complete).toHaveBeenCalledTimes(1);
      expect(mockAdapter.complete).toHaveBeenCalledWith({
        messages: [{ role: 'user', content: 'Review this function' }],
        systemPrompt: 'You are a code_expert agent.',
      });
    });

    it('should use agent role in system prompt', async () => {
      const agent = createSimpleAgent(deps, 'agent-1', 'security_expert');
      const task = createTestTask('Check for vulnerabilities');

      await agent.execute(task);

      expect(mockAdapter.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          systemPrompt: 'You are a security_expert agent.',
        })
      );
    });

    it('should handle adapter errors', async () => {
      const errorAdapter: IModelAdapter = {
        providerId: 'mock',
        modelId: 'mock-model',
        capabilities: ['completion'],
        complete: vi.fn().mockResolvedValue(err(new ModelError('API rate limit exceeded'))),
        stream: vi.fn(),
        countTokens: vi.fn().mockResolvedValue(10),
        validateConfig: vi.fn().mockReturnValue(ok(undefined)),
      };
      const errorDeps = createMockDependencies(errorAdapter);
      const agent = createSimpleAgent(errorDeps, 'agent-1', 'code_expert');
      const task = createTestTask('Failing task');

      const result = await agent.execute(task);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ModelError);
        expect(result.error.message).toBe('API rate limit exceeded');
      }
    });

    it('should handle non-text content blocks', async () => {
      const toolUseResponse: CompletionResponse = {
        content: [{ type: 'tool_use', id: 'tool-1', name: 'read_file', input: {} }],
        usage: { inputTokens: 5, outputTokens: 10, totalTokens: 15 },
        stopReason: 'tool_use',
        model: 'test-model',
      };
      const toolAdapter = createMockAdapter(toolUseResponse);
      const toolDeps = createMockDependencies(toolAdapter);
      const agent = createSimpleAgent(toolDeps, 'agent-1', 'code_expert');
      const task = createTestTask('Task with tool response');

      const result = await agent.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Non-text content should result in empty string output
        expect(result.value.output).toBe('');
      }
    });

    it('should handle empty content array', async () => {
      const emptyResponse: CompletionResponse = {
        content: [],
        usage: { inputTokens: 5, outputTokens: 0, totalTokens: 5 },
        stopReason: 'end_turn',
        model: 'test-model',
      };
      const emptyAdapter = createMockAdapter(emptyResponse);
      const emptyDeps = createMockDependencies(emptyAdapter);
      const agent = createSimpleAgent(emptyDeps, 'agent-1', 'code_expert');
      const task = createTestTask('Empty response task');

      const result = await agent.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.output).toBe('');
      }
    });
  });

  describe('handleMessage', () => {
    it('should return ok response with completed status', async () => {
      const agent = createSimpleAgent(deps, 'agent-1', 'code_expert');
      const message = createTestMessage();

      const result = await agent.handleMessage(message);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.messageId).toBe('msg-0');
        expect(result.value.status).toBe('completed');
      }
    });

    it('should handle different message types', async () => {
      const agent = createSimpleAgent(deps, 'agent-1', 'code_expert');
      const feedbackMessage: AgentMessage = {
        ...createTestMessage(),
        type: 'feedback',
      };

      const result = await agent.handleMessage(feedbackMessage);

      expect(result.ok).toBe(true);
    });
  });

  describe('initialize', () => {
    it('should return ok with undefined value', async () => {
      const agent = createSimpleAgent(deps, 'agent-1', 'code_expert');
      const context = createTestContext();

      const result = await agent.initialize(context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeUndefined();
      }
    });

    it('should accept any agent context', async () => {
      const agent = createSimpleAgent(deps, 'agent-1', 'code_expert');
      const complexContext: AgentContext = {
        config: {
          modelId: 'claude-sonnet-4',
          temperature: 0.5,
          systemPrompt: 'Custom system prompt',
          maxContextTokens: 100000,
        },
        tools: ['read_file', 'write_file', 'bash'],
        sharedState: { key: 'value' },
      };

      const result = await agent.initialize(complexContext);

      expect(result.ok).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should complete without error', async () => {
      const agent = createSimpleAgent(deps, 'agent-1', 'code_expert');

      await expect(agent.cleanup()).resolves.toBeUndefined();
    });

    it('should be callable multiple times', async () => {
      const agent = createSimpleAgent(deps, 'agent-1', 'code_expert');

      await agent.cleanup();
      await agent.cleanup();
      await expect(agent.cleanup()).resolves.toBeUndefined();
    });
  });

  describe('integration scenarios', () => {
    it('should work with full lifecycle', async () => {
      const agent = createSimpleAgent(deps, 'lifecycle-agent', 'architecture_expert');

      // Initialize
      const initResult = await agent.initialize(createTestContext());
      expect(initResult.ok).toBe(true);

      // Execute task
      const execResult = await agent.execute(createTestTask('Design system architecture'));
      expect(execResult.ok).toBe(true);

      // Handle message
      const msgResult = await agent.handleMessage(createTestMessage());
      expect(msgResult.ok).toBe(true);

      // Cleanup
      await expect(agent.cleanup()).resolves.toBeUndefined();
    });

    it('should maintain state consistency across operations', () => {
      const agent = createSimpleAgent(deps, 'state-agent', 'testing_expert');

      // State should always be idle for this simple wrapper
      expect(agent.state).toBe('idle');
      expect(agent.id).toBe('state-agent');
      expect(agent.role).toBe('testing_expert');
      expect(agent.capabilities).toContain(AgentCapability.TASK_EXECUTION);
    });
  });
});
