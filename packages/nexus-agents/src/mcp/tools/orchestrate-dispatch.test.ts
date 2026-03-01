/**
 * Tests for orchestrate-dispatch — worker dispatch integration.
 *
 * @module mcp/tools/orchestrate-dispatch.test
 * (Source: Issue #1303, Epic #1299)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeWorkerDispatch, isWorkerDispatchEnabled } from './orchestrate-dispatch.js';
import type { AgentPlan } from '../../orchestration/aorchestra/index.js';
import type { IModelAdapter } from '../../core/index.js';
import { ok, err, createLogger, ModelError, ErrorCode } from '../../core/index.js';

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

  it('returns false when env var is not set', () => {
    delete process.env['NEXUS_AORCHESTRA_DISPATCH'];
    expect(isWorkerDispatchEnabled()).toBe(false);
  });

  it('returns true when env var is "true"', () => {
    process.env['NEXUS_AORCHESTRA_DISPATCH'] = 'true';
    expect(isWorkerDispatchEnabled()).toBe(true);
  });

  it('returns false when env var is other value', () => {
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
    expect(result.results[0]?.error).toContain('Rate limited');
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
