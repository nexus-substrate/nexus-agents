/**
 * Tests for orchestrate-dispatch — worker dispatch integration.
 *
 * @module mcp/tools/orchestrate-dispatch.test
 * (Source: Issue #1303, Epic #1299)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  executeWorkerDispatch,
  isWorkerDispatchEnabled,
  recordWorkerOutcomes,
} from './orchestrate-dispatch.js';
import type { AgentPlan } from '../../orchestration/aorchestra/index.js';
import type { WorkerResult } from '../../orchestration/aorchestra/index.js';
import type { IModelAdapter } from '../../core/index.js';
import { ok, err, createLogger, ModelError, ErrorCode } from '../../core/index.js';
import { getOutcomeStore, resetOutcomeStore } from '../../orchestration/outcomes/index.js';
import type { SynthesisResult } from '../../orchestration/aorchestra/result-synthesizer.js';

// Disable persistence so getOutcomeStore() returns a fresh in-memory store
// instead of loading historical outcomes from ~/.nexus-agents/learning/outcomes.jsonl
vi.mock('../../config/learning-persistence.js', () => ({
  isPersistenceEnabled: vi.fn(() => false),
}));

// Mock registry + routing used by createAltWorkerExecutor (#1535)
vi.mock('../../adapters/unified-registry.js', () => ({
  getGlobalRegistry: vi.fn(() => ({
    getAdapterForCli: vi.fn(() => {
      throw new Error('No adapter in test');
    }),
  })),
}));
vi.mock('./create-expert-routing.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./create-expert-routing.js')>();
  return {
    ...actual,
    getExpertFallbackChain: vi.fn(() => []),
  };
});

// Allow overriding synthesizeResults for specific tests (#1469)
const mockSynthesizeResults = vi.hoisted(() => vi.fn());
vi.mock('../../orchestration/aorchestra/result-synthesizer.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../orchestration/aorchestra/result-synthesizer.js')>();
  return { ...actual, synthesizeResults: mockSynthesizeResults };
});

// ============================================================================
// Helpers
// ============================================================================

const logger = createLogger({ component: 'test-dispatch' });

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
// isWorkerDispatchEnabled
// ============================================================================

describe('isWorkerDispatchEnabled', () => {
  const originalEnv = process.env['NEXUS_AORCHESTRA_DISPATCH'];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['NEXUS_AORCHESTRA_DISPATCH'];
    } else {
      process.env['NEXUS_AORCHESTRA_DISPATCH'] = originalEnv;
    }
  });

  it('returns true when env var is not set (default enabled #1321)', () => {
    delete process.env['NEXUS_AORCHESTRA_DISPATCH'];
    expect(isWorkerDispatchEnabled()).toBe(true);
  });

  it('returns true when env var is "true"', () => {
    process.env['NEXUS_AORCHESTRA_DISPATCH'] = 'true';
    expect(isWorkerDispatchEnabled()).toBe(true);
  });

  it('returns false when env var is "false"', () => {
    process.env['NEXUS_AORCHESTRA_DISPATCH'] = 'false';
    expect(isWorkerDispatchEnabled()).toBe(false);
  });
});

// ============================================================================
// executeWorkerDispatch
// ============================================================================

describe('executeWorkerDispatch', () => {
  let mockAdapter: IModelAdapter;

  beforeEach(() => {
    mockAdapter = makeMockAdapter('Worker output here');
  });

  it('executes all workers and returns results', async () => {
    const plan = makePlan(2);
    const result = await executeWorkerDispatch({
      agentPlan: plan,
      taskDescription: 'Implement auth feature',
      modelAdapter: mockAdapter,
      logger,
    });

    expect(result.totalWorkers).toBe(2);
    expect(result.successCount).toBe(2);
    expect(result.errorCount).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.results).toHaveLength(2);
  });

  it('calls model adapter with composed prompt', async () => {
    const plan = makePlan(1);
    await executeWorkerDispatch({
      agentPlan: plan,
      taskDescription: 'Fix login bug',
      modelAdapter: mockAdapter,
      logger,
    });

    const completeFn = mockAdapter.complete as ReturnType<typeof vi.fn>;
    expect(completeFn).toHaveBeenCalledOnce();

    // The request messages should contain the composed prompt
    const request = completeFn.mock.calls[0]?.[0] as { messages: Array<{ content: string }> };
    const prompt = request.messages[0]?.content ?? '';
    expect(prompt).toContain('## Task Context');
    expect(prompt).toContain('Fix login bug');
  });

  it('handles adapter errors gracefully', async () => {
    const failingAdapter = {
      providerId: 'test',
      modelId: 'test-model',
      capabilities: ['text_generation'] as const,
      complete: vi.fn().mockRejectedValue(new Error('Model unavailable')),
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

    expect(result.totalWorkers).toBe(1);
    expect(result.errorCount).toBe(1);
    expect(result.successCount).toBe(0);
    const first = result.results[0];
    expect(first).toBeDefined();
    expect(first?.error).toContain('Model unavailable');
  });

  it('handles model error results', async () => {
    const errorAdapter = {
      providerId: 'test',
      modelId: 'test-model',
      capabilities: ['text_generation'] as const,
      complete: vi
        .fn()
        .mockResolvedValue(
          err(new ModelError('Rate limited', { code: ErrorCode.MODEL_RATE_LIMITED }))
        ),
      stream: vi.fn(),
      countTokens: vi.fn().mockResolvedValue(100),
      validate: vi.fn(),
    } as unknown as IModelAdapter;

    const plan = makePlan(1);
    const result = await executeWorkerDispatch({
      agentPlan: plan,
      taskDescription: 'Task',
      modelAdapter: errorAdapter,
      logger,
    });

    expect(result.errorCount).toBe(1);
    // Error may be original or from alt CLI retry (#1535 — altExecuteWorker)
    expect(result.results[0]?.error).toBeDefined();
  });

  it('respects maxConcurrency option', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    const slowAdapter = {
      providerId: 'test',
      modelId: 'test-model',
      capabilities: ['text_generation'] as const,
      complete: vi.fn().mockImplementation(() => {
        concurrent++;
        if (concurrent > maxConcurrent) maxConcurrent = concurrent;
        return new Promise((resolve) => {
          setTimeout(() => {
            concurrent--;
            resolve(makeSuccessResponse('done'));
          }, 10);
        });
      }),
      stream: vi.fn(),
      countTokens: vi.fn().mockResolvedValue(100),
      validate: vi.fn(),
    } as unknown as IModelAdapter;

    const plan = makePlan(3); // All in wave 1
    await executeWorkerDispatch({
      agentPlan: plan,
      taskDescription: 'Task',
      modelAdapter: slowAdapter,
      logger,
      maxConcurrency: 2,
    });

    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('includes worker output in results', async () => {
    const adapter = makeMockAdapter('Security review findings: no issues');
    const plan = makePlan(1);
    const result = await executeWorkerDispatch({
      agentPlan: plan,
      taskDescription: 'Review auth',
      modelAdapter: adapter,
      logger,
    });

    const first = result.results[0];
    expect(first?.output).toBe('Security review findings: no issues');
    expect(first?.status).toBe('success');
  });

  it('handles multi-wave execution', async () => {
    const plan = makePlan(4); // Wave 1: 3 workers, Wave 2: 1 worker
    const result = await executeWorkerDispatch({
      agentPlan: plan,
      taskDescription: 'Large task',
      modelAdapter: mockAdapter,
      logger,
    });

    expect(result.totalWorkers).toBe(4);
    expect(result.successCount).toBe(4);
  });

  it('detects conflicts in worker outputs', async () => {
    const conflictAdapter = {
      providerId: 'test',
      modelId: 'test-model',
      capabilities: ['text_generation'] as const,
      complete: vi
        .fn()
        .mockResolvedValueOnce(makeSuccessResponse('Modified src/auth.ts for feature'))
        .mockResolvedValueOnce(makeSuccessResponse('Updated src/auth.ts for security')),
      stream: vi.fn(),
      countTokens: vi.fn().mockResolvedValue(100),
      validate: vi.fn(),
    } as unknown as IModelAdapter;

    const plan = makePlan(2);
    const result = await executeWorkerDispatch({
      agentPlan: plan,
      taskDescription: 'Auth work',
      modelAdapter: conflictAdapter,
      logger,
    });

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.filePath).toBe('src/auth.ts');
  });

  it('handles synthesis failure without crashing (#1469)', async () => {
    const failureResult: SynthesisResult = { ok: false, error: 'Synthesis model unavailable' };
    mockSynthesizeResults.mockResolvedValueOnce(failureResult);

    const plan = makePlan(1);
    const result = await executeWorkerDispatch({
      agentPlan: plan,
      taskDescription: 'Task with synthesis',
      modelAdapter: makeMockAdapter('Worker output'),
      logger,
      synthesize: true,
    });

    expect(result.successCount).toBe(1);
    expect(result.synthesis).toBeUndefined();
  });

  it('returns empty conflicts when no overlaps', async () => {
    const noConflictAdapter = {
      providerId: 'test',
      modelId: 'test-model',
      capabilities: ['text_generation'] as const,
      complete: vi
        .fn()
        .mockResolvedValueOnce(makeSuccessResponse('Modified src/auth.ts for feature'))
        .mockResolvedValueOnce(makeSuccessResponse('Updated src/config.ts for settings')),
      stream: vi.fn(),
      countTokens: vi.fn().mockResolvedValue(100),
      validate: vi.fn(),
    } as unknown as IModelAdapter;

    const plan = makePlan(2);
    const result = await executeWorkerDispatch({
      agentPlan: plan,
      taskDescription: 'Auth work',
      modelAdapter: noConflictAdapter,
      logger,
    });

    expect(result.conflicts).toEqual([]);
  });
});

// ============================================================================
// recordWorkerOutcomes (Issue #1323, Epic #1322)
// ============================================================================

describe('recordWorkerOutcomes', () => {
  beforeEach(() => {
    resetOutcomeStore();
  });

  afterEach(() => {
    resetOutcomeStore();
  });

  it('records one outcome per worker result', () => {
    const results: WorkerResult[] = [
      {
        role: 'code',
        subTask: 'Implement feature',
        output: 'done',
        status: 'success',
        durationMs: 100,
      },
      {
        role: 'testing',
        subTask: 'Write tests',
        output: 'done',
        status: 'success',
        durationMs: 200,
      },
    ];

    recordWorkerOutcomes(results, 'Implement auth feature');

    const store = getOutcomeStore();
    const entries = store.query();
    expect(entries).toHaveLength(2);
  });

  it('records success=true for successful workers', () => {
    const results: WorkerResult[] = [
      {
        role: 'code',
        subTask: 'Implement feature',
        output: 'done',
        status: 'success',
        durationMs: 150,
      },
    ];

    recordWorkerOutcomes(results, 'Implement auth');

    const entries = getOutcomeStore().query();
    expect(entries[0]?.success).toBe(true);
    expect(entries[0]?.durationMs).toBe(150);
  });

  it('records success=false for errored workers', () => {
    const results: WorkerResult[] = [
      {
        role: 'security',
        subTask: 'Security review',
        output: '',
        status: 'error',
        durationMs: 500,
        error: 'Model rate limited',
        errorType: 'model_error',
      },
    ];

    recordWorkerOutcomes(results, 'Review security');

    const entries = getOutcomeStore().query();
    expect(entries[0]?.success).toBe(false);
    expect(entries[0]?.failureCategory).toBeDefined();
  });

  it('maps worker errorType to outcome failureCategory', () => {
    const results: WorkerResult[] = [
      {
        role: 'code',
        subTask: 'Task',
        output: '',
        status: 'error',
        durationMs: 30000,
        error: 'Worker timed out',
        errorType: 'timeout',
      },
    ];

    recordWorkerOutcomes(results, 'Task');

    const entries = getOutcomeStore().query();
    expect(entries[0]?.failureCategory).toBe('timeout');
  });

  it('classifies model_error with rate-limit message as rate_limit', () => {
    const results: WorkerResult[] = [
      {
        role: 'code',
        subTask: 'Task',
        output: '',
        status: 'error',
        durationMs: 500,
        error: 'Error: 429 Too Many Requests',
        errorType: 'model_error',
      },
    ];

    recordWorkerOutcomes(results, 'Task');

    const entries = getOutcomeStore().query();
    expect(entries[0]?.failureCategory).toBe('rate_limit');
  });

  it('classifies logic_error with auth message as authentication', () => {
    const results: WorkerResult[] = [
      {
        role: 'security',
        subTask: 'Audit',
        output: '',
        status: 'error',
        durationMs: 200,
        error: 'API key invalid or unauthorized',
        errorType: 'logic_error',
      },
    ];

    recordWorkerOutcomes(results, 'Task');

    const entries = getOutcomeStore().query();
    expect(entries[0]?.failureCategory).toBe('authentication');
  });

  it('uses model=worker-{role} for outcome entries', () => {
    const results: WorkerResult[] = [
      {
        role: 'architecture',
        subTask: 'Design',
        output: 'done',
        status: 'success',
        durationMs: 100,
      },
    ];

    recordWorkerOutcomes(results, 'Design system');

    const entries = getOutcomeStore().query();
    expect(entries[0]?.model).toBe('worker-architecture');
  });

  it('uses source=delegate for all worker outcomes', () => {
    const results: WorkerResult[] = [
      { role: 'code', subTask: 'Code', output: 'done', status: 'success', durationMs: 100 },
    ];

    recordWorkerOutcomes(results, 'Code task');

    const entries = getOutcomeStore().query();
    expect(entries[0]?.source).toBe('delegate');
  });

  it('is best-effort — never throws on store errors', () => {
    const results: WorkerResult[] = [
      { role: 'code', subTask: 'Code', output: 'done', status: 'success', durationMs: 100 },
    ];

    // Even if the store is somehow broken, this should not throw
    expect(() => {
      recordWorkerOutcomes(results, 'Task');
    }).not.toThrow();
  });

  it('records mixed success and error results', () => {
    const results: WorkerResult[] = [
      { role: 'code', subTask: 'Code', output: 'done', status: 'success', durationMs: 100 },
      {
        role: 'testing',
        subTask: 'Test',
        output: '',
        status: 'error',
        durationMs: 200,
        error: 'Failed',
      },
      { role: 'security', subTask: 'Audit', output: 'ok', status: 'success', durationMs: 300 },
    ];

    recordWorkerOutcomes(results, 'Full review');

    const entries = getOutcomeStore().query();
    expect(entries).toHaveLength(3);
    const successes = entries.filter((e) => e.success);
    const failures = entries.filter((e) => !e.success);
    expect(successes).toHaveLength(2);
    expect(failures).toHaveLength(1);
  });

  it('uses resolvedCli from worker result when available (#1527)', () => {
    const results: WorkerResult[] = [
      {
        role: 'code',
        subTask: 'Implement feature',
        output: 'done',
        status: 'success',
        durationMs: 200,
        resolvedCli: 'codex',
      },
    ];

    recordWorkerOutcomes(results, 'Implement auth feature');

    const entries = getOutcomeStore().query();
    expect(entries[0]?.cli).toBe('codex');
  });

  it('excludes skipped workers from outcome recording (#1528)', () => {
    const results: WorkerResult[] = [
      { role: 'code', subTask: 'Code', output: 'done', status: 'success', durationMs: 100 },
      {
        role: 'security',
        subTask: 'Audit',
        output: '',
        status: 'skipped',
        durationMs: 0,
        error: 'Role auto-disabled after consecutive failures',
      },
      { role: 'testing', subTask: 'Test', output: 'done', status: 'success', durationMs: 200 },
    ];

    recordWorkerOutcomes(results, 'Full review');

    const entries = getOutcomeStore().query();
    // Only success + error workers should be recorded, not skipped
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.success)).toBe(true);
  });

  it('falls back to specialization primaryCli when resolvedCli absent (#1527)', () => {
    const results: WorkerResult[] = [
      {
        role: 'code',
        subTask: 'Implement feature',
        output: 'done',
        status: 'success',
        durationMs: 200,
        // No resolvedCli — should use detectTaskCategory result
      },
    ];

    recordWorkerOutcomes(results, 'Implement auth feature');

    const entries = getOutcomeStore().query();
    // 'Implement' matches code_generation → primaryCli is 'codex'
    expect(entries[0]?.cli).toBe('codex');
  });
});
