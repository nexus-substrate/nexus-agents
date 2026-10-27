/**
 * Pipeline Checkpoint — Persist stage results for crash recovery (#1703)
 *
 * DRY: reuses ensureCheckpointDir from wave-checkpoint-persistence for
 * directory management and path security. Pipeline-specific JSONL schema.
 *
 * Storage: <repo>/.nexus-agents/checkpoints/pipeline-{sessionId}.jsonl
 * (checkpoints/ is per-repo state — epic #2872)
 *
 * @module pipeline/pipeline-checkpoint
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { createLogger } from '../core/index.js';
import { ensureCheckpointDir } from '../agents/wave-checkpoint-persistence.js';
import { previewNexusDataPath } from '../config/nexus-data-dir.js';
import {
  parseCheckpointBinding,
  rebuildBoundCheckpoint,
  validateBoundEntry,
} from './pipeline-checkpoint-binding.js';
import type {
  PipelineCheckpointBinding,
  BoundCheckpointState,
} from './pipeline-checkpoint-binding.js';
import type { PipelineTask, DevPipelineResult } from './dev-pipeline.js';

const logger = createLogger({ component: 'pipeline-checkpoint' });

// ============================================================================
// Types
// ============================================================================

/** Stages that can be checkpointed. */
export type PipelineStage = 'research' | 'plan' | 'vote' | 'decompose' | 'implement' | 'security';

/** A single checkpoint entry (one JSONL line). */
export interface PipelineCheckpointEntry {
  readonly sessionId: string;
  readonly stage: PipelineStage;
  readonly timestamp: string;
  readonly data: PipelineStageData;
  readonly binding?: PipelineCheckpointBinding;
}

/** Discriminated union of stage data. */
export type PipelineStageData =
  | { readonly type: 'research'; readonly text: string }
  | { readonly type: 'plan'; readonly text: string; readonly iterations: number }
  | {
      readonly type: 'vote';
      readonly approved: boolean;
      readonly iterations: number;
    }
  | { readonly type: 'decompose'; readonly tasks: readonly PipelineTask[] }
  | { readonly type: 'implement'; readonly tasks: readonly PipelineTask[] }
  | { readonly type: 'security'; readonly passed: boolean };

/** Partial pipeline state loaded from checkpoints. */
export interface PipelineCheckpointState {
  readonly research?: string;
  readonly plan?: string;
  readonly voteIterations?: number;
  readonly tasks?: readonly PipelineTask[];
  readonly implementedTasks?: readonly PipelineTask[];
  readonly securityPassed?: boolean;
  readonly lastCompletedStage?: PipelineStage;
}

// ============================================================================
// Path Helpers
// ============================================================================

const SESSION_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

function validateSessionId(sessionId: string): boolean {
  return SESSION_ID_REGEX.test(sessionId);
}

function getCheckpointPath(sessionId: string, customDir?: string): string | null {
  const dirResult = ensureCheckpointDir(customDir);
  if (!dirResult.ok) {
    logger.warn('Checkpoint directory unavailable', { error: dirResult.error.message });
    return null;
  }
  return path.join(dirResult.value, `pipeline-${sessionId}.jsonl`);
}

// ============================================================================
// Write
// ============================================================================

/** Append a stage checkpoint to disk. */
export function saveStageCheckpoint(
  sessionId: string,
  stage: PipelineStage,
  data: PipelineStageData,
  customDir?: string
): boolean {
  if (!validateSessionId(sessionId)) {
    logger.warn('Invalid session ID for checkpoint', { sessionId });
    return false;
  }

  const entry: PipelineCheckpointEntry = {
    sessionId,
    stage,
    timestamp: new Date().toISOString(),
    data,
  };

  try {
    const filePath = getCheckpointPath(sessionId, customDir);
    if (filePath === null) return false;
    fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', { mode: 0o600 });
    return true;
  } catch (error) {
    logger.debug('Failed to save checkpoint', { stage, error: String(error) });
    return false;
  }
}

// ============================================================================
// Read
// ============================================================================

/** Load checkpoint state for a session. Returns null if no checkpoints exist. */
export function loadCheckpointState(
  sessionId: string,
  customDir?: string
): PipelineCheckpointState | null {
  const result = loadCheckpointDiagnostic(sessionId, customDir);
  if (result.kind === 'legacy' || result.kind === 'bound') return result.state;
  if (result.kind === 'invalid' && result.legacyState !== undefined) {
    logger.warn('Recovered legacy checkpoint with malformed entries', {
      sessionId,
      reason: result.reason,
    });
    return result.legacyState;
  }
  return null;
}

export type CheckpointDiagnostic =
  | { readonly kind: 'absent' }
  | { readonly kind: 'legacy'; readonly state: PipelineCheckpointState }
  | {
      readonly kind: 'bound';
      readonly state: PipelineCheckpointState;
      readonly binding: BoundCheckpointState;
    }
  | {
      readonly kind: 'invalid';
      readonly reason:
        | 'invalid-session'
        | 'empty-checkpoint'
        | 'invalid-encoding'
        | 'malformed-checkpoint'
        | 'checkpoint-lineage-mismatch';
      readonly legacyState?: PipelineCheckpointState;
    }
  | {
      readonly kind: 'unavailable';
      readonly reason: 'checkpoint-unreadable' | CheckpointPermissionFailure;
    };

type CheckpointPermissionFailure = 'checkpoint-permissions' | 'checkpoint-permissions-unmeasured';

function errno(error: unknown): string | undefined {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : undefined;
}

/** POSIX evidence only: other platforms must not claim a measured owner/mode guarantee. */
function permissionFailure(stat: fs.Stats): CheckpointPermissionFailure | undefined {
  if (process.platform === 'win32' || typeof process.getuid !== 'function')
    return 'checkpoint-permissions-unmeasured';
  if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600)
    return 'checkpoint-permissions';
  return undefined;
}

/** One descriptor read, no mkdir, fatal decoding, and no permissive recovery of bound data. */
export function loadCheckpointDiagnostic(
  sessionId: string,
  customDir?: string
): CheckpointDiagnostic {
  if (!validateSessionId(sessionId)) return { kind: 'invalid', reason: 'invalid-session' };
  try {
    const directory =
      customDir === undefined ? previewNexusDataPath('checkpoints') : path.resolve(customDir);
    const { stat, bytes } = readCheckpointBytes(
      path.join(directory, `pipeline-${sessionId}.jsonl`)
    );
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch {
      return { kind: 'invalid', reason: 'invalid-encoding' };
    }
    const result = diagnoseContent(text, sessionId);
    const permission = result.kind === 'bound' ? permissionFailure(stat) : undefined;
    return permission === undefined ? result : { kind: 'unavailable', reason: permission };
  } catch (error: unknown) {
    return errno(error) === 'ENOENT'
      ? { kind: 'absent' }
      : { kind: 'unavailable', reason: 'checkpoint-unreadable' };
  }
}

function readCheckpointBytes(file: string): { stat: fs.Stats; bytes: Buffer } {
  const fd = fs.openSync(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
  );
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) throw new Error('Checkpoint is not a regular file');
    return { stat, bytes: fs.readFileSync(fd) };
  } finally {
    fs.closeSync(fd);
  }
}

type BoundCheckpointWriteResult =
  | { readonly status: 'saved' }
  | { readonly status: 'invalid'; readonly reason: 'invalid-bound-entry' }
  | {
      readonly status: 'unavailable';
      readonly reason:
        | CheckpointPermissionFailure
        | 'checkpoint-directory-unavailable'
        | 'checkpoint-write-failed';
    };

/** Validate before creating anything; an unsafe existing file is never chmodded or repaired. */
export function saveBoundStageCheckpoint(input: {
  readonly sessionId: string;
  readonly stage: PipelineStage;
  readonly data: PipelineStageData;
  readonly binding: PipelineCheckpointBinding;
  readonly customDir?: string;
}): BoundCheckpointWriteResult {
  const binding = parseCheckpointBinding(input.binding);
  const parsed = BoundCheckpointEntrySchema.safeParse({
    sessionId: input.sessionId,
    stage: input.stage,
    data: input.data,
    binding: input.binding,
    timestamp: new Date().toISOString(),
  });
  if (!validateSessionId(input.sessionId) || !binding.ok || !parsed.success)
    return { status: 'invalid', reason: 'invalid-bound-entry' };
  const entry = { ...parsed.data, binding: binding.value } as PipelineCheckpointEntry;
  if (!validateBoundEntry(entry)) return { status: 'invalid', reason: 'invalid-bound-entry' };
  if (process.platform === 'win32' || typeof process.getuid !== 'function')
    return { status: 'unavailable', reason: 'checkpoint-permissions-unmeasured' };
  try {
    const directory = ensureCheckpointDir(input.customDir);
    if (!directory.ok) return { status: 'unavailable', reason: 'checkpoint-directory-unavailable' };
    return appendBoundEntry(path.join(directory.value, `pipeline-${input.sessionId}.jsonl`), entry);
  } catch {
    return { status: 'unavailable', reason: 'checkpoint-write-failed' };
  }
}

function appendBoundEntry(
  file: string,
  entry: PipelineCheckpointEntry
): BoundCheckpointWriteResult {
  const fd = fs.openSync(
    file,
    fs.constants.O_WRONLY |
      fs.constants.O_APPEND |
      fs.constants.O_CREAT |
      fs.constants.O_NOFOLLOW |
      fs.constants.O_NONBLOCK,
    0o600
  );
  try {
    const permission = permissionFailure(fs.fstatSync(fd));
    if (permission !== undefined) return { status: 'unavailable', reason: permission };
    fs.appendFileSync(fd, JSON.stringify(entry) + '\n');
    return { status: 'saved' };
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Zod schema for `PipelineCheckpointEntry`. Closes #2981: previously
 * `rebuildState` did `JSON.parse(line) as PipelineCheckpointEntry`, which
 * silently accepted any successfully-parsed JSON (`null`, `42`, `{}`,
 * arbitrary objects). `applyEntry` then read undefined fields and poisoned
 * the recovered state. Validate every line through this schema and skip
 * (counting + warning) anything that doesn't match.
 *
 * The schema mirrors `PipelineStage` + `PipelineStageData` exactly — keep
 * in lockstep if either type changes.
 */
const PipelineStageSchema = z.enum([
  'research',
  'plan',
  'vote',
  'decompose',
  'implement',
  'security',
]);

const PipelineStageDataSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('research'), text: z.string() }),
  z.object({ type: z.literal('plan'), text: z.string(), iterations: z.number() }),
  // Unknown keys are stripped: 9.x conditional vote metadata remains loadable (#5969).
  z.object({
    type: z.literal('vote'),
    approved: z.boolean(),
    iterations: z.number(),
  }),
  // PipelineTask shape is loose at the persistence layer — capture as
  // `z.unknown()` and trust the downstream consumer's narrower validation.
  z.object({ type: z.literal('decompose'), tasks: z.array(z.unknown()) }),
  z.object({ type: z.literal('implement'), tasks: z.array(z.unknown()) }),
  z.object({ type: z.literal('security'), passed: z.boolean() }),
]);

const PipelineCheckpointEntrySchema = z.object({
  sessionId: z.string(),
  stage: PipelineStageSchema,
  timestamp: z.string(),
  data: PipelineStageDataSchema,
});

// Reuse the same stage schemas, but recognized new-format envelopes may not discard fields.
const BoundCheckpointEntrySchema = PipelineCheckpointEntrySchema.extend({
  binding: z.unknown(),
  data: z.union(PipelineStageDataSchema.options.map((schema) => schema.strict())),
}).strict();

/** Diagnose once; only legacy callers may project partial recovery, never strict bound resumes. */
function diagnoseContent(text: string, sessionId: string): CheckpointDiagnostic {
  const lines = text.trim().split('\n').filter(Boolean);
  if (lines.length === 0) return { kind: 'invalid', reason: 'empty-checkpoint', legacyState: {} };
  const { entries, invalid, recognizedBound } = parseHistory(lines, sessionId);
  const state: Record<string, unknown> = {};
  for (const entry of entries) applyEntry(state, entry);
  if (invalid || (recognizedBound && entries.some((entry) => entry.binding === undefined))) {
    return {
      kind: 'invalid',
      reason: 'malformed-checkpoint',
      ...(!recognizedBound ? { legacyState: state } : {}),
    };
  }
  if (!recognizedBound) return { kind: 'legacy', state };
  const bound = rebuildBoundCheckpoint(entries);
  return bound.ok
    ? { kind: 'bound', state, binding: bound.value }
    : { kind: 'invalid', reason: 'checkpoint-lineage-mismatch' };
}

function parseHistory(
  lines: readonly string[],
  sessionId: string
): {
  entries: PipelineCheckpointEntry[];
  invalid: boolean;
  recognizedBound: boolean;
} {
  const entries: PipelineCheckpointEntry[] = [];
  let invalid = false;
  let recognizedBound = lines.some((line) => /"binding"\s*(?::|$)/.test(line));
  for (const line of lines) {
    const parsed = parseEntry(line);
    recognizedBound ||= parsed.recognizedBound;
    if (parsed.entry === undefined) {
      invalid = true;
      continue;
    }
    entries.push(parsed.entry);
    invalid ||=
      parsed.entry.sessionId !== sessionId || parsed.entry.stage !== parsed.entry.data.type;
  }
  return { entries, invalid, recognizedBound };
}

function parseEntry(line: string): { entry?: PipelineCheckpointEntry; recognizedBound: boolean } {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return { recognizedBound: false };
  }
  const recognizedBound = typeof raw === 'object' && raw !== null && 'binding' in raw;
  const parsed = (
    recognizedBound ? BoundCheckpointEntrySchema : PipelineCheckpointEntrySchema
  ).safeParse(raw);
  if (!parsed.success) return { recognizedBound };
  const base = parsed.data as unknown as PipelineCheckpointEntry;
  if (!recognizedBound) return { entry: base, recognizedBound };
  const binding = parseCheckpointBinding((raw as { binding: unknown }).binding);
  return binding.ok
    ? { entry: { ...base, binding: binding.value }, recognizedBound }
    : { recognizedBound };
}

/** Apply a single checkpoint entry to the state accumulator. */
function applyEntry(state: Record<string, unknown>, entry: PipelineCheckpointEntry): void {
  state['lastCompletedStage'] = entry.stage;
  const d = entry.data;
  if (d.type === 'research') applyResearch(state, d);
  else if (d.type === 'plan') applyPlan(state, d);
  else if (d.type === 'vote') applyVote(state, d);
  else if (d.type === 'decompose') state['tasks'] = d.tasks;
  else if (d.type === 'implement') state['implementedTasks'] = d.tasks;
  else state['securityPassed'] = d.passed;
}

function applyResearch(state: Record<string, unknown>, d: { text: string }): void {
  state['research'] = d.text;
}

function applyPlan(state: Record<string, unknown>, d: { text: string; iterations: number }): void {
  state['plan'] = d.text;
  state['voteIterations'] = d.iterations;
}

/** Restore the vote iteration count. */
function applyVote(
  state: Record<string, unknown>,
  d: {
    approved: boolean;
    iterations: number;
  }
): void {
  state['voteIterations'] = d.iterations;
}

// ============================================================================
// Cleanup
// ============================================================================

/** Delete checkpoint file on successful completion. */
export function cleanupCheckpoint(sessionId: string, customDir?: string): boolean {
  if (!validateSessionId(sessionId)) return false;
  try {
    const filePath = getCheckpointPath(sessionId, customDir);
    if (filePath !== null && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Build a DevPipelineResult from checkpoint state (for resume scenarios). */
export function checkpointToResult(state: PipelineCheckpointState): Partial<DevPipelineResult> {
  const result: Partial<DevPipelineResult> = {
    plan: state.plan ?? '',
    tasks: state.implementedTasks ?? state.tasks ?? [],
    voteIterations: state.voteIterations ?? 0,
  };
  if (state.securityPassed !== undefined) {
    return { ...result, securityPassed: state.securityPassed };
  }
  return result;
}
