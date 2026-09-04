/**
 * nexus-agents/core - Step Event Vocabulary
 *
 * A typed, discriminated-union vocabulary for "operator-meaningful"
 * step boundaries. Emitted via a process-local EventEmitter so both
 * the JSON logger and the stderr ConsoleRenderer (peer subscribers)
 * observe the same events. Both subscribers key on `event`, `name`,
 * depth and status only; there is no per-step "kind" (#5097 removed it —
 * nothing read it and two of its seven values had no producer).
 *
 * @module core/step-events
 * (Source: #1930 — human console notifications; ux-expert design.)
 */

/** Error categories mirror the subprocess-adapter classifier so renderer can tag failures. */
export type StepErrorCategory =
  'timeout' | 'parse' | 'connection' | 'execution' | 'policy' | 'rate_limit' | 'unknown';

interface StepEventBase {
  /** Monotonic-enough unique id generated at step start. */
  stepId: string;
  /** Ambient parent from AsyncLocalStorage, undefined at root. */
  parentStepId?: string;
  /** Operator-facing step name, e.g. 'research', 'vote:security'. */
  name: string;
  /** Optional key/value attributes surfaced into logs. */
  attrs?: Record<string, unknown>;
}

export interface StepStartedEvent extends StepEventBase {
  event: 'step.started';
  /** ISO timestamp at start. */
  startedAt: string;
}

export interface StepCompletedEvent extends StepEventBase {
  event: 'step.completed';
  /** Wall-clock duration, milliseconds. */
  durationMs: number;
  status: 'ok';
  /** Optional one-line human summary (<=120 chars after truncation). */
  summary?: string;
}

export interface StepFailedEvent extends StepEventBase {
  event: 'step.failed';
  durationMs: number;
  status: 'failed';
  errorCategory: StepErrorCategory;
  /** One-line error summary (truncated at 120 chars). */
  summary?: string;
}

export type StepEvent = StepStartedEvent | StepCompletedEvent | StepFailedEvent;

/** Max characters of summary shown to operator. */
export const STEP_SUMMARY_MAX_LEN = 120;

/** Truncate a summary string for display without mutating the source. */
export function truncateSummary(s: string | undefined): string | undefined {
  if (s === undefined) return undefined;
  if (s.length <= STEP_SUMMARY_MAX_LEN) return s;
  return s.slice(0, STEP_SUMMARY_MAX_LEN - 1) + '…';
}
