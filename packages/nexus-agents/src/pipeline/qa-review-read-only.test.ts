/**
 * The dev-pipeline QA review runs read-only with no MCP tools (#6768).
 *
 * Seam test: it drives the real `createQaReviewStage` → `runExpert` →
 * `executeExpert` chain and inspects the `CliTask` the composite router
 * receives, so a break at any link (the stage not asking, `runExpert` not
 * forwarding, the bridge still attaching the MCP config) fails here. The
 * decompose stage is the contrast case: it keeps its MCP config and its
 * default access mode. (The implement stage runs in workspace-edit mode since
 * #6792; see `implement-workspace-edit.test.ts`.)
 *
 * @module pipeline/qa-review-read-only.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { executeTaskMock, generateMcpConfigMock } = vi.hoisted(() => ({
  executeTaskMock: vi.fn(),
  generateMcpConfigMock: vi.fn(() =>
    Promise.resolve({ configPath: '/tmp/qa-seam-mcp.json', cleanup: vi.fn() })
  ),
}));

vi.mock('../cli-adapters/factory.js', () => ({
  createAllAdapters: () => new Map([['claude', {}]]),
}));
vi.mock('../cli-adapters/composite-router.js', () => ({
  createCompositeRouter: () => ({ executeTask: executeTaskMock }),
}));
vi.mock('../cli-adapters/cli-circuit-breaker.js', () => ({
  createCliCircuitBreakerIntegration: () => ({
    getHealthStatus: () => ({ systemHealthy: true, healthyCount: 1, clis: [] }),
  }),
}));
vi.mock('../cli-adapters/child-mcp-config.js', () => ({
  generateMcpConfig: generateMcpConfigMock,
}));
vi.mock('./agent-executor-core.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./agent-executor-core.js')>()),
  recordOutcome: vi.fn(),
}));
vi.mock('./agent-executor-memory.js', () => ({
  flushPipelineMemory: vi.fn(),
  recordLearning: vi.fn(),
  recordMemoryError: vi.fn(),
  recordRoutingExperience: vi.fn(),
}));

import { createDecomposeStage, createQaReviewStage } from './agent-executor-stages.js';
import { createBudgetGuard } from './budget-guard.js';
import type { PipelineTask } from './dev-pipeline.js';
import type { StageDeps } from './agent-executor-core.js';

const TASK: PipelineTask = {
  id: 't1',
  title: 'Add a helper',
  description: 'Add a helper function',
  assignedTo: 'coder',
  status: 'in_progress',
};

function deps(): StageDeps {
  return { config: {}, guard: createBudgetGuard(), startStage: vi.fn() };
}

/** The `CliTask` the router received on its only call. */
function routedTask(): Record<string, unknown> {
  expect(executeTaskMock).toHaveBeenCalledTimes(1);
  return executeTaskMock.mock.calls[0]?.[0] as Record<string, unknown>;
}

beforeEach(() => {
  executeTaskMock.mockReset();
  executeTaskMock.mockResolvedValue({ ok: true, value: { text: 'VERDICT: PASS' } });
});

describe('QA review stage access mode (#6768)', () => {
  it('asks the router for read-only analysis mode', async () => {
    await createQaReviewStage(deps())(TASK, 'const x = 1;');

    expect(routedTask()['accessMode']).toBe('read-only-analysis');
  });

  it('sends no MCP config with the QA call', async () => {
    await createQaReviewStage(deps())(TASK, 'const x = 1;');

    const options = routedTask()['options'] as Record<string, unknown> | undefined;
    expect(options?.['mcpConfigPath']).toBeUndefined();
  });

  it('still reads the verdict of a read-only review', async () => {
    const review = await createQaReviewStage(deps())(TASK, 'const x = 1;');

    expect(review.verdict).toBe('pass');
  });
});

describe('decompose stage keeps its tools (#6768 contrast)', () => {
  it('keeps the MCP config and the default access mode', async () => {
    executeTaskMock.mockResolvedValue({ ok: true, value: { text: '[]' } });

    await createDecomposeStage(deps())('the plan');

    const task = routedTask();
    expect(task['options']).toEqual({ mcpConfigPath: '/tmp/qa-seam-mcp.json' });
    expect(task['accessMode']).toBeUndefined();
  });
});
