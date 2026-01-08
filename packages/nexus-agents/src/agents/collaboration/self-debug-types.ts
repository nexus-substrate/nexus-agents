/**
 * Self-Debug Protocol Types
 *
 * Type definitions for the Self-Debug code repair protocol.
 * Based on arXiv:2304.05128 - Teaching LLMs to Self-Debug.
 *
 * @module agents/collaboration/self-debug-types
 * (Source: Issue #131, arXiv:2304.05128)
 */

import { z } from 'zod';

// =============================================================================
// Error Categories
// =============================================================================

/**
 * Categories of errors that can be detected.
 */
export const ErrorCategorySchema = z.enum([
  'syntax',
  'type',
  'runtime',
  'logic',
  'security',
  'style',
  'unknown',
]);
export type ErrorCategory = z.infer<typeof ErrorCategorySchema>;

/**
 * Severity levels for detected errors.
 */
export const ErrorSeveritySchema = z.enum(['critical', 'error', 'warning', 'info']);
export type ErrorSeverity = z.infer<typeof ErrorSeveritySchema>;

// =============================================================================
// Parsed Error
// =============================================================================

/**
 * Location of an error in source code.
 */
export const ErrorLocationSchema = z.object({
  /** File path (relative or absolute) */
  file: z.string().optional(),
  /** Line number (1-indexed) */
  line: z.number().int().positive().optional(),
  /** Column number (1-indexed) */
  column: z.number().int().positive().optional(),
  /** End line for multi-line errors */
  endLine: z.number().int().positive().optional(),
  /** End column */
  endColumn: z.number().int().positive().optional(),
});
export type ErrorLocation = z.infer<typeof ErrorLocationSchema>;

/**
 * A parsed error extracted from execution output.
 */
export const ParsedErrorSchema = z.object({
  /** Unique identifier for this error */
  id: z.string(),
  /** Error category */
  category: ErrorCategorySchema,
  /** Severity level */
  severity: ErrorSeveritySchema,
  /** Error message from compiler/runtime */
  message: z.string(),
  /** Error code if available (e.g., TS2345) */
  code: z.string().optional(),
  /** Location in source code */
  location: ErrorLocationSchema.optional(),
  /** Raw error text */
  rawError: z.string(),
  /** Stack trace if available */
  stackTrace: z.string().optional(),
});
export type ParsedError = z.infer<typeof ParsedErrorSchema>;

// =============================================================================
// Error Explanation
// =============================================================================

/**
 * Natural language explanation of an error.
 */
export const ErrorExplanationSchema = z.object({
  /** The error being explained */
  errorId: z.string(),
  /** Simple explanation of what went wrong */
  summary: z.string(),
  /** Detailed explanation with context */
  details: z.string(),
  /** Identified root cause */
  rootCause: z.string(),
  /** Suggested fix strategies */
  fixStrategies: z.array(z.string()),
  /** Confidence in the explanation (0-1) */
  confidence: z.number().min(0).max(1),
});
export type ErrorExplanation = z.infer<typeof ErrorExplanationSchema>;

// =============================================================================
// Code Fix
// =============================================================================

/**
 * A proposed code fix for an error.
 */
export const CodeFixSchema = z.object({
  /** The error this fix addresses */
  errorId: z.string(),
  /** Original code snippet */
  originalCode: z.string(),
  /** Fixed code snippet */
  fixedCode: z.string(),
  /** Explanation of the fix */
  explanation: z.string(),
  /** Location where fix should be applied */
  location: ErrorLocationSchema.optional(),
  /** Confidence in the fix (0-1) */
  confidence: z.number().min(0).max(1),
});
export type CodeFix = z.infer<typeof CodeFixSchema>;

// =============================================================================
// Debug Iteration
// =============================================================================

/**
 * Result of executing code (tests, build, etc.).
 */
export const ExecutionResultSchema = z.object({
  /** Whether execution succeeded */
  success: z.boolean(),
  /** Exit code from execution */
  exitCode: z.number().int(),
  /** Standard output */
  stdout: z.string(),
  /** Standard error */
  stderr: z.string(),
  /** Execution time in ms */
  durationMs: z.number(),
  /** Parsed errors from output */
  errors: z.array(ParsedErrorSchema),
});
export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;

/**
 * Record of a single debug iteration.
 */
export const DebugIterationSchema = z.object({
  /** Iteration number (1-indexed) */
  iteration: z.number().int().positive(),
  /** Code at the start of this iteration */
  codeSnapshot: z.string(),
  /** Execution result for this iteration */
  executionResult: ExecutionResultSchema,
  /** Errors detected in this iteration */
  errorsDetected: z.array(ParsedErrorSchema),
  /** Explanations generated for errors */
  explanations: z.array(ErrorExplanationSchema),
  /** Fixes proposed for errors */
  proposedFixes: z.array(CodeFixSchema),
  /** Fix that was applied (if any) */
  appliedFix: CodeFixSchema.optional(),
  /** Time taken for this iteration in ms */
  durationMs: z.number(),
});
export type DebugIteration = z.infer<typeof DebugIterationSchema>;

// =============================================================================
// Configuration
// =============================================================================

/**
 * Configuration for Self-Debug protocol.
 */
export interface SelfDebugConfig {
  /** Maximum number of debug iterations (default: 5) */
  readonly maxIterations?: number;
  /** Timeout per iteration in ms (default: 60000) */
  readonly iterationTimeoutMs?: number;
  /** Stop on first error or try to fix all (default: true) */
  readonly stopOnFirstError?: boolean;
  /** Include "rubber duck" code explanation (default: true) */
  readonly includeExplanation?: boolean;
  /** Custom error parsing patterns */
  readonly errorPatterns?: readonly ErrorPattern[];
  /** Command to execute for verification (e.g., 'npm test') */
  readonly verifyCommand?: string;
  /** Working directory for execution */
  readonly workingDir?: string;
}

/**
 * Pattern for parsing errors from output.
 */
export interface ErrorPattern {
  /** Name of this pattern */
  readonly name: string;
  /** Regex to match error lines */
  readonly pattern: RegExp;
  /** Error category this pattern detects */
  readonly category: ErrorCategory;
  /** Groups: 1=file, 2=line, 3=column, 4=message */
  readonly groups: {
    readonly file?: number;
    readonly line?: number;
    readonly column?: number;
    readonly message?: number;
    readonly code?: number;
  };
}

// =============================================================================
// Result
// =============================================================================

/**
 * Final result of the Self-Debug protocol.
 */
export interface SelfDebugResult {
  /** Whether all errors were resolved */
  readonly success: boolean;
  /** Final code after debugging */
  readonly finalCode: string;
  /** Final execution result */
  readonly finalExecution: ExecutionResult;
  /** Number of iterations executed */
  readonly totalIterations: number;
  /** Total time spent debugging in ms */
  readonly totalDurationMs: number;
  /** Errors that were fixed */
  readonly errorsFixed: readonly ParsedError[];
  /** Errors that remain unfixed */
  readonly errorsRemaining: readonly ParsedError[];
  /** Complete debug history */
  readonly history: readonly DebugIteration[];
  /** Reason for stopping (success, max_iterations, timeout, etc.) */
  readonly stopReason: 'success' | 'max_iterations' | 'timeout' | 'no_progress' | 'cancelled';
}

// =============================================================================
// Default Error Patterns
// =============================================================================

/**
 * Built-in error patterns for common languages/tools.
 */
export const DEFAULT_ERROR_PATTERNS: readonly ErrorPattern[] = [
  // TypeScript/JavaScript compiler errors
  {
    name: 'typescript',
    pattern: /^(.+)\((\d+),(\d+)\): error (TS\d+): (.+)$/,
    category: 'type',
    groups: { file: 1, line: 2, column: 3, code: 4, message: 5 },
  },
  // ESLint errors
  {
    name: 'eslint',
    pattern: /^(.+):(\d+):(\d+): (error|warning) (.+)$/,
    category: 'style',
    groups: { file: 1, line: 2, column: 3, message: 5 },
  },
  // Node.js runtime errors
  {
    name: 'node-runtime',
    pattern: /^(.+):(\d+)\n\s+(.+)\n\s+\^+\n\n(\w+): (.+)$/m,
    category: 'runtime',
    groups: { file: 1, line: 2, message: 5 },
  },
  // Generic syntax error
  {
    name: 'syntax-error',
    pattern: /SyntaxError: (.+) at (.+):(\d+):(\d+)/,
    category: 'syntax',
    groups: { message: 1, file: 2, line: 3, column: 4 },
  },
  // Python errors
  {
    name: 'python',
    pattern: /File "(.+)", line (\d+)(?:, in .+)?\n\s+.+\n(\w+): (.+)$/m,
    category: 'runtime',
    groups: { file: 1, line: 2, message: 4 },
  },
  // Go errors
  {
    name: 'go',
    pattern: /^(.+):(\d+):(\d+): (.+)$/,
    category: 'type',
    groups: { file: 1, line: 2, column: 3, message: 4 },
  },
  // Rust errors
  {
    name: 'rust',
    pattern: /error\[E(\d+)\]: (.+)\n\s+--> (.+):(\d+):(\d+)/m,
    category: 'type',
    groups: { code: 1, message: 2, file: 3, line: 4, column: 5 },
  },
];

/**
 * Default configuration values.
 */
export const DEFAULT_SELF_DEBUG_CONFIG: Required<
  Omit<SelfDebugConfig, 'errorPatterns' | 'verifyCommand' | 'workingDir'>
> = {
  maxIterations: 5,
  iterationTimeoutMs: 60000,
  stopOnFirstError: true,
  includeExplanation: true,
};
