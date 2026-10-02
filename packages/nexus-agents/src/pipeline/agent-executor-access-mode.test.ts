/** Stage access modes reach the serving adapter, including dry runs (#6958). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CliTask, ICliAdapter, RoutingArmId } from '../cli-adapters/types.js';

const { executeMock, recordOutcomeMock, enforcement } = vi.hoisted(() => ({
  executeMock: vi.fn<ICliAdapter['execute']>(),
  recordOutcomeMock: vi.fn(),
  enforcement: { readOnly: true },
}));

vi.mock('../cli-adapters/factory.js', () => {
  const adapter = {
    name: 'claude',
    transport: 'subprocess',
    capabilities: { reasoning: 8, contextWindow: 200000, codeGeneration: 9, speed: 7, cost: 5 },
    get enforcesReadOnlyAnalysis() {
      return enforcement.readOnly;
    },
    enforcesWorkspaceEdit: true,
    execute: executeMock,
    healthCheck: vi.fn().mockResolvedValue({ healthy: true, version: '1.0.0' }),
    getModelInfo: vi.fn().mockReturnValue({ id: 'claude', name: 'claude' }),
  } as unknown as ICliAdapter;
  return { createAllAdapters: () => new Map<RoutingArmId, ICliAdapter>([['claude', adapter]]) };
});
vi.mock('../cli-adapters/composite-router.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cli-adapters/composite-router.js')>();
  return {
    ...actual,
    createCompositeRouter: (adapters: Map<RoutingArmId, ICliAdapter>) =>
      actual.createCompositeRouter(adapters, {
        enableBudgetFilter: false,
        enableZeroRouter: false,
        enableTopsisRanking: false,
        enableLinUCBSelection: false,
        enableResourceStrategy: false,
        enableLatencyTracking: false,
        enableCapacityBalancing: false,
      }),
  };
});
vi.mock('../cli-adapters/cli-circuit-breaker.js', () => ({
  createCliCircuitBreakerIntegration: () => ({
    getHealthStatus: () => ({ systemHealthy: true, healthyCount: 1, clis: [] }),
  }),
}));
vi.mock('../cli-adapters/child-mcp-config.js', () => ({
  generateMcpConfig: () => Promise.resolve({ configPath: '/unused/mcp.json', cleanup: vi.fn() }),
}));
vi.mock('../config/learning-persistence.js', () => ({
  isPersistenceEnabled: () => false,
  isStrategyDistillationEnabled: () => false,
  getModelSelectionShadowFile: () => '/dev/null',
}));
vi.mock('./agent-executor-context.js', () => ({
  getOutcomeContext: () => '',
  getTrendContext: () => '',
  getWeatherContext: () => Promise.resolve(''),
}));
vi.mock('./agent-executor-memory.js', () => ({
  recordLearning: vi.fn(),
  recordMemoryError: vi.fn(),
  recordRoutingExperience: vi.fn(),
}));
vi.mock('./agent-executor-core.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./agent-executor-core.js')>()),
  recordOutcome: recordOutcomeMock,
}));

import { createAgentStages } from './agent-executor.js';

const TASK = {
  id: 'task-1',
  title: 'Add helper',
  description: 'Implement the helper',
  assignedTo: 'coder' as const,
  status: 'pending' as const,
};

beforeEach(() => {
  enforcement.readOnly = true;
  recordOutcomeMock.mockClear();
  executeMock.mockReset().mockImplementation((task: CliTask) =>
    Promise.resolve({
      ok: true,
      value: { text: 'PASS', model: 'claude', accessMode: task.accessMode ?? 'default' },
    })
  );
});

describe('agent stage access modes (#6958)', () => {
  it.each([false, true])('planning is read-only with dryRun=%s', async (dryRun) => {
    const stages = createAgentStages({ quickMode: true, dryRun });
    const signal = new AbortController().signal;

    expect(await stages.plan('Add helper', 'research', undefined, signal)).toBe('PASS');

    expect(executeMock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ accessMode: 'read-only-analysis' }),
      { signal }
    );
    expect(executeMock.mock.calls[0]?.[0].options?.mcpConfigPath).toBeUndefined();
  });

  it('plan revision is read-only too', async () => {
    await createAgentStages().plan('Add helper', 'research', 'Revise it');

    expect(executeMock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ accessMode: 'read-only-analysis' })
    );
  });

  it.each([false, true])('decomposition is read-only with dryRun=%s', async (dryRun) => {
    await createAgentStages({ quickMode: true, dryRun }).decompose('plan');

    expect(executeMock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ accessMode: 'read-only-analysis' })
    );
  });

  it.each([false, true])('QA review is read-only with dryRun=%s', async (dryRun) => {
    const review = await createAgentStages({ quickMode: true, dryRun }).qaReview(TASK, 'code');

    expect(review.verdict).toBe('pass');
    expect(executeMock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ accessMode: 'read-only-analysis' })
    );
  });

  it('implementation is read-only when called during a dry run', async () => {
    await createAgentStages({ dryRun: true }).implement(TASK);

    expect(executeMock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ accessMode: 'read-only-analysis' })
    );
  });

  it('no dry-run expert stage requests write access, even if implementation is called', async () => {
    const stages = createAgentStages({ quickMode: true, dryRun: true });
    await stages.plan('Add helper', 'research');
    await stages.decompose('plan');
    await stages.implement(TASK);
    await stages.qaReview(TASK, 'code');

    // An empty call list cannot establish safety: all four stages must dispatch.
    expect(executeMock).toHaveBeenCalledTimes(4);
    for (const [task] of executeMock.mock.calls) {
      expect(task.accessMode).toBe('read-only-analysis');
      expect(task.options?.mcpConfigPath).toBeUndefined();
    }
    expect(stages.implementWorkspace?.accessMode).toBe('read-only-analysis');
  });

  it('real implementation retains workspace-edit access', async () => {
    const stages = createAgentStages();
    await stages.implement(TASK);

    expect(executeMock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ accessMode: 'workspace-edit' })
    );
    expect(stages.implementWorkspace?.accessMode).toBe('workspace-edit');
  });

  it('refuses a dry-run plan explicitly when no adapter enforces read-only', async () => {
    enforcement.readOnly = false;
    const stages = createAgentStages({ quickMode: true, dryRun: true });

    expect(await stages.plan('Add helper', 'research')).toBe('');

    expect(executeMock).not.toHaveBeenCalled();
    expect(recordOutcomeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        requestedAccessMode: 'read-only-analysis',
        error: expect.stringContaining('No routing arm enforces read-only analysis mode'),
      })
    );
  });
});
