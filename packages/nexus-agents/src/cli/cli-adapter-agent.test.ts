/**
 * Tests for cli-adapter-agent.ts
 *
 * Covers CliAdapterAgent: constructor, execute (success/error),
 * handleMessage, initialize, and cleanup.
 */

import { describe, it, expect, vi } from 'vitest';
import { CliAdapterAgent } from './cli-adapter-agent.js';
import type { ICliAdapter } from '../cli-adapters/index.js';
import type { Task as AgentTask } from '../core/types/agent.js';

// ============================================================================
// Mock adapter
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeMockAdapter(overrides: Partial<ICliAdapter> = {}) {
  return {
    name: 'claude' as const,
    execute: vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true as const,
        value: { text: 'response text', usage: { totalTokens: 100 } },
      })
    ),
    dispose: vi.fn().mockImplementation(() => Promise.resolve()),
    isAvailable: vi.fn().mockImplementation(() => Promise.resolve(true)),
    ...overrides,
  } as unknown as ICliAdapter;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeTask(overrides: Partial<AgentTask> = {}) {
  return {
    id: 'task-1',
    description: 'Implement feature',
    priority: 1,
    ...overrides,
  } as AgentTask;
}

// ============================================================================
// Constructor
// ============================================================================

describe('CliAdapterAgent - constructor', () => {
  it('creates agent with correct id', () => {
    const agent = new CliAdapterAgent('claude', makeMockAdapter());
    expect(agent.id).toBe('cli-claude');
  });

  it('sets role to worker', () => {
    const agent = new CliAdapterAgent('gemini', makeMockAdapter());
    expect(agent.role).toBe('worker');
  });

  it('sets state to idle', () => {
    const agent = new CliAdapterAgent('claude', makeMockAdapter());
    expect(agent.state).toBe('idle');
  });

  it('has expected capabilities', () => {
    const agent = new CliAdapterAgent('claude', makeMockAdapter());
    expect(agent.capabilities.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// execute
// ============================================================================

describe('CliAdapterAgent - execute', () => {
  it('executes task and returns result', async () => {
    const adapter = makeMockAdapter();
    const agent = new CliAdapterAgent('claude', adapter);
    const result = await agent.execute(makeTask());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.taskId).toBe('task-1');
      expect(result.value.output).toBe('response text');
      expect(result.value.metadata.tokensUsed).toBe(100);
      expect(result.value.metadata.model).toBe('claude');
    }
  });

  it('passes task description to adapter', async () => {
    const adapter = makeMockAdapter();
    const agent = new CliAdapterAgent('claude', adapter);
    await agent.execute(makeTask({ description: 'Build API' }));

    expect(adapter.execute).toHaveBeenCalledWith(expect.objectContaining({ content: 'Build API' }));
  });

  it('returns error on adapter failure', async () => {
    const adapter = makeMockAdapter({
      execute: vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: false as const,
          error: { message: 'API rate limit exceeded' },
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

  it('handles missing usage data', async () => {
    const adapter = makeMockAdapter({
      execute: vi.fn().mockImplementation(() =>
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
});

// ============================================================================
// handleMessage
// ============================================================================

describe('CliAdapterAgent - handleMessage', () => {
  it('returns completed response', async () => {
    const agent = new CliAdapterAgent('claude', makeMockAdapter());
    const result = await agent.handleMessage({ id: 'msg-1' } as never);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('completed');
    }
  });
});

// ============================================================================
// initialize
// ============================================================================

describe('CliAdapterAgent - initialize', () => {
  it('returns ok', async () => {
    const agent = new CliAdapterAgent('claude', makeMockAdapter());
    const result = await agent.initialize({} as never);
    expect(result.ok).toBe(true);
  });
});

// ============================================================================
// cleanup
// ============================================================================

describe('CliAdapterAgent - cleanup', () => {
  it('calls adapter dispose', async () => {
    const adapter = makeMockAdapter();
    const agent = new CliAdapterAgent('claude', adapter);
    await agent.cleanup();
    expect(adapter.dispose).toHaveBeenCalledTimes(1);
  });
});
