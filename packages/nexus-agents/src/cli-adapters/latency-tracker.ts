/**
 * nexus-agents/cli-adapters - Latency Tracker
 *
 * Tracks CLI execution latencies with rolling window statistics
 * and time-weighted decay for smarter routing decisions.
 *
 * @module cli-adapters/latency-tracker
 * (Source: Issue #361 - CLI latency tracking for routing)
 */

import type { CliName } from './types-core.js';
import { CLI_NAMES } from '../config/model-capabilities-types.js';
import { clamp01 } from '../utils/math-utils.js';
import {
  LatencyTrackerConfigSchema,
  LatencyTrackerError,
  EMPTY_LATENCY_STATS,
  type LatencyTrackerConfig,
  type LatencySample,
  type LatencyStats,
  type LatencyScore,
  type LatencyTrackerStats,
  type ILatencyTracker,
} from './latency-tracker-types.js';

// Re-export types for consumers
export {
  LatencyTrackerConfigSchema,
  LatencyTrackerError,
  EMPTY_LATENCY_STATS,
  DEFAULT_LATENCY_TRACKER_CONFIG,
  type LatencyTrackerConfig,
  type LatencySample,
  type LatencyStats,
  type LatencyScore,
  type LatencyTrackerStats,
  type ILatencyTracker,
} from './latency-tracker-types.js';

/** Minimum samples needed for reliable statistics */
const MIN_SAMPLES_FOR_RELIABILITY = 5;

/** Minimum confidence score (based on sample count) */
const MIN_CONFIDENCE = 0.1;

/** Maximum latency for normalization (10 minutes) */
const MAX_LATENCY_FOR_NORMALIZATION_MS = 600_000;

/**
 * Calculates a specific percentile from sorted values.
 */
function calculatePercentile(sortedValues: readonly number[], percentile: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0] ?? 0;

  const index = (percentile / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const fraction = index - lower;

  const lowerVal = sortedValues[lower] ?? 0;
  const upperVal = sortedValues[upper] ?? lowerVal;

  return lowerVal + fraction * (upperVal - lowerVal);
}

/**
 * Calculates standard deviation from values and mean.
 */
function calculateStdDev(values: readonly number[], mean: number): number {
  if (values.length < 2) return 0;

  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;

  return Math.sqrt(avgSquaredDiff);
}

/**
 * Calculates time-weighted average with exponential decay.
 */
function calculateWeightedAverage(
  samples: readonly LatencySample[],
  decayFactor: number,
  now: number
): number {
  if (samples.length === 0) return 0;

  let weightedSum = 0;
  let weightSum = 0;

  for (const sample of samples) {
    // Weight decays exponentially based on age in minutes
    const ageMinutes = (now - sample.recordedAt) / 60_000;
    const weight = Math.pow(decayFactor, ageMinutes);

    weightedSum += sample.durationMs * weight;
    weightSum += weight;
  }

  return weightSum > 0 ? weightedSum / weightSum : 0;
}

/**
 * LatencyTracker implementation.
 *
 * Maintains a rolling window of latency samples per CLI with:
 * - Configurable window size
 * - Time-weighted decay for recent sample emphasis
 * - Percentile calculations (p50, p95, p99)
 * - Age-based sample eviction
 */
export class LatencyTracker implements ILatencyTracker {
  private readonly config: LatencyTrackerConfig;
  private readonly samples: Map<CliName, LatencySample[]> = new Map();
  private totalRecordings = 0;
  private evictedByAge = 0;
  private evictedByWindow = 0;

  constructor(config?: Partial<LatencyTrackerConfig>) {
    this.config = LatencyTrackerConfigSchema.parse(config ?? {});
  }

  /**
   * Records a latency measurement for a CLI.
   *
   * @param cli - The CLI that was executed
   * @param durationMs - Execution duration in milliseconds
   * @param success - Whether the execution was successful (default: true)
   * @throws LatencyTrackerError if durationMs is negative
   */
  record(cli: CliName, durationMs: number, success = true): void {
    if (durationMs < 0) {
      throw new LatencyTrackerError('Duration must be non-negative', 'INVALID_DURATION');
    }

    const now = performance.now();
    this.totalRecordings++;

    const sample: LatencySample = {
      durationMs,
      recordedAt: now,
      success,
    };

    let cliSamples = this.samples.get(cli);
    if (cliSamples === undefined) {
      cliSamples = [];
      this.samples.set(cli, cliSamples);
    }

    // Evict old samples before adding new one
    this.evictOldSamples(cliSamples, now);

    // Evict oldest if at capacity
    if (cliSamples.length >= this.config.windowSize) {
      cliSamples.shift();
      this.evictedByWindow++;
    }

    cliSamples.push(sample);
  }

  /**
   * Evicts samples older than maxSampleAgeMs.
   */
  private evictOldSamples(samples: LatencySample[], now: number): void {
    const cutoff = now - this.config.maxSampleAgeMs;
    let evicted = 0;

    while (samples.length > 0 && (samples[0]?.recordedAt ?? now) < cutoff) {
      samples.shift();
      evicted++;
    }

    this.evictedByAge += evicted;
  }

  /**
   * Gets latency statistics for a specific CLI.
   */
  getStats(cli: CliName): LatencyStats {
    const cliSamples = this.samples.get(cli);
    if (cliSamples === undefined || cliSamples.length === 0) {
      return EMPTY_LATENCY_STATS;
    }

    const now = performance.now();
    this.evictOldSamples(cliSamples, now);

    if (cliSamples.length === 0) {
      return EMPTY_LATENCY_STATS;
    }

    return this.computeStats(cliSamples, now);
  }

  /**
   * Computes statistics from samples.
   */
  private computeStats(samples: readonly LatencySample[], now: number): LatencyStats {
    const durations = samples.map((s) => s.durationMs);
    const sortedDurations = [...durations].sort((a, b) => a - b);

    const sum = durations.reduce((a, b) => a + b, 0);
    const avg = sum / durations.length;
    const min = sortedDurations[0] ?? 0;
    const max = sortedDurations[sortedDurations.length - 1] ?? 0;

    const successCount = samples.filter((s) => s.success).length;

    return {
      count: samples.length,
      avg,
      min,
      max,
      p50: calculatePercentile(sortedDurations, 50),
      p95: calculatePercentile(sortedDurations, 95),
      p99: calculatePercentile(sortedDurations, 99),
      stdDev: calculateStdDev(durations, avg),
      weightedAvg: calculateWeightedAverage(samples, this.config.decayFactor, now),
      successRate: samples.length > 0 ? successCount / samples.length : 0,
      oldestSampleAt: samples[0]?.recordedAt,
      newestSampleAt: samples[samples.length - 1]?.recordedAt,
    };
  }

  /**
   * Gets latency-based routing scores for multiple CLIs.
   * Higher scores indicate better (faster, more reliable) CLIs.
   */
  getScores(clis: readonly CliName[]): readonly LatencyScore[] {
    const scores = clis.map((cli) => this.getScore(cli));

    // Find the maximum weighted average for normalization
    const validScores = scores.filter((s) => s.hasReliableData);
    if (validScores.length === 0) {
      return scores;
    }

    const maxLatency = Math.max(
      ...validScores.map((s) => s.weightedAvgMs),
      MAX_LATENCY_FOR_NORMALIZATION_MS
    );

    // Normalize scores (faster = higher score)
    return scores.map((score) => {
      if (!score.hasReliableData) {
        return score;
      }

      const normalizedScore = 1 - score.weightedAvgMs / maxLatency;
      return {
        ...score,
        score: clamp01(normalizedScore),
      };
    });
  }

  /**
   * Gets a latency-based routing score for a single CLI.
   */
  getScore(cli: CliName): LatencyScore {
    const stats = this.getStats(cli);

    const hasReliableData = stats.count >= MIN_SAMPLES_FOR_RELIABILITY;
    const confidence = Math.min(1, stats.count / this.config.windowSize);

    // Base score on weighted average (will be normalized in getScores)
    // For individual scores, use inverse relationship: lower latency = higher score
    const rawScore =
      stats.weightedAvg > 0
        ? 1 - Math.min(stats.weightedAvg / MAX_LATENCY_FOR_NORMALIZATION_MS, 1)
        : 0.5; // Default to middle score for no data

    // Factor in success rate
    const adjustedScore = rawScore * stats.successRate;

    return {
      cli,
      score: hasReliableData ? adjustedScore : MIN_CONFIDENCE,
      confidence: hasReliableData ? confidence : MIN_CONFIDENCE,
      weightedAvgMs: stats.weightedAvg,
      hasReliableData,
    };
  }

  /**
   * Gets overall tracker statistics.
   */
  getTrackerStats(): LatencyTrackerStats {
    const perCli: Record<CliName, LatencyStats> = {
      claude: EMPTY_LATENCY_STATS,
      gemini: EMPTY_LATENCY_STATS,
      codex: EMPTY_LATENCY_STATS,
      opencode: EMPTY_LATENCY_STATS,
    };

    let totalSamples = 0;

    for (const cli of CLI_NAMES) {
      const stats = this.getStats(cli);
      perCli[cli] = stats;
      totalSamples += stats.count;
    }

    return {
      perCli,
      totalSamples,
      totalRecordings: this.totalRecordings,
      evictedByAge: this.evictedByAge,
      evictedByWindow: this.evictedByWindow,
    };
  }

  /**
   * Clears all samples for a specific CLI.
   */
  clear(cli: CliName): void {
    this.samples.delete(cli);
  }

  /**
   * Clears all samples for all CLIs.
   */
  clearAll(): void {
    this.samples.clear();
    this.totalRecordings = 0;
    this.evictedByAge = 0;
    this.evictedByWindow = 0;
  }
}

/**
 * Factory function to create a LatencyTracker instance.
 */
export function createLatencyTracker(config?: Partial<LatencyTrackerConfig>): ILatencyTracker {
  return new LatencyTracker(config);
}
