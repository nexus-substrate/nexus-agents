/**
 * Incomplete Result — Typed partial completion for pipeline stages (#1737, Phase 4)
 *
 * When a stage cannot fully complete, it emits an IncompleteResult with
 * severity and justification. Downstream stages can gate on this —
 * compensate, skip, or escalate.
 *
 * Pattern from: SWE-AF explicit incompleteness.
 *
 * @module pipeline/incomplete-result
 */

// ============================================================================
// Types
// ============================================================================

/** Severity of an incomplete result. */
export type IncompleteSeverity = 'info' | 'warning' | 'error' | 'critical';

/** A typed partial result from a pipeline stage. */
export interface IncompleteResult {
  /** The stage that produced this result. */
  readonly stageId: string;
  /** What was accomplished (may be partial). */
  readonly partialOutput: unknown;
  /** What was NOT accomplished. */
  readonly missing: readonly string[];
  /** Severity — determines downstream behavior. */
  readonly severity: IncompleteSeverity;
  /** Why the stage couldn't fully complete. */
  readonly justification: string;
  /** Whether downstream stages can proceed. */
  readonly canProceed: boolean;
}

/** Check if a value is an IncompleteResult. */
export function isIncompleteResult(value: unknown): value is IncompleteResult {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj['stageId'] === 'string' &&
    typeof obj['severity'] === 'string' &&
    typeof obj['justification'] === 'string' &&
    typeof obj['canProceed'] === 'boolean' &&
    Array.isArray(obj['missing'])
  );
}

/** Create an IncompleteResult. */
export function createIncompleteResult(
  stageId: string,
  partialOutput: unknown,
  missing: readonly string[],
  severity: IncompleteSeverity,
  justification: string
): IncompleteResult {
  return {
    stageId,
    partialOutput,
    missing,
    severity,
    justification,
    canProceed: severity !== 'critical',
  };
}

/** Check if a pipeline can proceed given incomplete results. */
export function canPipelineProceed(results: readonly IncompleteResult[]): boolean {
  return results.every((r) => r.canProceed);
}

/** Filter incomplete results by severity. */
export function filterBySeverity(
  results: readonly IncompleteResult[],
  minSeverity: IncompleteSeverity
): readonly IncompleteResult[] {
  const severityOrder: Record<IncompleteSeverity, number> = {
    info: 0,
    warning: 1,
    error: 2,
    critical: 3,
  };
  const threshold = severityOrder[minSeverity];
  return results.filter((r) => severityOrder[r.severity] >= threshold);
}
