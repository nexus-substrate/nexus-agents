/**
 * Tests for BaseAgent Context Builders
 *
 * @module agents/base-agent-context-builders.test
 */

import { describe, it, expect, vi } from 'vitest';
import {
  buildInitializationContext,
  buildMessageHandlerContext,
  buildCompleteFlowContext,
  buildExecuteFlowContext,
  buildTaskMemoryContext,
} from './base-agent-context-builders.js';
import type { AgentContextState } from './base-agent-context-builders.js';
import { MemoryPersistenceMode } from './base-agent-memory-init.js';

// ============================================================================
// Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeAgentState(overrides: Partial<AgentContextState> = {}) {
  return {
    id: 'agent-1',
    role: 'executor',
    capabilities: ['code_generation'],
    initialized: true,
    historyLength: 5,
    adapter: { providerId: 'test' },
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    stateMachine: { state: 'idle' },
    budgetTracker: { getRemainingBudget: vi.fn() },
    eventBus: { emit: vi.fn() },
    memoryEnabled: true,
    memoryBackend: { get: vi.fn() },
    typedMemory: { query: vi.fn() },
    memoryConfig: {
      autoLoadOnInit: true,
      maxInitialLoadEntries: 100,
      persistenceMode: MemoryPersistenceMode.MANUAL,
    },
    memoryState: { agentId: 'agent-1', taskLearnings: [] },
    contextPruningEnabled: true,
    contextPruner: { prune: vi.fn() },
    pruningConfig: { enabled: true, maxTokens: 100_000 },
    pruningMetrics: { totalPruned: 0 },
    ...overrides,
  } as unknown as AgentContextState;
}

// ============================================================================
// buildInitializationContext
// ============================================================================

describe('buildInitializationContext', () => {
  it('maps agent state to initialization context', () => {
    const state = makeAgentState();
    const ctx = buildInitializationContext(state);

    expect(ctx.agentId).toBe('agent-1');
    expect(ctx.role).toBe('executor');
    expect(ctx.initialized).toBe(true);
    expect(ctx.memoryEnabled).toBe(true);
    expect(ctx.autoLoadOnInit).toBe(true);
    expect(ctx.maxInitialLoadEntries).toBe(100);
  });

  it('forwards undefined memory backend', () => {
    const state = makeAgentState({ memoryBackend: undefined });
    const ctx = buildInitializationContext(state);

    expect(ctx.memoryBackend).toBeUndefined();
  });

  it('forwards undefined typed memory', () => {
    const state = makeAgentState({ typedMemory: undefined });
    const ctx = buildInitializationContext(state);

    expect(ctx.typedMemory).toBeUndefined();
  });
});

// ============================================================================
// buildMessageHandlerContext
// ============================================================================

describe('buildMessageHandlerContext', () => {
  it('maps agent state to message handler context', () => {
    const state = makeAgentState();
    const ctx = buildMessageHandlerContext(state);

    expect(ctx.id).toBe('agent-1');
    expect(ctx.role).toBe('executor');
    expect(ctx.state).toBe('idle');
    expect(ctx.capabilities).toEqual(['code_generation']);
    expect(ctx.initialized).toBe(true);
    expect(ctx.historyLength).toBe(5);
  });

  it('reflects state machine state', () => {
    const state = makeAgentState();
    (state.stateMachine as unknown as { state: string }).state = 'executing';
    const ctx = buildMessageHandlerContext(state);

    expect(ctx.state).toBe('executing');
  });
});

// ============================================================================
// buildCompleteFlowContext
// ============================================================================

describe('buildCompleteFlowContext', () => {
  it('maps agent state to complete flow context', () => {
    const state = makeAgentState();
    const ctx = buildCompleteFlowContext(state);

    expect(ctx.agentId).toBe('agent-1');
    expect(ctx.adapter).toBeDefined();
    expect(ctx.contextPruningEnabled).toBe(true);
    expect(ctx.contextPruner).toBeDefined();
  });

  it('includes budgetTracker and eventBus', () => {
    const state = makeAgentState();
    const ctx = buildCompleteFlowContext(state);

    expect(ctx.budgetTracker).toBe(state.budgetTracker);
    expect(ctx.eventBus).toBe(state.eventBus);
  });

  it('handles undefined adapter', () => {
    const state = makeAgentState({ adapter: undefined });
    const ctx = buildCompleteFlowContext(state);

    expect(ctx.adapter).toBeUndefined();
  });

  it('handles disabled pruning', () => {
    const state = makeAgentState({
      contextPruningEnabled: false,
      contextPruner: undefined,
    });
    const ctx = buildCompleteFlowContext(state);

    expect(ctx.contextPruningEnabled).toBe(false);
    expect(ctx.contextPruner).toBeUndefined();
  });
});

// ============================================================================
// buildExecuteFlowContext
// ============================================================================

describe('buildExecuteFlowContext', () => {
  it('maps agent state to execute flow context', () => {
    const state = makeAgentState();
    const ctx = buildExecuteFlowContext(state);

    expect(ctx.agentId).toBe('agent-1');
    expect(ctx.stateMachine).toBe(state.stateMachine);
    expect(ctx.budgetTracker).toBe(state.budgetTracker);
    expect(ctx.logger).toBe(state.logger);
    expect(ctx.memoryEnabled).toBe(true);
  });

  it('forwards null memory state', () => {
    const state = makeAgentState({ memoryState: null });
    const ctx = buildExecuteFlowContext(state);

    expect(ctx.memoryState).toBeNull();
  });
});

// ============================================================================
// buildTaskMemoryContext
// ============================================================================

describe('buildTaskMemoryContext', () => {
  it('maps agent state to task memory context', () => {
    const state = makeAgentState();
    const ctx = buildTaskMemoryContext(state);

    expect(ctx.memoryEnabled).toBe(true);
    expect(ctx.memoryBackend).toBeDefined();
    expect(ctx.memoryState).toBeDefined();
    expect(ctx.persistenceMode).toBe(MemoryPersistenceMode.MANUAL);
  });

  it('handles disabled memory', () => {
    const state = makeAgentState({
      memoryEnabled: false,
      memoryBackend: undefined,
      memoryState: null,
    });
    const ctx = buildTaskMemoryContext(state);

    expect(ctx.memoryEnabled).toBe(false);
    expect(ctx.memoryBackend).toBeUndefined();
    expect(ctx.memoryState).toBeNull();
  });
});
