/**
 * Tests for orchestrator-adapters: OrchestratorAdapter, PuppeteerAdapter, WorkflowAdapter.
 *
 * Covers: execute (happy path, wrong definition, no engine wired, engine error),
 * getStatus, cancel, getHistory, and adapter identity properties.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

import { ok, err } from '../core/result.js';
import { OrchestratorError } from '../core/types/orchestrator.js';
import type { OrchestratorDefinition } from '../core/types/orchestrator.js';
import type { Task } from '../core/types/index.js';

import { OrchestratorAdapter, PuppeteerAdapter, WorkflowAdapter } from './orchestrator-adapters.js';

// ============================================================================
// Mock external modules
// ============================================================================

vi.mock('../core/index.js', () => ({
  getTimeProvider: () => ({
    now: () => 1000,
    nowIso: () => '2026-01-01T00:00:00.000Z',
  }),
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../utils/id-utils.js', () => {
  let counter = 0;
  return {
    generateHyphenId: (prefix: string, _len: number) => `${prefix}-mock-${String(++counter)}`,
  };
});

// ============================================================================
// Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    setLevel: vi.fn(),
    getLevel: vi.fn(),
    setFormat: vi.fn(),
    setDestination: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeTask(id = 'task-1', description = 'Test task') {
  return {
    id,
    description,
    context: { projectRoot: '/tmp', codebaseInfo: {} },
  } as Task;
}

function makeTaskDef(task?: Task): OrchestratorDefinition {
  return { type: 'task', task: task ?? makeTask() };
}

function makePolicyDef(
  policyId = 'policy-1',
  initialState: Record<string, unknown> = {}
): OrchestratorDefinition {
  return { type: 'policy', policyId, initialState };
}

function makeWorkflowDef(templatePath = 'templates/code-review'): OrchestratorDefinition {
  return { type: 'workflow', templatePath };
}

// ============================================================================
// OrchestratorAdapter
// ============================================================================

describe('OrchestratorAdapter', () => {
  let adapter: OrchestratorAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new OrchestratorAdapter(makeMockLogger());
  });

  it('has type tech_lead and a generated id', () => {
    expect(adapter.type).toBe('tech_lead');
    expect(adapter.id).toContain('orchestrator');
  });

  it('has canonical class name OrchestratorAdapter', () => {
    expect(OrchestratorAdapter.name).toBe('OrchestratorAdapter');
  });

  it('returns ok with empty output when no orchestrator agent is wired', async () => {
    const result = await adapter.execute(makeTaskDef(), {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.orchestratorType).toBe('tech_lead');
    expect(result.value.output).toEqual({});
    expect(result.value.steps).toHaveLength(1);
  });

  it('returns error for non-task definitions', async () => {
    const result = await adapter.execute(makePolicyDef(), {});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(OrchestratorError);
    expect(result.error.code).toBe('INVALID_DEFINITION');
  });

  it('delegates to wired orchestrator agent on success', async () => {
    const mockTl = { execute: vi.fn(() => Promise.resolve(ok({ answer: 42 }))) };
    adapter.setOrchestrator(mockTl);

    const result = await adapter.execute(makeTaskDef(), {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.output).toEqual({ answer: 42 });
    expect(mockTl.execute).toHaveBeenCalledTimes(1);
  });

  it('returns AGENT_ERROR when orchestrator execution fails with Error', async () => {
    const mockTl = {
      execute: vi.fn(() => Promise.resolve(err(new Error('boom')))),
    };
    adapter.setOrchestrator(mockTl);

    const result = await adapter.execute(makeTaskDef(), {});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('AGENT_ERROR');
    expect(result.error.message).toContain('boom');
  });

  it('returns AGENT_ERROR when orchestrator fails with non-Error', async () => {
    const mockTl = {
      execute: vi.fn(() => Promise.resolve(err('string-error'))),
    };
    adapter.setOrchestrator(mockTl);

    const result = await adapter.execute(makeTaskDef(), {});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('AGENT_ERROR');
    expect(result.error.message).toContain('string-error');
  });

  it('records execution in history', async () => {
    expect(adapter.getHistory()).toHaveLength(0);
    await adapter.execute(makeTaskDef(), {});
    expect(adapter.getHistory()).toHaveLength(1);
  });

  it('getHistory respects limit', async () => {
    await adapter.execute(makeTaskDef(), {});
    await adapter.execute(makeTaskDef(), {});
    await adapter.execute(makeTaskDef(), {});
    expect(adapter.getHistory(2)).toHaveLength(2);
  });

  it('getStatus returns pending for unknown execution', () => {
    expect(adapter.getStatus('unknown-id')).toEqual({ state: 'pending' });
  });

  it('cancel returns error for unknown execution', async () => {
    const result = await adapter.cancel('no-such-id');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('CANCELLED');
  });

  it('cancel marks a known execution as cancelled', async () => {
    // Execute to create an execution entry
    const execResult = await adapter.execute(makeTaskDef(), {});
    expect(execResult.ok).toBe(true);
    if (!execResult.ok) return;

    const execId = execResult.value.executionId;
    const cancelResult = await adapter.cancel(execId);
    expect(cancelResult.ok).toBe(true);

    const status = adapter.getStatus(execId);
    expect(status.state).toBe('cancelled');
  });
});

// ============================================================================
// PuppeteerAdapter
// ============================================================================

describe('PuppeteerAdapter', () => {
  let adapter: PuppeteerAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new PuppeteerAdapter();
  });

  it('has type puppeteer and a generated id', () => {
    expect(adapter.type).toBe('puppeteer');
    expect(adapter.id).toContain('puppeteer');
  });

  it('returns error for non-policy definitions', async () => {
    const result = await adapter.execute(makeTaskDef(), {});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_DEFINITION');
  });

  it('merges inputs and initialState when no puppeteer wired', async () => {
    const def = makePolicyDef('p1', { stateKey: 'stateVal' });
    const result = await adapter.execute(def, { inputKey: 'inputVal' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.output).toEqual({ inputKey: 'inputVal', stateKey: 'stateVal' });
    expect(result.value.steps[0]!.action).toBe('Policy: p1');
  });

  it('delegates to wired puppeteer on success', async () => {
    const mockPp = {
      execute: vi.fn(() => Promise.resolve(ok({ puppet: 'result' }))),
    };
    adapter.setPuppeteer(mockPp);

    const result = await adapter.execute(makePolicyDef(), {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.output).toEqual({ puppet: 'result' });
  });

  it('returns empty object when puppeteer execution fails', async () => {
    const mockPp = {
      execute: vi.fn(() => Promise.resolve(err(new Error('fail')))),
    };
    adapter.setPuppeteer(mockPp);

    const result = await adapter.execute(makePolicyDef(), {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.output).toEqual({});
  });

  it('getStatus returns pending for unknown id', () => {
    expect(adapter.getStatus('nope')).toEqual({ state: 'pending' });
  });

  it('cancel returns error for unknown execution', async () => {
    const result = await adapter.cancel('missing');
    expect(result.ok).toBe(false);
  });

  it('getHistory returns empty initially', () => {
    expect(adapter.getHistory()).toEqual([]);
  });
});

// ============================================================================
// WorkflowAdapter
// ============================================================================

describe('WorkflowAdapter', () => {
  let adapter: WorkflowAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new WorkflowAdapter();
  });

  it('has type workflow and a generated id', () => {
    expect(adapter.type).toBe('workflow');
    expect(adapter.id).toContain('workflow');
  });

  it('returns error for non-workflow definitions', async () => {
    const result = await adapter.execute(makePolicyDef(), {});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_DEFINITION');
  });

  it('passes through inputs when no engine wired', async () => {
    const inputs = { foo: 'bar' };
    const result = await adapter.execute(makeWorkflowDef(), inputs);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.output).toEqual(inputs);
    expect(result.value.steps[0]!.action).toBe('Template: templates/code-review');
  });

  it('delegates to wired engine on success', async () => {
    const mockEngine = {
      loadTemplate: vi.fn(() => Promise.resolve(ok({ name: 'test' }))),
      execute: vi.fn(() => Promise.resolve(ok({ done: true }))),
    };
    adapter.setWorkflowEngine(mockEngine);

    const result = await adapter.execute(makeWorkflowDef('my/template'), { x: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.output).toEqual({ done: true });
    expect(mockEngine.loadTemplate).toHaveBeenCalledWith('my/template');
  });

  it('returns empty object when loadTemplate fails', async () => {
    const mockEngine = {
      loadTemplate: vi.fn(() => Promise.resolve(err(new Error('not found')))),
      execute: vi.fn(() => Promise.resolve(ok({}))),
    };
    adapter.setWorkflowEngine(mockEngine);

    const result = await adapter.execute(makeWorkflowDef(), {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.output).toEqual({});
    expect(mockEngine.execute).not.toHaveBeenCalled();
  });

  it('returns empty object when engine execute fails', async () => {
    const mockEngine = {
      loadTemplate: vi.fn(() => Promise.resolve(ok({ name: 'w' }))),
      execute: vi.fn(() => Promise.resolve(err(new Error('exec fail')))),
    };
    adapter.setWorkflowEngine(mockEngine);

    const result = await adapter.execute(makeWorkflowDef(), {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.output).toEqual({});
  });

  it('cancel succeeds for known execution then getStatus shows cancelled', async () => {
    const execResult = await adapter.execute(makeWorkflowDef(), {});
    expect(execResult.ok).toBe(true);
    if (!execResult.ok) return;

    const execId = execResult.value.executionId;
    const cancelResult = await adapter.cancel(execId, 'user request');
    expect(cancelResult.ok).toBe(true);
    expect(adapter.getStatus(execId).state).toBe('cancelled');
  });

  it('getHistory returns last N entries', async () => {
    await adapter.execute(makeWorkflowDef(), {});
    await adapter.execute(makeWorkflowDef(), {});
    expect(adapter.getHistory(1)).toHaveLength(1);
    expect(adapter.getHistory()).toHaveLength(2);
  });
});
