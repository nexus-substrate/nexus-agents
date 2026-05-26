/**
 * Tests for structured task state (#2033).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  appendBlocker,
  appendCancellation,
  appendDecision,
  appendProgressLedgerEntry,
  appendResult,
  initTaskState,
  readTaskState,
  reduceLogEntries,
  reflect,
  resolveBlocker,
  updatePosition,
  updateStage,
  updateTaskLedger,
} from './structured-task-state.js';
import {
  TASK_RESULT_MAX_BYTES,
  type ProgressLedgerEntry,
  type StructuredTaskLogEntry,
  type StructuredTaskState,
  type TaskLedger,
} from './structured-task-state-types.js';

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
      // #3043: reducer now backfills `version: 0` for old-shape state
      // logs that didn't carry it. Backward-compat invariant — see
      // reduceLogEntries in structured-task-state.ts.
      expect(readR.value).toEqual({ ...initial, version: 0 });
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

// ---------------------------------------------------------------------------
// Magentic-One Task Ledger + Progress Ledger (#2278)
// ---------------------------------------------------------------------------

function makeTaskLedger(updatedAt = '2026-04-28T00:00:00Z'): TaskLedger {
  return {
    facts: ['repo uses TypeScript', 'main is clean'],
    guesses: ['failing test is a flake'],
    openQuestions: ['does the new code path break under concurrent load?'],
    updatedAt,
  };
}

function makeProgressEntry(overrides: Partial<ProgressLedgerEntry> = {}): ProgressLedgerEntry {
  return {
    ts: '2026-04-28T00:01:00Z',
    step: 'ran the tests',
    planStillValid: true,
    stuck: false,
    suggestedAction: 'continue',
    rationale: 'tests pass; proceed to PR',
    ...overrides,
  };
}

describe('Magentic-One Task Ledger', () => {
  it('round-trips through replay', () => {
    const initial = makeInitialState();
    initTaskState(initial, tmpDir);
    const ledger = makeTaskLedger();
    const r = updateTaskLedger('task-1', ledger, tmpDir);
    expect(r.ok).toBe(true);

    const read = readTaskState('task-1', tmpDir);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.value.taskLedger).toEqual(ledger);
      expect(read.value.updatedAt).toBe('2026-04-28T00:00:00Z');
    }
  });

  it('replaces atomically — most recent ledger wins', () => {
    const initial = makeInitialState();
    initTaskState(initial, tmpDir);
    updateTaskLedger('task-1', makeTaskLedger('2026-04-28T00:00:00Z'), tmpDir);
    const revised: TaskLedger = {
      facts: ['repo uses TypeScript', 'main is clean', 'concurrent test passes'],
      guesses: [],
      openQuestions: [],
      updatedAt: '2026-04-28T00:05:00Z',
    };
    updateTaskLedger('task-1', revised, tmpDir);

    const read = readTaskState('task-1', tmpDir);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.value.taskLedger).toEqual(revised);
    }
  });
});

describe('Magentic-One Progress Ledger', () => {
  it('appends entries in order', () => {
    initTaskState(makeInitialState(), tmpDir);
    appendProgressLedgerEntry(
      'task-1',
      makeProgressEntry({ ts: '2026-04-28T00:01:00Z', step: 'first step' }),
      tmpDir
    );
    appendProgressLedgerEntry(
      'task-1',
      makeProgressEntry({
        ts: '2026-04-28T00:02:00Z',
        step: 'second step',
        suggestedAction: 'revise_plan',
        stuck: true,
        rationale: 'tests are flaking; replan',
      }),
      tmpDir
    );

    const read = readTaskState('task-1', tmpDir);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.value.progressLedger?.length).toBe(2);
      expect(read.value.progressLedger?.[0]?.step).toBe('first step');
      expect(read.value.progressLedger?.[1]?.suggestedAction).toBe('revise_plan');
    }
  });
});

describe('reflect()', () => {
  it("returns 'continue' when no progress-ledger entries exist yet", () => {
    initTaskState(makeInitialState(), tmpDir);
    const r = reflect('task-1', tmpDir);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('continue');
  });

  it('returns the most recent entry suggested action', () => {
    initTaskState(makeInitialState(), tmpDir);
    appendProgressLedgerEntry(
      'task-1',
      makeProgressEntry({ ts: '2026-04-28T00:01:00Z', suggestedAction: 'continue' }),
      tmpDir
    );
    appendProgressLedgerEntry(
      'task-1',
      makeProgressEntry({
        ts: '2026-04-28T00:02:00Z',
        suggestedAction: 'escalate_to_human',
        stuck: true,
        rationale: 'three replans without progress',
      }),
      tmpDir
    );

    const r = reflect('task-1', tmpDir);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('escalate_to_human');
  });

  it('errors cleanly when the task log does not exist', () => {
    const r = reflect('does-not-exist', tmpDir);
    expect(r.ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// #3043 / epic #2631 Stage 2 — version / result / cancellation
// ─────────────────────────────────────────────────────────────────────

/** Test helper — readTaskState + type-guarded version assertion. */
function expectVersion(taskId: string, expected: number): void {
  const r = readTaskState(taskId, tmpDir);
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.value.version).toBe(expected);
}

describe('monotonic version (#3043)', () => {
  it('starts at 0 after init and increments on every non-init event', () => {
    initTaskState(makeInitialState(), tmpDir);
    expectVersion('task-1', 0);

    appendDecision(
      'task-1',
      { ts: '2026-04-19T00:01:00Z', decision: 'd1', rationale: 'because' },
      tmpDir
    );
    expectVersion('task-1', 1);

    updateStage('task-1', 'executing', '2026-04-19T00:02:00Z', tmpDir);
    expectVersion('task-1', 2);

    appendBlocker('task-1', { ts: '2026-04-19T00:03:00Z', blocker: 'b1' }, tmpDir);
    expectVersion('task-1', 3);
  });

  it('backward-compat: old-shape state log without version reduces to v0', () => {
    // Simulate a pre-Stage-2 log file: write the init entry directly
    // with no `version` field on the initial state.
    const oldShape: StructuredTaskLogEntry[] = [
      {
        event: 'init',
        ts: '2026-04-19T00:00:00Z',
        state: makeInitialState(), // makeInitialState() doesn't include version
      },
    ];
    const r = reduceLogEntries('task-1', oldShape);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.version).toBe(0);
  });

  it('two consecutive non-init events on a v0 base reach v2 (not v1)', () => {
    // Bug guard: the reducer must increment INSIDE applyLogEntry, not
    // once at the end of the fold. Two events = +2.
    initTaskState(makeInitialState(), tmpDir);
    appendDecision(
      'task-1',
      { ts: '2026-04-19T00:01:00Z', decision: 'd1', rationale: 'r1' },
      tmpDir
    );
    appendDecision(
      'task-1',
      { ts: '2026-04-19T00:02:00Z', decision: 'd2', rationale: 'r2' },
      tmpDir
    );
    expectVersion('task-1', 2);
  });
});

describe('appendResult (#3043)', () => {
  it('writes the result payload visible after readTaskState', () => {
    initTaskState(makeInitialState(), tmpDir);
    const payload = { ok: true, output: 'hello world', durationMs: 42 };
    appendResult('task-1', payload, '2026-04-19T00:01:00Z', tmpDir);
    const r = readTaskState('task-1', tmpDir);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.result).toEqual(payload);
      expect(r.value.version).toBe(1); // result event bumps version
    }
  });

  it('truncates over-cap payloads to a typed marker (not silent drop)', () => {
    initTaskState(makeInitialState(), tmpDir);
    // Build a payload guaranteed to exceed TASK_RESULT_MAX_BYTES once
    // JSON-serialized. A string of `max + 1024` 'x's gets ~2 MB on
    // disk after the JSON quotes — way over the 1 MiB cap.
    const huge = { huge: 'x'.repeat(TASK_RESULT_MAX_BYTES + 1024) };
    appendResult('task-1', huge, '2026-04-19T00:01:00Z', tmpDir);
    const r = readTaskState('task-1', tmpDir);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const result = r.value.result as {
        truncated?: boolean;
        originalBytes?: number;
        maxBytes?: number;
        note?: string;
      };
      expect(result.truncated).toBe(true);
      expect(result.originalBytes).toBeGreaterThan(TASK_RESULT_MAX_BYTES);
      expect(result.maxBytes).toBe(TASK_RESULT_MAX_BYTES);
    }
  });

  it('measures bytes after JSON-stringify (not just object size)', () => {
    initTaskState(makeInitialState(), tmpDir);
    // A small object with high-byte UTF-8 chars: count is in bytes, not
    // code units, so 4-byte emoji × 300_000 ≈ 1.2 MB which trips the cap
    // even though the JS string length is only 300_000.
    const utf8Heavy = { msg: '😀'.repeat(300_000) };
    appendResult('task-1', utf8Heavy, '2026-04-19T00:01:00Z', tmpDir);
    const r = readTaskState('task-1', tmpDir);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const result = r.value.result as { truncated?: boolean };
      expect(result.truncated).toBe(true);
    }
  });

  it('survives serialization failure cleanly (returns err, no crash)', () => {
    initTaskState(makeInitialState(), tmpDir);
    // BigInt isn't JSON-serializable — JSON.stringify throws on it.
    const r = appendResult('task-1', { n: 1n }, '2026-04-19T00:01:00Z', tmpDir);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain('serialize');
  });
});

describe('appendCancellation (#3043)', () => {
  it('writes the cancellation marker visible after readTaskState', () => {
    initTaskState(makeInitialState(), tmpDir);
    appendCancellation(
      'task-1',
      { requestedAt: '2026-04-19T00:01:00Z', reason: 'user clicked cancel' },
      tmpDir
    );
    const r = readTaskState('task-1', tmpDir);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.cancellation?.requestedAt).toBe('2026-04-19T00:01:00Z');
      expect(r.value.cancellation?.reason).toBe('user clicked cancel');
      expect(r.value.version).toBe(1);
    }
  });

  it('append-only: second cancellation does NOT overwrite the first requestedAt', () => {
    // Defense against a buggy double-cancel rewriting history. Both
    // events land on disk for audit, but the in-memory state keeps the
    // first cancellation's timestamp.
    initTaskState(makeInitialState(), tmpDir);
    appendCancellation('task-1', { requestedAt: '2026-04-19T00:01:00Z', reason: 'first' }, tmpDir);
    appendCancellation('task-1', { requestedAt: '2026-04-19T00:02:00Z', reason: 'second' }, tmpDir);
    const r = readTaskState('task-1', tmpDir);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.cancellation?.requestedAt).toBe('2026-04-19T00:01:00Z');
      expect(r.value.cancellation?.reason).toBe('first');
      // Version still bumps even though the in-memory cancellation didn't
      // change — so a polling client can see the log grew (audit visibility).
      expect(r.value.version).toBe(2);
    }
  });
});
