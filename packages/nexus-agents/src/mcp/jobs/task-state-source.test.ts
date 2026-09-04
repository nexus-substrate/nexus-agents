/**
 * Tests for the task-state job-result source (#3090 / epic #2631).
 * Covers the pure StructuredTaskState→JobResult mapping, the read adapter,
 * and the flag-gated dual-read resolver.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  jobResultFromTaskState,
  toolNameFromJobId,
  readJobResultFromTaskState,
  isTaskStateJobSource,
  resolveJobResult,
  resolveJobResultWithSource,
  listJobsFromTaskState,
  resolveJobList,
} from './task-state-source.js';
import { writeJobComplete } from './job-result-store.js';
import type { StructuredTaskState } from '../../context/structured-task-state-types.js';
import {
  initTaskState,
  updateStage,
  appendResult,
  appendCancellation,
  appendBlocker,
} from '../../context/structured-task-state.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';

function makeState(overrides: Partial<StructuredTaskState> = {}): StructuredTaskState {
  return {
    taskId: 'orch-abc-123',
    stage: 'planning',
    decisions: [],
    blockers: [],
    position: { currentStep: 'init' },
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:05:00Z',
    ...overrides,
  };
}

describe('toolNameFromJobId', () => {
  it('maps known prefixes', () => {
    expect(toolNameFromJobId('orch-1-a')).toBe('orchestrate');
    // run_workflow / consensus_vote mint two-segment `job-rw-…` / `job-vote-…`
    // ids; they must stay distinct despite sharing the `job` first segment.
    expect(toolNameFromJobId('job-rw-abc123')).toBe('run_workflow');
    expect(toolNameFromJobId('job-vote-abc123')).toBe('consensus_vote');
    expect(toolNameFromJobId('dp-abc123')).toBe('run_dev_pipeline');
    expect(toolNameFromJobId('rp-abc123')).toBe('run_pipeline');
    expect(toolNameFromJobId('pr-abc123')).toBe('pr_review');
    expect(toolNameFromJobId('sc-abc123')).toBe('supply_chain_tradeoff_panel');
    expect(toolNameFromJobId('es-abc123')).toBe('execute_spec');
    expect(toolNameFromJobId('gw-abc123')).toBe('run_graph_workflow');
    expect(toolNameFromJobId('rn-abc123')).toBe('run');
  });
  it('returns "unknown" for unrecognized or prefix-less ids', () => {
    expect(toolNameFromJobId('weird-1-a')).toBe('unknown');
    expect(toolNameFromJobId('noseparator')).toBe('unknown');
  });
});

describe('jobResultFromTaskState — status mapping', () => {
  it('pending for non-terminal stages (incl. blocked)', () => {
    for (const stage of ['planning', 'executing', 'verifying', 'blocked'] as const) {
      const r = jobResultFromTaskState(makeState({ stage }), 'orch-abc-123');
      expect(r.status).toBe('pending');
      expect(r.completedAt).toBeUndefined();
    }
  });

  it('complete with result passthrough', () => {
    const payload = { answer: 42 };
    const r = jobResultFromTaskState(
      makeState({ stage: 'complete', result: payload }),
      'orch-abc-123'
    );
    expect(r.status).toBe('complete');
    expect(r.result).toEqual(payload);
    expect(r.completedAt).toBe('2026-05-01T00:05:00Z');
    expect(r.error).toBeUndefined();
  });

  it('failed sources error from the most-recent blocker', () => {
    const r = jobResultFromTaskState(
      makeState({
        stage: 'failed',
        blockers: [
          { ts: '2026-05-01T00:02:00Z', blocker: 'first' },
          { ts: '2026-05-01T00:04:00Z', blocker: 'adapter timeout' },
        ],
      }),
      'orch-abc-123'
    );
    expect(r.status).toBe('failed');
    expect(r.error).toBe('adapter timeout');
    expect(r.completedAt).toBe('2026-05-01T00:05:00Z');
  });

  it('cancelled (cancellation wins over stage) sources error from reason', () => {
    const r = jobResultFromTaskState(
      makeState({
        stage: 'executing',
        cancellation: { requestedAt: '2026-05-01T00:03:00Z', reason: 'user aborted' },
      }),
      'orch-abc-123'
    );
    expect(r.status).toBe('cancelled');
    expect(r.error).toBe('user aborted');
  });

  it('cancelled without a reason omits error', () => {
    const r = jobResultFromTaskState(
      makeState({ cancellation: { requestedAt: '2026-05-01T00:03:00Z' } }),
      'orch-abc-123'
    );
    expect(r.status).toBe('cancelled');
    expect(r.error).toBeUndefined();
  });

  it('derives toolName and falls back createdAt→updatedAt', () => {
    const r = jobResultFromTaskState(
      makeState({ taskId: 'orch-x', createdAt: undefined }),
      'orch-x'
    );
    expect(r.toolName).toBe('orchestrate');
    expect(r.createdAt).toBe('2026-05-01T00:05:00Z');
    expect(r.v).toBe(1);
  });
});

describe('readJobResultFromTaskState + resolveJobResult (filesystem)', () => {
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];
  const originalSource = process.env['NEXUS_JOB_RESULT_SOURCE'];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-tss-test-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    delete process.env['NEXUS_JOB_RESULT_SOURCE'];
    resetNexusDataDirCache();
  });

  afterEach(() => {
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    if (originalSource === undefined) delete process.env['NEXUS_JOB_RESULT_SOURCE'];
    else process.env['NEXUS_JOB_RESULT_SOURCE'] = originalSource;
    resetNexusDataDirCache();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeCompletedTaskLog(taskId: string, result: unknown): void {
    initTaskState({
      taskId,
      stage: 'planning',
      decisions: [],
      blockers: [],
      position: { currentStep: 'init' },
      updatedAt: '2026-05-01T00:00:00Z',
    });
    updateStage(taskId, 'complete', '2026-05-01T00:05:00Z');
    appendResult(taskId, result, '2026-05-01T00:05:01Z');
  }

  it('reads a completed job from the task-state log', () => {
    writeCompletedTaskLog('orch-job-1', { ok: true });
    const r = readJobResultFromTaskState('orch-job-1');
    expect(r).not.toBeNull();
    expect(r?.status).toBe('complete');
    expect(r?.result).toEqual({ ok: true });
    expect(r?.toolName).toBe('orchestrate');
    expect(r?.createdAt).toBe('2026-05-01T00:00:00Z');
  });

  it('reads a cancelled job', () => {
    initTaskState({
      taskId: 'orch-job-c',
      stage: 'executing',
      decisions: [],
      blockers: [],
      position: { currentStep: 'run' },
      updatedAt: '2026-05-01T00:00:00Z',
    });
    appendCancellation('orch-job-c', {
      requestedAt: '2026-05-01T00:01:00Z',
      reason: 'stop',
    });
    const r = readJobResultFromTaskState('orch-job-c');
    expect(r?.status).toBe('cancelled');
    expect(r?.error).toBe('stop');
  });

  it('reads a failed job (failed stage + blocker)', () => {
    initTaskState({
      taskId: 'orch-job-f',
      stage: 'executing',
      decisions: [],
      blockers: [],
      position: { currentStep: 'run' },
      updatedAt: '2026-05-01T00:00:00Z',
    });
    appendBlocker('orch-job-f', { ts: '2026-05-01T00:02:00Z', blocker: 'boom' });
    updateStage('orch-job-f', 'failed', '2026-05-01T00:03:00Z');
    const r = readJobResultFromTaskState('orch-job-f');
    expect(r?.status).toBe('failed');
    expect(r?.error).toBe('boom');
  });

  it('returns null when no task-state log exists', () => {
    expect(readJobResultFromTaskState('orch-missing')).toBeNull();
  });

  it('isTaskStateJobSource defaults OFF', () => {
    expect(isTaskStateJobSource()).toBe(false);
  });

  it('resolveJobResult: flag OFF reads sidecar, ignores task-state', () => {
    // Task-state log exists, but flag is off → must NOT read it.
    writeCompletedTaskLog('orch-resolve-1', { fromTaskState: true });
    writeJobComplete('orch-resolve-1', 'orchestrate', { fromSidecar: true });
    const r = resolveJobResult('orch-resolve-1');
    expect(r?.result).toEqual({ fromSidecar: true });
  });

  it('resolveJobResult: flag ON prefers task-state', () => {
    process.env['NEXUS_JOB_RESULT_SOURCE'] = 'task_state';
    writeCompletedTaskLog('orch-resolve-2', { fromTaskState: true });
    writeJobComplete('orch-resolve-2', 'orchestrate', { fromSidecar: true });
    const r = resolveJobResult('orch-resolve-2');
    expect(r?.result).toEqual({ fromTaskState: true });
  });

  // #5008 follow-up: a task-state-sourced record is SYNTHESIZED and never
  // carries `producerVersion`, so absence alone would mean three things
  // (pre-field sidecar, dev build, task-state adapter). The resolver names
  // the source so the reader can say which.
  it('resolveJobResultWithSource: names task_state when the task-state log answered', () => {
    process.env['NEXUS_JOB_RESULT_SOURCE'] = 'task_state';
    writeCompletedTaskLog('orch-src-1', { fromTaskState: true });
    const r = resolveJobResultWithSource('orch-src-1');
    expect(r?.source).toBe('task_state');
    expect(r?.record.result).toEqual({ fromTaskState: true });
    expect(r?.record.producerVersion).toBeUndefined();
  });

  it('resolveJobResultWithSource: names sidecar on the flag-ON fallback', () => {
    process.env['NEXUS_JOB_RESULT_SOURCE'] = 'task_state';
    writeJobComplete('orch-src-2', 'orchestrate', { fromSidecar: true }, '9.9.9-fixture');
    const r = resolveJobResultWithSource('orch-src-2');
    expect(r?.source).toBe('sidecar');
    expect(r?.record.producerVersion).toBe('9.9.9-fixture');
  });

  it('resolveJobResultWithSource: names sidecar when the flag is OFF', () => {
    writeCompletedTaskLog('orch-src-3', { fromTaskState: true });
    writeJobComplete('orch-src-3', 'orchestrate', { fromSidecar: true });
    expect(resolveJobResultWithSource('orch-src-3')?.source).toBe('sidecar');
  });

  it('resolveJobResultWithSource: null when neither source has the job', () => {
    process.env['NEXUS_JOB_RESULT_SOURCE'] = 'task_state';
    expect(resolveJobResultWithSource('orch-src-missing')).toBeNull();
  });

  it('resolveJobResult: flag ON falls back to sidecar when no task-state log', () => {
    process.env['NEXUS_JOB_RESULT_SOURCE'] = 'task_state';
    writeJobComplete('orch-resolve-3', 'orchestrate', { fromSidecar: true });
    const r = resolveJobResult('orch-resolve-3');
    expect(r?.result).toEqual({ fromSidecar: true });
  });

  // #3693: list-side dual-read — mirrors resolveJobResult's reader semantics.
  it('listJobsFromTaskState: summarizes every task-state job', () => {
    writeCompletedTaskLog('orch-list-1', { ok: 1 });
    writeCompletedTaskLog('orch-list-2', { ok: 2 });
    const summaries = listJobsFromTaskState();
    const ids = summaries.map((s) => s.jobId).sort();
    expect(ids).toEqual(['orch-list-1', 'orch-list-2']);
    const one = summaries.find((s) => s.jobId === 'orch-list-1');
    expect(one?.toolName).toBe('orchestrate');
    expect(one?.status).toBe('complete');
    expect(one?.hasError).toBe(false);
  });

  it('resolveJobList: flag OFF returns the sidecar list only', () => {
    writeJobComplete('orch-only-sidecar', 'orchestrate', { fromSidecar: true });
    writeCompletedTaskLog('orch-only-taskstate', { fromTaskState: true });
    const ids = resolveJobList().map((s) => s.jobId);
    expect(ids).toContain('orch-only-sidecar');
    expect(ids).not.toContain('orch-only-taskstate');
  });

  it('resolveJobList: flag ON unions both sources, preferring task-state on collision', () => {
    process.env['NEXUS_JOB_RESULT_SOURCE'] = 'task_state';
    writeJobComplete('orch-sidecar-only', 'orchestrate', { s: true });
    writeCompletedTaskLog('orch-taskstate-only', { t: true });
    // Same jobId in BOTH: task-state must win (it's the migration target).
    writeJobComplete('orch-both', 'orchestrate', { fromSidecar: true });
    writeCompletedTaskLog('orch-both', { fromTaskState: true });
    const summaries = resolveJobList();
    const ids = summaries.map((s) => s.jobId).sort();
    expect(ids).toEqual(['orch-both', 'orch-sidecar-only', 'orch-taskstate-only']);
    // No duplicate for the collision id.
    expect(summaries.filter((s) => s.jobId === 'orch-both')).toHaveLength(1);
    // Newest-first ordering preserved (like listJobs()).
    const createdDesc = summaries.map((s) => s.createdAt);
    expect([...createdDesc].sort((a, b) => b.localeCompare(a))).toEqual(createdDesc);
  });
});
