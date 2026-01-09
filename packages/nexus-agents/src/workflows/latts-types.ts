/**
 * nexus-agents/workflows - LATTS Types
 *
 * Type definitions for Locally Adaptive Test-Time Scaling (LATTS).
 * Enables dynamic compute allocation with verifier-based acceptance.
 *
 * @module workflows/latts-types
 * (Source: Issue #153, arXiv:2509.20368)
 */

import { z } from 'zod';
import type { StepResult } from '../core/index.js';

/**
 * Verification result from the acceptance criterion.
 */
export interface VerificationResult {
  /** Whether the output is accepted */
  readonly accepted: boolean;
  /** Confidence in the verification (0-1) */
  readonly confidence: number;
  /** Reason for acceptance/rejection */
  readonly reason: string;
  /** Quality score if available (0-1) */
  readonly qualityScore?: number | undefined;
  /** Specific issues found */
  readonly issues?: readonly string[] | undefined;
}

/**
 * Decision from the LATTS controller.
 */
export type LattsDecision =
  | { readonly type: 'accept'; readonly reason: string }
  | {
      readonly type: 'resample';
      readonly reason: string;
      readonly adjustments?: Record<string, unknown>;
    }
  | { readonly type: 'backtrack'; readonly reason: string; readonly toStepId: string }
  | { readonly type: 'restart'; readonly reason: string }
  | { readonly type: 'stop'; readonly reason: string; readonly output: unknown };

/**
 * History entry for LATTS execution.
 */
export interface LattsHistoryEntry {
  /** Attempt number (1-indexed) */
  readonly attempt: number;
  /** Step result from this attempt */
  readonly result: StepResult;
  /** Verification result */
  readonly verification: VerificationResult;
  /** Decision made */
  readonly decision: LattsDecision;
  /** Time spent on this attempt */
  readonly durationMs: number;
}

/**
 * Verifier interface for acceptance criterion.
 */
export interface IVerifier {
  /** Verify a step result */
  verify(result: StepResult, context: VerifierContext): Promise<VerificationResult>;
}

/**
 * Context provided to verifier for verification.
 */
export interface VerifierContext {
  /** Step ID being verified */
  readonly stepId: string;
  /** Task description */
  readonly taskDescription: string;
  /** Previous attempts on this step */
  readonly previousAttempts: readonly LattsHistoryEntry[];
  /** Results from other steps */
  readonly stepResults: ReadonlyMap<string, StepResult>;
  /** Total attempts so far across all steps */
  readonly totalAttempts: number;
}

/**
 * LATTS controller interface.
 */
export interface ILattsController {
  /** Make a decision based on verification result */
  decide(
    verification: VerificationResult,
    history: readonly LattsHistoryEntry[],
    context: DecisionContext
  ): LattsDecision;
}

/**
 * Context for making LATTS decisions.
 */
export interface DecisionContext {
  /** Current step ID */
  readonly stepId: string;
  /** Total compute budget (max attempts) */
  readonly maxAttempts: number;
  /** Current attempt number */
  readonly currentAttempt: number;
  /** Available step IDs to backtrack to */
  readonly backtrackableSteps: readonly string[];
  /** Whether restart is allowed */
  readonly allowRestart: boolean;
  /** Time elapsed so far */
  readonly elapsedMs: number;
  /** Maximum time allowed */
  readonly maxTimeMs: number;
}

/**
 * LATTS configuration.
 */
export interface LattsConfig {
  /** Maximum attempts per step */
  readonly maxAttemptsPerStep: number;
  /** Maximum total attempts across all steps */
  readonly maxTotalAttempts: number;
  /** Maximum time in milliseconds */
  readonly maxTimeMs: number;
  /** Acceptance threshold (min confidence to accept) */
  readonly acceptanceThreshold: number;
  /** Quality threshold (min quality score to accept) */
  readonly qualityThreshold: number;
  /** Whether to allow backtracking */
  readonly allowBacktrack: boolean;
  /** Whether to allow restart */
  readonly allowRestart: boolean;
  /** Minimum confidence to consider stopping early */
  readonly earlyStopThreshold: number;
}

/**
 * Default LATTS configuration.
 */
export const DEFAULT_LATTS_CONFIG: LattsConfig = {
  maxAttemptsPerStep: 5,
  maxTotalAttempts: 20,
  maxTimeMs: 300000, // 5 minutes
  acceptanceThreshold: 0.7,
  qualityThreshold: 0.6,
  allowBacktrack: true,
  allowRestart: true,
  earlyStopThreshold: 0.95,
};

/**
 * Zod schema for config validation.
 */
export const LattsConfigSchema = z.object({
  maxAttemptsPerStep: z.number().int().positive().default(5),
  maxTotalAttempts: z.number().int().positive().default(20),
  maxTimeMs: z.number().int().positive().default(300000),
  acceptanceThreshold: z.number().min(0).max(1).default(0.7),
  qualityThreshold: z.number().min(0).max(1).default(0.6),
  allowBacktrack: z.boolean().default(true),
  allowRestart: z.boolean().default(true),
  earlyStopThreshold: z.number().min(0).max(1).default(0.95),
});

/**
 * Result of LATTS execution.
 */
export interface LattsExecutionResult {
  /** Final step result */
  readonly result: StepResult;
  /** Final verification */
  readonly verification: VerificationResult;
  /** Complete history of attempts */
  readonly history: readonly LattsHistoryEntry[];
  /** Total compute used (attempts) */
  readonly totalAttempts: number;
  /** Total time spent */
  readonly totalDurationMs: number;
  /** Whether early stopping was triggered */
  readonly earlyStop: boolean;
  /** Whether execution was successful */
  readonly success: boolean;
}

/**
 * Statistics about LATTS performance.
 */
export interface LattsStats {
  /** Total executions */
  readonly totalExecutions: number;
  /** Successful executions */
  readonly successfulExecutions: number;
  /** Average attempts per step */
  readonly avgAttemptsPerStep: number;
  /** Average attempts for successful execution */
  readonly avgAttemptsForSuccess: number;
  /** Backtrack frequency */
  readonly backtrackRate: number;
  /** Restart frequency */
  readonly restartRate: number;
  /** Early stop frequency */
  readonly earlyStopRate: number;
  /** Average quality score */
  readonly avgQualityScore: number;
}
