/**
 * nexus-agents/cli/hooks - Hook Output Formatter
 *
 * Formats hook output according to Claude CLI protocol.
 * Handles exit codes and JSON output formatting.
 *
 * @module cli/hooks/hook-output
 * (Source: Issue #411, #412 - Claude CLI Hook Integration)
 */

import {
  EXIT_SUCCESS,
  EXIT_BLOCK,
  EXIT_ERROR,
  type HookResult,
  type HookOutputBase,
  type PreToolUseOutput,
  type PostToolUseOutput,
  type StopOutput,
  type SessionStartOutput,
} from './hook-types.js';

// Re-export HookResult for convenience
export type { HookResult } from './hook-types.js';

// ============================================================================
// Exit Code Helpers
// ============================================================================

/**
 * Creates a successful hook result (exit code 0).
 * stdout is shown in verbose mode.
 */
export function exitSuccess(stdout?: string): HookResult {
  const result: HookResult = {
    exitCode: EXIT_SUCCESS,
  };
  if (stdout !== undefined) {
    result.stdout = stdout;
  }
  return result;
}

/**
 * Creates a blocking error result (exit code 2).
 * stderr is fed back to Claude.
 */
export function exitBlock(stderr: string): HookResult {
  return {
    exitCode: EXIT_BLOCK,
    stderr,
  };
}

/**
 * Creates a non-blocking error result (exit code 1).
 * stderr is shown in verbose mode.
 */
export function exitError(stderr: string): HookResult {
  return {
    exitCode: EXIT_ERROR,
    stderr,
  };
}

// ============================================================================
// JSON Output Helpers
// ============================================================================

/**
 * Creates JSON output for structured hook control.
 * Only processed when exit code is 0.
 */
export function jsonOutput(output: HookOutputBase): HookResult {
  return {
    exitCode: EXIT_SUCCESS,
    stdout: JSON.stringify(output),
  };
}

/**
 * Creates a PreToolUse allow decision.
 */
export function allowTool(reason?: string): HookResult {
  const output: PreToolUseOutput = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      permissionDecisionReason: reason,
    },
  };
  return jsonOutput(output);
}

/**
 * Creates a PreToolUse deny decision.
 */
export function denyTool(reason: string): HookResult {
  const output: PreToolUseOutput = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
  return jsonOutput(output);
}

/**
 * Creates a PreToolUse ask decision (prompt user).
 */
export function askPermission(reason?: string): HookResult {
  const output: PreToolUseOutput = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: reason,
    },
  };
  return jsonOutput(output);
}

/**
 * Creates a PreToolUse response with modified input.
 */
export function modifyToolInput(
  updatedInput: Record<string, unknown>,
  decision: 'allow' | 'ask' = 'allow'
): HookResult {
  const output: PreToolUseOutput = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      updatedInput,
    },
  };
  return jsonOutput(output);
}

/**
 * Creates a PostToolUse block decision.
 */
export function blockPostTool(reason: string): HookResult {
  const output: PostToolUseOutput = {
    decision: 'block',
    reason,
  };
  return jsonOutput(output);
}

/**
 * Creates a PostToolUse response with additional context.
 */
export function postToolContext(additionalContext: string): HookResult {
  const output: PostToolUseOutput = {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext,
    },
  };
  return jsonOutput(output);
}

/**
 * Creates a Stop block decision (prevents Claude from stopping).
 */
export function blockStop(reason: string): HookResult {
  const output: StopOutput = {
    decision: 'block',
    reason,
  };
  return jsonOutput(output);
}

/**
 * Creates a SessionStart response with additional context.
 */
export function sessionStartContext(additionalContext: string): HookResult {
  const output: SessionStartOutput = {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext,
    },
  };
  return jsonOutput(output);
}

/**
 * Creates a response that stops Claude processing.
 */
export function stopProcessing(stopReason: string): HookResult {
  const output: HookOutputBase = {
    continue: false,
    stopReason,
  };
  return jsonOutput(output);
}

// ============================================================================
// Output Writer
// ============================================================================

/**
 * Writes hook result to stdout/stderr and exits.
 * This should be called at the end of hook execution.
 */
export function writeResultAndExit(result: HookResult): never {
  if (result.stdout !== undefined) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr !== undefined) {
    process.stderr.write(result.stderr);
  }
  process.exit(result.exitCode);
}

/**
 * Writes hook result without exiting (for testing).
 */
export function writeResult(result: HookResult): void {
  if (result.stdout !== undefined) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr !== undefined) {
    process.stderr.write(result.stderr);
  }
}
