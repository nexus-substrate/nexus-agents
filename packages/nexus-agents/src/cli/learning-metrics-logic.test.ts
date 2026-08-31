/**
 * Tests for learning-metrics-logic.ts
 *
 * Covers aggregateModelStats, computeBanditProgress, computeRewardTrend,
 * computeFeedbackLoopStats, computeSummary, and gatherLearningMetrics.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { gatherLearningMetrics } from './learning-metrics-logic.js';
import { FixedTimeProvider, setTimeProvider, resetTimeProvider } from '../core/index.js';

// ============================================================================
// Setup
// ============================================================================

const FIXED_TIME = 1700000000000;

beforeEach(() => {
  setTimeProvider(new FixedTimeProvider(FIXED_TIME));
});

afterEach(() => {
  resetTimeProvider();
});

// ============================================================================
// gatherLearningMetrics - with no data sources
// ============================================================================

describe('gatherLearningMetrics', () => {
  it('returns valid result with all undefined sources', () => {
    const result = gatherLearningMetrics(undefined, undefined, undefined, {
      period: 24,
      format: 'ascii',
      banditStats: false,
      showTrends: true,
    });
    expect(result.periodHours).toBe(24);
    expect(result.timestamp).toBeDefined();
    expect(result.models).toEqual([]);
    expect(result.banditProgress.totalPulls).toBe(0);
    expect(result.feedbackLoop.totalDecisions).toBe(0);
  });

  it('sets correct reward trend when no metrics', () => {
    const result = gatherLearningMetrics(undefined, undefined, undefined, {
      period: 1,
      format: 'ascii',
      banditStats: false,
      showTrends: true,
    });
    expect(result.rewardTrend.current).toBe(0);
    expect(result.rewardTrend.direction).toBe('stable');
  });

  it('summary reports unmeasured when no bandit is supplied', () => {
    // Was named "shows exploring status for high exploration ratio" and
    // asserted 'exploiting', with a comment explaining the mechanism:
    // "When all sources undefined, exploration ratio is 0 → exploiting".
    // That documented the #5267 defect and pinned it as intended behaviour —
    // a green ✓ asserting convergence over a bandit never consulted.
    const result = gatherLearningMetrics(undefined, undefined, undefined, {
      period: 24,
      format: 'ascii',
      banditStats: false,
      showTrends: true,
    });
    expect(result.summary.learningStatus).toBe('unmeasured');
  });

  it('sets default feature importance when no bandit stats', () => {
    const result = gatherLearningMetrics(undefined, undefined, undefined, {
      period: 24,
      format: 'ascii',
      banditStats: false,
      showTrends: true,
    });
    expect(result.banditProgress.topFeatures.length).toBe(5);
    expect(result.banditProgress.topFeatures[0]?.importance).toBe(0);
  });

  it('computes correlation rate as 0 when no decisions', () => {
    const result = gatherLearningMetrics(undefined, undefined, undefined, {
      period: 24,
      format: 'ascii',
      banditStats: false,
      showTrends: true,
    });
    expect(result.feedbackLoop.correlationRate).toBe(0);
  });

  it('uses period from options', () => {
    const result = gatherLearningMetrics(undefined, undefined, undefined, {
      period: 168,
      format: 'ascii',
      banditStats: false,
      showTrends: true,
    });
    expect(result.periodHours).toBe(168);
  });

  it('returns zero outcome distribution with no feedback', () => {
    const result = gatherLearningMetrics(undefined, undefined, undefined, {
      period: 24,
      format: 'ascii',
      banditStats: false,
      showTrends: true,
    });
    expect(result.feedbackLoop.outcomeDistribution).toEqual({
      success: 0,
      partial: 0,
      failure: 0,
    });
  });
});
