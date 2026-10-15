/** Global adapter-attempt budget across workers and actual synthesis tiers (#7422). */
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  createLogger,
  err,
  ModelError,
  ok,
  type CompletionResponse,
  type IModelAdapter,
  type Result,
} from '../../core/index.js';
import type { AgentPlan } from '../../orchestration/aorchestra/agent-planner.js';
import {
  resetSynthesisHistory,
  getSynthesisHistoryTracker,
  createConflictPatternKey,
} from '../../orchestration/aorchestra/synthesis-history.js';
import { executeWorkerDispatch } from './orchestrate-dispatch.js';

vi.mock('../../config/learning-persistence.js', () => ({ isPersistenceEnabled: () => false }));

const logger = createLogger({ component: 'worker-global-budget-test' });
const WORKER_TEXT = `Reviewed src/shared.ts. ${'Specific review evidence. '.repeat(40)}`;

function response(text: string): Result<CompletionResponse, ModelError> {
  return ok({
    content: [{ type: 'text' as const, text }],
    usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
    stopReason: 'end_turn' as const,
    model: 'fixture',
  });
}

interface FixtureAdapter extends IModelAdapter {
  readonly complete: Mock<IModelAdapter['complete']>;
}

function adapter(): FixtureAdapter {
  return {
    providerId: 'fixture',
    modelId: 'fixture',
    capabilities: ['completion'] as const,
    supportsAccessMode: vi.fn().mockResolvedValue(true),
    complete: vi.fn<IModelAdapter['complete']>().mockResolvedValue(response(WORKER_TEXT)),
    stream: vi.fn(),
    countTokens: vi.fn().mockResolvedValue(50),
    validateConfig: () => ok(undefined),
  } satisfies IModelAdapter;
}

function plan(): AgentPlan {
  return {
    entries: [
      { role: 'code', subTask: 'Review code', priority: 1, reasoning: 'Code', wave: 1 },
      { role: 'testing', subTask: 'Review tests', priority: 2, reasoning: 'Tests', wave: 1 },
    ],
    totalExperts: 2,
    taskType: 'code_implementation',
    complexity: 'moderate',
    reasoning: 'Fixed plan',
    suggestedWaveSize: 2,
  };
}

beforeEach(() => {
  resetSynthesisHistory();
});

describe('global orchestration call budget', () => {
  it('keeps the original adapter receiver for actual synthesis completions', async () => {
    const model = adapter();
    model.complete.mockImplementation(function (this: IModelAdapter) {
      expect(this).toBe(model);
      return Promise.resolve(response(WORKER_TEXT));
    });
    const result = await executeWorkerDispatch({
      agentPlan: plan(),
      taskDescription: 'Review shared module',
      modelAdapter: model,
      logger,
      synthesize: true,
      maxWorkerCalls: 3,
    });
    expect(model.complete).toHaveBeenCalledTimes(3);
    expect(result.totalModelCalls).toBe(3);
    expect(result.synthesis).toBe(WORKER_TEXT);
  });

  it('shares the remaining reservation with refinement and its triage retry', async () => {
    const model = adapter();
    model.complete
      .mockRejectedValueOnce(new Error('Fixture initial unavailable'))
      .mockRejectedValueOnce(new Error('Fixture initial unavailable'))
      .mockResolvedValueOnce(err(new ModelError('Fixture econnreset')));
    const result = await executeWorkerDispatch({
      agentPlan: plan(),
      taskDescription: 'Review shared module',
      modelAdapter: model,
      logger,
      refine: true,
      maxWorkerCalls: 3,
    });
    expect(model.complete).toHaveBeenCalledTimes(3);
    expect(result.totalModelCalls).toBe(3);
    expect(result.refined).toBe(true);
    // Failed refinement keeps the authentic original worker failure.
    expect(result.results.find((r) => r.role === 'code')?.error).toBe(
      'Fixture initial unavailable'
    );
  });

  it('blocks tier-3 escalation when tier 2 consumed the final reservation', async () => {
    const model = adapter();
    model.complete
      .mockResolvedValueOnce(response(WORKER_TEXT))
      .mockResolvedValueOnce(response(WORKER_TEXT))
      .mockResolvedValueOnce(response('tiny'));
    const result = await executeWorkerDispatch({
      agentPlan: plan(),
      taskDescription: 'Review shared module',
      modelAdapter: model,
      logger,
      synthesize: true,
      maxWorkerCalls: 3,
    });
    expect(model.complete).toHaveBeenCalledTimes(3);
    expect(result.totalModelCalls).toBe(3);
    expect(result.synthesis).toContain('Specific review evidence');
    expect(result.successCount).toBe(2);
    expect(
      getSynthesisHistoryTracker().getStats(createConflictPatternKey(['code', 'testing']))
        ?.totalAttempts
    ).toBe(1);
  });

  it.each(['returned', 'thrown'] as const)(
    'counts a %s failed synthesis attempt even when fallback preserves output',
    async (failure) => {
      const model = adapter();
      model.complete
        .mockResolvedValueOnce(response(WORKER_TEXT))
        .mockResolvedValueOnce(response(WORKER_TEXT));
      if (failure === 'returned')
        model.complete.mockResolvedValueOnce(
          err(
            new ModelError('Fixture refused', {
              context: { operation: 'fixture-provider', attempted: false },
            })
          )
        );
      else model.complete.mockRejectedValueOnce(new Error('Fixture refused'));
      const result = await executeWorkerDispatch({
        agentPlan: plan(),
        taskDescription: 'Review shared module',
        modelAdapter: model,
        logger,
        synthesize: true,
        maxWorkerCalls: 3,
      });
      expect(model.complete).toHaveBeenCalledTimes(3);
      expect(result.totalModelCalls).toBe(3);
      expect(result.synthesis).toContain('Specific review evidence');
      expect(
        getSynthesisHistoryTracker().getStats(createConflictPatternKey(['code', 'testing']))
          ?.totalAttempts
      ).toBe(1);
    }
  );

  it('counts both synthesis tiers when two reservations remain', async () => {
    const model = adapter();
    model.complete
      .mockResolvedValueOnce(response(WORKER_TEXT))
      .mockResolvedValueOnce(response(WORKER_TEXT))
      .mockResolvedValueOnce(response('tiny'));
    const result = await executeWorkerDispatch({
      agentPlan: plan(),
      taskDescription: 'Review shared module',
      modelAdapter: model,
      logger,
      synthesize: true,
      maxWorkerCalls: 4,
    });
    expect(model.complete).toHaveBeenCalledTimes(4);
    expect(result.totalModelCalls).toBe(4);
    expect(result.synthesis).toContain('Specific review evidence');
  });

  it('does not charge deterministic synthesis or an empty plan', async () => {
    const model = adapter();
    model.complete.mockResolvedValue(response('Independent review without file references'));
    const result = await executeWorkerDispatch({
      agentPlan: plan(),
      taskDescription: 'Review',
      modelAdapter: model,
      logger,
      synthesize: true,
      maxWorkerCalls: 3,
    });
    expect(model.complete).toHaveBeenCalledTimes(2);
    expect(result.totalModelCalls).toBe(2);
    expect(result.synthesis).toContain('Independent review');
    model.complete.mockClear();
    const empty = await executeWorkerDispatch({
      agentPlan: { ...plan(), entries: [], totalExperts: 0 },
      taskDescription: 'Review',
      modelAdapter: model,
      logger,
      synthesize: true,
      maxWorkerCalls: 1,
    });
    expect(model.complete).not.toHaveBeenCalled();
    expect(empty.totalModelCalls).toBe(0);
    expect(empty.totalWorkers).toBe(0);
  });
});
