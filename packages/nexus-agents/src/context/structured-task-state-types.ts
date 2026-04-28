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
 * Magentic-One Task Ledger — outer-loop "facts and guesses" about the task (#2278).
 *
 * Mirrors AutoGen's `magentic-one` Orchestrator pattern: the outer loop maintains
 * a ledger of verifiable facts, working assumptions (guesses), and open questions
 * the orchestrator still needs to resolve. The inner loop's `ProgressLedger`
 * decides whether to continue, replan (which triggers a TaskLedger refresh), or
 * escalate.
 *
 * Reference: microsoft.github.io/autogen — Magentic-One Task Ledger / Progress
 * Ledger pattern.
 */
export const TaskLedgerSchema = z.object({
  /** Verifiable observations: what we have observed/measured/confirmed. */
  facts: z.array(z.string()),
  /** Working assumptions: useful guesses we proceed under, marked separately. */
  guesses: z.array(z.string()),
  /** Things we still need to figure out before the plan is sound. */
  openQuestions: z.array(z.string()),
  updatedAt: z.iso.datetime(),
});
export type TaskLedger = z.infer<typeof TaskLedgerSchema>;

/**
 * Magentic-One Progress Ledger — the inner-loop self-reflection at each step (#2278).
 *
 * After each step, the orchestrator (or whoever is driving) emits one
 * `ProgressLedgerEntry` summarizing whether the outer plan is still valid,
 * whether we are stuck, and what to do next. Append-only; the most recent entry's
 * `suggestedAction` is what `Orchestrator.reflect()` returns.
 */
export const ReflectActionSchema = z.enum([
  'continue',
  'revise_plan',
  'escalate_to_human',
  'abort',
]);
export type ReflectAction = z.infer<typeof ReflectActionSchema>;

export const ProgressLedgerEntrySchema = z.object({
  ts: z.iso.datetime(),
  /** What just happened (the step we are reflecting on). */
  step: z.string().min(1),
  /** Is the outer Task Ledger plan still right after this step? */
  planStillValid: z.boolean(),
  /** Are we making progress, or have we stalled? */
  stuck: z.boolean(),
  /** What the orchestrator should do next based on this reflection. */
  suggestedAction: ReflectActionSchema,
  /** Why this action was chosen — required so future readers can audit the call. */
  rationale: z.string().min(1),
});
export type ProgressLedgerEntry = z.infer<typeof ProgressLedgerEntrySchema>;

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
  /**
   * Magentic-One Task Ledger (#2278). Mutable single-object outer-loop state:
   * facts/guesses/openQuestions revised together when the plan is replanned.
   * Optional so the field can be added later without breaking existing logs.
   */
  taskLedger: TaskLedgerSchema.optional(),
  /**
   * Magentic-One Progress Ledger (#2278). Append-only inner-loop reflections.
   * Most recent entry's `suggestedAction` is what `reflect()` returns. Optional
   * for the same backward-compat reason as `taskLedger`.
   */
  progressLedger: z.array(ProgressLedgerEntrySchema).optional(),
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
  // Magentic-One Task Ledger replacement event — the outer loop revises the
  // entire ledger atomically when replanning. Always replaces, never partial.
  z.object({
    event: z.literal('task_ledger'),
    ts: z.iso.datetime(),
    ledger: TaskLedgerSchema,
  }),
  // Magentic-One Progress Ledger append event — one self-reflection per step.
  z.object({
    event: z.literal('progress_ledger'),
    ts: z.iso.datetime(),
    entry: ProgressLedgerEntrySchema,
  }),
]);
export type StructuredTaskLogEntry = z.infer<typeof StructuredTaskLogEntrySchema>;
