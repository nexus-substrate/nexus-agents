/**
 * Adaptive Thresholds — Learning Loop (Issue #901, Phase 4)
 *
 * Pure function-based module that computes dynamic thresholds from
 * observed task outcomes. Replaces hardcoded baseline/maxBonus/coldStart
 * values with data-driven adjustments.
 *
 * @module orchestration/outcomes/adaptive-thresholds
 */

import type { TaskOutcome } from './outcome-types.js';
import type { OutcomeStore } from './outcome-store.js';
import type { TaskCategory } from '../../config/task-specialization-types.js';

// ============================================================================
// Types
// ============================================================================

/** Direction of performance change over time. */
export type Trend = 'improving' | 'declining' | 'stable';

/** Result of computing adaptive thresholds for a CLI+category pair. */
export interface AdaptiveThresholdResult {
  /** Adjusted baseline success rate (default: 0.7). */
  readonly baseline: number;
  /** Adjusted max bonus cap (default: 5). */
  readonly maxBonus: number;
  /** Minimum samples before adjustment (always 10). */
  readonly coldStart: number;
  /** Detected performance trend. */
  readonly trend: Trend;
  /** Confidence in the result (0-1), based on sample size. */
  readonly confidence: number;
  /** Number of outcomes used for computation. */
  readonly sampleCount: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_BASELINE = 0.7;
const DEFAULT_MAX_BONUS = 5;
const COLD_START_THRESHOLD = 10;
const DEFAULT_WINDOW_SIZE = 25;
const FULL_CONFIDENCE_SAMPLES = 50;
const TREND_DELTA_THRESHOLD = 0.05;

// ============================================================================
// Public API
// ============================================================================

/**
 * Computes adaptive thresholds for a CLI+category pair from outcome data.
 *
 * Below cold start threshold: returns defaults with zero confidence.
 * Above threshold: adjusts baseline toward observed rate, scales max
 * bonus by confidence, and detects trend.
 */
export function computeAdaptiveThresholds(
  store: OutcomeStore,
  cli: 'claude' | 'gemini' | 'codex',
  category: TaskCategory
): AdaptiveThresholdResult {
  const outcomes = store.query({ cli, category });
  const sampleCount = outcomes.length;

  if (sampleCount < COLD_START_THRESHOLD) {
    return {
      baseline: DEFAULT_BASELINE,
      maxBonus: DEFAULT_MAX_BONUS,
      coldStart: COLD_START_THRESHOLD,
      trend: 'stable',
      confidence: 0,
      sampleCount,
    };
  }

  const confidence = computeConfidence(sampleCount);
  const overallRate = successRate(outcomes);
  const trend = detectTrend(outcomes);

  // Weighted blend: move baseline toward observed rate proportional to confidence
  const baseline = DEFAULT_BASELINE * (1 - confidence) + overallRate * confidence;

  // Scale max bonus with confidence — low confidence → smaller swings
  const maxBonus = DEFAULT_MAX_BONUS * confidence;

  return {
    baseline: round(baseline),
    maxBonus: round(maxBonus),
    coldStart: COLD_START_THRESHOLD,
    trend,
    confidence: round(confidence),
    sampleCount,
  };
}

/**
 * Detects performance trend by comparing recent vs historical success rates.
 *
 * Splits outcomes into two windows of `windowSize` (default 25).
 * If fewer than 2 * windowSize outcomes, uses half-split.
 */
export function detectTrend(
  outcomes: readonly TaskOutcome[],
  windowSize: number = DEFAULT_WINDOW_SIZE
): Trend {
  if (outcomes.length < 2) return 'stable';

  const midpoint = Math.max(1, Math.floor(outcomes.length / 2));
  const effectiveWindow = Math.min(windowSize, midpoint);

  const historical = outcomes.slice(Math.max(0, midpoint - effectiveWindow), midpoint);
  const recent = outcomes.slice(outcomes.length - effectiveWindow);

  const historicalRate = successRate(historical);
  const recentRate = successRate(recent);
  const delta = recentRate - historicalRate;

  if (delta > TREND_DELTA_THRESHOLD) return 'improving';
  if (delta < -TREND_DELTA_THRESHOLD) return 'declining';
  return 'stable';
}

// ============================================================================
// Internal Helpers
// ============================================================================

function successRate(outcomes: readonly TaskOutcome[]): number {
  if (outcomes.length === 0) return 0;
  return outcomes.filter((o) => o.success).length / outcomes.length;
}

function computeConfidence(sampleCount: number): number {
  return Math.min(1, sampleCount / FULL_CONFIDENCE_SAMPLES);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
