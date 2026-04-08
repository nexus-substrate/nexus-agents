/**
 * Quality Gate Types (#1684)
 *
 * Defines the pipeline stages and quality gate criteria for the
 * quality-gated development pipeline.
 *
 * @module security/quality-gate-types
 */

import { z } from 'zod';

/** Pipeline stages in execution order. */
export const PipelineStageSchema = z.enum([
  'research',
  'plan',
  'vote',
  'implement',
  'scan',
  'qa',
  'ship',
]);
export type PipelineStage = z.infer<typeof PipelineStageSchema>;

/** Verdict from a quality gate check. */
export const GateVerdictSchema = z.enum(['pass', 'fail', 'skip']);
export type GateVerdict = z.infer<typeof GateVerdictSchema>;

/** Result of a single quality gate check. */
export const GateCheckResultSchema = z.object({
  /** Name of the check (e.g., 'tests_pass', 'lint_clean'). */
  name: z.string().min(1),
  /** Pass/fail/skip verdict. */
  verdict: GateVerdictSchema,
  /** Human-readable details. */
  details: z.string().max(500),
  /** Duration of the check in ms. */
  durationMs: z.number().nonnegative().optional(),
});
export type GateCheckResult = z.infer<typeof GateCheckResultSchema>;

/** Aggregate result of all checks for a stage. */
export interface QualityGateResult {
  /** Stage that was evaluated. */
  readonly stage: PipelineStage;
  /** Overall verdict (fail if any check fails). */
  readonly verdict: GateVerdict;
  /** Individual check results. */
  readonly checks: readonly GateCheckResult[];
  /** Number of passes / fails / skips. */
  readonly summary: { pass: number; fail: number; skip: number };
  /** Actionable feedback for the next iteration (if failed). */
  readonly feedback: string;
  /** Which iteration this was (1-based). */
  readonly iteration: number;
}

/** Maximum iterations before escalating to human. */
export const MAX_GATE_ITERATIONS = 3;
