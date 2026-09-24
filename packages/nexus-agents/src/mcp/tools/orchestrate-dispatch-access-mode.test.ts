/**
 * Orchestrate workers run in read-only analysis mode (#6792).
 *
 * A worker's output is consumed as text: it is synthesized, checked for
 * conflicting file references and recorded. Nothing reads a file a worker
 * wrote, so the worker call asks for `'read-only-analysis'`, and the worker's
 * outcome row records the mode it ran under.
 *
 * @module mcp/tools/orchestrate-dispatch-access-mode.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeWorkerDispatch, recordWorkerOutcomes } from './orchestrate-dispatch.js';
import type { AgentPlan } from '../../orchestration/aorchestra/index.js';
import type { CompletionRequest, IModelAdapter } from '../../core/index.js';
import { ok, err, createLogger, ModelError, ErrorCode } from '../../core/index.js';
import { getOutcomeStore, resetOutcomeStore } from '../../orchestration/outcomes/index.js';

vi.mock('../../config/learning-persistence.js', () => ({
  isPersistenceEnabled: vi.fn(() => false),
}));
vi.mock('../../adapters/unified-registry.js', () => ({
  getGlobalRegistry: vi.fn(() => ({
    getAdapterForCli: vi.fn(() => {
      throw new Error('No adapter in test');
    }),
  })),
}));
vi.mock('./create-expert-routing.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./create-expert-routing.js')>();
  return { ...actual, getExpertFallbackChain: vi.fn(() => []) };
});

const logger = createLogger({ component: 'test-dispatch-access-mode' });

function plan(roles: readonly string[]): AgentPlan {
  return {
    entries: roles.map((role, i) => ({
      role: role as 'code',
      subTask: `Task for ${role}`,
      priority: i + 1,
      reasoning: `Selected for ${role}`,
      wave: 1,
    })),
    totalExperts: roles.length,
    taskType: 'code_implementation',
    complexity: 'moderate',
    reasoning: 'Test plan',
    suggestedWaveSize: 3,
  };
}

function recordingAdapter(): { adapter: IModelAdapter; requests: CompletionRequest[] } {
  const requests: CompletionRequest[] = [];
  const adapter = {
    providerId: 'test',
    modelId: 'test-model',
    capabilities: ['text_generation'] as const,
    complete: vi.fn((request: CompletionRequest) => {
      requests.push(request);
      return Promise.resolve(
        ok({
          content: [{ type: 'text' as const, text: 'analysis' }],
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          stopReason: 'end_turn' as const,
          model: 'test-model',
        })
      );
    }),
    stream: vi.fn(),
    countTokens: vi.fn().mockResolvedValue(100),
    validate: vi.fn().mockResolvedValue(ok(undefined)),
  } as unknown as IModelAdapter;
  return { adapter, requests };
}

beforeEach(() => {
  resetOutcomeStore();
});
afterEach(() => {
  resetOutcomeStore();
});

describe('orchestrate worker access mode (#6792)', () => {
  it('every worker call, write-tier roles included, asks for read-only analysis', async () => {
    const { adapter, requests } = recordingAdapter();

    await executeWorkerDispatch({
      agentPlan: plan(['code', 'testing', 'architecture']),
      taskDescription: 'Implement auth feature',
      modelAdapter: adapter,
      logger,
    });

    expect(requests).toHaveLength(3);
    expect(requests.map((r) => r.accessMode)).toEqual([
      'read-only-analysis',
      'read-only-analysis',
      'read-only-analysis',
    ]);
  });

  it('records the mode on each worker outcome row', async () => {
    const { adapter } = recordingAdapter();
    const result = await executeWorkerDispatch({
      agentPlan: plan(['code']),
      taskDescription: 'Implement auth feature',
      modelAdapter: adapter,
      logger,
    });

    recordWorkerOutcomes(result.results, 'Implement auth feature');

    const rows = getOutcomeStore().query();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.qualitySignals).toEqual(['access-mode:read-only-analysis']);
  });

  it('records the mode on a failed worker row too', async () => {
    const { adapter } = recordingAdapter();
    (adapter.complete as ReturnType<typeof vi.fn>).mockResolvedValue(
      err(new ModelError('refused', { code: ErrorCode.MODEL_ERROR }))
    );
    const result = await executeWorkerDispatch({
      agentPlan: plan(['code']),
      taskDescription: 'Implement auth feature',
      modelAdapter: adapter,
      logger,
    });

    recordWorkerOutcomes(result.results, 'Implement auth feature');

    const rows = getOutcomeStore().query();
    expect(rows.every((r) => !r.success)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((r) => r.qualitySignals)).toEqual(
      rows.map(() => ['access-mode:read-only-analysis'])
    );
  });

  it('a result that never reached a worker call records no mode (unmeasured)', () => {
    recordWorkerOutcomes(
      [{ role: 'code', subTask: 's', output: 'x', status: 'success', durationMs: 1 }],
      'Implement auth feature'
    );

    expect(getOutcomeStore().query()[0]?.qualitySignals).toBeUndefined();
  });
});
