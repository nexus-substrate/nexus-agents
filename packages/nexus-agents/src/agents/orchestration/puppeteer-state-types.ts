/**
 * Puppeteer State Types
 *
 * State and metadata type definitions for Puppeteer orchestration.
 *
 * @module agents/orchestration/puppeteer-state-types
 * (Source: Issue #335, arXiv:2505.19591)
 */

import type { Task } from '../../core/index.js';

/**
 * Output from a single agent step.
 */
export interface AgentStepOutput {
  /** Step number (0-indexed) */
  readonly step: number;
  /** ID of the agent that executed */
  readonly agentId: string;
  /** Output from the agent */
  readonly output: unknown;
  /** Execution duration in milliseconds */
  readonly durationMs: number;
  /** Tokens consumed */
  readonly tokensUsed: number;
  /** Model used for execution */
  readonly model: string;
}

/**
 * Metadata for policy computation and tracking.
 */
export interface PuppeteerStateMetadata {
  /** Estimated task progress (0-1) */
  readonly progress: number;
  /** Accumulated cost in dollars */
  readonly totalCost: number;
  /** Accumulated tokens */
  readonly totalTokens: number;
  /** Time elapsed in milliseconds */
  readonly elapsedMs: number;
  /** Start timestamp (ISO 8601) */
  readonly startedAt: string;
}

/**
 * Global system state at step t.
 * Aggregates all relevant context for agent selection.
 */
export interface PuppeteerState {
  /** Current step number (0-indexed) */
  readonly step: number;
  /** Task being executed */
  readonly task: Task;
  /** Accumulated agent outputs */
  readonly agentOutputs: readonly AgentStepOutput[];
  /** Current working context (compressed) */
  readonly context: string;
  /** Metadata for policy computation */
  readonly metadata: PuppeteerStateMetadata;
  /** Session identifier for tracking */
  readonly sessionId: string;
}

/**
 * Agent selection probability distribution.
 * Computed by the policy engine.
 */
export interface AgentDistribution {
  /** Map of agentId -> selection probability */
  readonly probabilities: ReadonlyMap<string, number>;
  /** Scores before normalization (for debugging) */
  readonly rawScores: ReadonlyMap<string, number>;
  /** Reasoning for top choices */
  readonly reasoning: string;
}
