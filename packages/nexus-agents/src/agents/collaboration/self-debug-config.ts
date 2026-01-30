/**
 * Self-Debug Protocol Configuration
 *
 * Configuration resolution and internal types for the Self-Debug protocol.
 * Extracted from self-debug-protocol.ts to maintain file size limits.
 *
 * @module agents/collaboration/self-debug-config
 * (Source: Issue #131, arXiv:2304.05128)
 */

import type { IAgent, Task } from '../../core/index.js';
import type {
  SelfDebugConfig,
  ExecutionResult,
  ParsedError,
  DebugIteration,
  ErrorPattern,
} from './self-debug-types.js';
import { DEFAULT_ERROR_PATTERNS, DEFAULT_SELF_DEBUG_CONFIG } from './self-debug-types.js';
import type { CodeExecutor } from './self-debug-helpers.js';

// =============================================================================
// Resolved Configuration
// =============================================================================

/** Resolved config with all defaults applied. */
export interface ResolvedConfig {
  readonly maxIterations: number;
  readonly iterationTimeoutMs: number;
  readonly stopOnFirstError: boolean;
  readonly includeExplanation: boolean;
  readonly errorPatterns: readonly ErrorPattern[];
  /** Allow synthetic errors when no patterns match (Issue #510) */
  readonly allowSyntheticErrors: boolean;
}

/** Get default resolved config. */
export function getDefaultConfig(): ResolvedConfig {
  const d = DEFAULT_SELF_DEBUG_CONFIG;
  return {
    maxIterations: d.maxIterations,
    iterationTimeoutMs: d.iterationTimeoutMs,
    stopOnFirstError: d.stopOnFirstError,
    includeExplanation: d.includeExplanation,
    errorPatterns: DEFAULT_ERROR_PATTERNS,
    allowSyntheticErrors: d.allowSyntheticErrors,
  };
}

/** Merge config with defaults. */
export function mergeConfig(config: SelfDebugConfig | undefined): ResolvedConfig {
  if (config === undefined) return getDefaultConfig();
  const d = getDefaultConfig();
  return {
    maxIterations: config.maxIterations ?? d.maxIterations,
    iterationTimeoutMs: config.iterationTimeoutMs ?? d.iterationTimeoutMs,
    stopOnFirstError: config.stopOnFirstError ?? d.stopOnFirstError,
    includeExplanation: config.includeExplanation ?? d.includeExplanation,
    errorPatterns: config.errorPatterns ?? d.errorPatterns,
    allowSyntheticErrors: config.allowSyntheticErrors ?? d.allowSyntheticErrors,
  };
}

// =============================================================================
// Internal Context Types
// =============================================================================

/** Context passed between methods during execution. */
export interface ExecutionContext {
  readonly task: Task;
  readonly agent: IAgent;
  readonly executor: CodeExecutor;
  readonly startTime: number;
}

/** Options for fix attempt. */
export interface FixAttemptOptions {
  readonly ctx: ExecutionContext;
  readonly code: string;
  readonly execution: ExecutionResult;
  readonly errors: ParsedError[];
  readonly iterNum: number;
  readonly iterStart: number;
}

/** Internal result from an iteration. */
export interface IterationResult {
  success: boolean;
  newCode: string;
  execution: ExecutionResult;
  fixedErrors: ParsedError[];
  madeProgress: boolean;
  iteration: DebugIteration;
}
