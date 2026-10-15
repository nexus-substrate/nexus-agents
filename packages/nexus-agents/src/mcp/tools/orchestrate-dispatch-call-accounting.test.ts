/** Count observed adapter completion attempts, not failed slots or native/provider calls. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CliToModelAdapter } from '../../cli-adapters/cli-to-model-adapter.js';
import type { CliTask, ICliAdapter } from '../../cli-adapters/types.js';
import type { AgentPlan } from '../../orchestration/aorchestra/agent-planner.js';
import { createLogger, err, ModelError, ok, type IModelAdapter } from '../../core/index.js';
import { executeWorkerDispatch } from './orchestrate-dispatch.js';

const routing = vi.hoisted<{ alternate: IModelAdapter | undefined; chain: string[] }>(() => ({
  alternate: undefined,
  chain: [],
}));
vi.mock('../../config/learning-persistence.js', () => ({ isPersistenceEnabled: () => false }));
vi.mock('../../adapters/unified-registry.js', () => ({
  getGlobalRegistry: () => ({
    getAdapterForCli: () => {
      if (routing.alternate === undefined) throw new Error('Fixture alternative unavailable');
      return routing.alternate;
    },
  }),
}));
vi.mock('./create-expert-routing.js', async (original) => ({
  ...(await original<typeof import('./create-expert-routing.js')>()),
  getExpertFallbackChain: () => routing.chain,
}));

const logger = createLogger({ component: 'worker-call-accounting-test' });
const TASK = `Review complete supplied text. ${'fixed inline data '.repeat(60)}FINAL CONDITION.`;

function plan(count = 1): AgentPlan {
  return {
    entries: Array.from({ length: count }, (_, i) => ({
      role: 'code',
      subTask: `Review scope ${String(i)}`,
      priority: i + 1,
      reasoning: 'Fixed review',
      wave: 1,
    })),
    totalExperts: count,
    taskType: 'code_implementation',
    complexity: 'moderate',
    reasoning: 'Fixed review plan',
    suggestedWaveSize: 1,
  };
}

function boundary(
  cliName: 'claude' | 'codex' = 'claude',
  supported = true
): {
  adapter: CliToModelAdapter;
  requests: CliTask[];
  cli: ICliAdapter;
} {
  const requests: CliTask[] = [];
  const model = cliName === 'claude' ? 'claude-sonnet' : 'gpt-5.4';
  const cli = {
    name: cliName,
    transport: 'stdio',
    enforcesReadOnlyAnalysis: supported,
    capabilities: { contextWindow: 200_000, reasoning: 9, codeGeneration: 9, speed: 7, cost: 5 },
    getModelInfo: () => ({ id: model, name: model }),
    execute: (request: CliTask) => {
      requests.push(request);
      return Promise.resolve(ok({ text: 'Review delivered', model }));
    },
  } as unknown as ICliAdapter;
  return { adapter: new CliToModelAdapter(cli), requests, cli };
}

async function refuseAfterPreflight(): Promise<{
  adapter: CliToModelAdapter;
  requests: CliTask[];
  complete: IModelAdapter['complete'];
  result: Awaited<ReturnType<typeof executeWorkerDispatch>>;
}> {
  const fixture = boundary();
  const complete = vi.spyOn(fixture.adapter, 'complete');
  vi.spyOn(fixture.adapter, 'countTokens')
    .mockResolvedValueOnce(50)
    .mockRejectedValue(new Error('Fixture immediate estimator rejection'));
  const result = await executeWorkerDispatch({
    agentPlan: plan(),
    taskDescription: TASK,
    modelAdapter: fixture.adapter,
    logger,
  });
  return { ...fixture, complete, result };
}

beforeEach(() => {
  routing.alternate = undefined;
  routing.chain = [];
});

describe('worker completion accounting (#7413)', () => {
  it.each(['returned', 'thrown'] as const)(
    'enforces the shared maximum after a %s retryable failure (#7422)',
    async (failure) => {
      const fixture = boundary();
      const complete = vi.spyOn(fixture.adapter, 'complete');
      if (failure === 'returned') {
        complete.mockResolvedValueOnce(err(new ModelError('Fixture econnreset')));
      } else {
        complete.mockRejectedValueOnce(new Error('Fixture econnreset'));
      }
      const result = await executeWorkerDispatch({
        agentPlan: plan(),
        taskDescription: TASK,
        modelAdapter: fixture.adapter,
        logger,
        maxWorkerCalls: 1,
      });
      expect(complete).toHaveBeenCalledOnce();
      expect(fixture.requests).toHaveLength(0);
      expect(result.totalModelCalls).toBe(1);
      expect(result.successCount).toBe(0);
      expect(result.results[0]?.error).toContain('budget exhausted');
      expect(result.results[0]?.subTask).toContain('Fixture econnreset');
      expect(result.results[0]?.resolvedCli).toBeUndefined();
      expect(result.results[0]?.accessMode).toBeUndefined();
    }
  );

  it('shares the maximum with the alternate adapter rather than granting a retry allowance', async () => {
    const primary = boundary();
    const alternate = boundary('codex');
    routing.alternate = alternate.adapter;
    routing.chain = ['codex'];
    const complete = vi
      .spyOn(primary.adapter, 'complete')
      .mockResolvedValueOnce(err(new ModelError('Fixture rate limit')));
    const altComplete = vi.spyOn(alternate.adapter, 'complete');
    const result = await executeWorkerDispatch({
      agentPlan: plan(),
      taskDescription: TASK,
      modelAdapter: primary.adapter,
      logger,
      maxWorkerCalls: 1,
    });
    expect(complete).toHaveBeenCalledOnce();
    expect(altComplete).not.toHaveBeenCalled();
    expect(result.totalModelCalls).toBe(1);
    expect(result.successCount).toBe(0);
    expect(result.results[0]?.resolvedCli).toBeUndefined();
  });

  it('reserves a shared maximum across concurrent failed workers and their retries', async () => {
    const fixture = boundary();
    const complete = vi
      .spyOn(fixture.adapter, 'complete')
      .mockResolvedValue(err(new ModelError('Fixture econnreset')));
    const result = await executeWorkerDispatch({
      agentPlan: plan(2),
      taskDescription: TASK,
      modelAdapter: fixture.adapter,
      logger,
      maxWorkerCalls: 2,
      maxConcurrency: 2,
    });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(result.totalModelCalls).toBe(2);
    expect(result.errorCount).toBe(2);
    expect(fixture.requests).toHaveLength(0);
  });

  it('records zero completion attempts when the immediate per-call recheck refuses', async () => {
    const { complete, requests, result } = await refuseAfterPreflight();
    expect(complete).not.toHaveBeenCalled();
    expect(requests).toHaveLength(0);
    expect(result.totalModelCalls).toBe(0);
  });

  it('omits actual-dispatch metadata when no completion was attempted', async () => {
    const { result } = await refuseAfterPreflight();
    expect(result.results[0]?.resolvedCli).toBeUndefined();
    expect(result.results[0]?.accessMode).toBeUndefined();
    expect(result.results[0]?.promptEvidence?.rawInputCoverage).toBe('UNSUPPORTED');
  });

  it('does not describe an immediate estimator rejection as a measured timeout', async () => {
    const { result } = await refuseAfterPreflight();
    expect(result.results[0]?.error).toContain('estimate unavailable');
    expect(result.results[0]?.error).not.toMatch(/timed out|timeout/i);
  });

  it('counts a bridge invocation but records only requested intent when native startup refuses', async () => {
    const fixture = boundary();
    // #7434: known incompatibility is now filtered before completion. This
    // test covers the final defense when serving state changes after pinning.
    const complete = vi.spyOn(fixture.adapter, 'complete').mockImplementation((request) => {
      Object.defineProperty(fixture.cli, 'enforcesReadOnlyAnalysis', { value: false });
      return CliToModelAdapter.prototype.complete.call(fixture.adapter, request);
    });
    const result = await executeWorkerDispatch({
      agentPlan: plan(),
      taskDescription: TASK,
      modelAdapter: fixture.adapter,
      logger,
    });
    expect(complete).toHaveBeenCalledOnce();
    expect(fixture.requests).toHaveLength(0);
    expect(result.totalModelCalls).toBe(1);
    expect(result.results[0]).toMatchObject({
      requestedCli: 'cli-claude',
      requestedAccessMode: 'read-only-analysis',
    });
    expect(result.results[0]?.resolvedCli).toBeUndefined();
    expect(result.results[0]?.accessMode).toBeUndefined();
  });

  it('counts both primary and same-adapter retry invocations instead of one result slot', async () => {
    const fixture = boundary();
    const complete = vi
      .spyOn(fixture.adapter, 'complete')
      .mockResolvedValueOnce(err(new ModelError('Fixture econnreset')));
    const result = await executeWorkerDispatch({
      agentPlan: plan(),
      taskDescription: TASK,
      modelAdapter: fixture.adapter,
      logger,
    });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(fixture.requests).toHaveLength(1);
    expect(result.successCount).toBe(1);
    expect(result.totalModelCalls).toBe(2);
  });

  it('counts the primary and alternate adapter invocations independently', async () => {
    const primary = boundary();
    const alternate = boundary('codex');
    routing.alternate = alternate.adapter;
    routing.chain = ['codex'];
    const primaryComplete = vi
      .spyOn(primary.adapter, 'complete')
      .mockResolvedValueOnce(err(new ModelError('Fixture rate limit')));
    const altComplete = vi.spyOn(alternate.adapter, 'complete');
    const result = await executeWorkerDispatch({
      agentPlan: plan(),
      taskDescription: TASK,
      modelAdapter: primary.adapter,
      logger,
    });
    expect(primaryComplete).toHaveBeenCalledOnce();
    expect(altComplete).toHaveBeenCalledOnce();
    expect(result.totalModelCalls).toBe(2);
    expect(result.successCount).toBe(1);
  });

  it('keeps a concurrent successful attempt separate from another worker rejected before completion', async () => {
    const fixture = boundary();
    const complete = vi.spyOn(fixture.adapter, 'complete');
    let release: ((tokens: number) => void) | undefined;
    vi.spyOn(fixture.adapter, 'countTokens')
      .mockResolvedValueOnce(50)
      .mockResolvedValueOnce(50)
      .mockImplementationOnce(
        () =>
          new Promise<number>((resolve) => {
            release = resolve;
          })
      )
      .mockImplementationOnce(() => {
        if (release === undefined) throw new Error('Fixture did not start first recheck');
        release(50);
        return Promise.reject(new Error('Fixture second recheck rejected'));
      });
    const result = await executeWorkerDispatch({
      agentPlan: plan(2),
      taskDescription: TASK,
      modelAdapter: fixture.adapter,
      logger,
      maxConcurrency: 2,
    });
    const refused = result.results.find((r) => r.subTask === 'Review scope 1');
    expect(complete).toHaveBeenCalledOnce();
    expect(fixture.requests).toHaveLength(1);
    expect(result.totalModelCalls).toBe(1);
    expect(refused?.resolvedCli).toBeUndefined();
    expect(refused?.accessMode).toBeUndefined();
  });
});
