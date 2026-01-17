/**
 * nexus-agents/workflows - SEW Fitness Calculations
 *
 * Fitness metrics and scoring for Self-Evolving Workflows.
 * Extracted from sew-types.ts to maintain file size limits.
 *
 * @module workflows/self-evolving/sew-fitness
 * (Source: Issue #339)
 */

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
