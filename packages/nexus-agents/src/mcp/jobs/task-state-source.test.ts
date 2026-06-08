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
    expect(toolNameFromJobId('rwf-1-a')).toBe('run_workflow');
    expect(toolNameFromJobId('cv-1-a')).toBe('consensus_vote');
    expect(toolNameFromJobId('dp-abc123')).toBe('run_dev_pipeline');
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

  it('resolveJobResult: flag ON falls back to sidecar when no task-state log', () => {
    process.env['NEXUS_JOB_RESULT_SOURCE'] = 'task_state';
    writeJobComplete('orch-resolve-3', 'orchestrate', { fromSidecar: true });
    const r = resolveJobResult('orch-resolve-3');
    expect(r?.result).toEqual({ fromSidecar: true });
  });
});
