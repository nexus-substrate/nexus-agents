/**
 * Tests for Routing Metrics Dashboard Helpers
 * @module observability/routing-metrics-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { RoutingMetrics } from './routing-metrics-types.js';
import {
  centerText,
  padText,
  renderModelDistribution,
  renderLearningProgress,
  renderPerformanceSection,
} from './routing-metrics-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeMetrics(overrides: Partial<RoutingMetrics> = {}): RoutingMetrics {
  return {
    totalDecisions: 100,
    totalOutcomes: 90,
    explorationRate: 0.15,
    avgReward: 0.75,
    avgRoutingLatencyMs: 50,
    avgRewardTrend: 0.05,
    modelMetrics: [
      {
        model: 'claude',
        selectionCount: 60,
        selectionPercent: 0.6,
        avgReward: 0.8,
        avgQuality: 0.85,
        avgLatencyMs: 200,
        successRate: 0.9,
        explorationPercent: 0.1,
      },
      {
        model: 'gemini',
        selectionCount: 40,
        selectionPercent: 0.4,
        avgReward: 0.65,
        avgQuality: 0.7,
        avgLatencyMs: 150,
        successRate: 0.85,
        explorationPercent: 0.2,
      },
    ],
    ...overrides,
  };
}

// ============================================================================
// centerText
// ============================================================================

describe('centerText', () => {
  it('centers text within given width', () => {
    const result = centerText('Hello', 20);
    expect(result.startsWith('│')).toBe(true);
    expect(result.endsWith('│')).toBe(true);
    expect(result).toContain('Hello');
  });

  it('handles text wider than container', () => {
    const result = centerText('Very long text here', 10);
    expect(result.startsWith('│')).toBe(true);
    expect(result.endsWith('│')).toBe(true);
  });

  it('handles empty text', () => {
    const result = centerText('', 10);
    expect(result.startsWith('│')).toBe(true);
    expect(result.endsWith('│')).toBe(true);
  });
});

// ============================================================================
// padText
// ============================================================================

describe('padText', () => {
  it('pads text to fill width', () => {
    const result = padText('Hello', 20);
    expect(result.endsWith('│')).toBe(true);
    expect(result.length).toBe(20);
  });

  it('handles text longer than width', () => {
    const result = padText('Very long text', 5);
    expect(result.endsWith('│')).toBe(true);
  });
});

// ============================================================================
// renderModelDistribution
// ============================================================================

describe('renderModelDistribution', () => {
  it('renders model distribution with data', () => {
    const lines = renderModelDistribution(makeMetrics(), 60);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[0]).toContain('Model Selection Distribution');
  });

  it('shows no data message for empty metrics', () => {
    const lines = renderModelDistribution(makeMetrics({ modelMetrics: [] }), 60);
    expect(lines.some((l) => l.includes('No routing data'))).toBe(true);
  });

  it('includes model names', () => {
    const lines = renderModelDistribution(makeMetrics(), 60);
    const allText = lines.join('\n');
    expect(allText).toContain('claude');
    expect(allText).toContain('gemini');
  });

  it('renders non-empty bar for 60% selection (regression: * 20 not * 0.2)', () => {
    const lines = renderModelDistribution(makeMetrics(), 80);
    const allText = lines.join('\n');
    // selectionPercent=0.6 → barLength=12, so at least 10 filled blocks
    expect(allText).toContain('█'.repeat(10));
  });
});

// ============================================================================
// renderLearningProgress
// ============================================================================

describe('renderLearningProgress', () => {
  it('renders learning progress section', () => {
    const lines = renderLearningProgress(makeMetrics(), 60, false);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[0]).toContain('Learning Progress');
  });

  it('shows healthy exploration rate', () => {
    const lines = renderLearningProgress(makeMetrics({ explorationRate: 0.15 }), 60, false);
    const allText = lines.join('\n');
    expect(allText).toContain('healthy');
  });

  it('shows adjust for extreme exploration rate', () => {
    const lines = renderLearningProgress(makeMetrics({ explorationRate: 0.5 }), 60, false);
    const allText = lines.join('\n');
    expect(allText).toContain('adjust');
  });

  it('includes trends when enabled', () => {
    const lines = renderLearningProgress(makeMetrics({ avgRewardTrend: 0.05 }), 60, true);
    const allText = lines.join('\n');
    expect(allText).toContain('trend');
  });

  it('shows upward arrow for positive trend', () => {
    const lines = renderLearningProgress(makeMetrics({ avgRewardTrend: 0.1 }), 60, true);
    const allText = lines.join('\n');
    expect(allText).toContain('↑');
  });

  it('shows downward arrow for negative trend', () => {
    const lines = renderLearningProgress(makeMetrics({ avgRewardTrend: -0.1 }), 60, true);
    const allText = lines.join('\n');
    expect(allText).toContain('↓');
  });
});

// ============================================================================
// renderPerformanceSection
// ============================================================================

describe('renderPerformanceSection', () => {
  it('renders performance section', () => {
    const lines = renderPerformanceSection(makeMetrics(), 60);
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines[0]).toContain('Performance');
  });

  it('includes decision count', () => {
    const lines = renderPerformanceSection(makeMetrics({ totalDecisions: 500 }), 60);
    const allText = lines.join('\n');
    expect(allText).toContain('500');
  });

  it('includes latency', () => {
    const lines = renderPerformanceSection(makeMetrics({ avgRoutingLatencyMs: 42 }), 60);
    const allText = lines.join('\n');
    expect(allText).toContain('42');
  });

  it('calculates success rate from model metrics', () => {
    const lines = renderPerformanceSection(makeMetrics(), 60);
    const allText = lines.join('\n');
    expect(allText).toContain('success rate');
  });
});
