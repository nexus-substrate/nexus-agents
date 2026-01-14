/**
 * Self-Development Workflow State Types
 *
 * Workflow state, metrics, result, and engine interface definitions.
 *
 * @module workflows/self-development/self-dev-state-types
 * (Source: docs/workflows/SELF_DEVELOPMENT_WORKFLOW.md)
 */

import type { SelfDevWorkflowConfig } from './self-dev-config-types.js';
import type { AnalyzeOutput, ResearchOutput } from './self-dev-config-types.js';
import type {
  PlanOutput,
  RefineOutput,
  VoteOutput,
  ReviewOutput,
  ImplementOutput,
  VerifyOutput,
  CommitOutput,
  HumanDecision,
} from './self-dev-phase-types.js';

// =============================================================================
// Workflow State & Results
// =============================================================================

/**
 * Current phase of the workflow.
 */
export type WorkflowPhase =
  | 'analyze'
  | 'research'
  | 'plan'
  | 'refine'
  | 'vote'
  | 'review'
  | 'implement'
  | 'verify'
  | 'commit';

/**
 * Workflow checkpoint for recovery.
 */
export interface WorkflowCheckpoint {
  readonly phase: WorkflowPhase;
  readonly timestamp: string;
  readonly inputs: unknown;
  readonly outputs: unknown;
  readonly status: 'completed' | 'failed' | 'skipped' | 'pending';
}

/**
 * Full workflow state.
 */
export interface SelfDevWorkflowState {
  readonly executionId: string;
  readonly config: SelfDevWorkflowConfig;
  readonly currentPhase: WorkflowPhase;
  readonly checkpoints: WorkflowCheckpoint[];
  readonly startedAt: string;
  readonly status: 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
}

/**
 * Workflow metrics.
 */
export interface SelfDevWorkflowMetrics {
  /** Total duration in ms */
  readonly totalDurationMs: number;
  /** Duration per phase */
  readonly phaseDurations: Record<WorkflowPhase, number>;
  /** Protocol iterations */
  readonly trinityIterations: number;
  readonly reflexionIterations: number;
  readonly selfDebugIterations: number;
  readonly selfRefineIterations: number;
  /** Quality metrics */
  readonly finalSeverity: number;
  readonly testCoverage: number;
  /** Consensus metrics */
  readonly approvalRate: number;
  readonly vetoCount: number;
  /** Human metrics */
  readonly humanReviewTime: number;
  readonly humanRevisions: number;
}

/**
 * Final workflow result.
 */
export interface SelfDevWorkflowResult {
  readonly executionId: string;
  readonly success: boolean;
  readonly phase: WorkflowPhase;
  readonly outputs: {
    readonly analyze?: AnalyzeOutput;
    readonly research?: ResearchOutput;
    readonly plan?: PlanOutput;
    readonly refine?: RefineOutput;
    readonly vote?: VoteOutput;
    readonly review?: ReviewOutput;
    readonly implement?: ImplementOutput;
    readonly verify?: VerifyOutput;
    readonly commit?: CommitOutput;
  };
  readonly metrics: SelfDevWorkflowMetrics;
  readonly error?: string;
}

// =============================================================================
// Workflow Engine Interface
// =============================================================================

/**
 * Interface for the self-development workflow engine.
 */
export interface ISelfDevWorkflowEngine {
  /**
   * Start a new self-development workflow.
   */
  start(config: SelfDevWorkflowConfig): Promise<SelfDevWorkflowState>;

  /**
   * Resume a paused workflow from checkpoint.
   */
  resume(executionId: string): Promise<SelfDevWorkflowState>;

  /**
   * Get current workflow state.
   */
  getState(executionId: string): SelfDevWorkflowState | undefined;

  /**
   * Cancel a running workflow.
   */
  cancel(executionId: string, reason: string): Promise<void>;

  /**
   * Submit human review decision.
   */
  submitReview(executionId: string, decision: HumanDecision, feedback?: string): Promise<void>;

  /**
   * Get workflow result (only available when completed).
   */
  getResult(executionId: string): SelfDevWorkflowResult | undefined;
}
