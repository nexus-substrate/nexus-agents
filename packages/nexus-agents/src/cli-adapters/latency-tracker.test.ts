/**
 * nexus-agents/cli-adapters - Latency Tracker Tests
 *
 * Unit tests for the CLI latency tracking system.
 *
 * @module cli-adapters/latency-tracker.test
 * (Source: Issue #361 - CLI latency tracking for routing)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  LatencyTracker,
  createLatencyTracker,
  LatencyTrackerError,
  EMPTY_LATENCY_STATS,
  DEFAULT_LATENCY_TRACKER_CONFIG,
  type LatencyTrackerConfig,
} from './latency-tracker.js';

describe('LatencyTracker', () => {
  let tracker: LatencyTracker;

  beforeEach(() => {
    vi.useFakeTimers();
    tracker = new LatencyTracker();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('should create with default configuration', () => {
      const stats = tracker.getTrackerStats();
      expect(stats.totalSamples).toBe(0);
      expect(stats.totalRecordings).toBe(0);
    });

    it('should accept custom configuration', () => {
      const customConfig: Partial<LatencyTrackerConfig> = {
        windowSize: 50,
        decayFactor: 0.9,
      };
      const customTracker = new LatencyTracker(customConfig);
      expect(customTracker).toBeInstanceOf(LatencyTracker);
    });

    it('should use default config values for missing options', () => {
      const partialConfig = { windowSize: 50 };
      const customTracker = createLatencyTracker(partialConfig);
      expect(customTracker).toBeDefined();
    });
  });

  describe('record()', () => {
    it('should record a latency measurement', () => {
      tracker.record('claude', 100);

      const stats = tracker.getStats('claude');
      expect(stats.count).toBe(1);
      expect(stats.avg).toBe(100);
    });

    it('should record multiple measurements', () => {
      tracker.record('claude', 100);
      tracker.record('claude', 200);
      tracker.record('claude', 300);

      const stats = tracker.getStats('claude');
      expect(stats.count).toBe(3);
      expect(stats.avg).toBe(200);
    });

    it('should track measurements per CLI separately', () => {
      tracker.record('claude', 100);
      tracker.record('gemini', 200);
      tracker.record('codex', 300);

      expect(tracker.getStats('claude').avg).toBe(100);
      expect(tracker.getStats('gemini').avg).toBe(200);
      expect(tracker.getStats('codex').avg).toBe(300);
    });

    it('should track success/failure status', () => {
      tracker.record('claude', 100, true);
      tracker.record('claude', 200, false);
      tracker.record('claude', 300, true);

      const stats = tracker.getStats('claude');
      expect(stats.successRate).toBeCloseTo(2 / 3, 5);
    });

    it('should default success to true', () => {
      tracker.record('claude', 100);

      const stats = tracker.getStats('claude');
      expect(stats.successRate).toBe(1);
    });

    it('should throw for negative duration', () => {
      expect(() => {
        tracker.record('claude', -100);
      }).toThrow(LatencyTrackerError);
      expect(() => {
        tracker.record('claude', -100);
      }).toThrow('Duration must be non-negative');
    });

    it('should accept zero duration', () => {
      tracker.record('claude', 0);
      expect(tracker.getStats('claude').count).toBe(1);
    });

    it('should increment total recordings counter', () => {
      tracker.record('claude', 100);
      tracker.record('gemini', 200);
      tracker.record('claude', 150);

      const stats = tracker.getTrackerStats();
      expect(stats.totalRecordings).toBe(3);
    });
  });

  describe('getStats()', () => {
    it('should return empty stats for unknown CLI', () => {
      const stats = tracker.getStats('claude');
      expect(stats).toEqual(EMPTY_LATENCY_STATS);
    });

    it('should calculate correct min/max', () => {
      tracker.record('claude', 50);
      tracker.record('claude', 200);
      tracker.record('claude', 100);

      const stats = tracker.getStats('claude');
      expect(stats.min).toBe(50);
      expect(stats.max).toBe(200);
    });

    it('should calculate correct percentiles', () => {
      // Add 100 samples: 1, 2, 3, ..., 100
      for (let i = 1; i <= 100; i++) {
        tracker.record('claude', i);
      }

      const stats = tracker.getStats('claude');
      expect(stats.p50).toBeCloseTo(50.5, 0);
      expect(stats.p95).toBeCloseTo(95.05, 0);
      expect(stats.p99).toBeCloseTo(99.01, 0);
    });

    it('should calculate standard deviation', () => {
      tracker.record('claude', 100);
      tracker.record('claude', 100);
      tracker.record('claude', 100);

      const uniformStats = tracker.getStats('claude');
      expect(uniformStats.stdDev).toBe(0);

      tracker.clear('claude');

      tracker.record('claude', 0);
      tracker.record('claude', 100);
      tracker.record('claude', 200);

      const variableStats = tracker.getStats('claude');
      expect(variableStats.stdDev).toBeGreaterThan(0);
    });

    it('should handle single sample correctly', () => {
      tracker.record('claude', 100);

      const stats = tracker.getStats('claude');
      expect(stats.count).toBe(1);
      expect(stats.avg).toBe(100);
      expect(stats.p50).toBe(100);
      expect(stats.p95).toBe(100);
      expect(stats.p99).toBe(100);
      expect(stats.stdDev).toBe(0);
    });

    it('should track oldest and newest sample timestamps', () => {
      tracker.record('claude', 100);
      const firstTime = performance.now();

      vi.advanceTimersByTime(1000);
      tracker.record('claude', 200);
      const secondTime = performance.now();

      const stats = tracker.getStats('claude');
      expect(stats.oldestSampleAt).toBeLessThanOrEqual(firstTime);
      expect(stats.newestSampleAt).toBeLessThanOrEqual(secondTime);
      expect(stats.newestSampleAt).toBeGreaterThan(stats.oldestSampleAt!);
    });
  });

  describe('time-weighted decay', () => {
    it('should weight recent samples more heavily', () => {
      // Use a more aggressive decay factor to see clear effect
      const decayTracker = new LatencyTracker({ decayFactor: 0.5 });

      // Record old sample
      decayTracker.record('claude', 1000);

      // Advance time by 10 minutes
      vi.advanceTimersByTime(10 * 60 * 1000);

      // Record recent sample
      decayTracker.record('claude', 100);

      const stats = decayTracker.getStats('claude');

      // Weighted average should be closer to 100 (recent) than to 550 (simple avg)
      // With decay=0.5, after 10 minutes the old sample has weight ~0.001
      // while the new sample has weight 1.0
      expect(stats.weightedAvg).toBeLessThan(stats.avg);
      expect(stats.weightedAvg).toBeLessThan(200); // Much closer to 100 than 550
    });

    it('should give equal weight to samples recorded at same time', () => {
      tracker.record('claude', 100);
      tracker.record('claude', 200);
      tracker.record('claude', 300);

      const stats = tracker.getStats('claude');

      // With no time difference, weighted avg should be close to simple avg
      expect(stats.weightedAvg).toBeCloseTo(stats.avg, 0);
    });
  });

  describe('window size enforcement', () => {
    it('should evict oldest samples when window is full', () => {
      const smallTracker = new LatencyTracker({ windowSize: 5 });

      // Record 7 samples
      for (let i = 1; i <= 7; i++) {
        smallTracker.record('claude', i * 100);
      }

      const stats = smallTracker.getStats('claude');
      expect(stats.count).toBe(5);
      expect(stats.min).toBe(300); // First two (100, 200) should be evicted
    });

    it('should track evicted samples by window', () => {
      const smallTracker = new LatencyTracker({ windowSize: 3 });

      for (let i = 1; i <= 5; i++) {
        smallTracker.record('claude', i * 100);
      }

      const trackerStats = smallTracker.getTrackerStats();
      expect(trackerStats.evictedByWindow).toBe(2);
    });
  });

  describe('age-based eviction', () => {
    it('should evict samples older than maxSampleAgeMs', () => {
      const shortAgeTracker = new LatencyTracker({ maxSampleAgeMs: 60000 }); // 1 minute

      shortAgeTracker.record('claude', 100);

      // Advance time by 2 minutes
      vi.advanceTimersByTime(2 * 60 * 1000);

      // Trigger eviction by getting stats
      const stats = shortAgeTracker.getStats('claude');
      expect(stats.count).toBe(0);
    });

    it('should track evicted samples by age', () => {
      const shortAgeTracker = new LatencyTracker({ maxSampleAgeMs: 60000 });

      shortAgeTracker.record('claude', 100);
      shortAgeTracker.record('claude', 200);

      vi.advanceTimersByTime(2 * 60 * 1000);

      // Recording new sample triggers eviction
      shortAgeTracker.record('claude', 300);

      const trackerStats = shortAgeTracker.getTrackerStats();
      expect(trackerStats.evictedByAge).toBe(2);
    });

    it('should keep samples within age limit', () => {
      const shortAgeTracker = new LatencyTracker({ maxSampleAgeMs: 60000 });

      shortAgeTracker.record('claude', 100);

      vi.advanceTimersByTime(30 * 1000); // 30 seconds

      const stats = shortAgeTracker.getStats('claude');
      expect(stats.count).toBe(1);
    });
  });

  describe('getScore()', () => {
    it('should return low confidence for insufficient data', () => {
      tracker.record('claude', 100);

      const score = tracker.getScore('claude');
      expect(score.hasReliableData).toBe(false);
      expect(score.confidence).toBe(0.1); // MIN_CONFIDENCE
    });

    it('should return reliable data indicator after enough samples', () => {
      for (let i = 0; i < 5; i++) {
        tracker.record('claude', 100);
      }

      const score = tracker.getScore('claude');
      expect(score.hasReliableData).toBe(true);
    });

    it('should increase confidence with more samples', () => {
      for (let i = 0; i < 10; i++) {
        tracker.record('claude', 100);
      }

      const score10 = tracker.getScore('claude');

      for (let i = 0; i < 40; i++) {
        tracker.record('claude', 100);
      }

      const score50 = tracker.getScore('claude');

      expect(score50.confidence).toBeGreaterThan(score10.confidence);
    });

    it('should give higher score to faster CLIs', () => {
      // Claude is fast
      for (let i = 0; i < 10; i++) {
        tracker.record('claude', 100);
      }

      // Gemini is slow
      for (let i = 0; i < 10; i++) {
        tracker.record('gemini', 1000);
      }

      const claudeScore = tracker.getScore('claude');
      const geminiScore = tracker.getScore('gemini');

      expect(claudeScore.score).toBeGreaterThan(geminiScore.score);
    });

    it('should factor in success rate', () => {
      // Claude: fast but unreliable
      for (let i = 0; i < 10; i++) {
        tracker.record('claude', 100, i < 5); // 50% success
      }

      // Gemini: slightly slower but reliable
      for (let i = 0; i < 10; i++) {
        tracker.record('gemini', 150, true); // 100% success
      }

      const claudeScore = tracker.getScore('claude');
      const geminiScore = tracker.getScore('gemini');

      // Gemini should score better due to reliability
      expect(geminiScore.score).toBeGreaterThan(claudeScore.score);
    });

    it('should return weightedAvgMs in score', () => {
      for (let i = 0; i < 10; i++) {
        tracker.record('claude', 150);
      }

      const score = tracker.getScore('claude');
      expect(score.weightedAvgMs).toBeCloseTo(150, 0);
    });
  });

  describe('getScores()', () => {
    it('should return scores for all requested CLIs', () => {
      tracker.record('claude', 100);
      tracker.record('gemini', 200);

      const scores = tracker.getScores(['claude', 'gemini', 'codex']);

      expect(scores).toHaveLength(3);
      expect(scores.map((s) => s.cli)).toEqual(['claude', 'gemini', 'codex']);
    });

    it('should normalize scores relative to each other', () => {
      // Add enough samples for reliable data
      for (let i = 0; i < 10; i++) {
        tracker.record('claude', 100);
        tracker.record('gemini', 500);
        tracker.record('codex', 300);
      }

      const scores = tracker.getScores(['claude', 'gemini', 'codex']);
      const claudeScore = scores.find((s) => s.cli === 'claude');
      const geminiScore = scores.find((s) => s.cli === 'gemini');
      const codexScore = scores.find((s) => s.cli === 'codex');

      // Claude (fastest) should have highest score
      expect(claudeScore!.score).toBeGreaterThan(codexScore!.score);
      expect(codexScore!.score).toBeGreaterThan(geminiScore!.score);
    });

    it('should handle empty CLI list', () => {
      const scores = tracker.getScores([]);
      expect(scores).toHaveLength(0);
    });

    it('should handle CLIs with no data', () => {
      const scores = tracker.getScores(['claude', 'gemini']);

      expect(scores[0]?.hasReliableData).toBe(false);
      expect(scores[1]?.hasReliableData).toBe(false);
    });
  });

  describe('getTrackerStats()', () => {
    it('should return stats for all CLIs', () => {
      tracker.record('claude', 100);
      tracker.record('gemini', 200);

      const stats = tracker.getTrackerStats();

      expect(stats.perCli.claude.count).toBe(1);
      expect(stats.perCli.gemini.count).toBe(1);
      expect(stats.perCli.codex.count).toBe(0);
    });

    it('should track total samples correctly', () => {
      tracker.record('claude', 100);
      tracker.record('claude', 200);
      tracker.record('gemini', 150);

      const stats = tracker.getTrackerStats();
      expect(stats.totalSamples).toBe(3);
    });

    it('should track eviction counts', () => {
      const smallTracker = new LatencyTracker({
        windowSize: 2,
        maxSampleAgeMs: 60000,
      });

      // Fill window
      smallTracker.record('claude', 100);
      smallTracker.record('claude', 200);

      // This should evict by window
      smallTracker.record('claude', 300);

      const stats = smallTracker.getTrackerStats();
      expect(stats.evictedByWindow).toBe(1);
    });
  });

  describe('clear()', () => {
    it('should clear samples for specific CLI', () => {
      tracker.record('claude', 100);
      tracker.record('gemini', 200);

      tracker.clear('claude');

      expect(tracker.getStats('claude').count).toBe(0);
      expect(tracker.getStats('gemini').count).toBe(1);
    });

    it('should handle clearing non-existent CLI', () => {
      expect(() => {
        tracker.clear('codex');
      }).not.toThrow();
    });
  });

  describe('clearAll()', () => {
    it('should clear all samples', () => {
      tracker.record('claude', 100);
      tracker.record('gemini', 200);
      tracker.record('codex', 300);

      tracker.clearAll();

      const stats = tracker.getTrackerStats();
      expect(stats.totalSamples).toBe(0);
      expect(stats.totalRecordings).toBe(0);
      expect(stats.evictedByAge).toBe(0);
      expect(stats.evictedByWindow).toBe(0);
    });
  });

  describe('createLatencyTracker()', () => {
    it('should create tracker with default config', () => {
      const tracker = createLatencyTracker();
      expect(tracker).toBeDefined();
    });

    it('should create tracker with custom config', () => {
      const tracker = createLatencyTracker({ windowSize: 50 });
      expect(tracker).toBeDefined();
    });
  });
});

describe('DEFAULT_LATENCY_TRACKER_CONFIG', () => {
  it('should have reasonable defaults', () => {
    expect(DEFAULT_LATENCY_TRACKER_CONFIG.windowSize).toBe(100);
    expect(DEFAULT_LATENCY_TRACKER_CONFIG.decayFactor).toBe(0.95);
    expect(DEFAULT_LATENCY_TRACKER_CONFIG.maxSampleAgeMs).toBe(3600000);
    expect(DEFAULT_LATENCY_TRACKER_CONFIG.percentiles).toEqual([50, 95, 99]);
  });
});

describe('EMPTY_LATENCY_STATS', () => {
  it('should have all zero values', () => {
    expect(EMPTY_LATENCY_STATS.count).toBe(0);
    expect(EMPTY_LATENCY_STATS.avg).toBe(0);
    expect(EMPTY_LATENCY_STATS.min).toBe(0);
    expect(EMPTY_LATENCY_STATS.max).toBe(0);
    expect(EMPTY_LATENCY_STATS.p50).toBe(0);
    expect(EMPTY_LATENCY_STATS.p95).toBe(0);
    expect(EMPTY_LATENCY_STATS.p99).toBe(0);
    expect(EMPTY_LATENCY_STATS.stdDev).toBe(0);
    expect(EMPTY_LATENCY_STATS.weightedAvg).toBe(0);
    expect(EMPTY_LATENCY_STATS.successRate).toBe(0);
    expect(EMPTY_LATENCY_STATS.oldestSampleAt).toBeUndefined();
    expect(EMPTY_LATENCY_STATS.newestSampleAt).toBeUndefined();
  });
});
