/**
 * Tests for structured task state (#2033).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  appendBlocker,
  appendDecision,
  initTaskState,
  readTaskState,
  reduceLogEntries,
  resolveBlocker,
  updatePosition,
  updateStage,
} from './structured-task-state.js';
import type { StructuredTaskLogEntry, StructuredTaskState } from './structured-task-state-types.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-task-state-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeInitialState(taskId = 'task-1'): StructuredTaskState {
  return {
    taskId,
    stage: 'planning',
    decisions: [],
    blockers: [],
    position: { currentStep: 'read spec' },
    updatedAt: '2026-04-19T00:00:00Z',
  };
}

describe('initTaskState + readTaskState', () => {
  it('round-trips initial state', () => {
    const initial = makeInitialState();
    const initR = initTaskState(initial, tmpDir);
    expect(initR.ok).toBe(true);

    const readR = readTaskState('task-1', tmpDir);
    expect(readR.ok).toBe(true);
    if (readR.ok) {
      expect(readR.value).toEqual(initial);
    }
  });

  it('errors when log file is missing', () => {
    const r = readTaskState('no-such-task', tmpDir);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain('No state log');
  });

  it('errors when init entry is missing', () => {
    // Write a valid decision entry but no init.
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'state-orphan.jsonl'),
      JSON.stringify({
        event: 'decision',
        ts: '2026-04-19T00:00:00Z',
        decision: {
          ts: '2026-04-19T00:00:00Z',
          decision: 'x',
          rationale: 'y',
        },
      }) + '\n'
    );
    const r = readTaskState('orphan', tmpDir);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain('No init entry');
  });
});

describe('append + resolve', () => {
  it('appends decisions and reads them back in order', () => {
    const initial = makeInitialState();
    initTaskState(initial, tmpDir);
    appendDecision(
      'task-1',
      { ts: '2026-04-19T01:00:00Z', decision: 'use SQLite', rationale: 'stable' },
      tmpDir
    );
    appendDecision(
      'task-1',
      { ts: '2026-04-19T02:00:00Z', decision: 'add index', rationale: 'perf' },
      tmpDir
    );

    const r = readTaskState('task-1', tmpDir);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.decisions.length).toBe(2);
      expect(r.value.decisions[0]?.decision).toBe('use SQLite');
      expect(r.value.decisions[1]?.decision).toBe('add index');
      expect(r.value.updatedAt).toBe('2026-04-19T02:00:00Z');
    }
  });

  it('appends blockers and allows resolving them by index', () => {
    initTaskState(makeInitialState(), tmpDir);
    appendBlocker('task-1', { ts: '2026-04-19T01:00:00Z', blocker: 'missing creds' }, tmpDir);
    appendBlocker('task-1', { ts: '2026-04-19T02:00:00Z', blocker: 'rate limit' }, tmpDir);
    resolveBlocker('task-1', 0, '2026-04-19T03:00:00Z', tmpDir);

    const r = readTaskState('task-1', tmpDir);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.blockers.length).toBe(2);
      expect(r.value.blockers[0]?.resolved).toBe('2026-04-19T03:00:00Z');
      expect(r.value.blockers[1]?.resolved).toBeUndefined();
    }
  });

  it('updates stage and position', () => {
    initTaskState(makeInitialState(), tmpDir);
    updateStage('task-1', 'executing', '2026-04-19T01:00:00Z', tmpDir);
    updatePosition(
      'task-1',
      { currentStep: 'apply patch', nextStep: 'run tests' },
      '2026-04-19T02:00:00Z',
      tmpDir
    );
    updateStage('task-1', 'verifying', '2026-04-19T03:00:00Z', tmpDir);

    const r = readTaskState('task-1', tmpDir);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.stage).toBe('verifying');
      expect(r.value.position.currentStep).toBe('apply patch');
      expect(r.value.position.nextStep).toBe('run tests');
      expect(r.value.updatedAt).toBe('2026-04-19T03:00:00Z');
    }
  });
});

describe('reduceLogEntries', () => {
  it('folds a sequence of entries into final state without filesystem', () => {
    const initial = makeInitialState();
    const entries: StructuredTaskLogEntry[] = [
      { event: 'init', ts: initial.updatedAt, state: initial },
      {
        event: 'decision',
        ts: '2026-04-19T01:00:00Z',
        decision: {
          ts: '2026-04-19T01:00:00Z',
          decision: 'a',
          rationale: 'b',
        },
      },
      { event: 'stage', ts: '2026-04-19T02:00:00Z', stage: 'executing' },
    ];
    const r = reduceLogEntries('task-1', entries);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.stage).toBe('executing');
      expect(r.value.decisions.length).toBe(1);
      expect(r.value.updatedAt).toBe('2026-04-19T02:00:00Z');
    }
  });

  it('rejects mismatched taskId', () => {
    const initial = makeInitialState('task-A');
    const r = reduceLogEntries('task-B', [
      { event: 'init', ts: initial.updatedAt, state: initial },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain('Task ID mismatch');
  });
});

describe('path traversal safety', () => {
  it('rejects taskId with ../ sequences', () => {
    const r = appendDecision(
      '../evil',
      { ts: '2026-04-19T00:00:00Z', decision: 'x', rationale: 'y' },
      tmpDir
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain('path traversal');
  });

  it('rejects taskId with slashes', () => {
    const r = readTaskState('foo/bar', tmpDir);
    expect(r.ok).toBe(false);
  });

  it('rejects empty taskId', () => {
    const r = readTaskState('', tmpDir);
    expect(r.ok).toBe(false);
  });
});

describe('malformed log resilience', () => {
  it('skips garbage JSON lines but reads valid ones', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const initial = makeInitialState();
    const validInit = JSON.stringify({
      event: 'init',
      ts: initial.updatedAt,
      state: initial,
    });
    const logLine = `${validInit}\nnot json at all\n${JSON.stringify({
      event: 'decision',
      ts: '2026-04-19T01:00:00Z',
      decision: { ts: '2026-04-19T01:00:00Z', decision: 'a', rationale: 'b' },
    })}\n`;
    fs.writeFileSync(path.join(tmpDir, 'state-task-1.jsonl'), logLine);

    const r = readTaskState('task-1', tmpDir);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.decisions.length).toBe(1);
    }
  });
});
