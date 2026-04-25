/**
 * Canonical helpers for constructing CliError values with the correct
 * `retryable` flag.
 *
 * Consolidates three previously-duplicated copies:
 * - `cli-retry-loop.ts` (as a module-local set + `isRetryableError`)
 * - `adapters/codex-adapter-helpers.ts` (as `createCodexError`)
 * - `adapters/codex-mcp-adapter-helpers.ts` (as `createCliError`)
 * - `testing/adapters/mock-adapter-helpers.ts` (as `createCliError`)
 *
 * Every call path that classifies retryable CLI errors should now flow
 * through here. Adding a new retryable code is a one-line change in one
 * place instead of four.
 *
 * (Issue #2181 — adapter harness consolidation)
 *
 * @module cli-adapters/cli-error-helpers
 */

import type { CliError, CliErrorCode, CliName } from './types.js';

/** Error codes the retry machinery treats as transient. */
export const RETRYABLE_ERROR_CODES: ReadonlySet<CliErrorCode> = new Set<CliErrorCode>([
  'TIMEOUT',
  'RATE_LIMITED',
  'CONNECTION_ERROR',
]);

/** Whether a given CLI error code should be retried. */
export function isRetryableErrorCode(code: CliErrorCode): boolean {
  return RETRYABLE_ERROR_CODES.has(code);
}

/**
 * Constructs a CliError with `retryable` auto-derived from the code.
 * Every adapter that needs to surface a CliError should prefer this
 * helper (or the `createError` method on `BaseCliAdapter`, which calls
 * into the same logic) rather than building the shape inline.
 */
export function createCliError(
  code: CliErrorCode,
  message: string,
  cli: CliName,
  cause?: Error
): CliError {
  return {
    code,
    message,
    cli,
    retryable: isRetryableErrorCode(code),
    ...(cause !== undefined && { cause }),
  };
}
