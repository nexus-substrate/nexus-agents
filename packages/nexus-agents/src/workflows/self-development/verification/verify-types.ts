/**
 * QA Verification Types
 *
 * Type definitions for the verification engine that runs quality checks
 * before issue closure.
 *
 * (Source: Issue #277 - QA cycle before issue closure)
 */

import { z } from 'zod';

// ============================================================================
// Check Types
// ============================================================================

/**
 * Category of verification check.
 */
export type CheckCategory =
  | 'build'
  | 'lint'
  | 'typecheck'
  | 'test'
  | 'security'
  | 'documentation'
  | 'coverage'
  | 'custom';

/**
 * Severity level for check failures.
 */
export type CheckSeverity = 'error' | 'warning' | 'info';

/**
 * Definition of a verification check.
 */
export interface CheckDefinition {
  /** Unique check identifier */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;
  /** Category for grouping */
  readonly category: CheckCategory;
  /** Shell command to execute */
  readonly command: string;
  /** Patterns that indicate success (regex) */
  readonly successPatterns?: readonly string[];
  /** Patterns that indicate failure (regex) */
  readonly failurePatterns?: readonly string[];
  /** Timeout in milliseconds */
  readonly timeoutMs?: number;
  /** Whether this check is required for pass */
  readonly required: boolean;
  /** Weight for scoring (0-1) */
  readonly weight?: number;
}

/**
 * Result of executing a single check.
 */
export interface CheckResult {
  /** Check that was executed */
  readonly checkId: string;
  /** Whether the check passed */
  readonly passed: boolean;
  /** Severity of failure (if failed) */
  readonly severity?: CheckSeverity;
  /** Score for this check (0-1) */
  readonly score: number;
  /** Execution duration in ms */
  readonly durationMs: number;
  /** Raw command output */
  readonly output?: string;
  /** Error message if failed */
  readonly error?: string;
  /** Specific issues found */
  readonly issues?: readonly CheckIssue[];
}

/**
 * Specific issue found during a check.
 */
export interface CheckIssue {
  /** Issue type/code */
  readonly code: string;
  /** Human-readable message */
  readonly message: string;
  /** File path if applicable */
  readonly file?: string;
  /** Line number if applicable */
  readonly line?: number;
  /** Severity */
  readonly severity: CheckSeverity;
}

// ============================================================================
// Verification Types
// ============================================================================

/**
 * Configuration for verification engine.
 */
export interface VerifyConfig {
  /** Checks to run */
  readonly checks: readonly CheckDefinition[];
  /** Stop on first failure */
  readonly stopOnFirstFailure?: boolean;
  /** Minimum overall score to pass (0-1) */
  readonly passThreshold?: number;
  /** Enable feedback generation */
  readonly generateFeedback?: boolean;
  /** Maximum refinement iterations */
  readonly maxIterations?: number;
}

/**
 * Input to verification engine.
 */
export interface VerifyInput {
  /** Working directory */
  readonly workDir: string;
  /** Files changed (for targeted checks) */
  readonly changedFiles?: readonly string[];
  /** Acceptance criteria from issue */
  readonly acceptanceCriteria?: readonly string[];
  /** Additional context */
  readonly context?: Record<string, unknown>;
}

/**
 * Output from verification engine.
 */
export interface VerifyOutput {
  /** Overall pass/fail verdict */
  readonly verdict: 'pass' | 'fail';
  /** Overall quality score (0-1) */
  readonly qualityScore: number;
  /** Confidence in the verdict (0-1) */
  readonly confidence: number;
  /** Individual check results */
  readonly checkResults: readonly CheckResult[];
  /** Summary of failures */
  readonly failureSummary?: string;
  /** Recommendations for improvement */
  readonly recommendations?: readonly string[];
  /** Total duration in ms */
  readonly durationMs: number;
  /** Iteration count if refinement was attempted */
  readonly iterations?: number;
}

/**
 * Feedback for refinement.
 */
export interface VerifyFeedback {
  /** Summary of issues found */
  readonly summary: string;
  /** Detailed recommendations */
  readonly recommendations: readonly string[];
  /** Files that need attention */
  readonly filesWithIssues: readonly string[];
  /** Priority order for fixes */
  readonly prioritizedFixes: readonly string[];
}

// ============================================================================
// Events
// ============================================================================

/**
 * Event types emitted by verification engine.
 */
export type VerifyEventType =
  | 'verify.started'
  | 'verify.check_started'
  | 'verify.check_completed'
  | 'verify.feedback_generated'
  | 'verify.completed';

/**
 * Verification event.
 */
export interface VerifyEvent {
  readonly type: VerifyEventType;
  readonly timestamp: Date;
  readonly data: Record<string, unknown>;
}

// ============================================================================
// Schemas
// ============================================================================

/**
 * Schema for check definition validation.
 */
export const CheckDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.enum([
    'build',
    'lint',
    'typecheck',
    'test',
    'security',
    'documentation',
    'coverage',
    'custom',
  ]),
  command: z.string().min(1),
  successPatterns: z.array(z.string()).optional(),
  failurePatterns: z.array(z.string()).optional(),
  timeoutMs: z.number().positive().optional(),
  required: z.boolean(),
  weight: z.number().min(0).max(1).optional(),
});

/**
 * Schema for verify config validation.
 */
export const VerifyConfigSchema = z.object({
  checks: z.array(CheckDefinitionSchema),
  stopOnFirstFailure: z.boolean().optional(),
  passThreshold: z.number().min(0).max(1).optional(),
  generateFeedback: z.boolean().optional(),
  maxIterations: z.number().positive().optional(),
});
