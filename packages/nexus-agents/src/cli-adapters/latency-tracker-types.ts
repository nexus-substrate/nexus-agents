/**
 * nexus-agents/cli-adapters - Latency Tracker Types
 *
 * Type definitions and Zod schemas for CLI latency tracking.
 * Tracks execution times for smarter routing decisions.
 *
 * @module cli-adapters/latency-tracker-types
 * (Source: Issue #361 - CLI latency tracking for routing)
 */

import { z } from 'zod';
import type { CliName } from './types-core.js';

/**
 * Configuration schema for LatencyTracker.
 */
export const LatencyTrackerConfigSchema = z.object({
  /** Maximum number of samples to keep per CLI (default: 100) */
  windowSize: z.number().int().positive().default(100),
  /** Time-weighted decay factor (0-1, higher = more weight to recent) (default: 0.95) */
  decayFactor: z.number().min(0).max(1).default(0.95),
  /** Maximum age of samples in milliseconds before forced eviction (default: 3600000 = 1 hour) */
  maxSampleAgeMs: z.number().int().positive().default(3600000),
  /** Percentiles to calculate (default: [50, 95, 99]) */
  percentiles: z.array(z.number().min(0).max(100)).default([50, 95, 99]),
});

export type LatencyTrackerConfig = z.infer<typeof LatencyTrackerConfigSchema>;

/**
 * Default configuration for latency tracker.
 */
export const DEFAULT_LATENCY_TRACKER_CONFIG: LatencyTrackerConfig = {
  windowSize: 100,
  decayFactor: 0.95,
  maxSampleAgeMs: 3600000, // 1 hour
  percentiles: [50, 95, 99],
};

/**
 * A single latency measurement sample.
 */
export interface LatencySample {
  /** Duration of the operation in milliseconds */
  readonly durationMs: number;
  /** Timestamp when the measurement was recorded (monotonic) */
  readonly recordedAt: number;
  /** Whether the operation was successful */
  readonly success: boolean;
}

/**
 * Latency statistics for a single CLI.
 */
export interface LatencyStats {
  /** Number of samples in the window */
  readonly count: number;
  /** Arithmetic mean of latencies */
  readonly avg: number;
  /** Minimum latency observed */
  readonly min: number;
  /** Maximum latency observed */
  readonly max: number;
  /** 50th percentile (median) */
  readonly p50: number;
  /** 95th percentile */
  readonly p95: number;
  /** 99th percentile */
  readonly p99: number;
  /** Standard deviation */
  readonly stdDev: number;
  /** Time-weighted average (recent samples weighted more) */
  readonly weightedAvg: number;
  /** Success rate (0-1) */
  readonly successRate: number;
  /** Timestamp of the oldest sample */
  readonly oldestSampleAt: number | undefined;
  /** Timestamp of the newest sample */
  readonly newestSampleAt: number | undefined;
}

/**
 * Empty stats for CLIs with no measurements.
 */
export const EMPTY_LATENCY_STATS: LatencyStats = {
  count: 0,
  avg: 0,
  min: 0,
  max: 0,
  p50: 0,
  p95: 0,
  p99: 0,
  stdDev: 0,
  weightedAvg: 0,
  successRate: 0,
  oldestSampleAt: undefined,
  newestSampleAt: undefined,
};

/**
 * Latency-based routing score for a CLI.
 */
export interface LatencyScore {
  /** The CLI being scored */
  readonly cli: CliName;
  /** Normalized score (0-1, higher is better/faster) */
  readonly score: number;
  /** Confidence in the score (0-1, based on sample count) */
  readonly confidence: number;
  /** Raw weighted average latency */
  readonly weightedAvgMs: number;
  /** Whether enough data exists for reliable scoring */
  readonly hasReliableData: boolean;
}

/**
 * Overall tracker statistics for observability.
 */
export interface LatencyTrackerStats {
  /** Stats per CLI */
  readonly perCli: Readonly<Record<CliName, LatencyStats>>;
  /** Total samples across all CLIs */
  readonly totalSamples: number;
  /** Total recordings made (including evicted) */
  readonly totalRecordings: number;
  /** Number of samples evicted due to age */
  readonly evictedByAge: number;
  /** Number of samples evicted due to window size */
  readonly evictedByWindow: number;
}

/**
 * Interface for latency tracker dependency injection.
 */
export interface ILatencyTracker {
  /** Record a latency measurement for a CLI */
  record(cli: CliName, durationMs: number, success?: boolean): void;

  /** Get statistics for a specific CLI */
  getStats(cli: CliName): LatencyStats;

  /** Get latency-based routing scores for all CLIs */
  getScores(clis: readonly CliName[]): readonly LatencyScore[];

  /** Get a single score for a CLI */
  getScore(cli: CliName): LatencyScore;

  /** Get overall tracker statistics */
  getTrackerStats(): LatencyTrackerStats;

  /** Clear all samples for a specific CLI */
  clear(cli: CliName): void;

  /** Clear all samples for all CLIs */
  clearAll(): void;
}

/**
 * Error thrown by latency tracker operations.
 */
export class LatencyTrackerError extends Error {
  readonly code: 'INVALID_DURATION' | 'CONFIG_ERROR';

  constructor(message: string, code: 'INVALID_DURATION' | 'CONFIG_ERROR') {
    super(message);
    this.name = 'LatencyTrackerError';
    this.code = code;
  }
}
