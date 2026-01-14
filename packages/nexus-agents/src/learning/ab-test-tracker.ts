/**
 * A/B Test Tracker
 *
 * Manages experiment lifecycle, variant assignment, and statistical analysis.
 * Supports deterministic variant assignment based on trace ID hashing.
 *
 * @module learning/ab-test-tracker
 * (Source: Issue #273 - Learning Validation Dashboard)
 */

import type {
  ExperimentDefinition,
  ExperimentOutcome,
  ExperimentStatus,
  ExperimentSummary,
  ExperimentVariant,
  ExperimentExport,
  IAbTestTracker,
  VariantStats,
} from './ab-test-types.js';
import type { ExperimentResult, VariantResultSummary } from './validation-stats-types.js';
import {
  proportionConfidenceInterval,
  compareProportions,
  calculateMinSampleSize,
} from './validation-stats.js';

/**
 * A/B Test Tracker implementation.
 * Provides experiment management with deterministic variant assignment.
 */
export class AbTestTracker implements IAbTestTracker {
  private readonly experiments: Map<string, ExperimentDefinition> = new Map();
  private readonly outcomes: Map<string, ExperimentOutcome[]> = new Map();

  /**
   * Create a new experiment.
   */
  createExperiment(
    definition: Omit<ExperimentDefinition, 'status' | 'startedAt' | 'endedAt'>
  ): ExperimentDefinition {
    if (this.experiments.has(definition.id)) {
      throw new Error(`Experiment ${definition.id} already exists`);
    }

    validateExperimentDefinition(definition);

    const experiment: ExperimentDefinition = {
      ...definition,
      status: 'draft',
      startedAt: null,
      endedAt: null,
    };

    this.experiments.set(experiment.id, experiment);
    this.outcomes.set(experiment.id, []);

    return experiment;
  }

  /**
   * Start an experiment (sets status to running).
   */
  startExperiment(experimentId: string): void {
    const experiment = this.getExperimentOrThrow(experimentId);

    if (experiment.status !== 'draft' && experiment.status !== 'paused') {
      throw new Error(`Cannot start experiment in ${experiment.status} status`);
    }

    const updated: ExperimentDefinition = {
      ...experiment,
      status: 'running',
      startedAt: experiment.startedAt ?? new Date().toISOString(),
    };

    this.experiments.set(experimentId, updated);
  }

  /**
   * Pause a running experiment.
   */
  pauseExperiment(experimentId: string): void {
    const experiment = this.getExperimentOrThrow(experimentId);

    if (experiment.status !== 'running') {
      throw new Error(`Cannot pause experiment in ${experiment.status} status`);
    }

    const updated: ExperimentDefinition = {
      ...experiment,
      status: 'paused',
    };

    this.experiments.set(experimentId, updated);
  }

  /**
   * Complete an experiment.
   */
  completeExperiment(experimentId: string): void {
    const experiment = this.getExperimentOrThrow(experimentId);

    if (experiment.status === 'completed' || experiment.status === 'archived') {
      throw new Error(`Experiment already in ${experiment.status} status`);
    }

    const updated: ExperimentDefinition = {
      ...experiment,
      status: 'completed',
      endedAt: new Date().toISOString(),
    };

    this.experiments.set(experimentId, updated);
  }

  /**
   * Assign a variant for a given trace ID (deterministic assignment).
   * Uses consistent hashing to ensure same trace ID always gets same variant.
   */
  assignVariant(experimentId: string, traceId: string): ExperimentVariant | null {
    const experiment = this.experiments.get(experimentId);

    if (experiment?.status !== 'running') {
      return null;
    }

    const hash = hashString(traceId);
    const bucket = hash % 100;

    let cumulative = 0;
    for (const variant of experiment.variants) {
      cumulative += variant.trafficPercent;
      if (bucket < cumulative) {
        return variant;
      }
    }

    // Fallback to last variant (shouldn't happen if traffic sums to 100)
    return experiment.variants[experiment.variants.length - 1] ?? null;
  }

  /**
   * Record an outcome for an experiment.
   */
  recordOutcome(outcome: ExperimentOutcome): void {
    const experiment = this.experiments.get(outcome.experimentId);

    if (!experiment) {
      throw new Error(`Experiment ${outcome.experimentId} not found`);
    }

    const variantExists = experiment.variants.some((v) => v.id === outcome.variantId);
    if (!variantExists) {
      throw new Error(`Variant ${outcome.variantId} not found in experiment`);
    }

    const outcomes = this.outcomes.get(outcome.experimentId) ?? [];
    outcomes.push(outcome);
    this.outcomes.set(outcome.experimentId, outcomes);
  }

  /**
   * Get experiment summary with statistics.
   */
  getSummary(experimentId: string): ExperimentSummary | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      return null;
    }

    const outcomes = this.outcomes.get(experimentId) ?? [];
    const variantStats = this.calculateVariantStats(experiment, outcomes);
    const hasMinimumSampleSize = variantStats.every((vs) => vs.n >= experiment.minSampleSize);

    const result = this.calculateExperimentResult(experiment, variantStats);
    const recommendation = this.getRecommendation(experiment, result, hasMinimumSampleSize);

    return {
      experiment,
      variantStats,
      result,
      hasMinimumSampleSize,
      recommendation,
    };
  }

  /**
   * List all experiments.
   */
  listExperiments(filter?: {
    status?: ExperimentStatus;
    tags?: readonly string[];
  }): readonly ExperimentDefinition[] {
    let experiments = Array.from(this.experiments.values());

    if (filter?.status) {
      experiments = experiments.filter((e) => e.status === filter.status);
    }

    const filterTags = filter?.tags;
    if (filterTags !== undefined && filterTags.length > 0) {
      experiments = experiments.filter((e) => filterTags.some((tag) => e.tags.includes(tag)));
    }

    return experiments;
  }

  /**
   * Get experiment by ID.
   */
  getExperiment(experimentId: string): ExperimentDefinition | null {
    return this.experiments.get(experimentId) ?? null;
  }

  /**
   * Export all experiment data.
   */
  exportData(): ExperimentExport {
    const experiments = Array.from(this.experiments.values());
    const allOutcomes: ExperimentOutcome[] = [];
    const summaries: ExperimentSummary[] = [];

    for (const experiment of experiments) {
      const outcomes = this.outcomes.get(experiment.id) ?? [];
      allOutcomes.push(...outcomes);

      if (experiment.status === 'completed') {
        const summary = this.getSummary(experiment.id);
        if (summary) {
          summaries.push(summary);
        }
      }
    }

    return {
      exportedAt: new Date().toISOString(),
      experiments,
      outcomes: allOutcomes,
      summaries,
    };
  }

  private getExperimentOrThrow(experimentId: string): ExperimentDefinition {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }
    return experiment;
  }

  private calculateVariantStats(
    experiment: ExperimentDefinition,
    outcomes: readonly ExperimentOutcome[]
  ): readonly VariantStats[] {
    return experiment.variants.map((variant) => {
      const variantOutcomes = outcomes.filter((o) => o.variantId === variant.id);
      const n = variantOutcomes.length;
      const successes = variantOutcomes.filter((o) => o.success).length;
      const sumReward = variantOutcomes.reduce((sum, o) => sum + o.reward, 0);
      const sumLatencyMs = variantOutcomes.reduce((sum, o) => sum + o.latencyMs, 0);

      return {
        variantId: variant.id,
        name: variant.name,
        n,
        successes,
        successRate: n > 0 ? successes / n : 0,
        avgReward: n > 0 ? sumReward / n : 0,
        avgLatencyMs: n > 0 ? sumLatencyMs / n : 0,
        sumReward,
        sumLatencyMs,
      };
    });
  }

  /** Build variant summary for experiment results. */
  private buildVariantSummary(stats: VariantStats): VariantResultSummary {
    const ci = proportionConfidenceInterval(stats.successes, stats.n);
    return {
      name: stats.name,
      n: stats.n,
      successRate: stats.successRate,
      avgReward: stats.avgReward,
      successRateCI: ci,
    };
  }

  private calculateExperimentResult(
    experiment: ExperimentDefinition,
    variantStats: readonly VariantStats[]
  ): ExperimentResult | null {
    const control = variantStats.find(
      (vs) => experiment.variants.find((v) => v.id === vs.variantId)?.isControl === true
    );
    const treatment = variantStats.find(
      (vs) => experiment.variants.find((v) => v.id === vs.variantId)?.isControl !== true
    );
    if (!control || !treatment) return null;

    const comparison = compareProportions(
      treatment.successes,
      treatment.n,
      control.successes,
      control.n
    );
    const relativeImprovement =
      control.successRate > 0
        ? (treatment.successRate - control.successRate) / control.successRate
        : 0;
    const recommendedSampleSize = calculateMinSampleSize(
      control.successRate || 0.5,
      experiment.minimumDetectableEffect
    );
    const hasMinimumSampleSize =
      control.n >= experiment.minSampleSize && treatment.n >= experiment.minSampleSize;

    return {
      experimentId: experiment.id,
      control: this.buildVariantSummary(control),
      treatment: this.buildVariantSummary(treatment),
      comparison,
      relativeImprovement,
      hasMinimumSampleSize,
      recommendedSampleSize,
    };
  }

  private getRecommendation(
    experiment: ExperimentDefinition,
    result: ExperimentResult | null,
    hasMinimumSampleSize: boolean
  ): 'continue' | 'stop_winner' | 'stop_inconclusive' {
    if (!result || !hasMinimumSampleSize) {
      return 'continue';
    }

    if (result.comparison.significant) {
      return 'stop_winner';
    }

    // If we have enough samples but no significance, check if effect is too small
    const effectSizeThreshold = 0.1; // Small effect
    if (result.comparison.effectSize < effectSizeThreshold) {
      return 'stop_inconclusive';
    }

    return 'continue';
  }
}

/**
 * Hash a string to a number (FNV-1a hash).
 */
function hashString(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

/**
 * Validate experiment definition.
 */
function validateExperimentDefinition(
  definition: Omit<ExperimentDefinition, 'status' | 'startedAt' | 'endedAt'>
): void {
  if (!definition.id || definition.id.length === 0) {
    throw new Error('Experiment ID is required');
  }

  if (definition.variants.length < 2) {
    throw new Error('Experiment requires at least 2 variants');
  }

  const controlCount = definition.variants.filter((v) => v.isControl).length;
  if (controlCount !== 1) {
    throw new Error('Experiment requires exactly 1 control variant');
  }

  const totalTraffic = definition.variants.reduce((sum, v) => sum + v.trafficPercent, 0);
  if (Math.abs(totalTraffic - 100) > 0.01) {
    throw new Error(`Variant traffic must sum to 100, got ${String(totalTraffic)}`);
  }

  if (definition.minSampleSize < 10) {
    throw new Error('Minimum sample size must be at least 10');
  }
}

/**
 * Create a default A/B test tracker instance.
 */
export function createAbTestTracker(): IAbTestTracker {
  return new AbTestTracker();
}
