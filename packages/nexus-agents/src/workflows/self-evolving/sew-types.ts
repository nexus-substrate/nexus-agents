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
import type { WorkflowDefinition, WorkflowStep, StepResult } from '../../core/index.js';

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

/**
 * Fitness metrics measuring workflow performance.
 */
export interface FitnessMetrics {
  /** Success rate (0-1) */
  readonly successRate: number;
  /** Average execution duration in milliseconds */
  readonly avgDurationMs: number;
  /** Average cost (arbitrary units, e.g., tokens) */
  readonly avgCost: number;
  /** Number of executions measured */
  readonly executionCount: number;
  /** Variance in duration (stability metric) */
  readonly durationVariance: number;
  /** Retry rate (0-1) - how often retries were needed */
  readonly retryRate: number;
}

/**
 * Default fitness metrics for new workflows.
 */
export const DEFAULT_FITNESS_METRICS: FitnessMetrics = {
  successRate: 0,
  avgDurationMs: 0,
  avgCost: 0,
  executionCount: 0,
  durationVariance: 0,
  retryRate: 0,
};

/**
 * Compute overall fitness score from metrics.
 * Higher is better. Range: 0-1.
 */
export function computeFitnessScore(metrics: FitnessMetrics, weights?: FitnessWeights): number {
  const w = weights ?? DEFAULT_FITNESS_WEIGHTS;

  // Normalize metrics to 0-1 range (higher is better)
  const successComponent = metrics.successRate * w.successRate;

  // Duration: lower is better, use inverse (capped at 1 for 0ms)
  const durationNormalized =
    metrics.avgDurationMs > 0 ? 1 / (1 + metrics.avgDurationMs / 10000) : 1;
  const durationComponent = durationNormalized * w.duration;

  // Cost: lower is better, use inverse
  const costNormalized = metrics.avgCost > 0 ? 1 / (1 + metrics.avgCost / 1000) : 1;
  const costComponent = costNormalized * w.cost;

  // Stability: lower variance is better
  const stabilityNormalized =
    metrics.durationVariance > 0 ? 1 / (1 + metrics.durationVariance / 1000000) : 1;
  const stabilityComponent = stabilityNormalized * w.stability;

  // Retry rate: lower is better
  const retryComponent = (1 - metrics.retryRate) * w.retryRate;

  return successComponent + durationComponent + costComponent + stabilityComponent + retryComponent;
}

/**
 * Weights for fitness score computation.
 */
export interface FitnessWeights {
  readonly successRate: number;
  readonly duration: number;
  readonly cost: number;
  readonly stability: number;
  readonly retryRate: number;
}

/**
 * Default fitness weights (must sum to 1).
 */
export const DEFAULT_FITNESS_WEIGHTS: FitnessWeights = {
  successRate: 0.4,
  duration: 0.2,
  cost: 0.15,
  stability: 0.15,
  retryRate: 0.1,
};

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

/**
 * Check if two steps have a dependency relationship.
 */
export function stepsAreDependent(
  stepA: WorkflowStep,
  stepB: WorkflowStep,
  allSteps: readonly WorkflowStep[]
): boolean {
  const stepADeps = new Set(stepA.dependsOn ?? []);
  const stepBDeps = new Set(stepB.dependsOn ?? []);

  // Direct dependency
  if (stepADeps.has(stepB.id) || stepBDeps.has(stepA.id)) {
    return true;
  }

  // Transitive dependency check
  const getAllDependencies = (stepId: string, visited: Set<string>): Set<string> => {
    if (visited.has(stepId)) return new Set();
    visited.add(stepId);

    const step = allSteps.find((s) => s.id === stepId);
    if (!step?.dependsOn) return new Set();

    const deps = new Set(step.dependsOn);
    for (const dep of step.dependsOn) {
      const transitiveDeps = getAllDependencies(dep, visited);
      for (const td of transitiveDeps) {
        deps.add(td);
      }
    }
    return deps;
  };

  const allDepsA = getAllDependencies(stepA.id, new Set());
  const allDepsB = getAllDependencies(stepB.id, new Set());

  return allDepsA.has(stepB.id) || allDepsB.has(stepA.id);
}

/**
 * Find steps that can be reordered (independent steps).
 */
export function findReorderableSteps(
  steps: readonly WorkflowStep[]
): readonly [WorkflowStep, WorkflowStep][] {
  const pairs: [WorkflowStep, WorkflowStep][] = [];

  for (let i = 0; i < steps.length; i++) {
    for (let j = i + 1; j < steps.length; j++) {
      const stepA = steps[i];
      const stepB = steps[j];
      if (stepA && stepB && !stepsAreDependent(stepA, stepB, steps)) {
        pairs.push([stepA, stepB]);
      }
    }
  }

  return pairs;
}

/**
 * Find steps that can be parallelized.
 */
export function findParallelizableSteps(steps: readonly WorkflowStep[]): readonly WorkflowStep[][] {
  const groups: WorkflowStep[][] = [];
  const visited = new Set<string>();

  for (const step of steps) {
    if (visited.has(step.id) || step.parallel === true) continue;

    const parallelGroup: WorkflowStep[] = [step];
    visited.add(step.id);

    for (const other of steps) {
      if (visited.has(other.id) || other.parallel === true) continue;
      if (!stepsAreDependent(step, other, steps)) {
        // Check if other can be parallel with all in group
        const canParallelize = parallelGroup.every((g) => !stepsAreDependent(g, other, steps));
        if (canParallelize) {
          parallelGroup.push(other);
          visited.add(other.id);
        }
      }
    }

    if (parallelGroup.length > 1) {
      groups.push(parallelGroup);
    }
  }

  return groups;
}
