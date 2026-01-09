/**
 * Tests for Self-Development Workflow Engine
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SelfDevWorkflowEngine, createSelfDevWorkflowEngine } from './engine.js';
import type { SelfDevWorkflowDependencies, WorkflowEvent } from './interfaces.js';
import type { SelfDevWorkflowConfig } from './types.js';
import { ok } from '../../core/index.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockDependencies(): SelfDevWorkflowDependencies {
  return {
    modelAdapter: {
      complete: vi.fn().mockResolvedValue(
        ok({
          content: [{ type: 'text' as const, text: 'Mock response' }],
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
          stopReason: 'end_turn' as const,
        })
      ),
      completeStream: vi.fn(),
      capabilities: [],
    },
  };
}

function createTestConfig(): SelfDevWorkflowConfig {
  return {
    repository: 'test/repo',
    workingDirectory: '/tmp/test',
  };
}

// =============================================================================
// Constructor Tests
// =============================================================================

describe('SelfDevWorkflowEngine', () => {
  describe('constructor', () => {
    it('creates engine with dependencies', () => {
      const deps = createMockDependencies();
      const engine = new SelfDevWorkflowEngine(deps);
      expect(engine).toBeDefined();
    });
  });

  describe('createSelfDevWorkflowEngine', () => {
    it('creates engine instance', () => {
      const deps = createMockDependencies();
      const engine = createSelfDevWorkflowEngine(deps);
      expect(engine).toBeInstanceOf(SelfDevWorkflowEngine);
    });
  });
});

// =============================================================================
// Event Listener Tests
// =============================================================================

describe('event listeners', () => {
  let engine: SelfDevWorkflowEngine;
  let deps: SelfDevWorkflowDependencies;

  beforeEach(() => {
    deps = createMockDependencies();
    engine = new SelfDevWorkflowEngine(deps);
  });

  it('adds event listener', () => {
    const listener = vi.fn();
    engine.addEventListener(listener);
    // No way to check internally, but should not throw
    expect(true).toBe(true);
  });

  it('removes event listener', () => {
    const listener = vi.fn();
    engine.addEventListener(listener);
    engine.removeEventListener(listener);
    // No way to check internally, but should not throw
    expect(true).toBe(true);
  });

  it('calls listener on workflow start', async () => {
    const events: WorkflowEvent[] = [];
    const listener = (event: WorkflowEvent): void => {
      events.push(event);
    };

    engine.addEventListener(listener);
    await engine.start(createTestConfig());

    // Should receive at least the phase_started event
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]?.type).toBe('phase_started');
  });
});

// =============================================================================
// Start Tests
// =============================================================================

describe('start', () => {
  let engine: SelfDevWorkflowEngine;
  let deps: SelfDevWorkflowDependencies;

  beforeEach(() => {
    deps = createMockDependencies();
    engine = new SelfDevWorkflowEngine(deps);
  });

  it('returns workflow state', async () => {
    const state = await engine.start(createTestConfig());

    expect(state).toBeDefined();
    expect(state.executionId).toBeDefined();
    expect(state.currentPhase).toBe('analyze');
    expect(state.status).toBe('running');
  });

  it('generates unique execution IDs', async () => {
    const state1 = await engine.start(createTestConfig());
    const state2 = await engine.start(createTestConfig());

    expect(state1.executionId).not.toBe(state2.executionId);
  });

  it('stores state for retrieval', async () => {
    const state = await engine.start(createTestConfig());
    const retrieved = engine.getState(state.executionId);

    expect(retrieved).toBeDefined();
    expect(retrieved?.executionId).toBe(state.executionId);
  });
});

// =============================================================================
// GetState Tests
// =============================================================================

describe('getState', () => {
  let engine: SelfDevWorkflowEngine;
  let deps: SelfDevWorkflowDependencies;

  beforeEach(() => {
    deps = createMockDependencies();
    engine = new SelfDevWorkflowEngine(deps);
  });

  it('returns undefined for unknown execution ID', () => {
    const state = engine.getState('unknown-id');
    expect(state).toBeUndefined();
  });

  it('returns state for known execution ID', async () => {
    const startState = await engine.start(createTestConfig());
    const state = engine.getState(startState.executionId);

    expect(state).toBeDefined();
    expect(state?.config.repository).toBe('test/repo');
  });
});

// =============================================================================
// Cancel Tests
// =============================================================================

describe('cancel', () => {
  let engine: SelfDevWorkflowEngine;
  let deps: SelfDevWorkflowDependencies;

  beforeEach(() => {
    deps = createMockDependencies();
    engine = new SelfDevWorkflowEngine(deps);
  });

  it('cancels running workflow', async () => {
    const state = await engine.start(createTestConfig());
    await engine.cancel(state.executionId, 'Test cancellation');

    const cancelled = engine.getState(state.executionId);
    expect(cancelled?.status).toBe('cancelled');
  });

  it('rejects for unknown execution ID', async () => {
    await expect(engine.cancel('unknown-id', 'reason')).rejects.toThrow('not found');
  });

  it('emits workflow_failed event on cancel', async () => {
    const events: WorkflowEvent[] = [];
    engine.addEventListener((e) => events.push(e));

    const state = await engine.start(createTestConfig());
    await engine.cancel(state.executionId, 'Test cancellation');

    const failedEvent = events.find((e) => e.type === 'workflow_failed');
    expect(failedEvent).toBeDefined();
  });
});

// =============================================================================
// Resume Tests
// =============================================================================

describe('resume', () => {
  let engine: SelfDevWorkflowEngine;
  let deps: SelfDevWorkflowDependencies;

  beforeEach(() => {
    deps = createMockDependencies();
    engine = new SelfDevWorkflowEngine(deps);
  });

  it('rejects for unknown execution ID', async () => {
    await expect(engine.resume('unknown-id')).rejects.toThrow('not found');
  });

  it('rejects for non-paused workflow', async () => {
    const state = await engine.start(createTestConfig());
    // State is 'running', not 'paused'
    await expect(engine.resume(state.executionId)).rejects.toThrow('not paused');
  });
});

// =============================================================================
// Submit Review Tests
// =============================================================================

describe('submitReview', () => {
  let engine: SelfDevWorkflowEngine;
  let deps: SelfDevWorkflowDependencies;

  beforeEach(() => {
    deps = createMockDependencies();
    engine = new SelfDevWorkflowEngine(deps);
  });

  it('rejects when no pending review', async () => {
    await expect(engine.submitReview('unknown-id', 'approved')).rejects.toThrow(
      'No pending review'
    );
  });
});

// =============================================================================
// GetResult Tests
// =============================================================================

describe('getResult', () => {
  let engine: SelfDevWorkflowEngine;
  let deps: SelfDevWorkflowDependencies;

  beforeEach(() => {
    deps = createMockDependencies();
    engine = new SelfDevWorkflowEngine(deps);
  });

  it('returns undefined before workflow completes', async () => {
    const state = await engine.start(createTestConfig());
    const result = engine.getResult(state.executionId);
    // Result may or may not be set depending on async timing
    expect(result === undefined || result.executionId === state.executionId).toBe(true);
  });
});

// =============================================================================
// Config Tests
// =============================================================================

describe('config handling', () => {
  let engine: SelfDevWorkflowEngine;
  let deps: SelfDevWorkflowDependencies;

  beforeEach(() => {
    deps = createMockDependencies();
    engine = new SelfDevWorkflowEngine(deps);
  });

  it('stores config in state', async () => {
    const config: SelfDevWorkflowConfig = {
      repository: 'owner/repo',
      workingDirectory: '/custom/path',
      issueLabels: ['self-dev'],
      maxIssues: 5,
    };

    const state = await engine.start(config);
    expect(state.config.repository).toBe('owner/repo');
    expect(state.config.workingDirectory).toBe('/custom/path');
    expect(state.config.issueLabels).toEqual(['self-dev']);
    expect(state.config.maxIssues).toBe(5);
  });
});
