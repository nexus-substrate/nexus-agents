/**
 * Seam test: the orchestrate handler dispatches workers with NO quality gate
 * (#6589).
 *
 * The `qualityGate` JSDoc on `WorkerDispatchExecutionOptions` states that no
 * gate runs unless a caller passes one, and that the orchestrate tool passes
 * none. This pins the caller half of that claim: if someone wires a default
 * gate into the orchestrate path, this fails and the doc must change with it.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { ok } from '../../core/result.js';
import type { IModelAdapter } from '../../core/index.js';
import type { AgentPlan } from '../../orchestration/aorchestra/index.js';
import { OrchestratorAdapter } from '../../orchestration/orchestrator-adapters.js';
import { NOOP_NOTIFIER } from '../mcp-notifier.js';
import { RateLimiter } from '../middleware/index.js';
import * as orchestrateMod from './orchestrate.js';
import { executeWorkerDispatch, type WorkerDispatchResult } from './orchestrate-dispatch.js';

vi.mock('./tool-memory.js', () => {
  const noop = vi.fn();
  const noopAsync = vi
    .fn()
    .mockResolvedValue({ learningsPromotedToBelief: 0, beliefsPromotedToAgentic: 0 });
  return {
    getToolMemory: vi.fn(() => ({
      recordTask: noop,
      recordLearning: noop,
      recordError: noop,
      recordBelief: noopAsync,
      getRelevantLearnings: vi.fn(),
      getRelevantBeliefs: vi.fn().mockResolvedValue(undefined),
      getRelevantErrorHints: vi.fn(),
      runPromotionPipeline: noopAsync,
    })),
  };
});

vi.mock('./research-auto-catalog.js', () => ({
  getAutoCatalog: vi.fn(() => ({ scanAndRecord: vi.fn() })),
}));

vi.mock('../../pipeline/v2-orchestrate.js', () => ({
  orchestrateInputToTaskContract: vi.fn(),
  executeOrchestratePipeline: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../pipeline/v2-config.js', () => ({
  resolveV2Config: vi.fn(() => ({
    delegateEnabled: false,
    orchestrateEnabled: false,
    aorchestraEnabled: true,
    dispatchEnabled: true,
  })),
}));

const PLAN: AgentPlan = {
  entries: [
    { role: 'code', subTask: 'Implement', priority: 1, reasoning: 'test', wave: 1 },
    { role: 'testing', subTask: 'Test', priority: 2, reasoning: 'test', wave: 1 },
  ],
  totalExperts: 2,
  taskType: 'code_implementation',
  complexity: 'moderate',
  reasoning: 'Test plan',
  suggestedWaveSize: 3,
};

vi.mock('./orchestrate-aorchestra.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./orchestrate-aorchestra.js')>();
  return { ...actual, computeAgentPlan: vi.fn(() => PLAN) };
});

const DISPATCH_RESULT: WorkerDispatchResult = {
  results: [],
  totalWorkers: 0,
  successCount: 0,
  errorCount: 0,
  durationMs: 0,
  conflicts: [],
  totalModelCalls: 0,
};

vi.mock('./orchestrate-dispatch.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./orchestrate-dispatch.js')>();
  return {
    ...actual,
    isWorkerDispatchEnabled: vi.fn(() => true),
    executeWorkerDispatch: vi.fn(() => Promise.resolve(DISPATCH_RESULT)),
  };
});

async function runOrchestrate(args: Record<string, unknown>): Promise<void> {
  const orchestrator = new OrchestratorAdapter();
  orchestrator.setOrchestrator({ execute: vi.fn().mockResolvedValue(ok({ output: {} })) });
  let handler: ((args: unknown) => Promise<unknown>) | undefined;
  const server = {
    registerTool: vi.fn(
      (_name: string, _config: unknown, callback: (args: unknown) => Promise<unknown>): void => {
        handler = callback;
      }
    ),
  };
  orchestrateMod.registerOrchestrateTool(server as never, {
    orchestrator,
    notifier: NOOP_NOTIFIER,
    rateLimiter: new RateLimiter({ capacity: 10, refillRate: 10, refillIntervalMs: 1000 }),
    modelAdapter: { providerId: 'test', modelId: 'test-model' } as unknown as IModelAdapter,
  });
  if (handler === undefined) throw new Error('orchestrate handler was not registered');
  await handler(args);
}

const TASK =
  'Refactor the distributed authentication architecture for concurrent security workloads.';

describe('orchestrate -> executeWorkerDispatch quality-gate seam (#6589)', () => {
  afterEach(() => {
    vi.mocked(executeWorkerDispatch).mockClear();
    vi.unstubAllEnvs();
  });

  it('dispatches workers without a qualityGate, so worker output is not gated', async () => {
    vi.stubEnv('NEXUS_TASK_STATE_ENABLED', '0');
    await runOrchestrate({ task: TASK });

    expect(executeWorkerDispatch).toHaveBeenCalledOnce();
    const options = vi.mocked(executeWorkerDispatch).mock.calls[0]?.[0];
    expect(options).toBeDefined();
    expect(options?.agentPlan).toBe(PLAN);
    expect(options !== undefined && 'qualityGate' in options).toBe(false);
  });
});
