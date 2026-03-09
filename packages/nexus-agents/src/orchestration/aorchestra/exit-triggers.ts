/**
 * Exit triggers for orchestration lifecycle (#1509).
 *
 * Configurable conditions for determining when a dispatch execution
 * has completed all useful work. ALL enabled triggers must be met
 * (AND semantics) before signaling exit.
 *
 * Inspired by Overstory's coordinator exit trigger pattern.
 *
 * @module orchestration/aorchestra/exit-triggers
 */

import type { WorkerResult } from './worker-dispatcher.js';

// ============================================================================
// Types
// ============================================================================

/** Exit trigger configuration. Omitted triggers are not evaluated. */
export interface ExitTriggerConfig {
  /** Exit when all workers have completed (success or error, not skipped). */
  readonly allWorkersComplete?: boolean;
  /** Exit when the model call budget is exhausted. */
  readonly budgetExhausted?: boolean;
  /** Exit when no errors are retriable (all are rate_limit or timeout). */
  readonly noRetriableErrors?: boolean;
}

/** State snapshot for evaluating exit triggers. */
export interface ExitTriggerState {
  readonly results: readonly WorkerResult[];
  readonly totalModelCalls: number;
  readonly maxModelCalls: number;
  readonly plannedWorkers: number;
}

/** Result of exit trigger evaluation. */
export interface ExitTriggerResult {
  readonly shouldExit: boolean;
  readonly reasons: readonly string[];
}

// ============================================================================
// Non-retriable error types (retrying won't help)
// ============================================================================

const NON_RETRIABLE_TYPES = new Set(['rate_limit', 'timeout']);

// ============================================================================
// Public API
// ============================================================================

/**
 * Evaluate exit triggers against current dispatch state.
 * Returns shouldExit=true only when ALL enabled triggers are satisfied.
 */
export function evaluateExitTriggers(
  config: ExitTriggerConfig,
  state: ExitTriggerState
): ExitTriggerResult {
  const reasons: string[] = [];
  const enabledCount = countEnabled(config);

  if (enabledCount === 0) return { shouldExit: false, reasons: [] };

  if (config.allWorkersComplete === true) {
    const completed = state.results.filter((r) => r.status !== 'skipped').length;
    if (completed >= state.plannedWorkers) {
      reasons.push('all workers complete');
    }
  }

  if (config.budgetExhausted === true) {
    if (state.totalModelCalls >= state.maxModelCalls) {
      reasons.push('budget exhausted');
    }
  }

  if (config.noRetriableErrors === true) {
    const errors = state.results.filter((r) => r.status === 'error');
    const allNonRetriable =
      errors.length > 0 &&
      errors.every((r) => r.errorType !== undefined && NON_RETRIABLE_TYPES.has(r.errorType));
    if (errors.length === 0 || allNonRetriable) {
      reasons.push('no retriable errors');
    }
  }

  return {
    shouldExit: reasons.length >= enabledCount,
    reasons,
  };
}

function countEnabled(config: ExitTriggerConfig): number {
  let count = 0;
  if (config.allWorkersComplete === true) count++;
  if (config.budgetExhausted === true) count++;
  if (config.noRetriableErrors === true) count++;
  return count;
}
