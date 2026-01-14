/**
 * A/B Test Tracker Types
 *
 * Type definitions for A/B testing infrastructure in the learning validation dashboard.
 * Supports experiment definition, variant assignment, and result analysis.
 *
 * @module learning/ab-test-types
 * (Source: Issue #273 - Learning Validation Dashboard)
 */

import type { ExperimentResult } from './validation-stats-types.js';

/**
 * Experiment status states.
 */
export type ExperimentStatus = 'draft' | 'running' | 'paused' | 'completed' | 'archived';

/**
 * Experiment variant configuration.
 */
export interface ExperimentVariant {
  /** Variant identifier */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;
  /** Description of what this variant does */
  readonly description: string;
  /** Traffic allocation percentage (0-100) */
  readonly trafficPercent: number;
  /** Whether this is the control variant */
  readonly isControl: boolean;
}

/**
 * Experiment definition.
 */
export interface ExperimentDefinition {
  /** Unique experiment identifier */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;
  /** Description of the experiment's hypothesis */
  readonly description: string;
  /** Current status */
  readonly status: ExperimentStatus;
  /** Experiment variants */
  readonly variants: readonly ExperimentVariant[];
  /** Start timestamp (ISO 8601) */
  readonly startedAt: string | null;
  /** End timestamp (ISO 8601) */
  readonly endedAt: string | null;
  /** Minimum sample size per variant */
  readonly minSampleSize: number;
  /** Primary metric to optimize */
  readonly primaryMetric: 'successRate' | 'avgReward' | 'avgLatency';
  /** Minimum detectable effect size */
  readonly minimumDetectableEffect: number;
  /** Tags for categorization */
  readonly tags: readonly string[];
}

/**
 * Recorded outcome for an experiment.
 */
export interface ExperimentOutcome {
  /** Experiment ID */
  readonly experimentId: string;
  /** Assigned variant ID */
  readonly variantId: string;
  /** Routing decision trace ID */
  readonly traceId: string;
  /** Whether the task succeeded */
  readonly success: boolean;
  /** Reward value */
  readonly reward: number;
  /** Latency in milliseconds */
  readonly latencyMs: number;
  /** Timestamp (ISO 8601) */
  readonly timestamp: string;
  /** Additional metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Variant statistics.
 */
export interface VariantStats {
  /** Variant ID */
  readonly variantId: string;
  /** Variant name */
  readonly name: string;
  /** Number of observations */
  readonly n: number;
  /** Success count */
  readonly successes: number;
  /** Success rate */
  readonly successRate: number;
  /** Average reward */
  readonly avgReward: number;
  /** Average latency in ms */
  readonly avgLatencyMs: number;
  /** Sum of rewards (for incremental computation) */
  readonly sumReward: number;
  /** Sum of latencies (for incremental computation) */
  readonly sumLatencyMs: number;
}

/**
 * Experiment summary with all variants and comparison.
 */
export interface ExperimentSummary {
  /** Experiment definition */
  readonly experiment: ExperimentDefinition;
  /** Statistics per variant */
  readonly variantStats: readonly VariantStats[];
  /** Statistical comparison result */
  readonly result: ExperimentResult | null;
  /** Whether experiment has reached minimum sample size */
  readonly hasMinimumSampleSize: boolean;
  /** Recommended action based on results */
  readonly recommendation: 'continue' | 'stop_winner' | 'stop_inconclusive';
}

/**
 * A/B test tracker interface.
 */
export interface IAbTestTracker {
  /**
   * Create a new experiment.
   */
  createExperiment(
    definition: Omit<ExperimentDefinition, 'status' | 'startedAt' | 'endedAt'>
  ): ExperimentDefinition;

  /**
   * Start an experiment (sets status to running).
   */
  startExperiment(experimentId: string): void;

  /**
   * Pause a running experiment.
   */
  pauseExperiment(experimentId: string): void;

  /**
   * Complete an experiment.
   */
  completeExperiment(experimentId: string): void;

  /**
   * Assign a variant for a given trace ID (deterministic assignment).
   */
  assignVariant(experimentId: string, traceId: string): ExperimentVariant | null;

  /**
   * Record an outcome for an experiment.
   */
  recordOutcome(outcome: ExperimentOutcome): void;

  /**
   * Get experiment summary with statistics.
   */
  getSummary(experimentId: string): ExperimentSummary | null;

  /**
   * List all experiments.
   */
  listExperiments(filter?: {
    status?: ExperimentStatus;
    tags?: readonly string[];
  }): readonly ExperimentDefinition[];

  /**
   * Get experiment by ID.
   */
  getExperiment(experimentId: string): ExperimentDefinition | null;

  /**
   * Export all experiment data.
   */
  exportData(): ExperimentExport;
}

/**
 * Export format for experiment data.
 */
export interface ExperimentExport {
  /** Export timestamp */
  readonly exportedAt: string;
  /** All experiments */
  readonly experiments: readonly ExperimentDefinition[];
  /** All outcomes */
  readonly outcomes: readonly ExperimentOutcome[];
  /** Summaries for completed experiments */
  readonly summaries: readonly ExperimentSummary[];
}
