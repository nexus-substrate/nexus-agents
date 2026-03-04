/**
 * Tests for self-refinement loop in orchestrate-dispatch (Issue #1389).
 *
 * Covers shouldRefine predicate + executeWorkerDispatch refinement integration.
 *
 * @module mcp/tools/orchestrate-dispatch-refine.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shouldRefine, executeWorkerDispatch } from './orchestrate-dispatch.js';
import type { RefinementSignals } from './orchestrate-dispatch.js';
import type { AgentPlan } from '../../orchestration/aorchestra/index.js';
import type { IModelAdapter } from '../../core/index.js';
import { ok, createLogger } from '../../core/index.js';

vi.mock('../../config/learning-persistence.js', () => ({
  isPersistenceEnabled: vi.fn(() => false),
}));

// ============================================================================
// Helpers
// ============================================================================

const logger = createLogger({ component: 'test-refine' });

function makePlan(entryCount: number): AgentPlan {
  const roles = ['code', 'testing', 'security', 'architecture', 'documentation'] as const;
  const entries = Array.from({ length: entryCount }, (_, i) => ({
    role: roles[i % roles.length] as (typeof roles)[number],
    subTask: `Task for ${roles[i % roles.length] as string}`,
    priority: i + 1,
    reasoning: `Selected for ${roles[i % roles.length] as string}`,
    wave: Math.ceil((i + 1) / 3),
  }));

  return {
    entries,
    totalExperts: entryCount,
    taskType: 'code_implementation',
    complexity: 'moderate',
    reasoning: 'Test plan',
    suggestedWaveSize: 3,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeSuccessResponse(text: string) {
  return ok({
    content: [{ type: 'text' as const, text }],
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    stopReason: 'end_turn' as const,
    model: 'test-model',
  });
}

function makeMockAdapter(responseText: string): IModelAdapter {
  return {
    providerId: 'test',
    modelId: 'test-model',
    capabilities: ['text_generation'] as const,
    complete: vi.fn().mockResolvedValue(makeSuccessResponse(responseText)),
    stream: vi.fn(),
    countTokens: vi.fn().mockResolvedValue(100),
    validate: vi.fn().mockResolvedValue(ok(undefined)),
  } as unknown as IModelAdapter;
}

// ============================================================================
// shouldRefine — pure predicate
// ============================================================================

describe('shouldRefine', () => {
  it('returns false when all succeed and no fallback', () => {
    const signals: RefinementSignals = {
      errorCount: 0,
      successCount: 3,
      conflictCount: 0,
    };
    expect(shouldRefine(signals)).toBe(false);
  });

  it('returns true when successCount is 0', () => {
    const signals: RefinementSignals = {
      errorCount: 2,
      successCount: 0,
      conflictCount: 0,
    };
    expect(shouldRefine(signals)).toBe(true);
  });

  it('returns true when errorCount > 0', () => {
    const signals: RefinementSignals = {
      errorCount: 1,
      successCount: 2,
      conflictCount: 0,
    };
    expect(shouldRefine(signals)).toBe(true);
  });

  it('returns true when synthesisSource is fallback', () => {
    const signals: RefinementSignals = {
      errorCount: 0,
      successCount: 2,
      conflictCount: 0,
      synthesisSource: 'fallback',
    };
    expect(shouldRefine(signals)).toBe(true);
  });

  it('returns false when synthesisSource is llm and no errors', () => {
    const signals: RefinementSignals = {
      errorCount: 0,
      successCount: 3,
      conflictCount: 1,
      synthesisSource: 'llm',
    };
    expect(shouldRefine(signals)).toBe(false);
  });

  it('returns false with conflicts alone (no errors)', () => {
    const signals: RefinementSignals = {
      errorCount: 0,
      successCount: 2,
      conflictCount: 2,
    };
    expect(shouldRefine(signals)).toBe(false);
  });
});

// ============================================================================
// executeWorkerDispatch — refinement integration
// ============================================================================

describe('executeWorkerDispatch refinement', () => {
  let mockAdapter: IModelAdapter;

  beforeEach(() => {
    mockAdapter = makeMockAdapter('Worker output');
  });

  it('skips refinement when refine not set (default behavior unchanged)', async () => {
    const failingAdapter = {
      providerId: 'test',
      modelId: 'test-model',
      capabilities: ['text_generation'] as const,
      complete: vi.fn().mockRejectedValue(new Error('Model error')),
      stream: vi.fn(),
      countTokens: vi.fn().mockResolvedValue(100),
      validate: vi.fn(),
    } as unknown as IModelAdapter;

    const plan = makePlan(1);
    const result = await executeWorkerDispatch({
      agentPlan: plan,
      taskDescription: 'Task',
      modelAdapter: failingAdapter,
      logger,
    });

    expect(result.errorCount).toBe(1);
    expect(result.refined).toBeUndefined();
    // Adapter called only once — no refinement pass
    const completeFn = failingAdapter.complete as ReturnType<typeof vi.fn>;
    expect(completeFn).toHaveBeenCalledTimes(1);
  });

  it('skips refinement when all workers succeed', async () => {
    const plan = makePlan(2);
    const result = await executeWorkerDispatch({
      agentPlan: plan,
      taskDescription: 'Task',
      modelAdapter: mockAdapter,
      logger,
      refine: true,
    });

    expect(result.successCount).toBe(2);
    expect(result.errorCount).toBe(0);
    expect(result.refined).toBeUndefined();
  });

  it('re-dispatches failed workers on refinement pass', async () => {
    let callCount = 0;
    const adapter = {
      providerId: 'test',
      modelId: 'test-model',
      capabilities: ['text_generation'] as const,
      complete: vi.fn().mockImplementation(() => {
        callCount++;
        // First call fails, subsequent calls succeed
        if (callCount === 1) {
          return Promise.reject(new Error('Temporary error'));
        }
        return Promise.resolve(makeSuccessResponse('Refined output'));
      }),
      stream: vi.fn(),
      countTokens: vi.fn().mockResolvedValue(100),
      validate: vi.fn(),
    } as unknown as IModelAdapter;

    const plan = makePlan(1);
    const result = await executeWorkerDispatch({
      agentPlan: plan,
      taskDescription: 'Task',
      modelAdapter: adapter,
      logger,
      refine: true,
      maxWorkerCalls: 6,
    });

    expect(result.refined).toBe(true);
    expect(result.successCount).toBe(1);
    expect(result.errorCount).toBe(0);
    expect(result.results[0]?.output).toBe('Refined output');
  });

  it('sets refined=true on successful refinement', async () => {
    let callCount = 0;
    const adapter = {
      providerId: 'test',
      modelId: 'test-model',
      capabilities: ['text_generation'] as const,
      complete: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.reject(new Error('Fail'));
        }
        return Promise.resolve(makeSuccessResponse('Fixed'));
      }),
      stream: vi.fn(),
      countTokens: vi.fn().mockResolvedValue(100),
      validate: vi.fn(),
    } as unknown as IModelAdapter;

    const plan = makePlan(2);
    const result = await executeWorkerDispatch({
      agentPlan: plan,
      taskDescription: 'Task',
      modelAdapter: adapter,
      logger,
      refine: true,
      maxWorkerCalls: 6,
    });

    expect(result.refined).toBe(true);
  });

  it('skips refinement when budget exhausted', async () => {
    const failAdapter = {
      providerId: 'test',
      modelId: 'test-model',
      capabilities: ['text_generation'] as const,
      complete: vi.fn().mockRejectedValue(new Error('Error')),
      stream: vi.fn(),
      countTokens: vi.fn().mockResolvedValue(100),
      validate: vi.fn(),
    } as unknown as IModelAdapter;

    // 2 workers with budget of 2 — no room for refinement
    const plan = makePlan(2);
    const result = await executeWorkerDispatch({
      agentPlan: plan,
      taskDescription: 'Task',
      modelAdapter: failAdapter,
      logger,
      refine: true,
      maxWorkerCalls: 2,
    });

    expect(result.errorCount).toBe(2);
    expect(result.refined).toBeUndefined();
    // Only 2 calls total — no refinement
    const completeFn = failAdapter.complete as ReturnType<typeof vi.fn>;
    expect(completeFn).toHaveBeenCalledTimes(2);
  });

  it('preserves synthesis output through refinement', async () => {
    let callCount = 0;
    const adapter = {
      providerId: 'test',
      modelId: 'test-model',
      capabilities: ['text_generation'] as const,
      complete: vi.fn().mockImplementation(() => {
        callCount++;
        // Worker 1 fails, worker 2 succeeds, synthesis succeeds, refinement succeeds
        if (callCount === 1) {
          return Promise.reject(new Error('Temporary'));
        }
        return Promise.resolve(makeSuccessResponse('Output'));
      }),
      stream: vi.fn(),
      countTokens: vi.fn().mockResolvedValue(100),
      validate: vi.fn(),
    } as unknown as IModelAdapter;

    const plan = makePlan(2);
    const result = await executeWorkerDispatch({
      agentPlan: plan,
      taskDescription: 'Task',
      modelAdapter: adapter,
      logger,
      refine: true,
      synthesize: true,
      maxWorkerCalls: 10,
    });

    // Should have synthesis from the initial pass
    expect(result.synthesis).toBeDefined();
    expect(result.refined).toBe(true);
  });

  it('only re-dispatches failed workers, not successful ones', async () => {
    let callCount = 0;
    const adapter = {
      providerId: 'test',
      modelId: 'test-model',
      capabilities: ['text_generation'] as const,
      complete: vi.fn().mockImplementation(() => {
        callCount++;
        // Worker 1 (code) succeeds, Worker 2 (testing) fails, refinement of Worker 2 succeeds
        if (callCount === 2) {
          return Promise.reject(new Error('Fail'));
        }
        return Promise.resolve(makeSuccessResponse(`Output-${String(callCount)}`));
      }),
      stream: vi.fn(),
      countTokens: vi.fn().mockResolvedValue(100),
      validate: vi.fn(),
    } as unknown as IModelAdapter;

    const plan = makePlan(2);
    const result = await executeWorkerDispatch({
      agentPlan: plan,
      taskDescription: 'Task',
      modelAdapter: adapter,
      logger,
      refine: true,
      maxWorkerCalls: 6,
    });

    // 2 initial + 1 refinement = 3 calls
    const completeFn = adapter.complete as ReturnType<typeof vi.fn>;
    expect(completeFn).toHaveBeenCalledTimes(3);
    expect(result.successCount).toBe(2);
    expect(result.errorCount).toBe(0);
    expect(result.refined).toBe(true);
  });
});
