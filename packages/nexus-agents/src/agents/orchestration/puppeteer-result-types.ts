/**
 * Puppeteer Result Types
 *
 * Result and metrics type definitions for Puppeteer orchestration.
 *
 * @module agents/orchestration/puppeteer-result-types
 * (Source: Issue #335, arXiv:2505.19591)
 */

import type {
  AgentStepOutput,
  AgentDistribution,
  PuppeteerState,
} from './puppeteer-state-types.js';

/** Reasons for terminating orchestration. */
export type PuppeteerTerminationReason =
  'task_complete' | 'max_steps' | 'timeout' | 'error' | 'cancelled' | 'convergence';

/**
 * Result of one orchestration step.
 */
export interface PuppeteerStepResult {
  /** ID of the selected agent */
  readonly selectedAgent: string;
  /** Distribution used for selection */
  readonly distribution: AgentDistribution;
  /** Output from the agent */
  readonly agentOutput: AgentStepOutput;
  /** Updated state after this step */
  readonly newState: PuppeteerState;
  /** Reward for this step */
  /**
   * Step reward, or `null` when the step could not be scored (#4766).
   *
   * `null` means its token usage was never measured, so no defensible cost
   * term existed — the step is excluded from the trajectory the learner fits
   * rather than credited a zero cost and scored as maximally efficient.
   */
  readonly reward: number | null;
  /** Whether orchestration should terminate */
  readonly shouldTerminate: boolean;
  /** Reason for termination (if shouldTerminate) */
  readonly terminationReason?: PuppeteerTerminationReason;
}

/**
 * Information about a hub agent.
 */
export interface HubAgentInfo {
  /** Agent identifier */
  readonly agentId: string;
  /** Number of times activated */
  readonly activationCount: number;
  /** Percentage of total activations */
  readonly percentage: number;
}

/**
 * Information about a detected cycle.
 */
export interface CycleInfo {
  /** Agents in the cycle (ordered) */
  readonly agents: readonly string[];
  /** Number of occurrences */
  readonly occurrences: number;
}

/**
 * Detected emergent patterns during orchestration.
 */
export interface EmergentPatterns {
  /** Hub agents that received disproportionate traffic */
  readonly hubAgents: readonly HubAgentInfo[];
  /** Detected cyclic patterns in agent sequence */
  readonly cycles: readonly CycleInfo[];
  /** Graph density (measure of compaction) */
  readonly graphDensity: number;
  /** Cyclicality score (0-1) */
  readonly cyclicalityScore: number;
}

/**
 * Metrics from orchestration execution.
 */
export interface PuppeteerMetrics {
  /** Average reward across SCORED steps. See {@link PuppeteerMetrics.scoredSteps}. */
  readonly avgReward: number;
  /**
   * Steps the average was actually taken over (#4766).
   *
   * Lower than the trajectory length when steps were excluded for unmeasured
   * token usage. `0` means nothing was scored, so `avgReward` is `0` over
   * nothing rather than a measured zero.
   */
  readonly scoredSteps: number;
  /** Task completion rate (0-1) */
  readonly taskCompletionRate: number;
  /** Efficiency score (lower is better) */
  readonly efficiencyScore: number;
  /** Compaction score (0-1, higher means more hub concentration) */
  readonly compactionScore: number;
  /** Cyclicality score (0-1, higher means more cyclic patterns) */
  readonly cyclicalityScore: number;
}

/**
 * Final result of Puppeteer orchestration.
 */
export interface PuppeteerResult {
  /** Whether orchestration succeeded */
  readonly success: boolean;
  /** Final output from the orchestration */
  readonly output: unknown;
  /** Execution trajectory (all steps) */
  readonly trajectory: readonly PuppeteerStepResult[];
  /** Total steps executed */
  readonly totalSteps: number;
  /** Total duration in milliseconds */
  readonly totalDurationMs: number;
  /** Total tokens consumed */
  readonly totalTokens: number;
  /** Total cost in dollars */
  readonly totalCost: number;
  /** Detected emergent patterns */
  readonly emergentPatterns: EmergentPatterns;
  /** Execution metrics */
  readonly metrics: PuppeteerMetrics;
  /** Reason for termination */
  readonly terminationReason: PuppeteerTerminationReason;
  /** Session identifier */
  readonly sessionId: string;
}
