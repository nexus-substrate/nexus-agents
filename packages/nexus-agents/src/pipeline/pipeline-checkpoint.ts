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
}

/** Discriminated union of stage data. */
export type PipelineStageData =
  | { readonly type: 'research'; readonly text: string }
  | { readonly type: 'plan'; readonly text: string; readonly iterations: number }
  | {
      readonly type: 'vote';
      readonly approved: boolean;
      readonly conditional: boolean;
      readonly conditions?: readonly string[];
      readonly caveats?: readonly string[];
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
  readonly voteConditional?: boolean;
  readonly voteConditions?: readonly string[];
  readonly voteCaveats?: readonly string[];
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
  if (!validateSessionId(sessionId)) return null;

  const filePath = getCheckpointPath(sessionId, customDir);
  if (filePath === null || !fs.existsSync(filePath)) return null;

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    return rebuildState(lines);
  } catch (error) {
    logger.debug('Failed to load checkpoints', { error: String(error) });
    return null;
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
  z.object({
    type: z.literal('vote'),
    approved: z.boolean(),
    conditional: z.boolean(),
    conditions: z.array(z.string()).optional(),
    caveats: z.array(z.string()).optional(),
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

/** Rebuild pipeline state from JSONL entries. Skipped malformed lines are
 *  counted and reported at warn level (closes #2981 — was previously silent). */
function rebuildState(lines: string[]): PipelineCheckpointState {
  const state: {
    research?: string;
    plan?: string;
    voteIterations?: number;
    tasks?: readonly PipelineTask[];
    implementedTasks?: readonly PipelineTask[];
    securityPassed?: boolean;
    lastCompletedStage?: PipelineStage;
  } = {};

  let skippedCount = 0;
  let firstSkipReason: string | undefined;

  for (const line of lines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      skippedCount++;
      firstSkipReason ??= `JSON.parse failed: ${error instanceof Error ? error.message : String(error)}`;
      continue;
    }
    const result = PipelineCheckpointEntrySchema.safeParse(parsed);
    if (!result.success) {
      skippedCount++;
      firstSkipReason ??= `schema validation failed: ${result.error.message}`;
      continue;
    }
    // Cast tasks[] back to readonly PipelineTask[] — the schema captured them
    // as unknown[] because the persistence layer doesn't narrow them.
    applyEntry(state, result.data as unknown as PipelineCheckpointEntry);
  }

  if (skippedCount > 0) {
    logger.warn('Skipped malformed checkpoint lines during state rebuild', {
      skippedCount,
      totalLines: lines.length,
      firstSkipReason,
      recovered: state.lastCompletedStage,
    });
  }

  return state;
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

/** Fix: vote conditional metadata was saved but never rehydrated (#1734). */
function applyVote(
  state: Record<string, unknown>,
  d: {
    approved: boolean;
    conditional: boolean;
    conditions?: readonly string[];
    caveats?: readonly string[];
    iterations: number;
  }
): void {
  state['voteIterations'] = d.iterations;
  state['voteConditional'] = d.conditional;
  if (d.conditions !== undefined) state['voteConditions'] = d.conditions;
  if (d.caveats !== undefined) state['voteCaveats'] = d.caveats;
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
