/**
 * nexus-agents/core - Unified Command Result Pattern
 *
 * Base type for CLI command results. Provides a consistent interface
 * for all command outputs across the CLI module.
 *
 * @module core/command-result
 * (Source: Issue #584 - CommandResult consolidation)
 */

/**
 * Base interface for CLI command results.
 *
 * Provides a unified pattern for representing command outcomes:
 * - `success`: whether the command completed successfully
 * - `message`: human-readable status message
 * - `data`: optional typed payload for command-specific data
 * - `error`: optional error details for failure cases
 *
 * @template T - The type of the data payload (default: void)
 *
 * @example
 * ```typescript
 * // Simple success/failure result
 * const result: CommandResult = { success: true, message: 'Done' };
 *
 * // Result with typed data
 * interface ConfigData { key: string; value: unknown }
 * const configResult: CommandResult<ConfigData> = {
 *   success: true,
 *   message: 'Config retrieved',
 *   data: { key: 'timeout', value: 5000 }
 * };
 *
 * // Failure result
 * const errorResult: CommandResult = {
 *   success: false,
 *   message: 'Config not found',
 *   error: 'Key "invalid" does not exist'
 * };
 * ```
 */
export interface CommandResult<T = void> {
  /** Whether the command completed successfully */
  readonly success: boolean;
  /** Human-readable status message */
  readonly message?: string;
  /** Command-specific data payload (only present on success) */
  readonly data?: T;
  /** Error details (only present on failure) */
  readonly error?: string;
}

/**
 * Creates a successful command result.
 *
 * @param message - Success message
 * @param data - Optional data payload
 * @returns A successful CommandResult
 */
export function commandOk<T = void>(message?: string, data?: T): CommandResult<T> {
  const result: CommandResult<T> = { success: true };
  if (message !== undefined) {
    (result as { message?: string }).message = message;
  }
  if (data !== undefined) {
    (result as { data?: T }).data = data;
  }
  return result;
}

/**
 * Creates a failed command result.
 *
 * @param message - Error message for display
 * @param error - Optional detailed error string
 * @returns A failed CommandResult
 */
export function commandErr<T = void>(message: string, error?: string): CommandResult<T> {
  const result: CommandResult<T> = { success: false, message };
  if (error !== undefined) {
    (result as { error?: string }).error = error;
  }
  return result;
}

/**
 * Type guard to check if a command result is successful.
 *
 * @param result - The command result to check
 * @returns True if the result is successful
 */
export function isCommandOk<T>(
  result: CommandResult<T>
): result is CommandResult<T> & { success: true } {
  return result.success;
}

/**
 * Type guard to check if a command result is a failure.
 *
 * @param result - The command result to check
 * @returns True if the result is a failure
 */
export function isCommandErr<T>(
  result: CommandResult<T>
): result is CommandResult<T> & { success: false } {
  return !result.success;
}

/**
 * Extracts the data from a successful command result.
 *
 * @param result - The command result
 * @returns The data if present and successful, undefined otherwise
 */
export function getCommandData<T>(result: CommandResult<T>): T | undefined {
  return result.success ? result.data : undefined;
}
