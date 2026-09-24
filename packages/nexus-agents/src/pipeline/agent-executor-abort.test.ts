/**
 * The stage's abort signal reaches the model calls (#6736).
 *
 * `runDevPipeline` hands each stage call a signal that aborts on the stage's
 * deadline or on a job cancel. A stage that drops it still "fails" at the
 * deadline, but its CLI subprocess or voter panel runs on behind the failure.
 * These tests pin that each model-calling stage forwards it, and that an
 * aborted expert call is not recorded as the model's own failure.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const bridgeResult = {
  success: true,
  text: 'ok',
  expertType: 'code',
  durationMs: 1,
  tokensUsed: 1,
} as const;

vi.mock('./expert-bridge.js', () => ({
  executeExpert: vi.fn(() => Promise.resolve(bridgeResult)),
}));
vi.mock('../mcp/tools/consensus-vote.js', () => ({
  executeVoting: vi.fn().mockRejectedValue(new Error('voters unavailable')),
}));

const { recordOutcomeMock } = vi.hoisted(() => ({ recordOutcomeMock: vi.fn() }));
vi.mock('./agent-executor-core.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./agent-executor-core.js')>()),
  recordOutcome: recordOutcomeMock,
}));

import { createAgentStages, runExpert } from './agent-executor.js';
import { createBudgetGuard } from './budget-guard.js';
import { executeExpert } from './expert-bridge.js';
import { executeVoting } from '../mcp/tools/consensus-vote.js';

const TASK = { id: 't1', title: 'x', description: 'y', assignedTo: 'coder', status: 'pending' };

beforeEach(() => {
  vi.mocked(executeExpert).mockClear();
  vi.mocked(executeExpert).mockImplementation(() => Promise.resolve(bridgeResult));
  vi.mocked(executeVoting).mockClear();
  recordOutcomeMock.mockClear();
});

/** The signal each executeExpert call received, in call order. */
function expertSignals(): unknown[] {
  return vi.mocked(executeExpert).mock.calls.map((c) => c[2]?.signal);
}

describe('runExpert forwards the stage signal (#6736)', () => {
  it('hands the signal to the expert call', async () => {
    const signal = new AbortController().signal;
    await runExpert(createBudgetGuard(), 'code', 'prompt', 'exec', signal);
    expect(expertSignals()).toEqual([signal]);
  });

  it('throws the abort reason instead of returning a failure once the signal fires', async () => {
    const controller = new AbortController();
    const reason = new DOMException('stage timed out', 'TimeoutError');
    vi.mocked(executeExpert).mockImplementation(() => {
      controller.abort(reason);
      return Promise.resolve({ ...bridgeResult, success: false, text: '', error: 'aborted' });
    });

    await expect(
      runExpert(createBudgetGuard(), 'code', 'prompt', 'exec', controller.signal)
    ).rejects.toBe(reason);
  });

  it('does not start an expert call on an already-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    await expect(
      runExpert(createBudgetGuard(), 'code', 'prompt', 'exec', controller.signal)
    ).rejects.toThrow('cancelled');
    expect(executeExpert).not.toHaveBeenCalled();
  });
});

describe('model-calling stages forward their signal (#6736)', () => {
  it('plan, decompose, implement and qaReview hand it to the expert call', async () => {
    const stages = createAgentStages({});
    const signal = new AbortController().signal;

    await stages.plan('task', 'research', undefined, signal);
    await stages.decompose('plan', signal);
    await stages.implement(TASK as never, signal);
    await stages.qaReview(TASK as never, 'impl', signal);

    expect(expertSignals()).toEqual([signal, signal, signal, signal]);
  });

  it('does not record an aborted implement call as the model failing', async () => {
    const controller = new AbortController();
    vi.mocked(executeExpert).mockImplementation(() => {
      controller.abort(new Error('cancelled'));
      return Promise.resolve({ ...bridgeResult, success: false, text: '' });
    });
    const stages = createAgentStages({});

    await expect(stages.implement(TASK as never, controller.signal)).rejects.toThrow('cancelled');
    expect(recordOutcomeMock).not.toHaveBeenCalled();
  });

  it('the vote stage hands it to the panel, which aborts in-flight seats', async () => {
    const stages = createAgentStages({});
    const signal = new AbortController().signal;

    await stages.vote('plan', 'research', signal);

    expect(vi.mocked(executeVoting).mock.calls[0]?.[2]).toEqual({ signal });
  });
});
