/**
 * Tests for LatencyStage
 *
 * Covers latency-based scoring, tracker integration, signal generation,
 * outcome recording, and statistics.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LatencyStage, createLatencyStage } from './latency-stage.js';
import type { ILatencyTracker } from '../../latency-tracker.js';
import { createRoutingContext } from '../router-stage.js';
import { FixedTimeProvider, setTimeProvider, resetTimeProvider } from '../../../core/index.js';

// ============================================================================
// Setup
// ============================================================================

const FIXED_TIME = 1700000000000;

beforeEach(() => {
  setTimeProvider(new FixedTimeProvider(FIXED_TIME));
  return () => {
    resetTimeProvider();
  };
});

const SCORES_WITH_DATA = [
  {
    cli: 'claude' as const,
    score: 0.8,
    confidence: 0.9,
    hasReliableData: true,
    weightedAvgMs: 2000,
  },
  {
    cli: 'gemini' as const,
    score: 0.5,
    confidence: 0.7,
    hasReliableData: true,
    weightedAvgMs: 800,
  },
  { cli: 'codex' as const, score: 0.3, confidence: 0.4, hasReliableData: false, weightedAvgMs: 0 },
];

const SCORES_NO_DATA = [
  { cli: 'claude' as const, score: 0, confidence: 0, hasReliableData: false, weightedAvgMs: 0 },
  { cli: 'gemini' as const, score: 0, confidence: 0, hasReliableData: false, weightedAvgMs: 0 },
  { cli: 'codex' as const, score: 0, confidence: 0, hasReliableData: false, weightedAvgMs: 0 },
];

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createMockTracker(hasData = false) {
  const samples = hasData ? 10 : 0;
  return {
    getScores: vi.fn().mockReturnValue(hasData ? SCORES_WITH_DATA : SCORES_NO_DATA),
    record: vi.fn(),
    getTrackerStats: vi.fn().mockReturnValue({
      totalSamples: samples,
      totalRecordings: samples,
      perCli: {
        claude: { count: hasData ? 5 : 0, avg: hasData ? 2000 : 0 },
        gemini: { count: hasData ? 3 : 0, avg: hasData ? 800 : 0 },
        codex: { count: hasData ? 2 : 0, avg: hasData ? 1500 : 0 },
      },
    }),
  } as unknown as ILatencyTracker;
}

// ============================================================================
// Construction
// ============================================================================

describe('LatencyStage', () => {
  it('uses default config', () => {
    const stage = new LatencyStage();
    expect(stage.name).toBe('latency-performance');
    expect(stage.priority).toBe(80);
  });

  it('accepts custom config and tracker', () => {
    const tracker = createMockTracker();
    const stage = new LatencyStage({ scoreWeight: 0.5 }, undefined, tracker);
    expect(stage.getTracker()).toBe(tracker);
  });

  it('createLatencyStage factory works', () => {
    const stage = createLatencyStage();
    expect(stage).toBeInstanceOf(LatencyStage);
  });
});

// ============================================================================
// canHandle
// ============================================================================

describe('LatencyStage.canHandle', () => {
  it('returns true when candidates remain', () => {
    const stage = new LatencyStage();
    expect(stage.canHandle(createRoutingContext('task'))).toBe(true);
  });
});

// ============================================================================
// route - with and without data
// ============================================================================

describe('LatencyStage.route', () => {
  it('adds insufficient-data signal when no latency data', async () => {
    const tracker = createMockTracker(false);
    const stage = new LatencyStage({}, undefined, tracker);
    const result = await stage.route(createRoutingContext('task'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.context.signals).toContain('latency:insufficient-data');
      expect(result.value.continuesPipeline).toBe(true);
    }
  });

  it('applies latency scores when data is available', async () => {
    const tracker = createMockTracker(true);
    const stage = new LatencyStage({}, undefined, tracker);
    const result = await stage.route(createRoutingContext('task'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      const signals = result.value.context.signals;
      // Should have fastest signal
      const fastestSignal = signals.find((s) => s.startsWith('latency:fastest-'));
      expect(fastestSignal).toBeDefined();
      // gemini is fastest (800ms)
      expect(fastestSignal).toBe('latency:fastest-gemini');
    }
  });

  it('adds trace entry', async () => {
    const tracker = createMockTracker(true);
    const stage = new LatencyStage({}, undefined, tracker);
    const result = await stage.route(createRoutingContext('task'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.context.trace.length).toBe(1);
      expect(result.value.context.trace[0]?.stageName).toBe('latency-performance');
      expect(result.value.context.trace[0]?.action).toBe('score');
    }
  });

  it('uses skip action when no reliable data', async () => {
    const tracker = createMockTracker(false);
    const stage = new LatencyStage({}, undefined, tracker);
    const result = await stage.route(createRoutingContext('task'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.context.trace[0]?.action).toBe('skip');
    }
  });
});

// ============================================================================
// recordOutcome
// ============================================================================

describe('LatencyStage.recordOutcome', () => {
  it('records latency to tracker', () => {
    const tracker = createMockTracker();
    const stage = new LatencyStage({}, undefined, tracker);
    stage.recordOutcome({
      selectedCli: 'claude',
      task: 'test',
      success: true,
      latencyMs: 1500,
    });
    expect(tracker.record).toHaveBeenCalledWith('claude', 1500, true);
  });

  it('does not record when no latency', () => {
    const tracker = createMockTracker();
    const stage = new LatencyStage({}, undefined, tracker);
    stage.recordOutcome({
      selectedCli: 'claude',
      task: 'test',
      success: true,
    });
    expect(tracker.record).not.toHaveBeenCalled();
  });
});

// ============================================================================
// getStats
// ============================================================================

describe('LatencyStage.getStats', () => {
  it('returns initial stats', () => {
    const tracker = createMockTracker();
    const stage = new LatencyStage({}, undefined, tracker);
    const stats = stage.getStats() as {
      routingsCount: number;
      latencyApplied: number;
      applicationRate: number;
    };
    expect(stats.routingsCount).toBe(0);
    expect(stats.latencyApplied).toBe(0);
    expect(stats.applicationRate).toBe(0);
  });

  it('tracks routing count and application rate', async () => {
    const tracker = createMockTracker(true);
    const stage = new LatencyStage({}, undefined, tracker);
    await stage.route(createRoutingContext('task'));
    const stats = stage.getStats() as {
      routingsCount: number;
      latencyApplied: number;
      applicationRate: number;
    };
    expect(stats.routingsCount).toBe(1);
    expect(stats.latencyApplied).toBe(1);
    expect(stats.applicationRate).toBe(1);
  });
});
