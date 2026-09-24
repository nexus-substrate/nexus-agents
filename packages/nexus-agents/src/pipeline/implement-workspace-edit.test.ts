/**
 * The dev-pipeline implement stage runs in workspace-edit mode with no MCP
 * tools, and the effective access mode of every expert call is recorded
 * (#6792, panel decision option B).
 *
 * Seam test: it drives the real `createImplementStage` → `runExpert` →
 * `executeExpert` → `recordOutcome` chain, inspects the `CliTask` the
 * composite router receives, and reads the row the real `recordOutcome`
 * appends. A break at any link (the stage not asking, `runExpert` not
 * forwarding, the bridge still attaching the MCP config, the bridge not
 * stamping the mode, the recorder dropping it) fails here.
 *
 * @module pipeline/implement-workspace-edit.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { executeTaskMock, appendMock } = vi.hoisted(() => ({
  executeTaskMock: vi.fn(),
  appendMock: vi.fn(),
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
  generateMcpConfig: vi.fn(() =>
    Promise.resolve({ configPath: '/tmp/impl-seam-mcp.json', cleanup: vi.fn() })
  ),
}));
vi.mock('../orchestration/outcomes/outcome-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../orchestration/outcomes/outcome-store.js')>()),
  getOutcomeStore: () => ({ append: appendMock, query: vi.fn(() => []) }),
}));
vi.mock('./agent-executor-memory.js', () => ({
  flushPipelineMemory: vi.fn(),
  recordLearning: vi.fn(),
  recordMemoryError: vi.fn(),
  recordRoutingExperience: vi.fn(),
}));

import {
  createDecomposeStage,
  createImplementStage,
  createQaReviewStage,
} from './agent-executor-stages.js';
import { createBudgetGuard } from './budget-guard.js';
import { executeExpert } from './expert-bridge.js';
import type { PipelineTask } from './dev-pipeline.js';
import type { StageDeps } from './agent-executor-core.js';

const TASK: PipelineTask = {
  id: 't6792',
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

/** The outcome row appended for `taskId`. */
function outcomeRow(taskId: string): Record<string, unknown> {
  const row = appendMock.mock.calls
    .map((c: unknown[]) => c[0] as Record<string, unknown>)
    .find((r) => String(r['id']).startsWith(`pipeline-${taskId}-`));
  if (row === undefined) throw new Error(`no outcome row for ${taskId}`);
  return row;
}

beforeEach(() => {
  executeTaskMock.mockReset();
  appendMock.mockReset();
  executeTaskMock.mockResolvedValue({ ok: true, value: { text: 'done', routedCli: 'claude' } });
});

describe('implement stage access mode (#6792)', () => {
  it('asks the router for workspace-edit mode', async () => {
    await createImplementStage(deps())(TASK);

    expect(routedTask()['accessMode']).toBe('workspace-edit');
  });

  it('sends no MCP config with the implement call', async () => {
    await createImplementStage(deps())(TASK);

    const options = routedTask()['options'] as Record<string, unknown> | undefined;
    expect(options?.['mcpConfigPath']).toBeUndefined();
  });

  it('records the effective mode on the implement outcome row', async () => {
    await createImplementStage(deps())(TASK);

    expect(outcomeRow(TASK.id)['qualitySignals']).toEqual(['access-mode:workspace-edit']);
  });

  it('records the mode on a failed implement call too', async () => {
    executeTaskMock.mockResolvedValue({
      ok: false,
      error: Object.assign(new Error('refused'), { routedCli: 'claude' }),
    });

    await createImplementStage(deps())(TASK);

    const row = outcomeRow(TASK.id);
    expect(row['success']).toBe(false);
    expect(row['qualitySignals']).toEqual(['access-mode:workspace-edit']);
  });
});

describe('the effective mode is recorded for every expert call (#6792)', () => {
  it('a QA review row records read-only analysis beside its verdict', async () => {
    executeTaskMock.mockResolvedValue({
      ok: true,
      value: { text: 'VERDICT: PASS', routedCli: 'claude' },
    });

    await createQaReviewStage(deps())(TASK, 'const x = 1;');

    expect(outcomeRow(TASK.id)['qualitySignals']).toEqual([
      'qa-verdict:pass',
      'access-mode:read-only-analysis',
    ]);
  });

  it('a decompose row records the default mode, which keeps its MCP config (contrast)', async () => {
    executeTaskMock.mockResolvedValue({ ok: true, value: { text: '[]', routedCli: 'claude' } });

    await createDecomposeStage(deps())('the plan');

    expect(routedTask()['accessMode']).toBeUndefined();
    expect(outcomeRow('decompose')['qualitySignals']).toEqual(['access-mode:default']);
  });

  it('the bridge result states the mode it ran under, default included', async () => {
    const edit = await executeExpert('code', 'x', { accessMode: 'workspace-edit' });
    const plain = await executeExpert('code', 'x');

    expect(edit.accessMode).toBe('workspace-edit');
    expect(plain.accessMode).toBe('default');
  });
});
