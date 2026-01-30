/**
 * nexus-agents/workflows - Workflow Evolver Execution
 *
 * Execution and evaluation helpers for genetic algorithm-based workflow evolution.
 * Extracted from workflow-evolver.ts to maintain file size limits.
 *
 * @module workflows/self-evolving/workflow-evolver-execution
 * (Source: Issue #330, #339)
 */

import type { StepResult } from '../../core/index.js';
import { getRandomProvider, getTimeProvider } from '../../core/index.js';
import type { FitnessMetrics, ExecutionOutcome } from './sew-types.js';
import { DEFAULT_FITNESS_METRICS, computeFitnessScore } from './sew-types.js';

/**
 * Evaluate fitness metrics for a set of execution outcomes.
 */
export function evaluateOutcomes(outcomes: readonly ExecutionOutcome[]): FitnessMetrics {
  if (outcomes.length === 0) {
    return DEFAULT_FITNESS_METRICS;
  }

  const successCount = outcomes.filter((o) => o.success).length;
  const successRate = successCount / outcomes.length;

  const durations = outcomes.map((o) => o.durationMs);
  const avgDurationMs = durations.reduce((a, b) => a + b, 0) / durations.length;

  const costs = outcomes.map((o) => o.cost);
  const avgCost = costs.reduce((a, b) => a + b, 0) / costs.length;

  const totalRetries = outcomes.reduce((sum, o) => sum + o.totalRetries, 0);
  const totalSteps = outcomes.reduce((sum, o) => sum + o.stepResults.length, 0);
  const retryRate = totalSteps > 0 ? totalRetries / totalSteps : 0;

  // Calculate duration variance
  const durationVariance =
    durations.reduce((sum, d) => sum + Math.pow(d - avgDurationMs, 2), 0) / durations.length;

  return {
    successRate,
    avgDurationMs,
    avgCost,
    executionCount: outcomes.length,
    durationVariance,
    retryRate,
  };
}

/**
 * Compute fitness score from metrics.
 */
export function computeFitness(metrics: FitnessMetrics): number {
  return computeFitnessScore(metrics);
}

/**
 * Options for creating an execution outcome record.
 */
export interface CreateOutcomeOptions {
  readonly executionId: string;
  readonly versionId: string;
  readonly success: boolean;
  readonly durationMs: number;
  readonly cost: number;
  readonly stepResults: readonly StepResult[];
  readonly totalRetries: number;
}

/**
 * Create an execution outcome record.
 */
export function createOutcome(options: CreateOutcomeOptions): ExecutionOutcome {
  return {
    executionId: options.executionId,
    versionId: options.versionId,
    success: options.success,
    durationMs: options.durationMs,
    cost: options.cost,
    stepResults: options.stepResults,
    totalRetries: options.totalRetries,
    timestamp: getTimeProvider().now(),
  };
}

/**
 * Select random indices for crossover.
 */
export function selectCrossoverIndices(populationSize: number): [number, number] {
  const random = getRandomProvider();
  const idx1 = random.randomInt(0, populationSize);
  let idx2 = random.randomInt(0, populationSize);
  while (idx2 === idx1 && populationSize > 1) {
    idx2 = random.randomInt(0, populationSize);
  }
  return [idx1, idx2];
}

/**
 * Calculate fitness statistics from an array of fitness values.
 */
export function calculateFitnessStats(fitnessValues: readonly number[]): {
  best: number;
  average: number;
} {
  if (fitnessValues.length === 0) {
    return { best: 0, average: 0 };
  }
  const best = Math.max(...fitnessValues);
  const average = fitnessValues.reduce((a, b) => a + b, 0) / fitnessValues.length;
  return { best, average };
}
