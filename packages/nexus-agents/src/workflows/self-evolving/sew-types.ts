/**
 * nexus-agents/workflows - SEW Types
 *
 * Type definitions for Self-Evolving Workflows (SEW).
 * Enables automatic workflow improvement through execution feedback.
 *
 * @module workflows/self-evolving/sew-types
 * (Source: Issue #330)
 */

import { z } from 'zod';
import type { WorkflowDefinition, StepResult } from '../../core/index.js';

// Re-export fitness types and functions
export type { FitnessMetrics, FitnessWeights } from './sew-fitness.js';
export {
  DEFAULT_FITNESS_METRICS,
  DEFAULT_FITNESS_WEIGHTS,
  computeFitnessScore,
} from './sew-fitness.js';

// Re-export step utilities
export {
  stepsAreDependent,
  findReorderableSteps,
  findParallelizableSteps,
} from './sew-step-utils.js';

/**
 * Semantic version for workflow versions.
 */
export interface SemanticVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

/**
 * Parse semantic version string.
 */
export function parseVersion(version: string): SemanticVersion {
  const parts = version.split('.');
  const major = parseInt(parts[0] ?? '', 10);
  const minor = parseInt(parts[1] ?? '', 10);
  const patch = parseInt(parts[2] ?? '', 10);
  return {
    major: Number.isNaN(major) ? 1 : major,
    minor: Number.isNaN(minor) ? 0 : minor,
    patch: Number.isNaN(patch) ? 0 : patch,
  };
}

/**
 * Format semantic version to string.
 */
export function formatVersion(version: SemanticVersion): string {
  return `${String(version.major)}.${String(version.minor)}.${String(version.patch)}`;
}

/**
 * Increment version based on change type.
 */
export function incrementVersion(
  version: SemanticVersion,
  changeType: 'major' | 'minor' | 'patch'
): SemanticVersion {
  switch (changeType) {
    case 'major':
      return { major: version.major + 1, minor: 0, patch: 0 };
    case 'minor':
      return { major: version.major, minor: version.minor + 1, patch: 0 };
    case 'patch':
      return { major: version.major, minor: version.minor, patch: version.patch + 1 };
  }
}

// Import FitnessMetrics for local type reference
import type { FitnessMetrics } from './sew-fitness.js';

/**
 * Versioned workflow with evolution history.
 */
export interface WorkflowVersion {
  /** Unique version identifier */
  readonly id: string;
  /** Semantic version string */
  readonly version: string;
  /** The workflow definition */
  readonly workflow: WorkflowDefinition;
  /** Fitness score (0-1, higher is better) */
  readonly fitnessScore: number;
  /** Detailed fitness metrics */
  readonly metrics: FitnessMetrics;
  /** Parent version ID (null for initial version) */
  readonly parentVersion: string | null;
  /** Mutations applied from parent */
  readonly appliedMutations: readonly WorkflowMutation[];
  /** Creation timestamp */
  readonly createdAt: number;
  /** Whether this version is currently active */
  readonly isActive: boolean;
}

/**
 * Types of mutations that can be applied to workflows.
 */
export type MutationType =
  | 'timeout_adjustment'
  | 'retry_adjustment'
  | 'step_reorder'
  | 'add_parallelization'
  | 'remove_parallelization';

/**
 * Mutation applied to a workflow.
 */
export type WorkflowMutation =
  | TimeoutAdjustment
  | RetryAdjustment
  | StepReorder
  | ParallelizationChange;

/**
 * Timeout adjustment mutation.
 */
export interface TimeoutAdjustment {
  readonly type: 'timeout_adjustment';
  /** Step ID to modify */
  readonly stepId: string;
  /** Original timeout value */
  readonly originalValue: number;
  /** New timeout value */
  readonly newValue: number;
  /** Adjustment factor applied */
  readonly factor: number;
}

/**
 * Retry count adjustment mutation.
 */
export interface RetryAdjustment {
  readonly type: 'retry_adjustment';
  /** Step ID to modify */
  readonly stepId: string;
  /** Original retry count */
  readonly originalValue: number;
  /** New retry count */
  readonly newValue: number;
  /** Delta applied */
  readonly delta: number;
}

/**
 * Step reordering mutation.
 */
export interface StepReorder {
  readonly type: 'step_reorder';
  /** Step ID that was moved */
  readonly stepId: string;
  /** Original position index */
  readonly fromIndex: number;
  /** New position index */
  readonly toIndex: number;
}

/**
 * Parallelization change mutation.
 */
export interface ParallelizationChange {
  readonly type: 'add_parallelization' | 'remove_parallelization';
  /** Step IDs affected */
  readonly stepIds: readonly string[];
}

/**
 * Configuration for workflow evolution.
 */
export interface EvolutionConfig {
  /** Mutation rate (0-1, probability of mutation per step) */
  readonly mutationRate: number;
  /** Population size (number of variants to maintain) */
  readonly populationSize: number;
  /** Number of generations to evolve */
  readonly generations: number;
  /** Minimum executions before evaluating fitness */
  readonly minExecutionsForEval: number;
  /** Fitness threshold for promotion to active */
  readonly promotionThreshold: number;
  /** Fitness regression threshold for rollback */
  readonly regressionThreshold: number;
  /** Selection pressure (higher = more aggressive selection) */
  readonly selectionPressure: number;
  /** Crossover rate (0-1, probability of crossover vs mutation) */
  readonly crossoverRate: number;
  /** Elitism count (number of top performers to preserve) */
  readonly elitismCount: number;
  /** Timeout adjustment range (min/max factors) */
  readonly timeoutAdjustmentRange: readonly [number, number];
  /** Retry adjustment range (min/max delta) */
  readonly retryAdjustmentRange: readonly [number, number];
}

/**
 * Default evolution configuration.
 */
export const DEFAULT_EVOLUTION_CONFIG: EvolutionConfig = {
  mutationRate: 0.3,
  populationSize: 5,
  generations: 10,
  minExecutionsForEval: 5,
  promotionThreshold: 0.7,
  regressionThreshold: 0.1,
  selectionPressure: 1.5,
  crossoverRate: 0.3,
  elitismCount: 1,
  timeoutAdjustmentRange: [0.5, 2.0], // 50% to 200%
  retryAdjustmentRange: [-2, 2], // -2 to +2 retries
};

/**
 * Zod schema for evolution config validation.
 */
export const EvolutionConfigSchema = z.object({
  mutationRate: z.number().min(0).max(1).default(0.3),
  populationSize: z.number().int().min(2).max(20).default(5),
  generations: z.number().int().min(1).max(100).default(10),
  minExecutionsForEval: z.number().int().min(1).default(5),
  promotionThreshold: z.number().min(0).max(1).default(0.7),
  regressionThreshold: z.number().min(0).max(1).default(0.1),
  selectionPressure: z.number().min(1).max(3).default(1.5),
  crossoverRate: z.number().min(0).max(1).default(0.3),
  elitismCount: z.number().int().min(0).default(1),
  timeoutAdjustmentRange: z.tuple([z.number().min(0.1), z.number().max(10)]).default([0.5, 2.0]),
  retryAdjustmentRange: z.tuple([z.number().int(), z.number().int()]).default([-2, 2]),
});

/**
 * Execution outcome for fitness evaluation.
 */
export interface ExecutionOutcome {
  /** Execution ID */
  readonly executionId: string;
  /** Version ID that was executed */
  readonly versionId: string;
  /** Whether execution was successful */
  readonly success: boolean;
  /** Total duration in milliseconds */
  readonly durationMs: number;
  /** Cost (tokens or other metric) */
  readonly cost: number;
  /** Step results */
  readonly stepResults: readonly StepResult[];
  /** Number of retries that occurred */
  readonly totalRetries: number;
  /** Timestamp */
  readonly timestamp: number;
}

/**
 * Evolution history entry.
 */
export interface EvolutionHistoryEntry {
  /** Generation number */
  readonly generation: number;
  /** Timestamp */
  readonly timestamp: number;
  /** Population at this generation */
  readonly population: readonly WorkflowVersion[];
  /** Best fitness in this generation */
  readonly bestFitness: number;
  /** Average fitness in this generation */
  readonly avgFitness: number;
  /** Mutations applied this generation */
  readonly mutationsApplied: number;
  /** Crossovers performed this generation */
  readonly crossoversPerformed: number;
}

/**
 * Result of evolution process.
 */
export interface EvolutionResult {
  /** Original workflow version */
  readonly originalVersion: WorkflowVersion;
  /** Best evolved version */
  readonly bestVersion: WorkflowVersion;
  /** Final population */
  readonly finalPopulation: readonly WorkflowVersion[];
  /** Complete evolution history */
  readonly history: readonly EvolutionHistoryEntry[];
  /** Total generations evolved */
  readonly totalGenerations: number;
  /** Fitness improvement (best - original) */
  readonly fitnessImprovement: number;
  /** Whether evolution was successful */
  readonly success: boolean;
  /** Reason if not successful */
  readonly reason?: string;
}
