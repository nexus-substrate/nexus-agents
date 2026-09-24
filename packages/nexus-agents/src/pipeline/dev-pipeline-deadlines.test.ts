/**
 * Per-stage deadlines for the dev pipeline (#6736).
 *
 * `run_dev_pipeline` advertised `timeoutMs` ("Max time per stage") and nothing
 * read it; `runDevPipeline` had no per-stage deadline at all. These tests pin
 * the resolved deadline per stage and, on a fake clock, that a stage past its
 * deadline fails with a timeout AND that the signal it was handed is aborted,
 * so its model calls stop instead of running on behind the failure.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  OPERATION_CLASSES,
  VOTE_TIMEOUTS,
  classOverrideEnvVar,
  getMcpSafeDeadlineMs,
  resolveClassGuardMs,
} from '../config/timeouts.js';
import {
  computeOverallConsensusDeadlineMs,
  DEFAULT_INTER_AGENT_DELAY_MS,
} from '../cli/voter-agents.js';
import { VOTER_ROLES } from '../cli/vote-types.js';
import {
  DevPipelineStageTimeoutError,
  guardDevPipelineStages,
  resolveDevStageTimeoutMs,
} from './dev-pipeline-deadlines.js';
import type { DevPipelineStages, VoteResult } from './dev-pipeline.js';
import { researchContextFromText } from './research-context.js';

describe('resolveDevStageTimeoutMs (#6736)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('gives the vote stage a panel-sized default that fits a full panel', () => {
    const vote = resolveDevStageTimeoutMs('vote', undefined);
    expect(vote).toBe(resolveClassGuardMs('multi-llm-panel'));
    // At least one seat's own deadline, and past the engine's overall deadline
    // for a full panel, so the engine settles (with partial results) first.
    expect(vote).toBeGreaterThanOrEqual(VOTE_TIMEOUTS.defaultMs);
    const fullPanelDeadlineMs = getMcpSafeDeadlineMs(
      computeOverallConsensusDeadlineMs(
        VOTE_TIMEOUTS.defaultMs,
        VOTE_TIMEOUTS.maxRetries,
        Object.keys(VOTER_ROLES).length,
        DEFAULT_INTER_AGENT_DELAY_MS
      ),
      'consensus_vote'
    );
    expect(vote).toBeGreaterThan(fullPanelDeadlineMs);
  });

  it('bounds every other stage by the pipeline class guard by default', () => {
    for (const stage of ['research', 'plan', 'decompose', 'implement', 'qaReview']) {
      expect(resolveDevStageTimeoutMs(stage, undefined)).toBe(resolveClassGuardMs('pipeline'));
    }
  });

  it('applies an explicit timeoutMs to every stage, the vote included', () => {
    const requested = 45_000;
    expect(resolveDevStageTimeoutMs('plan', requested)).toBe(requested);
    expect(resolveDevStageTimeoutMs('vote', requested)).toBe(requested);
    expect(resolveDevStageTimeoutMs('securityScan', requested)).toBe(requested);
  });

  it('clamps an explicit timeoutMs to the pipeline class guard', () => {
    const pipelineCeiling = 400_000;
    vi.stubEnv(classOverrideEnvVar('pipeline'), String(pipelineCeiling));
    expect(resolveDevStageTimeoutMs('implement', 600_000)).toBe(pipelineCeiling);
  });

  it('clamps the panel-sized vote default to the pipeline class guard', () => {
    const pipelineCeiling = 400_000;
    vi.stubEnv(classOverrideEnvVar('pipeline'), String(pipelineCeiling));
    vi.stubEnv(classOverrideEnvVar('multi-llm-panel'), '1200000');
    expect(resolveDevStageTimeoutMs('vote', undefined)).toBe(pipelineCeiling);
  });

  it('lets a stage deadline fire before the async job guard under default settings', () => {
    // A backgrounded run is bounded by the async-job-body guard (#6725). The
    // longest stage deadline must expire first, so the stage fails with its own
    // timeout instead of the whole job being reaped as a runaway.
    expect(resolveDevStageTimeoutMs('implement', undefined)).toBeLessThan(
      OPERATION_CLASSES['async-job-body'].guardMs
    );
    expect(resolveDevStageTimeoutMs('implement', undefined)).toBeLessThan(
      resolveClassGuardMs('async-job-body')
    );
  });
});

// ============================================================================
// Runtime: a stage past its deadline fails and its signal is aborted
// ============================================================================

function stubStages(): DevPipelineStages {
  return {
    research: vi.fn(() => Promise.resolve(researchContextFromText('notes'))),
    plan: vi.fn(() => Promise.resolve('plan')),
    vote: vi.fn(() => Promise.resolve<VoteResult>({ kind: 'approved', approvalPercentage: 100 })),
    decompose: vi.fn(() => Promise.resolve([])),
    implement: vi.fn(() => Promise.resolve('impl')),
    qaReview: vi.fn(() =>
      Promise.resolve({ verdict: 'pass' as const, feedback: 'ok', issues: [] })
    ),
    securityScan: vi.fn(() => Promise.resolve({ passed: true, feedback: 'ok' })),
  };
}

describe('guardDevPipelineStages (#6736)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fails a stage that outlives its deadline and aborts the signal it was handed', async () => {
    const timeoutMs = 30_000;
    const stages = stubStages();
    let seen: AbortSignal | undefined;
    stages.vote = vi.fn((_plan: string, _research: string, signal?: AbortSignal) => {
      seen = signal;
      return new Promise<VoteResult>(() => undefined);
    });
    const guarded = guardDevPipelineStages(stages, { stageTimeoutMs: timeoutMs });

    const pending = guarded.vote('plan', 'research');
    const outcome = pending.then(
      () => 'resolved',
      (e: unknown) => e
    );
    await vi.advanceTimersByTimeAsync(timeoutMs - 1);
    expect(seen?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    const error = await outcome;
    expect(error).toBeInstanceOf(DevPipelineStageTimeoutError);
    expect((error as Error).message).toBe(
      `Dev pipeline vote stage timed out after ${String(timeoutMs)}ms`
    );
    expect(seen?.aborted).toBe(true);
    // TimeoutError, as the async job guard uses (#6725): a CLI breaker counts
    // it as a timeout, not as a caller cancel.
    expect((seen?.reason as DOMException).name).toBe('TimeoutError');
  });

  it('hands every stage its own signal, in the argument after its declared ones', async () => {
    const stages = stubStages();
    const guarded = guardDevPipelineStages(stages, {});
    const task = { id: 't', title: 't', description: 'd', assignedTo: 'coder' as const };
    const pendingTask = { ...task, status: 'pending' as const };

    await guarded.research('task');
    await guarded.plan('task', 'research');
    await guarded.vote('plan', 'research');
    await guarded.decompose('plan');
    await guarded.implement(pendingTask);
    await guarded.qaReview(pendingTask, 'impl');
    await guarded.securityScan();

    const signal = expect.any(AbortSignal) as unknown;
    expect(stages.research).toHaveBeenCalledWith('task', signal);
    // `priorFeedback` stays in its own slot: the signal never lands in it.
    expect(stages.plan).toHaveBeenCalledWith('task', 'research', undefined, signal);
    expect(stages.vote).toHaveBeenCalledWith('plan', 'research', signal);
    expect(stages.decompose).toHaveBeenCalledWith('plan', signal);
    expect(stages.implement).toHaveBeenCalledWith(pendingTask, signal);
    expect(stages.qaReview).toHaveBeenCalledWith(pendingTask, 'impl', signal);
    expect(stages.securityScan).toHaveBeenCalledWith(signal);
  });

  it('passes the quality gate its signal when the stage is supplied', async () => {
    const qualityGate = vi.fn(() => Promise.resolve({ passed: true, feedback: 'ok' }));
    const guarded = guardDevPipelineStages({ ...stubStages(), qualityGate }, {});
    await guarded.qualityGate?.();
    expect(qualityGate).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(guardDevPipelineStages(stubStages(), {}).qualityGate).toBeUndefined();
  });

  it('leaves the signal of a stage that finishes in time un-aborted and clears its timer', async () => {
    const stages = stubStages();
    let seen: AbortSignal | undefined;
    stages.plan = vi.fn((_t: string, _r: string, _f?: string, signal?: AbortSignal) => {
      seen = signal;
      return Promise.resolve('plan');
    });
    const guarded = guardDevPipelineStages(stages, { stageTimeoutMs: 30_000 });

    await expect(guarded.plan('task', 'research')).resolves.toBe('plan');
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(seen?.aborted).toBe(false);
  });

  it("forwards the run's cancel to the in-flight stage's signal", async () => {
    const controller = new AbortController();
    const stages = stubStages();
    let seen: AbortSignal | undefined;
    stages.implement = vi.fn((_task, signal?: AbortSignal) => {
      seen = signal;
      return new Promise<string>(() => undefined);
    });
    const guarded = guardDevPipelineStages(stages, { signal: controller.signal });

    void guarded
      .implement({ id: 't', title: 't', description: 'd', assignedTo: 'coder', status: 'pending' })
      .catch(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(seen?.aborted).toBe(false);
    controller.abort(new Error('cancelled'));
    expect(seen?.aborted).toBe(true);
  });

  it('refuses to start a stage once the run is cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const stages = stubStages();
    const guarded = guardDevPipelineStages(stages, { signal: controller.signal });

    await expect(guarded.decompose('plan')).rejects.toThrow(
      'Dev pipeline cancelled before the decompose stage'
    );
    expect(stages.decompose).not.toHaveBeenCalled();
  });
});
