/**
 * TRINITY Coordinator Types
 *
 * Type definitions for the TRINITY Thinker/Worker/Verifier pattern
 * from arXiv:2512.04695. Achieves 86.2% accuracy on LiveCodeBench.
 *
 * @module agents/collaboration/trinity-types
 * (Source: Issue #141, arXiv:2512.04695)
 */

import { z } from 'zod';
import type { IAgent, Task } from '../../core/index.js';
import type { IEventBus } from './event-bus-types.js';

// =============================================================================
// TRINITY Role Types
// =============================================================================

/** TRINITY-specific roles. */
export type TrinityRole = 'thinker' | 'worker' | 'verifier';

/** Configuration for a TRINITY role. */
export interface TrinityRoleConfig {
  /** Role identifier */
  readonly role: TrinityRole;
  /** System prompt for this role */
  readonly systemPrompt: string;
  /** Temperature for completions */
  readonly temperature: number;
  /** Maximum tokens for response */
  readonly maxTokens: number;
}

/** Default prompts for each TRINITY role. */
export const TRINITY_ROLE_PROMPTS: Record<TrinityRole, string> = {
  thinker: `You are the Thinker in a TRINITY coordination framework.
Your role is high-level reasoning and problem decomposition.

Responsibilities:
1. Analyze the task requirements and constraints
2. Break down complex problems into actionable steps
3. Identify potential approaches and trade-offs
4. Create a clear execution plan for the Worker

Output Format:
- Problem Analysis: What needs to be solved
- Approach: Step-by-step plan
- Considerations: Edge cases, risks, assumptions
- Success Criteria: How to verify correctness`,

  worker: `You are the Worker in a TRINITY coordination framework.
Your role is task execution based on the Thinker's plan.

Responsibilities:
1. Follow the Thinker's execution plan
2. Implement the solution step by step
3. Generate code, content, or artifacts as needed
4. Report any blockers or deviations from the plan

Output Format:
- Implementation: The actual work output
- Steps Completed: What was done
- Deviations: Any changes from the plan
- Questions: Clarifications needed`,

  verifier: `You are the Verifier in a TRINITY coordination framework.
Your role is output validation and correctness checking.

Responsibilities:
1. Review the Worker's output against the Thinker's plan
2. Check for correctness, completeness, and quality
3. Identify errors, bugs, or missing requirements
4. Provide pass/fail verdict with specific feedback

Output Format:
- Verdict: PASS or FAIL
- Correctness Check: Does it solve the problem?
- Quality Check: Code quality, best practices
- Issues Found: Specific problems to fix
- Recommendations: Improvements if any`,
};

/** Default temperatures for TRINITY roles. */
export const TRINITY_ROLE_TEMPERATURES: Record<TrinityRole, number> = {
  thinker: 0.7, // Higher for creative problem decomposition
  worker: 0.2, // Lower for precise execution
  verifier: 0.3, // Moderate for balanced evaluation
};

/** Default max tokens for TRINITY roles. */
export const TRINITY_ROLE_MAX_TOKENS: Record<TrinityRole, number> = {
  thinker: 2000, // Needs space for analysis
  worker: 4000, // Needs space for implementation
  verifier: 1500, // Concise feedback
};

// =============================================================================
// Coordination Types
// =============================================================================

/** Phase of TRINITY coordination. */
export type TrinityPhase = 'thinking' | 'working' | 'verifying' | 'complete';

/** Result from a single TRINITY phase. */
export interface TrinityPhaseResult {
  /** Which phase produced this result */
  readonly phase: TrinityPhase;
  /** Role that executed this phase */
  readonly role: TrinityRole;
  /** Output from the phase */
  readonly output: string;
  /** Duration in milliseconds */
  readonly durationMs: number;
  /** Tokens used */
  readonly tokensUsed: number;
}

/** Thinker's analysis output. */
export interface ThinkerOutput {
  /** Problem analysis */
  readonly problemAnalysis: string;
  /** Execution approach/plan */
  readonly approach: string;
  /** Considerations and edge cases */
  readonly considerations: string[];
  /** Success criteria */
  readonly successCriteria: string[];
}

/** Worker's implementation output. */
export interface WorkerOutput {
  /** The actual implementation/content */
  readonly implementation: string;
  /** Steps completed */
  readonly stepsCompleted: string[];
  /** Deviations from plan */
  readonly deviations: string[];
  /** Questions or blockers */
  readonly questions: string[];
}

/** Verifier's evaluation output. */
export interface VerifierOutput {
  /** Pass or fail verdict */
  readonly verdict: 'pass' | 'fail';
  /** Correctness assessment */
  readonly correctnessCheck: string;
  /** Quality assessment */
  readonly qualityCheck: string;
  /** Issues found */
  readonly issuesFound: string[];
  /** Recommendations */
  readonly recommendations: string[];
}

// =============================================================================
// Coordinator Configuration
// =============================================================================

/** Configuration for TRINITY coordinator. */
export interface TrinityConfig {
  /** Maximum verification iterations before giving up */
  readonly maxIterations?: number;
  /** Timeout for entire coordination in ms */
  readonly timeoutMs?: number;
  /** Whether to include detailed phase history */
  readonly includeHistory?: boolean;
  /** Custom role configurations */
  readonly roleConfigs?: Partial<Record<TrinityRole, Partial<TrinityRoleConfig>>>;
}

/** Default TRINITY configuration. */
export const DEFAULT_TRINITY_CONFIG: Required<TrinityConfig> = {
  maxIterations: 3,
  timeoutMs: 5 * 60 * 1000, // 5 minutes
  includeHistory: true,
  roleConfigs: {},
};

// =============================================================================
// Coordination Result
// =============================================================================

/** Result of TRINITY coordination. */
export interface TrinityResult {
  /** Whether coordination succeeded */
  readonly success: boolean;
  /** Final output after all phases */
  readonly finalOutput: string;
  /** Thinker's analysis */
  readonly thinkerOutput: ThinkerOutput;
  /** Worker's implementation */
  readonly workerOutput: WorkerOutput;
  /** Verifier's final assessment */
  readonly verifierOutput: VerifierOutput;
  /** Number of think-work-verify iterations */
  readonly iterations: number;
  /** Total duration in milliseconds */
  readonly totalDurationMs: number;
  /** Phase execution history */
  readonly history: TrinityPhaseResult[];
  /** Stop reason */
  readonly stopReason: 'verified' | 'max_iterations' | 'timeout' | 'error';
}

// =============================================================================
// Zod Schemas
// =============================================================================

/** Schema for TRINITY role. */
export const TrinityRoleSchema = z.enum(['thinker', 'worker', 'verifier']);

/** Schema for TRINITY phase. */
export const TrinityPhaseSchema = z.enum(['thinking', 'working', 'verifying', 'complete']);

/** Schema for verifier verdict. */
export const VerifierVerdictSchema = z.enum(['pass', 'fail']);

/** Schema for TrinityConfig. */
export const TrinityConfigSchema = z.object({
  maxIterations: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),
  includeHistory: z.boolean().optional(),
  roleConfigs: z
    .record(
      TrinityRoleSchema,
      z.object({
        systemPrompt: z.string().optional(),
        temperature: z.number().min(0).max(2).optional(),
        maxTokens: z.number().int().positive().optional(),
      })
    )
    .optional(),
});

/** Schema for stop reason. */
export const TrinityStopReasonSchema = z.enum(['verified', 'max_iterations', 'timeout', 'error']);

// =============================================================================
// Coordinator Internal Types (moved from trinity-coordinator.ts for file size)
// =============================================================================

/** Options for executing TRINITY coordination. */
export interface TrinityExecuteOptions {
  readonly task: Task;
  readonly agent: IAgent;
}

/** Internal context during coordination. */
export interface CoordinationContext {
  readonly task: Task;
  readonly agent: IAgent;
  readonly startTime: number;
  readonly history: TrinityPhaseResult[];
  readonly sessionId: string;
}

/** Options for TrinityCoordinator constructor. */
export interface TrinityCoordinatorOptions {
  readonly config?: TrinityConfig;
  /** Optional event bus for protocol lifecycle events. Uses global bus if not provided. */
  readonly eventBus?: IEventBus;
}

/** Resolved configuration with defaults applied. */
export interface ResolvedConfig {
  readonly maxIterations: number;
  readonly timeoutMs: number;
  readonly includeHistory: boolean;
}

/** Options for building final result. */
export interface ResultBuildOpts {
  readonly ctx: CoordinationContext;
  readonly thinker: ThinkerOutput;
  readonly worker: WorkerOutput | undefined;
  readonly verifier: VerifierOutput | undefined;
  readonly stopReason: TrinityResult['stopReason'];
  readonly iterations: number;
}
