/**
 * Structured task state — JSONL append-only log (#2033).
 *
 * Writes a per-task log at `~/.nexus-agents/tasks/state-{taskId}.jsonl`
 * (overridable via `customDir` for tests). Replay reduces the log
 * forward to a current `StructuredTaskState` snapshot — suitable for
 * resume-after-restart and STATE.md-style inspection.
 *
 * Mirrors the session-journal pattern in `context/session-journal.ts`:
 * - Directory mode 0o700, file mode 0o600
 * - Path-traversal validation on taskId
 * - `Result<T, Error>` returns, no exceptions for expected failures
 *
 * @module context/structured-task-state
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { nexusDataPath } from '../config/nexus-data-dir.js';
import type { Result } from '../core/result.js';
import { ok, err } from '../core/result.js';
import { createLogger } from '../core/logger.js';
import {
  StructuredTaskLogEntrySchema,
  TASK_RESULT_MAX_BYTES,
  type ProgressLedgerEntry,
  type ReflectAction,
  type StructuredTaskLogEntry,
  type StructuredTaskState,
  type TaskBlocker,
  type TaskCancellation,
  type TaskDecision,
  type TaskLedger,
  type TaskPosition,
  type TaskStage,
} from './structured-task-state-types.js';

const logger = createLogger({ component: 'structured-task-state' });

/** Subdirectory name under the resolved nexus data dir for task-state logs. */
const TASKS_SUBDIR = 'tasks';

const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

function getTasksDir(customDir?: string): string {
  if (customDir !== undefined) return path.resolve(customDir);
  return nexusDataPath(TASKS_SUBDIR);
}

function getLogPath(taskId: string, customDir?: string): string {
  return path.join(getTasksDir(customDir), `state-${taskId}.jsonl`);
}

function validateTaskId(taskId: string): Result<string, Error> {
  if (taskId.includes('..') || taskId.includes('/') || taskId.includes('\\')) {
    return err(new Error('Invalid task ID: contains path traversal characters'));
  }
  if (taskId.length === 0 || taskId.length > 128) {
    return err(new Error('Invalid task ID: must be 1-128 characters'));
  }
  return ok(taskId);
}

function ensureTasksDir(customDir?: string): Result<string, Error> {
  const dirPath = getTasksDir(customDir);
  try {
    fs.mkdirSync(dirPath, { recursive: true, mode: DIR_MODE });
    return ok(dirPath);
  } catch (cause) {
    const e = cause instanceof Error ? cause : new Error(String(cause));
    return err(new Error(`Failed to create tasks directory at ${dirPath}: ${e.message}`));
  }
}

/** Append a log entry (no state computation). Pure I/O. */
function appendLogEntry(
  taskId: string,
  entry: StructuredTaskLogEntry,
  customDir?: string
): Result<void, Error> {
  const idCheck = validateTaskId(taskId);
  if (!idCheck.ok) return err(idCheck.error);
  const dirResult = ensureTasksDir(customDir);
  if (!dirResult.ok) return err(dirResult.error);

  const filePath = getLogPath(taskId, customDir);
  const line = JSON.stringify(entry) + '\n';
  try {
    fs.appendFileSync(filePath, line, { mode: FILE_MODE });
    return ok(undefined);
  } catch (cause) {
    const e = cause instanceof Error ? cause : new Error(String(cause));
    return err(new Error(`Failed to write task state entry: ${e.message}`));
  }
}

/**
 * Initialize structured state for a new task. Writes the full initial
 * state as an `init` log entry. Safe to call once per taskId.
 */
export function initTaskState(state: StructuredTaskState, customDir?: string): Result<void, Error> {
  return appendLogEntry(state.taskId, { event: 'init', ts: state.updatedAt, state }, customDir);
}

export function appendDecision(
  taskId: string,
  decision: TaskDecision,
  customDir?: string
): Result<void, Error> {
  return appendLogEntry(taskId, { event: 'decision', ts: decision.ts, decision }, customDir);
}

export function appendBlocker(
  taskId: string,
  blocker: TaskBlocker,
  customDir?: string
): Result<void, Error> {
  return appendLogEntry(taskId, { event: 'blocker', ts: blocker.ts, blocker }, customDir);
}

export function resolveBlocker(
  taskId: string,
  blockerIndex: number,
  resolvedAt: string,
  customDir?: string
): Result<void, Error> {
  return appendLogEntry(
    taskId,
    { event: 'blocker_resolved', ts: resolvedAt, blockerIndex, resolvedAt },
    customDir
  );
}

export function updateStage(
  taskId: string,
  stage: TaskStage,
  ts: string,
  customDir?: string
): Result<void, Error> {
  return appendLogEntry(taskId, { event: 'stage', ts, stage }, customDir);
}

export function updatePosition(
  taskId: string,
  position: TaskPosition,
  ts: string,
  customDir?: string
): Result<void, Error> {
  return appendLogEntry(taskId, { event: 'position', ts, position }, customDir);
}

/**
 * Replace the Magentic-One Task Ledger atomically (#2278). The outer loop calls
 * this when it replans — facts/guesses/openQuestions are revised together so
 * downstream reflections are reading a consistent set.
 */
export function updateTaskLedger(
  taskId: string,
  ledger: TaskLedger,
  customDir?: string
): Result<void, Error> {
  return appendLogEntry(taskId, { event: 'task_ledger', ts: ledger.updatedAt, ledger }, customDir);
}

/**
 * Append a Magentic-One Progress Ledger entry (#2278). Inner-loop reflection
 * after a step: was the plan still valid, are we stuck, what to do next.
 */
export function appendProgressLedgerEntry(
  taskId: string,
  entry: ProgressLedgerEntry,
  customDir?: string
): Result<void, Error> {
  return appendLogEntry(taskId, { event: 'progress_ledger', ts: entry.ts, entry }, customDir);
}

/**
 * Append a tool-result payload (#3043 / epic #2631 Stage 2). Carries the
 * same shape the synchronous mode would have returned inline. Writers
 * should `updateStage(taskId, 'complete', ...)` immediately before so a
 * polling reader observes the terminal stage transition + result together.
 *
 * The payload is JSON-serialized to measure size; over-cap writes
 * (> `TASK_RESULT_MAX_BYTES`) get replaced with a typed truncation
 * marker. The cap is observable by the caller (the reducer surfaces
 * `state.result` as the truncation marker rather than the original) so
 * silent data loss is impossible.
 */
export function appendResult(
  taskId: string,
  result: unknown,
  ts: string,
  customDir?: string
): Result<void, Error> {
  let payload: unknown = result;
  let serialized: string;
  try {
    serialized = JSON.stringify(result ?? null);
  } catch (cause) {
    const e = cause instanceof Error ? cause : new Error(String(cause));
    return err(new Error(`Failed to serialize result for task ${taskId}: ${e.message}`));
  }
  // Note: `Buffer.byteLength` is the right unit — JSON.stringify length is
  // UTF-16 code units, not the bytes that hit disk. For ASCII the two
  // coincide; for non-ASCII / emoji results the byte-count is what bounds
  // the actual storage cost.
  const bytes = Buffer.byteLength(serialized, 'utf-8');
  if (bytes > TASK_RESULT_MAX_BYTES) {
    payload = {
      truncated: true,
      originalBytes: bytes,
      maxBytes: TASK_RESULT_MAX_BYTES,
      note: 'Result exceeded TASK_RESULT_MAX_BYTES — original dropped at write time.',
    };
    logger.warn('Task result truncated at write', {
      taskId,
      bytes,
      max: TASK_RESULT_MAX_BYTES,
    });
  }
  return appendLogEntry(taskId, { event: 'result', ts, result: payload }, customDir);
}

/**
 * Append a cancellation marker (#3043 / epic #2631 Stage 2). Called by
 * `cancel_job`. The reducer is append-only: if a cancellation already
 * exists in the log, subsequent cancellation events are kept on disk
 * (for audit) but DON'T overwrite the original `requestedAt` — so a
 * malicious or buggy double-cancel can't rewrite history.
 */
export function appendCancellation(
  taskId: string,
  cancellation: TaskCancellation,
  customDir?: string
): Result<void, Error> {
  return appendLogEntry(
    taskId,
    { event: 'cancellation', ts: cancellation.requestedAt, cancellation },
    customDir
  );
}

/**
 * Read the most recent ProgressLedger entry's suggested action — what
 * `Orchestrator.reflect()` returns. Returns `'continue'` when no progress-ledger
 * entries exist yet (default to "no reflection has flagged a problem"), and an
 * error if the task log itself can't be read.
 */
export function reflect(taskId: string, customDir?: string): Result<ReflectAction, Error> {
  const stateResult = readTaskState(taskId, customDir);
  if (!stateResult.ok) return err(stateResult.error);
  const ledger = stateResult.value.progressLedger;
  if (ledger === undefined || ledger.length === 0) return ok('continue');
  const last = ledger[ledger.length - 1];
  if (last === undefined) return ok('continue');
  return ok(last.suggestedAction);
}

/**
 * Read the log file and reduce it to the current state snapshot.
 *
 * Returns `err` when the file doesn't exist or no `init` entry is
 * present. Malformed lines are skipped with a warning (log, don't
 * fail) — same policy as the session-journal replay.
 */
export function readTaskState(
  taskId: string,
  customDir?: string
): Result<StructuredTaskState, Error> {
  const idCheck = validateTaskId(taskId);
  if (!idCheck.ok) return err(idCheck.error);

  const filePath = getLogPath(taskId, customDir);
  if (!fs.existsSync(filePath)) {
    return err(new Error(`No state log for task: ${taskId}`));
  }

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (cause) {
    const e = cause instanceof Error ? cause : new Error(String(cause));
    return err(new Error(`Failed to read state log: ${e.message}`));
  }

  const lines = content.split('\n').filter((l) => l.length > 0);
  const entries: StructuredTaskLogEntry[] = [];
  for (const line of lines) {
    try {
      const parsed: unknown = JSON.parse(line);
      const validated = StructuredTaskLogEntrySchema.safeParse(parsed);
      if (validated.success) {
        entries.push(validated.data);
      } else {
        logger.warn('Skipping malformed task-state log entry', {
          taskId,
          error: validated.error.message,
        });
      }
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : String(cause);
      logger.warn('Skipping unparseable task-state log entry', { taskId, error: msg });
    }
  }

  return reduceLogEntries(taskId, entries);
}

/**
 * Fold a sequence of log entries into the final state. Exported so
 * tests can exercise the reducer without touching the filesystem.
 */
export function reduceLogEntries(
  taskId: string,
  entries: readonly StructuredTaskLogEntry[]
): Result<StructuredTaskState, Error> {
  const init = entries.find((e) => e.event === 'init');
  if (init === undefined) {
    return err(new Error(`No init entry found for task: ${taskId}`));
  }
  const initState = init.state;
  if (initState.taskId !== taskId) {
    return err(
      new Error(`Task ID mismatch: log contains state for ${initState.taskId}, expected ${taskId}`)
    );
  }

  // #3043: monotonic version. Pre-Stage-2 logs lack the field; default
  // to 0 and start counting from there. Each non-init event bumps by 1.
  let state: StructuredTaskState = {
    ...initState,
    decisions: [...initState.decisions],
    blockers: initState.blockers.map((b) => ({ ...b })),
    version: initState.version ?? 0,
  };

  for (const entry of entries) {
    if (entry === init) continue;
    state = applyLogEntry(state, entry);
  }
  return ok(state);
}

/** Apply a blockers-related event (#2033). */
function applyBlockerEvent(
  state: StructuredTaskState,
  entry: Extract<StructuredTaskLogEntry, { event: 'blocker' | 'blocker_resolved' }>,
  nextVersion: number
): StructuredTaskState {
  if (entry.event === 'blocker') {
    return {
      ...state,
      blockers: [...state.blockers, entry.blocker],
      updatedAt: entry.ts,
      version: nextVersion,
    };
  }
  return {
    ...state,
    blockers: state.blockers.map((b, i) =>
      i === entry.blockerIndex ? { ...b, resolved: entry.resolvedAt } : b
    ),
    updatedAt: entry.ts,
    version: nextVersion,
  };
}

/** Apply a simple scalar/ledger replacement event (no array merge). */
function applyReplacementEvent(
  state: StructuredTaskState,
  entry: Extract<
    StructuredTaskLogEntry,
    { event: 'stage' | 'position' | 'task_ledger' | 'decision' | 'progress_ledger' }
  >,
  nextVersion: number
): StructuredTaskState {
  switch (entry.event) {
    case 'decision':
      return {
        ...state,
        decisions: [...state.decisions, entry.decision],
        updatedAt: entry.ts,
        version: nextVersion,
      };
    case 'stage':
      return { ...state, stage: entry.stage, updatedAt: entry.ts, version: nextVersion };
    case 'position':
      return { ...state, position: entry.position, updatedAt: entry.ts, version: nextVersion };
    case 'task_ledger':
      return { ...state, taskLedger: entry.ledger, updatedAt: entry.ts, version: nextVersion };
    case 'progress_ledger':
      return {
        ...state,
        progressLedger: [...(state.progressLedger ?? []), entry.entry],
        updatedAt: entry.ts,
        version: nextVersion,
      };
  }
}

/**
 * Apply a result or cancellation event (#3043 / epic #2631 Stage 2). Result
 * always assigns; cancellation is append-only (in-memory keeps the FIRST
 * requestedAt across duplicate events).
 */
function applyTerminalEvent(
  state: StructuredTaskState,
  entry: Extract<StructuredTaskLogEntry, { event: 'result' | 'cancellation' }>,
  nextVersion: number
): StructuredTaskState {
  if (entry.event === 'result') {
    return { ...state, result: entry.result, updatedAt: entry.ts, version: nextVersion };
  }
  return {
    ...state,
    cancellation: state.cancellation ?? entry.cancellation,
    updatedAt: entry.ts,
    version: nextVersion,
  };
}

/**
 * Map each event tag to the apply-helper that owns it. Lets `applyLogEntry`
 * dispatch in one table lookup rather than a 10-case switch — the latter
 * trips the per-function complexity cap as the event set grows (#3043).
 */
const EVENT_CATEGORY: Record<
  StructuredTaskLogEntry['event'],
  'init' | 'blocker' | 'replace' | 'terminal'
> = {
  init: 'init',
  blocker: 'blocker',
  blocker_resolved: 'blocker',
  decision: 'replace',
  stage: 'replace',
  position: 'replace',
  task_ledger: 'replace',
  progress_ledger: 'replace',
  result: 'terminal',
  cancellation: 'terminal',
};

function applyLogEntry(
  state: StructuredTaskState,
  entry: StructuredTaskLogEntry
): StructuredTaskState {
  const category = EVENT_CATEGORY[entry.event];
  if (category === 'init') return state;
  // #3043: every non-init event bumps the monotonic version. Calculated
  // here (not in each branch) so a new event type can't accidentally
  // forget to bump.
  const nextVersion = (state.version ?? 0) + 1;
  if (category === 'blocker') {
    return applyBlockerEvent(
      state,
      entry as Extract<StructuredTaskLogEntry, { event: 'blocker' | 'blocker_resolved' }>,
      nextVersion
    );
  }
  if (category === 'terminal') {
    return applyTerminalEvent(
      state,
      entry as Extract<StructuredTaskLogEntry, { event: 'result' | 'cancellation' }>,
      nextVersion
    );
  }
  return applyReplacementEvent(
    state,
    entry as Extract<
      StructuredTaskLogEntry,
      { event: 'decision' | 'stage' | 'position' | 'task_ledger' | 'progress_ledger' }
    >,
    nextVersion
  );
}
