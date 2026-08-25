/**
 * State Manager Tests
 *
 * Tests for Puppeteer state management and transitions.
 *
 * @module agents/orchestration/state-manager.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StateManager, createStateManager } from './state-manager.js';
import type { Task } from '../../core/index.js';
import type { AgentStepOutput, PuppeteerState } from './puppeteer-types.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const createTestTask = (description = 'Test task description'): Task => ({
  id: 'test-task-1',
  description,
  context: {
    workingDirectory: '/test/dir',
    files: ['file1.ts', 'file2.ts'],
    metadata: { key: 'value' },
  },
  constraints: {
    maxDuration: 60000,
    maxTokens: 10000,
  },
  priority: 1,
});

const createTestOutput = (
  step: number,
  agentId: string,
  output: string = 'Test output'
): AgentStepOutput => ({
  step,
  agentId,
  output,
  durationMs: 100,
  tokensUsed: 50,
  model: 'test-model',
});

// =============================================================================
// Constructor Tests
// =============================================================================

describe('StateManager', () => {
  describe('constructor', () => {
    it('creates with default config', () => {
      const manager = new StateManager();
      expect(manager).toBeDefined();
    });

    it('creates with custom config', () => {
      const manager = new StateManager({
        maxContextTokens: 4000,
        compressionThreshold: 0.5,
      });
      expect(manager).toBeDefined();
    });
  });

  describe('createStateManager factory', () => {
    it('creates StateManager instance', () => {
      const manager = createStateManager();
      expect(manager).toBeInstanceOf(StateManager);
    });
  });
});

// =============================================================================
// Initial State Tests
// =============================================================================

describe('createInitialState', () => {
  let manager: StateManager;

  beforeEach(() => {
    manager = new StateManager();
  });

  it('creates initial state with correct step', () => {
    const task = createTestTask();
    const state = manager.createInitialState(task, 'session-1');

    expect(state.step).toBe(0);
  });

  it('includes task reference', () => {
    const task = createTestTask();
    const state = manager.createInitialState(task, 'session-1');

    expect(state.task).toBe(task);
  });

  it('starts with empty agent outputs', () => {
    const task = createTestTask();
    const state = manager.createInitialState(task, 'session-1');

    expect(state.agentOutputs).toHaveLength(0);
  });

  it('builds initial context from task', () => {
    const task = createTestTask('Implement feature X');
    const state = manager.createInitialState(task, 'session-1');

    expect(state.context).toContain('Task:');
    expect(state.context).toContain('Implement feature X');
  });

  it('includes working directory in context', () => {
    const task = createTestTask();
    const state = manager.createInitialState(task, 'session-1');

    expect(state.context).toContain('/test/dir');
  });

  it('includes files in context', () => {
    const task = createTestTask();
    const state = manager.createInitialState(task, 'session-1');

    expect(state.context).toContain('file1.ts');
    expect(state.context).toContain('file2.ts');
  });

  it('uses provided initial context', () => {
    const task = createTestTask();
    const state = manager.createInitialState(task, 'session-1', 'Custom initial context');

    expect(state.context).toBe('Custom initial context');
  });

  it('initializes metadata correctly', () => {
    const task = createTestTask();
    const state = manager.createInitialState(task, 'session-1');

    expect(state.metadata.progress).toBe(0);
    expect(state.metadata.totalCost).toBe(0);
    expect(state.metadata.totalTokens).toBe(0);
    expect(state.metadata.startedAt).toBeDefined();
  });

  it('sets session ID', () => {
    const task = createTestTask();
    const state = manager.createInitialState(task, 'my-session');

    expect(state.sessionId).toBe('my-session');
  });
});

// =============================================================================
// Update State Tests
// =============================================================================

describe('updateState', () => {
  let manager: StateManager;
  let initialState: PuppeteerState;

  beforeEach(() => {
    manager = new StateManager();
    initialState = manager.createInitialState(createTestTask(), 'session-1');
  });

  it('increments step number', () => {
    const output = createTestOutput(0, 'agent-1');
    const newState = manager.updateState(initialState, output);

    expect(newState.step).toBe(1);
  });

  it('appends agent output', () => {
    const output = createTestOutput(0, 'agent-1');
    const newState = manager.updateState(initialState, output);

    expect(newState.agentOutputs).toHaveLength(1);
    expect(newState.agentOutputs[0]).toBe(output);
  });

  it('accumulates multiple outputs', () => {
    const output1 = createTestOutput(0, 'agent-1');
    const state1 = manager.updateState(initialState, output1);

    const output2 = createTestOutput(1, 'agent-2');
    const state2 = manager.updateState(state1, output2);

    expect(state2.agentOutputs).toHaveLength(2);
  });

  it('updates total tokens', () => {
    const output = createTestOutput(0, 'agent-1');
    expect(output.tokensUsed).toBe(50);
    const newState = manager.updateState(initialState, output);

    expect(newState.metadata.totalTokens).toBe(50);
  });

  it('does not add an unmeasured step to the totals, and counts it (#4766)', () => {
    // `tokensUsed: 0` with `tokensMeasured: false` is a placeholder, not a
    // measurement. Summing it is arithmetically a no-op today, but the count
    // is what stops the totals reading as complete when they are a lower
    // bound.
    const output = { ...createTestOutput(0, 'agent-1'), tokensUsed: 0, tokensMeasured: false };

    const newState = manager.updateState(initialState, output);

    expect(newState.metadata.totalTokens).toBe(0);
    expect(newState.metadata.unmeasuredSteps).toBe(1);
  });

  it('does not count a measured step as unmeasured (#4766)', () => {
    // The pair: counting every step would make the disclosure meaningless.
    const newState = manager.updateState(initialState, createTestOutput(0, 'agent-1'));

    expect(newState.metadata.totalTokens).toBe(50);
    expect(newState.metadata.unmeasuredSteps).toBe(0);
  });

  it('updates total cost', () => {
    const output = createTestOutput(0, 'agent-1');
    const newState = manager.updateState(initialState, output);

    expect(newState.metadata.totalCost).toBeGreaterThan(0);
  });

  it('appends output to context', () => {
    const output = createTestOutput(0, 'agent-1', 'Agent produced output');
    const newState = manager.updateState(initialState, output);

    expect(newState.context).toContain('Agent produced output');
    expect(newState.context).toContain('agent-1');
  });

  it('preserves task reference', () => {
    const output = createTestOutput(0, 'agent-1');
    const newState = manager.updateState(initialState, output);

    expect(newState.task).toBe(initialState.task);
  });

  it('preserves session ID', () => {
    const output = createTestOutput(0, 'agent-1');
    const newState = manager.updateState(initialState, output);

    expect(newState.sessionId).toBe('session-1');
  });
});

// =============================================================================
// Context Extraction Tests
// =============================================================================

describe('extractAgentContext', () => {
  let manager: StateManager;

  beforeEach(() => {
    manager = new StateManager();
  });

  it('includes task description', () => {
    const state = manager.createInitialState(createTestTask('Build feature Y'), 'session-1');
    const context = manager.extractAgentContext(state, 'agent-1');

    expect(context).toContain('Build feature Y');
  });

  it('includes previous step outputs', () => {
    let state = manager.createInitialState(createTestTask(), 'session-1');
    state = manager.updateState(state, createTestOutput(0, 'agent-1', 'First output'));
    state = manager.updateState(state, createTestOutput(1, 'agent-2', 'Second output'));

    const context = manager.extractAgentContext(state, 'agent-3');

    expect(context).toContain('First output');
    expect(context).toContain('Second output');
  });
});

// =============================================================================
// State Compression Tests
// =============================================================================

describe('compressState', () => {
  let manager: StateManager;

  beforeEach(() => {
    manager = new StateManager({ maxContextTokens: 500, compressionThreshold: 0.5 });
  });

  it('compresses large context', () => {
    let state = manager.createInitialState(createTestTask(), 'session-1');

    // Add many outputs to exceed threshold
    for (let i = 0; i < 10; i++) {
      const longOutput = 'x'.repeat(500);
      state = manager.updateState(state, createTestOutput(i, `agent-${String(i)}`, longOutput));
    }

    const originalLength = state.context.length;
    const compressed = manager.compressState(state);

    // Compressed should be smaller or equal (when already compressed during updateState)
    expect(compressed.context.length).toBeLessThanOrEqual(originalLength);
  });

  it('preserves recent outputs in compressed context', () => {
    let state = manager.createInitialState(createTestTask(), 'session-1');

    for (let i = 0; i < 5; i++) {
      state = manager.updateState(
        state,
        createTestOutput(i, `agent-${String(i)}`, `Output ${String(i)}`)
      );
    }

    const compressed = manager.compressState(state);

    // Recent outputs should still be present
    expect(compressed.context).toContain('Output 4');
  });
});

// =============================================================================
// Progress Estimation Tests
// =============================================================================

describe('estimateProgress', () => {
  let manager: StateManager;

  beforeEach(() => {
    manager = new StateManager();
  });

  it('returns 0 for empty state', () => {
    const state = manager.createInitialState(createTestTask(), 'session-1');
    const progress = manager.estimateProgress(state);

    expect(progress).toBe(0);
  });

  it('increases with more steps', () => {
    let state = manager.createInitialState(createTestTask(), 'session-1');
    const progress0 = manager.estimateProgress(state);

    state = manager.updateState(state, createTestOutput(0, 'agent-1'));
    const progress1 = manager.estimateProgress(state);

    state = manager.updateState(state, createTestOutput(1, 'agent-2'));
    const progress2 = manager.estimateProgress(state);

    expect(progress1).toBeGreaterThan(progress0);
    expect(progress2).toBeGreaterThan(progress1);
  });

  it('boosts progress for completion indicators', () => {
    let state = manager.createInitialState(createTestTask(), 'session-1');
    state = manager.updateState(state, createTestOutput(0, 'agent-1', 'Working on task'));
    const progress1 = manager.estimateProgress(state);

    state = manager.updateState(
      state,
      createTestOutput(1, 'agent-2', 'Task complete and verified')
    );
    const progress2 = manager.estimateProgress(state);

    expect(progress2).toBeGreaterThan(progress1);
  });

  it('caps progress at 1.0', () => {
    let state = manager.createInitialState(createTestTask(), 'session-1');

    for (let i = 0; i < 20; i++) {
      state = manager.updateState(state, createTestOutput(i, `agent-${String(i)}`, 'Complete'));
    }

    const progress = manager.estimateProgress(state);

    expect(progress).toBeLessThanOrEqual(1);
  });
});

// =============================================================================
// Token Estimation Tests
// =============================================================================

describe('estimateTokens', () => {
  let manager: StateManager;

  beforeEach(() => {
    manager = new StateManager();
  });

  it('estimates tokens from text length', () => {
    const text = 'a'.repeat(100);
    const tokens = manager.estimateTokens(text);

    expect(tokens).toBe(25); // 100 / 4 = 25
  });

  it('rounds up partial tokens', () => {
    const text = 'a'.repeat(101);
    const tokens = manager.estimateTokens(text);

    expect(tokens).toBe(26); // ceil(101 / 4) = 26
  });

  it('returns 0 for empty text', () => {
    const tokens = manager.estimateTokens('');

    expect(tokens).toBe(0);
  });
});

// =============================================================================
// Relevance Computation Tests (Issue #457)
// =============================================================================

describe('relevance computation', () => {
  let manager: StateManager;

  beforeEach(() => {
    manager = new StateManager();
  });

  it('includes outputs with high keyword overlap', () => {
    // Task about implementing authentication
    const task = createTestTask('Implement user authentication system with login and password');
    let state = manager.createInitialState(task, 'session-1');

    // Output with relevant keywords
    state = manager.updateState(
      state,
      createTestOutput(0, 'code-expert', 'Created authentication module with login function')
    );
    // Output with irrelevant keywords
    state = manager.updateState(
      state,
      createTestOutput(1, 'code-expert', 'Refactored database connection pooling')
    );

    const context = manager.extractAgentContext(state, 'test-agent');

    // Relevant output should be included
    expect(context).toContain('authentication module');
  });

  it('prioritizes outputs from same agent type', () => {
    const task = createTestTask('Write tests for API endpoint');
    let state = manager.createInitialState(task, 'session-1');

    // Add output from code-expert
    state = manager.updateState(
      state,
      createTestOutput(0, 'code-expert-1', 'Created API endpoint tests')
    );

    // Get context for another code-expert
    const context = manager.extractAgentContext(state, 'code-expert-2');

    // Should include output from same agent type
    expect(context).toContain('API endpoint tests');
  });

  it('includes recent outputs due to recency weighting', () => {
    const task = createTestTask('Complete task X');
    let state = manager.createInitialState(task, 'session-1');

    // Add several outputs
    for (let i = 0; i < 5; i++) {
      state = manager.updateState(
        state,
        createTestOutput(i, `agent-${String(i)}`, `Step ${String(i)} output`)
      );
    }

    const context = manager.extractAgentContext(state, 'test-agent');

    // Recent output should be included
    expect(context).toContain('Step 4 output');
  });

  it('filters outputs with low relevance', () => {
    // Task about implementing feature X
    const task = createTestTask('Implement feature X');
    let state = manager.createInitialState(task, 'session-1');

    // Add many unrelated outputs to push down relevance threshold
    for (let i = 0; i < 10; i++) {
      state = manager.updateState(
        state,
        createTestOutput(
          i,
          `misc-${String(i)}`,
          'Completely unrelated content about something else entirely different'
        )
      );
    }

    const context = manager.extractAgentContext(state, 'test-agent');

    // Task description should still be present
    expect(context).toContain('feature X');
  });

  it('handles empty outputs gracefully', () => {
    const task = createTestTask('Test task');
    const state = manager.createInitialState(task, 'session-1');

    const context = manager.extractAgentContext(state, 'test-agent');

    // Should not throw and should contain task
    expect(context).toContain('Test task');
    expect(context).toContain('Previous Steps');
  });
});
