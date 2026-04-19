/**
 * Structured task state — type definitions (#2033).
 *
 * Per-task state (decisions, blockers, stage, position) that a
 * long-running orchestration task mutates as it progresses. Designed
 * for the STATE.md-equivalent pattern from GSD — replacing ad-hoc
 * `memory_write` calls with a typed append-only log keyed by taskId.
 *
 * Serialized one-entry-per-JSONL-line so a later `query_trace` can
 * replay the full evolution, and resume-after-timeout reads the latest
 * state without replaying everything.
 *
 * @module context/structured-task-state-types
 */

import { z } from 'zod';

/** Task execution lifecycle stages. */
export const TaskStageSchema = z.enum([
  'planning',
  'executing',
  'verifying',
  'complete',
  'blocked',
]);
export type TaskStage = z.infer<typeof TaskStageSchema>;

/** A single recorded decision in the task evolution. */
export const TaskDecisionSchema = z.object({
  ts: z.iso.datetime(),
  decision: z.string().min(1),
  rationale: z.string().min(1),
});
export type TaskDecision = z.infer<typeof TaskDecisionSchema>;

/** A blocker that stopped forward progress (optionally later resolved). */
export const TaskBlockerSchema = z.object({
  ts: z.iso.datetime(),
  blocker: z.string().min(1),
  resolved: z.iso.datetime().optional(),
});
export type TaskBlocker = z.infer<typeof TaskBlockerSchema>;

/** Where the task currently is in its execution. */
export const TaskPositionSchema = z.object({
  currentStep: z.string().min(1),
  nextStep: z.string().optional(),
});
export type TaskPosition = z.infer<typeof TaskPositionSchema>;

/**
 * Structured state for a single long-running task.
 *
 * All arrays are append-only during the task's lifetime; a blocker can
 * be resolved by updating its `resolved` timestamp, but we do not
 * retroactively rewrite earlier entries.
 */
export const StructuredTaskStateSchema = z.object({
  taskId: z.string().min(1),
  stage: TaskStageSchema,
  decisions: z.array(TaskDecisionSchema),
  blockers: z.array(TaskBlockerSchema),
  position: TaskPositionSchema,
  updatedAt: z.iso.datetime(),
});
export type StructuredTaskState = z.infer<typeof StructuredTaskStateSchema>;

/** Log entry types for the append-only journal. */
export const StructuredTaskLogEntrySchema = z.discriminatedUnion('event', [
  z.object({
    event: z.literal('init'),
    ts: z.iso.datetime(),
    state: StructuredTaskStateSchema,
  }),
  z.object({
    event: z.literal('decision'),
    ts: z.iso.datetime(),
    decision: TaskDecisionSchema,
  }),
  z.object({
    event: z.literal('blocker'),
    ts: z.iso.datetime(),
    blocker: TaskBlockerSchema,
  }),
  z.object({
    event: z.literal('blocker_resolved'),
    ts: z.iso.datetime(),
    /** Index of the blocker in the state's blockers[] array. */
    blockerIndex: z.number().int().nonnegative(),
    resolvedAt: z.iso.datetime(),
  }),
  z.object({
    event: z.literal('stage'),
    ts: z.iso.datetime(),
    stage: TaskStageSchema,
  }),
  z.object({
    event: z.literal('position'),
    ts: z.iso.datetime(),
    position: TaskPositionSchema,
  }),
]);
export type StructuredTaskLogEntry = z.infer<typeof StructuredTaskLogEntrySchema>;
