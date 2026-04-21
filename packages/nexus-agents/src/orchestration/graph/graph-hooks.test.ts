/**
 * Tests for graph workflow hooks — preconditions and post-step verification.
 *
 * (Source: Issue #994 — Post-step verification, Issue #997 — Pre-condition hooks)
 */

import { describe, it, expect, vi } from 'vitest';
import { GraphBuilder, overwrite, START, END } from './graph-builder.js';
import { executeGraph } from './graph-executor.js';
import { runPreconditions, runVerification, createStateGuard } from './graph-hooks.js';
import type { GraphEvent, NodeHookContext, HookError, PreconditionConfig } from './graph-types.js';
import type { Result } from '../../core/index.js';
import { ok, err } from '../../core/index.js';

// ============================================================================
// Helper factories
// ============================================================================

function passingHook(name = 'pass'): PreconditionConfig {
  return {
    name,
    required: true,
    hook: () => Promise.resolve(ok(undefined)),
  };
}

function failingHook(name = 'fail', message = 'hook failed'): PreconditionConfig {
  return {
    name,
    required: true,
    hook: (ctx: NodeHookContext) =>
      Promise.resolve(err({ hookName: name, nodeId: ctx.nodeId, message })),
  };
}

function optionalFailingHook(name = 'optional-fail'): PreconditionConfig {
  return {
    name,
    required: false,
    hook: (ctx: NodeHookContext) =>
      Promise.resolve(err({ hookName: name, nodeId: ctx.nodeId, message: 'optional failed' })),
  };
}

function passingVerify() {
  return () => Promise.resolve(ok(undefined));
}

function failingVerify(message = 'verification failed') {
  return (ctx: NodeHookContext) =>
    Promise.resolve(err({ hookName: 'verify', nodeId: ctx.nodeId, message }));
}

// ============================================================================
// Precondition Tests
// ============================================================================

describe('preconditions', () => {
  describe('runPreconditions', () => {
    it('returns passed=true when no preconditions configured', async () => {
      const node = { id: 'A', handler: () => Promise.resolve({}) };
      const result = await runPreconditions(node, {}, 0);
      expect(result.passed).toBe(true);
      expect(result.results).toHaveLength(0);
    });

    it('returns passed=true when all preconditions pass', async () => {
      const node = {
        id: 'A',
        handler: () => Promise.resolve({}),
        preconditions: [passingHook('check-1'), passingHook('check-2')],
      };
      const result = await runPreconditions(node, {}, 0);
      expect(result.passed).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results.every((r) => r.passed)).toBe(true);
    });

    it('returns passed=false when required precondition fails', async () => {
      const node = {
        id: 'A',
        handler: () => Promise.resolve({}),
        preconditions: [passingHook(), failingHook('budget-check', 'insufficient funds')],
      };
      const result = await runPreconditions(node, {}, 0);
      expect(result.passed).toBe(false);
      const failed = result.results.find((r) => !r.passed);
      expect(failed?.name).toBe('budget-check');
      expect(failed?.error).toContain('insufficient funds');
    });

    it('stops on first required failure (short-circuit)', async () => {
      const thirdHook = vi.fn(() => Promise.resolve(ok(undefined)));
      const node = {
        id: 'A',
        handler: () => Promise.resolve({}),
        preconditions: [
          passingHook(),
          failingHook('blocker'),
          { name: 'never-reached', required: true, hook: thirdHook },
        ],
      };
      await runPreconditions(node, {}, 0);
      expect(thirdHook).not.toHaveBeenCalled();
    });

    it('continues past optional precondition failures', async () => {
      const node = {
        id: 'A',
        handler: () => Promise.resolve({}),
        preconditions: [optionalFailingHook(), passingHook('after-optional')],
      };
      const result = await runPreconditions(node, {}, 0);
      expect(result.passed).toBe(true);
      expect(result.results).toHaveLength(2);
      const first = result.results[0];
      const second = result.results[1];
      expect(first).toBeDefined();
      expect(second).toBeDefined();
      expect(first?.passed).toBe(false);
      expect(second?.passed).toBe(true);
    });

    it('handles hooks that throw exceptions', async () => {
      const node = {
        id: 'A',
        handler: () => Promise.resolve({}),
        preconditions: [
          {
            name: 'throws',
            required: true,
            hook: () => Promise.reject(new Error('unexpected')),
          },
        ],
      };
      const result = await runPreconditions(node, {}, 0);
      expect(result.passed).toBe(false);
      const first = result.results[0];
      expect(first).toBeDefined();
      expect(first?.error).toContain('unexpected');
    });

    it('passes state and nodeId to hook context', async () => {
      const hookFn = vi.fn(() => Promise.resolve(ok(undefined)));
      const node = {
        id: 'my-node',
        handler: () => Promise.resolve({}),
        preconditions: [{ name: 'spy', required: true, hook: hookFn }],
      };
      await runPreconditions(node, { budget: 1000 }, 5);
      expect(hookFn).toHaveBeenCalledWith({
        nodeId: 'my-node',
        state: { budget: 1000 },
        stepNumber: 5,
      });
    });
  });

  describe('integrated with executeGraph', () => {
    it('skips node when required precondition fails', async () => {
      const graph = new GraphBuilder()
        .addState('value', overwrite(0))
        .addNode('A', () => Promise.resolve({ value: 42 }), {
          preconditions: [failingHook('guard', 'not ready')],
        })
        .addEdge(START, 'A')
        .addEdge('A', END)
        .compile();

      expect(graph.ok).toBe(true);
      if (!graph.ok) return;

      const result = await executeGraph(graph.value, {});
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Node skipped — state unchanged
      expect(result.value.finalState['value']).toBe(0);
      const nodeResult = result.value.nodeResults.find((r) => r.nodeId === 'A');
      expect(nodeResult?.status).toBe('skipped');
    });

    it('executes node when all preconditions pass', async () => {
      const graph = new GraphBuilder()
        .addState('value', overwrite(0))
        .addNode('A', () => Promise.resolve({ value: 42 }), {
          preconditions: [passingHook('check-1'), passingHook('check-2')],
        })
        .addEdge(START, 'A')
        .addEdge('A', END)
        .compile();

      expect(graph.ok).toBe(true);
      if (!graph.ok) return;

      const result = await executeGraph(graph.value, {});
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.finalState['value']).toBe(42);
    });
  });
});

// ============================================================================
// Verification Tests
// ============================================================================

describe('verification', () => {
  describe('runVerification', () => {
    it('returns passed=true when no verify hook configured', async () => {
      const node = { id: 'A', handler: () => Promise.resolve({}) };
      const result = await runVerification(node, {}, 0);
      expect(result.passed).toBe(true);
    });

    it('returns passed=true when verify hook passes', async () => {
      const node = {
        id: 'A',
        handler: () => Promise.resolve({}),
        verify: passingVerify(),
      };
      const result = await runVerification(node, {}, 0);
      expect(result.passed).toBe(true);
    });

    it('returns passed=false when verify hook fails', async () => {
      const node = {
        id: 'A',
        handler: () => Promise.resolve({}),
        verify: failingVerify('state mismatch'),
      };
      const result = await runVerification(node, {}, 0);
      expect(result.passed).toBe(false);
      expect(result.error).toContain('state mismatch');
    });

    it('handles verify hooks that throw', async () => {
      const node = {
        id: 'A',
        handler: () => Promise.resolve({}),
        verify: () => Promise.reject(new Error('boom')),
      };
      const result = await runVerification(node, {}, 0);
      expect(result.passed).toBe(false);
      expect(result.error).toContain('boom');
    });
  });

  describe('integrated with executeGraph', () => {
    it('fails node when verification fails', async () => {
      const graph = new GraphBuilder()
        .addState('value', overwrite(0))
        .addNode('A', () => Promise.resolve({ value: 42 }), {
          verify: failingVerify('integrity check failed'),
        })
        .addEdge(START, 'A')
        .addEdge('A', END)
        .compile();

      expect(graph.ok).toBe(true);
      if (!graph.ok) return;

      const result = await executeGraph(graph.value, {});
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Verification failed — state updates discarded
      expect(result.value.finalState['value']).toBe(0);
      const nodeResult = result.value.nodeResults.find((r) => r.nodeId === 'A');
      expect(nodeResult?.status).toBe('failed');
      expect(nodeResult?.error).toContain('Verification failed');
    });

    it('succeeds when verification passes', async () => {
      const graph = new GraphBuilder()
        .addState('value', overwrite(0))
        .addNode('A', () => Promise.resolve({ value: 42 }), {
          verify: passingVerify(),
        })
        .addEdge(START, 'A')
        .addEdge('A', END)
        .compile();

      expect(graph.ok).toBe(true);
      if (!graph.ok) return;

      const result = await executeGraph(graph.value, {});
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.finalState['value']).toBe(42);
    });
  });
});

// ============================================================================
// Event Emission Tests
// ============================================================================

describe('hook events', () => {
  it('emits hook_started and hook_completed for preconditions', async () => {
    const events: GraphEvent[] = [];

    const graph = new GraphBuilder()
      .addState('value', overwrite(0))
      .addNode('A', () => Promise.resolve({ value: 1 }), {
        preconditions: [passingHook('budget-check')],
      })
      .addEdge(START, 'A')
      .addEdge('A', END)
      .compile();

    expect(graph.ok).toBe(true);
    if (!graph.ok) return;

    await executeGraph(graph.value, {}, { onEvent: (e) => events.push(e) });

    const hookStarted = events.filter((e) => e.type === 'hook_started');
    const hookCompleted = events.filter((e) => e.type === 'hook_completed');
    expect(hookStarted.length).toBeGreaterThanOrEqual(1);
    expect(hookCompleted.length).toBeGreaterThanOrEqual(1);

    const started = hookStarted[0];
    expect(started).toBeDefined();
    if (started?.type === 'hook_started') {
      expect(started.hookName).toBe('budget-check');
      expect(started.hookPhase).toBe('precondition');
    }
  });

  it('emits hook_failed when precondition fails', async () => {
    const events: GraphEvent[] = [];

    const graph = new GraphBuilder()
      .addState('value', overwrite(0))
      .addNode('A', () => Promise.resolve({ value: 1 }), {
        preconditions: [failingHook('guard', 'blocked')],
      })
      .addEdge(START, 'A')
      .addEdge('A', END)
      .compile();

    expect(graph.ok).toBe(true);
    if (!graph.ok) return;

    await executeGraph(graph.value, {}, { onEvent: (e) => events.push(e) });

    const hookFailed = events.filter((e) => e.type === 'hook_failed');
    expect(hookFailed.length).toBeGreaterThanOrEqual(1);

    const failed = hookFailed[0];
    expect(failed).toBeDefined();
    if (failed?.type === 'hook_failed') {
      expect(failed.hookName).toBe('guard');
      expect(failed.hookPhase).toBe('precondition');
      expect(failed.error).toContain('blocked');
    }
  });

  it('emits hook events for verification', async () => {
    const events: GraphEvent[] = [];

    const graph = new GraphBuilder()
      .addState('value', overwrite(0))
      .addNode('A', () => Promise.resolve({ value: 1 }), {
        verify: passingVerify(),
      })
      .addEdge(START, 'A')
      .addEdge('A', END)
      .compile();

    expect(graph.ok).toBe(true);
    if (!graph.ok) return;

    await executeGraph(graph.value, {}, { onEvent: (e) => events.push(e) });

    const hookEvents = events.filter(
      (e) => e.type === 'hook_started' || e.type === 'hook_completed'
    );
    const verifyEvents = hookEvents.filter(
      (e) => (e.type === 'hook_started' || e.type === 'hook_completed') && e.hookPhase === 'verify'
    );
    expect(verifyEvents.length).toBeGreaterThanOrEqual(2); // started + completed
  });
});

// ============================================================================
// Built-in Hook Tests
// ============================================================================

describe('createStateGuard', () => {
  it('creates a precondition that passes when predicate is true', async () => {
    const guard = createStateGuard(
      'has-budget',
      (state) => (state['budget'] as number) > 0,
      'No budget remaining'
    );

    const result = await guard.hook({
      nodeId: 'A',
      state: { budget: 1000 },
      stepNumber: 0,
    });
    expect(result.ok).toBe(true);
  });

  it('creates a precondition that fails when predicate is false', async () => {
    const guard = createStateGuard(
      'has-budget',
      (state) => (state['budget'] as number) > 0,
      'No budget remaining'
    );

    const result = await guard.hook({
      nodeId: 'A',
      state: { budget: 0 },
      stepNumber: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('No budget remaining');
      expect(result.error.hookName).toBe('has-budget');
    }
  });

  it('integrates with executeGraph as precondition', async () => {
    const budgetGuard = createStateGuard(
      'budget-guard',
      (state) => (state['budget'] as number) > 100,
      'Budget too low'
    );

    const graph = new GraphBuilder()
      .addState('budget', overwrite(50))
      .addState('built', overwrite(false))
      .addNode('build', () => Promise.resolve({ built: true }), {
        preconditions: [budgetGuard],
      })
      .addEdge(START, 'build')
      .addEdge('build', END)
      .compile();

    expect(graph.ok).toBe(true);
    if (!graph.ok) return;

    const result = await executeGraph(graph.value, {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Budget too low → node skipped → built stays false
    expect(result.value.finalState['built']).toBe(false);
  });
});

// ============================================================================
// Combined Precondition + Verification Tests
// ============================================================================

describe('combined hooks', () => {
  it('runs both preconditions and verification on a single node', async () => {
    const hookLog: string[] = [];

    const precondition: PreconditionConfig = {
      name: 'pre-check',
      required: true,
      hook: () => {
        hookLog.push('precondition');
        return Promise.resolve(ok(undefined));
      },
    };

    const verify = (): Promise<Result<void, HookError>> => {
      hookLog.push('verify');
      return Promise.resolve(ok(undefined));
    };

    const graph = new GraphBuilder()
      .addState('value', overwrite(0))
      .addNode('A', () => Promise.resolve({ value: 1 }), {
        preconditions: [precondition],
        verify,
      })
      .addEdge(START, 'A')
      .addEdge('A', END)
      .compile();

    expect(graph.ok).toBe(true);
    if (!graph.ok) return;

    const result = await executeGraph(graph.value, {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Both hooks ran in order
    expect(hookLog).toEqual(['precondition', 'verify']);
    expect(result.value.finalState['value']).toBe(1);
  });

  it('skips verification when precondition fails', async () => {
    const verifyFn = vi.fn(passingVerify());

    const graph = new GraphBuilder()
      .addState('value', overwrite(0))
      .addNode('A', () => Promise.resolve({ value: 1 }), {
        preconditions: [failingHook('blocker')],
        verify: verifyFn,
      })
      .addEdge(START, 'A')
      .addEdge('A', END)
      .compile();

    expect(graph.ok).toBe(true);
    if (!graph.ok) return;

    await executeGraph(graph.value, {});

    // Verification should not have been called
    expect(verifyFn).not.toHaveBeenCalled();
  });

  it('shared preconditions work across multiple nodes', async () => {
    const budgetGuard = createStateGuard(
      'budget-guard',
      (state) => (state['budget'] as number) > 100,
      'Budget too low'
    );

    const graph = new GraphBuilder()
      .addState('budget', overwrite(200))
      .addState('a_done', overwrite(false))
      .addState('b_done', overwrite(false))
      .addNode('A', () => Promise.resolve({ a_done: true }), {
        preconditions: [budgetGuard],
      })
      .addNode('B', () => Promise.resolve({ b_done: true }), {
        preconditions: [budgetGuard],
      })
      .addEdge(START, 'A')
      .addEdge(START, 'B')
      .addEdge('A', END)
      .addEdge('B', END)
      .compile();

    expect(graph.ok).toBe(true);
    if (!graph.ok) return;

    const result = await executeGraph(graph.value, {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Both nodes pass precondition (budget=200 > 100)
    expect(result.value.finalState['a_done']).toBe(true);
    expect(result.value.finalState['b_done']).toBe(true);
  });
});
