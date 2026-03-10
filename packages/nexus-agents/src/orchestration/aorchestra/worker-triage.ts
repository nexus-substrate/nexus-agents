/**
 * Worker Failure Triage — Pattern-based failure classification (#1506).
 *
 * Analyzes worker failures to determine whether they are retryable,
 * what action to take, and whether partial output is useful.
 * Zero-cost (no model calls) — uses deterministic pattern matching.
 *
 * Inspired by Overstory's 3-tier watchdog with AI triage (Tier 1).
 * Can be upgraded to AI-assisted triage in the future.
 *
 * @module orchestration/aorchestra/worker-triage
 * (Source: Issue #1506)
 */

import type { WorkerResult } from './worker-dispatcher.js';

/** Action recommendation from failure triage. */
export type TriageAction = 'retry_same_cli' | 'retry_different_cli' | 'extend_timeout' | 'abort';

/** Result of triaging a worker failure. */
export interface TriageResult {
  /** Recommended action for handling the failure. */
  readonly action: TriageAction;
  /** Human-readable reason for the recommendation. */
  readonly reason: string;
  /** Whether the failure is worth retrying at all. */
  readonly retryable: boolean;
  /** Whether the worker produced partial output worth preserving. */
  readonly hasUsefulOutput: boolean;
}

/** Minimum output length to consider "useful" partial output. */
const MIN_USEFUL_OUTPUT_LENGTH = 50;

/** Roles whose timeouts typically indicate genuine long-running work. */
const TIMEOUT_EXTENDABLE_ROLES = new Set(['code', 'testing', 'security', 'devops']);

// ============================================================================
// Pattern Groups
// ============================================================================

const TRANSIENT_PATTERNS = [
  'econnreset',
  'econnrefused',
  'etimedout',
  'epipe',
  'socket hang up',
  'connection reset',
  'network error',
  '500 internal server error',
  '502 bad gateway',
  '503 service unavailable',
  '504 gateway timeout',
  'empty response',
  'unexpected token',
  'malformed',
  'truncated',
  'parse error',
  'cannot parse',
  'command failed',
] as const;

const RATE_LIMIT_PATTERNS = [
  'rate limit',
  'rate_limit',
  'quota exceeded',
  '429',
  'too many requests',
  'max retries',
  'throttl',
] as const;

const NON_RETRYABLE_PATTERNS = [
  'unauthorized',
  'authentication',
  '401',
  '403 forbidden',
  'no model adapter',
  'adapter unavailable',
  'heap out of memory',
  'out of memory',
  'sigkill',
  'sigterm',
  'enomem',
  'spawn error',
] as const;

/**
 * Triage a worker failure and recommend an action.
 *
 * Classification priority (checked in order):
 * 1. Non-error results → abort (no-op)
 * 2. Non-retryable patterns (auth, crash, adapter) → abort
 * 3. Rate limit patterns → retry_different_cli
 * 4. Transient patterns (connection, parse, empty) → retry_same_cli
 * 5. Timeout on extendable roles → extend_timeout
 * 6. Unknown errors → abort (fail closed)
 */
export function triageWorkerFailure(result: WorkerResult): TriageResult {
  if (result.status !== 'error') {
    return makeResult('abort', 'Result is not a failure', false, false);
  }

  const errorMsg = (result.error ?? '').toLowerCase();
  const hasUsefulOutput = result.output.length >= MIN_USEFUL_OUTPUT_LENGTH;

  return classifyFailure(result, errorMsg, hasUsefulOutput);
}

/** Core classification logic — separated for complexity budget. */
function classifyFailure(
  result: WorkerResult,
  errorMsg: string,
  hasUsefulOutput: boolean
): TriageResult {
  if (matchesAny(errorMsg, NON_RETRYABLE_PATTERNS)) {
    return makeResult(
      'abort',
      `Non-retryable: ${truncate(result.error ?? 'unknown')}`,
      false,
      hasUsefulOutput
    );
  }
  if (result.errorType === 'rate_limit' || matchesAny(errorMsg, RATE_LIMIT_PATTERNS)) {
    return makeResult(
      'retry_different_cli',
      'Rate limited — try alternate CLI',
      true,
      hasUsefulOutput
    );
  }
  if (matchesAny(errorMsg, TRANSIENT_PATTERNS)) {
    return makeResult(
      'retry_same_cli',
      `Transient: ${truncate(result.error ?? 'unknown')}`,
      true,
      hasUsefulOutput
    );
  }
  return classifyTimeoutOrUnknown(result, errorMsg, hasUsefulOutput);
}

/** Handle timeout and unknown error classification. */
function classifyTimeoutOrUnknown(
  result: WorkerResult,
  errorMsg: string,
  hasUsefulOutput: boolean
): TriageResult {
  if (result.errorType === 'timeout') {
    if (TIMEOUT_EXTENDABLE_ROLES.has(result.role)) {
      return makeResult(
        'extend_timeout',
        `Timeout on ${result.role} — may need more time`,
        true,
        hasUsefulOutput
      );
    }
    return makeResult(
      'retry_same_cli',
      `Timeout on ${result.role} — retry without extension (#1536)`,
      true,
      hasUsefulOutput
    );
  }
  if (errorMsg === '' || errorMsg.trim() === '') {
    return makeResult(
      'retry_same_cli',
      'Empty error — likely transport issue, worth retrying (#1536)',
      true,
      hasUsefulOutput
    );
  }
  // model_error errorType indicates model/CLI transport issues — often transient (#1536)
  if (result.errorType === 'model_error') {
    return makeResult(
      'retry_same_cli',
      `Model error — may be transient: ${truncate(result.error ?? 'unknown')}`,
      true,
      hasUsefulOutput
    );
  }
  return makeResult(
    'abort',
    `Unrecognized failure: ${truncate(result.error ?? 'unknown')}`,
    false,
    hasUsefulOutput
  );
}

/** Build a TriageResult. */
function makeResult(
  action: TriageAction,
  reason: string,
  retryable: boolean,
  hasUsefulOutput: boolean
): TriageResult {
  return { action, reason, retryable, hasUsefulOutput };
}

// ============================================================================
// Helpers
// ============================================================================

function matchesAny(text: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => text.includes(p));
}

function truncate(s: string, max: number = 80): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
