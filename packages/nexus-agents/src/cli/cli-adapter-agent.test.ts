/**
 * Tests for cli-adapter-agent.ts
 *
 * Covers CliAdapterAgent wrapper that adapts ICliAdapter to IAgent interface.
 * Tests constructor, execute, handleMessage, initialize, and cleanup methods
 * with comprehensive edge cases and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CliAdapterAgent } from './cli-adapter-agent.js';
import type { ICliAdapter, CliResponse } from '../cli-adapters/index.js';
import type { Task as AgentTask, AgentMessage, AgentContext } from '../core/types/agent.js';
import { setTimeProvider, resetTimeProvider } from '../core/index.js';

// ============================================================================
// Mock adapter
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeMockAdapter(overrides: Partial<ICliAdapter> = {}) {
  return {
    name: 'claude' as const,
    execute: vi.fn(() =>
      Promise.resolve({
        ok: true as const,
        value: { text: 'response text', usage: { totalTokens: 100 } },
      })
    ),
    dispose: vi.fn(() => Promise.resolve()),
    isAvailable: vi.fn(() => Promise.resolve(true)),
    ...overrides,
  } as unknown as ICliAdapter;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeTask(overrides: Partial<AgentTask> = {}) {
  return {
    id: 'task-1',
    description: 'Implement feature',
    priority: 1,
    constraints: {},
    context: {},
    ...overrides,
  } as AgentTask;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeCliResponse(overrides: Partial<CliResponse> = {}) {
  return {
    text: 'Test response',
    usage: {
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
    },
    ...overrides,
  } as CliResponse;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeAgentMessage(overrides: Partial<AgentMessage> = {}) {
  return {
    id: 'msg-123',
    role: 'user' as const,
    content: 'Test message',
    timestamp: '2026-02-05T10:00:00.000Z',
    ...overrides,
  } as AgentMessage;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeAgentContext(overrides: Partial<AgentContext> = {}) {
  return {
    agentId: 'agent-123',
    sessionId: 'session-123',
    metadata: {},
    ...overrides,
  } as AgentContext;
}

// ============================================================================
// Constructor
// ============================================================================

describe('CliAdapterAgent - constructor', () => {
  it('creates agent with correct id for claude', () => {
    const agent = new CliAdapterAgent('claude', makeMockAdapter());
    expect(agent.id).toBe('cli-claude');
  });

  it('creates agent with correct id for gemini', () => {
    const agent = new CliAdapterAgent('gemini', makeMockAdapter());
    expect(agent.id).toBe('cli-gemini');
  });

  it('creates agent with correct id for codex', () => {
    const agent = new CliAdapterAgent('codex', makeMockAdapter());
    expect(agent.id).toBe('cli-codex');
  });

  it('sets role to worker', () => {
    const agent = new CliAdapterAgent('gemini', makeMockAdapter());
    expect(agent.role).toBe('worker');
  });

  it('sets state to idle', () => {
    const agent = new CliAdapterAgent('claude', makeMockAdapter());
    expect(agent.state).toBe('idle');
  });

  it('sets capabilities to task execution, code generation, research', () => {
    const agent = new CliAdapterAgent('claude', makeMockAdapter());
    expect(agent.capabilities).toEqual(['task_execution', 'code_generation', 'research']);
  });

  it('capabilities array is readonly', () => {
    const agent = new CliAdapterAgent('claude', makeMockAdapter());
    expect(Array.isArray(agent.capabilities)).toBe(true);
    expect(agent.capabilities.length).toBe(3);
  });
});

// ============================================================================
// execute
// ============================================================================

describe('CliAdapterAgent - execute', () => {
  let mockTimeProvider: { now: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockTimeProvider = { now: vi.fn() };
    mockTimeProvider.now.mockReturnValueOnce(1000).mockReturnValueOnce(2500);
    setTimeProvider(mockTimeProvider as never);
  });

  afterEach(() => {
    resetTimeProvider();
  });

  it('executes task and returns result with correct metadata', async () => {
    const adapter = makeMockAdapter();
    const agent = new CliAdapterAgent('claude', adapter);
    const result = await agent.execute(makeTask());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.taskId).toBe('task-1');
      expect(result.value.output).toBe('response text');
      expect(result.value.metadata.tokensUsed).toBe(100);
      expect(result.value.metadata.model).toBe('claude');
      expect(result.value.metadata.durationMs).toBe(1500);
      expect(result.value.metadata.toolsUsed).toEqual([]);
    }
  });

  it('passes task description to adapter as content', async () => {
    const adapter = makeMockAdapter();
    const agent = new CliAdapterAgent('claude', adapter);
    await agent.execute(makeTask({ description: 'Build API' }));

    expect(adapter.execute).toHaveBeenCalledWith({
      content: 'Build API',
      systemPrompt: 'You are a helpful assistant.',
    });
  });

  it('includes system prompt in CLI task', async () => {
    const adapter = makeMockAdapter();
    const agent = new CliAdapterAgent('gemini', adapter);
    await agent.execute(makeTask());

    expect(adapter.execute).toHaveBeenCalledWith(
      expect.objectContaining({ systemPrompt: 'You are a helpful assistant.' })
    );
  });

  it('returns error on adapter failure', async () => {
    const adapter = makeMockAdapter({
      execute: vi.fn(() =>
        Promise.resolve({
          ok: false as const,
          error: { message: 'API rate limit exceeded', code: 'RATE_LIMIT' },
        })
      ),
    });
    const agent = new CliAdapterAgent('claude', adapter);
    const result = await agent.execute(makeTask());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('API rate limit exceeded');
    }
  });

  it('preserves adapter error details', async () => {
    const adapter = makeMockAdapter({
      execute: vi.fn(() =>
        Promise.resolve({
          ok: false as const,
          error: { message: 'Connection timeout', code: 'TIMEOUT' },
        })
      ),
    });
    const agent = new CliAdapterAgent('codex', adapter);
    const result = await agent.execute(makeTask());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('Connection timeout');
    }
  });

  it('handles missing usage data defaults to zero tokens', async () => {
    const adapter = makeMockAdapter({
      execute: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          value: { text: 'result', usage: undefined },
        })
      ),
    });
    const agent = new CliAdapterAgent('claude', adapter);
    const result = await agent.execute(makeTask());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.tokensUsed).toBe(0);
    }
  });

  it('handles empty text response', async () => {
    const adapter = makeMockAdapter({
      execute: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          value: makeCliResponse({ text: '' }),
        })
      ),
    });
    const agent = new CliAdapterAgent('gemini', adapter);
    const result = await agent.execute(makeTask());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.output).toBe('');
    }
  });

  it('handles task with empty description', async () => {
    const adapter = makeMockAdapter();
    const agent = new CliAdapterAgent('claude', adapter);
    await agent.execute(makeTask({ description: '' }));

    expect(adapter.execute).toHaveBeenCalledWith({
      content: '',
      systemPrompt: 'You are a helpful assistant.',
    });
  });

  it('handles task with very long description', async () => {
    const adapter = makeMockAdapter();
    const agent = new CliAdapterAgent('codex', adapter);
    const longDesc = 'x'.repeat(10000);
    await agent.execute(makeTask({ description: longDesc }));

    expect(adapter.execute).toHaveBeenCalledWith({
      content: longDesc,
      systemPrompt: 'You are a helpful assistant.',
    });
  });

  it('includes correct task id in result', async () => {
    const adapter = makeMockAdapter();
    const agent = new CliAdapterAgent('claude', adapter);
    const result = await agent.execute(makeTask({ id: 'specific-task-789' }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.taskId).toBe('specific-task-789');
    }
  });

  it('handles zero token usage', async () => {
    const adapter = makeMockAdapter({
      execute: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          value: makeCliResponse({
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          }),
        })
      ),
    });
    const agent = new CliAdapterAgent('gemini', adapter);
    const result = await agent.execute(makeTask());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.tokensUsed).toBe(0);
    }
  });

  it('handles large token counts', async () => {
    const adapter = makeMockAdapter({
      execute: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          value: makeCliResponse({
            usage: { promptTokens: 50000, completionTokens: 50000, totalTokens: 100000 },
          }),
        })
      ),
    });
    const agent = new CliAdapterAgent('claude', adapter);
    const result = await agent.execute(makeTask());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.tokensUsed).toBe(100000);
    }
  });

  it('preserves toolsUsed as empty array', async () => {
    const adapter = makeMockAdapter();
    const agent = new CliAdapterAgent('codex', adapter);
    const result = await agent.execute(makeTask());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.toolsUsed).toEqual([]);
      expect(Array.isArray(result.value.metadata.toolsUsed)).toBe(true);
    }
  });
});

// ============================================================================
// handleMessage
// ============================================================================

describe('CliAdapterAgent - handleMessage', () => {
  it('returns completed response for any message', async () => {
    const agent = new CliAdapterAgent('claude', makeMockAdapter());
    const message = makeAgentMessage({ id: 'msg-456' });
    const result = await agent.handleMessage(message);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.messageId).toBe('msg-456');
      expect(result.value.status).toBe('completed');
    }
  });

  it('ignores message content', async () => {
    const agent = new CliAdapterAgent('gemini', makeMockAdapter());
    const message = makeAgentMessage({
      id: 'msg-789',
      content: 'Complex message content',
    });
    const result = await agent.handleMessage(message);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.messageId).toBe('msg-789');
    }
  });

  it('handles user role messages', async () => {
    const agent = new CliAdapterAgent('codex', makeMockAdapter());
    const message = makeAgentMessage({ id: 'msg-1', role: 'user' });
    const result = await agent.handleMessage(message);

    expect(result.ok).toBe(true);
  });

  it('handles assistant role messages', async () => {
    const agent = new CliAdapterAgent('claude', makeMockAdapter());
    const message = makeAgentMessage({ id: 'msg-2', role: 'assistant' });
    const result = await agent.handleMessage(message);

    expect(result.ok).toBe(true);
  });

  it('handles system role messages', async () => {
    const agent = new CliAdapterAgent('gemini', makeMockAdapter());
    const message = makeAgentMessage({ id: 'msg-3', role: 'system' });
    const result = await agent.handleMessage(message);

    expect(result.ok).toBe(true);
  });
});

// ============================================================================
// initialize
// ============================================================================

describe('CliAdapterAgent - initialize', () => {
  it('returns ok with undefined value', async () => {
    const agent = new CliAdapterAgent('claude', makeMockAdapter());
    const context = makeAgentContext();
    const result = await agent.initialize(context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeUndefined();
    }
  });

  it('ignores context parameter', async () => {
    const agent = new CliAdapterAgent('gemini', makeMockAdapter());
    const context = makeAgentContext({ metadata: { custom: 'data' } });
    const result = await agent.initialize(context);

    expect(result.ok).toBe(true);
  });

  it('does not call adapter methods', async () => {
    const adapter = makeMockAdapter();
    const agent = new CliAdapterAgent('codex', adapter);
    const context = makeAgentContext();

    await agent.initialize(context);

    expect(adapter.execute).not.toHaveBeenCalled();
    expect(adapter.dispose).not.toHaveBeenCalled();
  });

  it('accepts various context structures', async () => {
    const agent = new CliAdapterAgent('claude', makeMockAdapter());
    const minimalContext = makeAgentContext({ metadata: {} });
    const result = await agent.initialize(minimalContext);

    expect(result.ok).toBe(true);
  });
});

// ============================================================================
// cleanup
// ============================================================================

describe('CliAdapterAgent - cleanup', () => {
  it('calls adapter dispose once', async () => {
    const adapter = makeMockAdapter();
    const agent = new CliAdapterAgent('claude', adapter);
    await agent.cleanup();
    expect(adapter.dispose).toHaveBeenCalledTimes(1);
  });

  it('propagates adapter dispose errors', async () => {
    const adapter = makeMockAdapter({
      dispose: vi.fn(() => Promise.reject(new Error('Dispose failed'))),
    });
    const agent = new CliAdapterAgent('gemini', adapter);

    await expect(agent.cleanup()).rejects.toThrow('Dispose failed');
  });

  it('handles adapter dispose that returns void', async () => {
    const adapter = makeMockAdapter({
      dispose: vi.fn(() => Promise.resolve(undefined)),
    });
    const agent = new CliAdapterAgent('codex', adapter);

    await expect(agent.cleanup()).resolves.toBeUndefined();
  });

  it('can be called multiple times', async () => {
    const adapter = makeMockAdapter();
    const agent = new CliAdapterAgent('claude', adapter);

    await agent.cleanup();
    await agent.cleanup();

    expect(adapter.dispose).toHaveBeenCalledTimes(2);
  });

  it('handles concurrent cleanup calls', async () => {
    const adapter = makeMockAdapter();
    const agent = new CliAdapterAgent('gemini', adapter);

    await Promise.all([agent.cleanup(), agent.cleanup(), agent.cleanup()]);

    expect(adapter.dispose).toHaveBeenCalledTimes(3);
  });
});

// ============================================================================
// Integration Scenarios
// ============================================================================

describe('CliAdapterAgent - integration scenarios', () => {
  it('supports full lifecycle: initialize, execute, cleanup', async () => {
    const adapter = makeMockAdapter({
      execute: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          value: makeCliResponse({ text: 'Complete' }),
        })
      ),
    });

    const agent = new CliAdapterAgent('claude', adapter);
    const context = makeAgentContext();
    const task = makeTask();

    const initResult = await agent.initialize(context);
    expect(initResult.ok).toBe(true);

    const execResult = await agent.execute(task);
    expect(execResult.ok).toBe(true);

    await agent.cleanup();
    expect(adapter.dispose).toHaveBeenCalledOnce();
  });

  it('allows multiple executions before cleanup', async () => {
    const adapter = makeMockAdapter();
    const agent = new CliAdapterAgent('gemini', adapter);

    await agent.execute(makeTask({ id: 'task-1' }));
    await agent.execute(makeTask({ id: 'task-2' }));
    await agent.execute(makeTask({ id: 'task-3' }));

    expect(adapter.execute).toHaveBeenCalledTimes(3);
  });

  it('maintains immutable properties across lifecycle', async () => {
    const adapter = makeMockAdapter();
    const agent = new CliAdapterAgent('codex', adapter);

    const idBefore = agent.id;
    const roleBefore = agent.role;
    const stateBefore = agent.state;

    await agent.initialize(makeAgentContext());
    await agent.execute(makeTask());
    await agent.cleanup();

    expect(agent.id).toBe(idBefore);
    expect(agent.role).toBe(roleBefore);
    expect(agent.state).toBe(stateBefore);
  });

  it('handles message before execute', async () => {
    const adapter = makeMockAdapter();
    const agent = new CliAdapterAgent('claude', adapter);

    const msgResult = await agent.handleMessage(makeAgentMessage());
    const execResult = await agent.execute(makeTask());

    expect(msgResult.ok).toBe(true);
    expect(execResult.ok).toBe(true);
  });

  it('handles message after execute', async () => {
    const adapter = makeMockAdapter();
    const agent = new CliAdapterAgent('gemini', adapter);

    const execResult = await agent.execute(makeTask());
    const msgResult = await agent.handleMessage(makeAgentMessage());

    expect(execResult.ok).toBe(true);
    expect(msgResult.ok).toBe(true);
  });

  it('handles interleaved operations', async () => {
    const adapter = makeMockAdapter();
    const agent = new CliAdapterAgent('codex', adapter);

    await agent.initialize(makeAgentContext());
    await agent.handleMessage(makeAgentMessage({ id: 'msg-1' }));
    await agent.execute(makeTask({ id: 'task-1' }));
    await agent.handleMessage(makeAgentMessage({ id: 'msg-2' }));
    await agent.execute(makeTask({ id: 'task-2' }));
    await agent.cleanup();

    expect(adapter.execute).toHaveBeenCalledTimes(2);
  });
});
