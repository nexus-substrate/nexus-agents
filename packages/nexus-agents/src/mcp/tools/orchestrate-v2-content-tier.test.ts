/**
 * orchestrate's V2 trust-tier instrumentation receives the task text's CONTENT
 * tier, not the caller's (#6795). orchestrate takes no provenance declaration,
 * so a measured tier-1 (stdio) caller's goal is still Tier 3.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ok } from '../../core/result.js';
import { OrchestratorAdapter } from '../../orchestration/orchestrator-adapters.js';
import { NOOP_NOTIFIER } from '../mcp-notifier.js';
import { RateLimiter } from '../middleware/index.js';
import { recordServerTransport } from '../middleware/request-context.js';
import * as v2 from '../../pipeline/v2-orchestrate.js';
import * as orchestrateMod from './orchestrate.js';

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
    orchestrateEnabled: true,
    aorchestraEnabled: false,
    dispatchEnabled: false,
  })),
}));
vi.mock('./orchestrate-aorchestra.js', () => ({
  computeAgentPlan: vi.fn(),
}));

async function callOrchestrate(): Promise<void> {
  vi.stubEnv('NEXUS_TASK_STATE_ENABLED', '0');
  const orchestrator = new OrchestratorAdapter();
  orchestrator.setOrchestrator({
    execute: vi.fn().mockResolvedValue(ok({ output: {}, metadata: {} })),
  });
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
  await handler({ task: 'Refactor the authentication module for clarity.' });
}

afterEach(() => {
  recordServerTransport(undefined);
  vi.mocked(v2.orchestrateInputToTaskContract).mockClear();
  vi.unstubAllEnvs();
});

describe('orchestrate V2 instrumentation tier (#6795)', () => {
  it("a measured tier-1 stdio caller's goal reaches the V2 contract as tier '3'", async () => {
    recordServerTransport('stdio');
    await callOrchestrate();
    expect(vi.mocked(v2.orchestrateInputToTaskContract)).toHaveBeenCalledWith(expect.anything(), {
      trustTier: '3',
    });
  });

  it('an unmeasured caller threads no tier, so the policy engine fails closed', async () => {
    await callOrchestrate();
    expect(vi.mocked(v2.orchestrateInputToTaskContract)).toHaveBeenCalledWith(
      expect.anything(),
      {}
    );
  });
});
