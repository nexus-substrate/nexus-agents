/**
 * Seam test: the orchestrate handler hands `context.filePaths` to the
 * AOrchestra planner (#4827).
 *
 * `computeAgentPlan` accepting `filePaths` proves nothing if the tool never
 * supplies them — that was the defect. This exercises the handler with the
 * planner mocked and asserts the value it receives.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { ok } from '../../core/result.js';
import { OrchestratorAdapter } from '../../orchestration/orchestrator-adapters.js';
import { NOOP_NOTIFIER } from '../mcp-notifier.js';
import { RateLimiter } from '../middleware/index.js';
import * as orchestrateMod from './orchestrate.js';
import { computeAgentPlan } from './orchestrate-aorchestra.js';

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
    dispatchEnabled: false,
  })),
}));

vi.mock('./orchestrate-aorchestra.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./orchestrate-aorchestra.js')>();
  return { ...actual, computeAgentPlan: vi.fn(() => undefined) };
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
  });
  if (handler === undefined) throw new Error('orchestrate handler was not registered');
  await handler(args);
}

const TASK =
  'Refactor the distributed authentication architecture for concurrent security workloads.';

describe('orchestrate -> computeAgentPlan filePaths seam (#4827)', () => {
  afterEach(() => {
    vi.mocked(computeAgentPlan).mockClear();
    vi.unstubAllEnvs();
  });

  it('passes context.filePaths through to the planner', async () => {
    vi.stubEnv('NEXUS_TASK_STATE_ENABLED', '0');
    await runOrchestrate({ task: TASK, context: { filePaths: ['deploy/main.tf'] } });

    expect(computeAgentPlan).toHaveBeenCalledOnce();
    expect(vi.mocked(computeAgentPlan).mock.calls[0]?.[2]).toEqual({
      filePaths: ['deploy/main.tf'],
    });
  });

  it('passes filePaths: undefined when the context carries none', async () => {
    vi.stubEnv('NEXUS_TASK_STATE_ENABLED', '0');
    await runOrchestrate({ task: TASK });

    expect(computeAgentPlan).toHaveBeenCalledOnce();
    expect(vi.mocked(computeAgentPlan).mock.calls[0]?.[2]).toEqual({ filePaths: undefined });
  });
});
