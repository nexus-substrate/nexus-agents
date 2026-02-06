/**
 * Tests for Context Pressure Monitor.
 *
 * (Source: Context Exhaustion Prevention - Issue #769 follow-up)
 */

import { describe, it, expect } from 'vitest';
import {
  createContextPressureMonitor,
  calculateLevel,
  getRecommendedAction,
  shouldAutoCheckpoint,
} from './context-pressure-monitor.js';
import { DEFAULT_PRESSURE_CONFIG } from './context-pressure-types.js';
import type { PressureStats } from './context-pressure-types.js';

// ============================================================================
// calculateLevel
// ============================================================================

describe('calculateLevel', () => {
  const config = DEFAULT_PRESSURE_CONFIG;

  it('should return normal for low utilization', () => {
    expect(calculateLevel(0, config)).toBe('normal');
    expect(calculateLevel(0.3, config)).toBe('normal');
    expect(calculateLevel(0.59, config)).toBe('normal');
  });

  it('should return info at info threshold', () => {
    expect(calculateLevel(0.6, config)).toBe('info');
    expect(calculateLevel(0.65, config)).toBe('info');
    expect(calculateLevel(0.74, config)).toBe('info');
  });

  it('should return warning at warn threshold', () => {
    expect(calculateLevel(0.75, config)).toBe('warning');
    expect(calculateLevel(0.8, config)).toBe('warning');
    expect(calculateLevel(0.84, config)).toBe('warning');
  });

  it('should return critical at critical threshold', () => {
    expect(calculateLevel(0.85, config)).toBe('critical');
    expect(calculateLevel(0.95, config)).toBe('critical');
    expect(calculateLevel(1.0, config)).toBe('critical');
  });
});

// ============================================================================
// getRecommendedAction
// ============================================================================

describe('getRecommendedAction', () => {
  it('should return appropriate messages for each level', () => {
    expect(getRecommendedAction('normal')).toContain('safe bounds');
    expect(getRecommendedAction('info')).toContain('Monitor');
    expect(getRecommendedAction('warning')).toContain('Approaching');
    expect(getRecommendedAction('critical')).toContain('Auto-checkpoint');
  });
});

// ============================================================================
// shouldAutoCheckpoint
// ============================================================================

describe('shouldAutoCheckpoint', () => {
  const config = DEFAULT_PRESSURE_CONFIG;

  it('should return false below critical', () => {
    const stats: PressureStats = {
      tokensUsed: 70000,
      maxTokens: 95000,
      utilization: 0.74,
      level: 'warning',
    };
    expect(shouldAutoCheckpoint(stats, config)).toBe(false);
  });

  it('should return true at critical', () => {
    const stats: PressureStats = {
      tokensUsed: 85000,
      maxTokens: 95000,
      utilization: 0.89,
      level: 'critical',
    };
    expect(shouldAutoCheckpoint(stats, config)).toBe(true);
  });

  it('should return true at exactly critical threshold', () => {
    const stats: PressureStats = {
      tokensUsed: 80750,
      maxTokens: 95000,
      utilization: 0.85,
      level: 'critical',
    };
    expect(shouldAutoCheckpoint(stats, config)).toBe(true);
  });
});

// ============================================================================
// createContextPressureMonitor
// ============================================================================

describe('createContextPressureMonitor', () => {
  it('should start with zero usage', () => {
    const monitor = createContextPressureMonitor();
    const stats = monitor.getStats();
    expect(stats.tokensUsed).toBe(0);
    expect(stats.utilization).toBe(0);
    expect(stats.level).toBe('normal');
  });

  it('should accumulate token usage', () => {
    const monitor = createContextPressureMonitor({ maxContextTokens: 100 });
    monitor.recordUsage(30);
    monitor.recordUsage(20);
    const stats = monitor.getStats();
    expect(stats.tokensUsed).toBe(50);
    expect(stats.utilization).toBeCloseTo(0.5);
  });

  it('should emit event when crossing info threshold', () => {
    const monitor = createContextPressureMonitor({ maxContextTokens: 100 });
    // Below info (60%)
    const noEvent = monitor.recordUsage(50);
    expect(noEvent).toBeNull();

    // Cross info threshold
    const event = monitor.recordUsage(15);
    expect(event).not.toBeNull();
    expect(event!.level).toBe('info');
    expect(event!.utilizationPct).toBe(65);
  });

  it('should emit event when crossing warning threshold', () => {
    const monitor = createContextPressureMonitor({ maxContextTokens: 100 });
    monitor.recordUsage(60); // info
    monitor.recordUsage(16); // cross warning at 76%
    const event = monitor.recordUsage(0); // no new tokens, no event
    // The warning event was emitted on the previous recordUsage
    expect(event).toBeNull();

    // Verify stats show warning
    const stats = monitor.getStats();
    expect(stats.level).toBe('warning');
  });

  it('should not emit duplicate events at same level', () => {
    const monitor = createContextPressureMonitor({ maxContextTokens: 100 });
    const event1 = monitor.recordUsage(65); // crosses info
    expect(event1).not.toBeNull();

    // Still in info range, no new event
    const event2 = monitor.recordUsage(5);
    expect(event2).toBeNull();
  });

  it('should emit critical event', () => {
    const monitor = createContextPressureMonitor({ maxContextTokens: 100 });
    monitor.recordUsage(60); // info event
    monitor.recordUsage(16); // warning event
    const critical = monitor.recordUsage(14); // 90% — critical
    expect(critical).not.toBeNull();
    expect(critical!.level).toBe('critical');
    expect(critical!.recommendedAction).toContain('Auto-checkpoint');
  });

  it('should cap utilization at 1.0 when exceeding max', () => {
    const monitor = createContextPressureMonitor({ maxContextTokens: 100 });
    monitor.recordUsage(150);
    const stats = monitor.getStats();
    expect(stats.utilization).toBe(1);
    expect(stats.level).toBe('critical');
  });

  it('should handle zero maxContextTokens', () => {
    const monitor = createContextPressureMonitor({ maxContextTokens: 0 });
    monitor.recordUsage(5000);
    const stats = monitor.getStats();
    expect(stats.utilization).toBe(0);
    expect(stats.level).toBe('normal');
  });

  it('should reset accumulated state', () => {
    const monitor = createContextPressureMonitor({ maxContextTokens: 100 });
    monitor.recordUsage(80);
    expect(monitor.getStats().tokensUsed).toBe(80);

    monitor.reset();
    expect(monitor.getStats().tokensUsed).toBe(0);
    expect(monitor.getStats().level).toBe('normal');
  });

  it('should emit events again after reset', () => {
    const monitor = createContextPressureMonitor({ maxContextTokens: 100 });
    const first = monitor.recordUsage(65); // info
    expect(first).not.toBeNull();

    monitor.reset();
    const afterReset = monitor.recordUsage(65); // info again
    expect(afterReset).not.toBeNull();
    expect(afterReset!.level).toBe('info');
  });

  it('should accept custom thresholds', () => {
    const monitor = createContextPressureMonitor({
      maxContextTokens: 100,
      infoThreshold: 0.3,
      warnThreshold: 0.5,
      criticalThreshold: 0.7,
    });

    const info = monitor.recordUsage(35);
    expect(info).not.toBeNull();
    expect(info!.level).toBe('info');

    const warn = monitor.recordUsage(20);
    expect(warn).not.toBeNull();
    expect(warn!.level).toBe('warning');

    const critical = monitor.recordUsage(20);
    expect(critical).not.toBeNull();
    expect(critical!.level).toBe('critical');
  });

  it('should emit critical when skipping intermediate levels', () => {
    const monitor = createContextPressureMonitor({ maxContextTokens: 100 });
    // Jump from normal straight to critical in one call (90%)
    const event = monitor.recordUsage(90);
    expect(event).not.toBeNull();
    expect(event!.level).toBe('critical');
    expect(event!.utilizationPct).toBe(90);
  });

  it('should handle negative token input without crashing', () => {
    const monitor = createContextPressureMonitor({ maxContextTokens: 100 });
    monitor.recordUsage(50);
    // Negative tokens reduce accumulation
    monitor.recordUsage(-10);
    const stats = monitor.getStats();
    expect(stats.tokensUsed).toBe(40);
    expect(stats.utilization).toBeCloseTo(0.4);
  });

  it('should not emit events on zero-token recordUsage', () => {
    const monitor = createContextPressureMonitor({ maxContextTokens: 100 });
    const event = monitor.recordUsage(0);
    expect(event).toBeNull();
    expect(monitor.getStats().tokensUsed).toBe(0);
  });

  it('should handle negative maxContextTokens as zero-capacity', () => {
    const monitor = createContextPressureMonitor({ maxContextTokens: -100 });
    monitor.recordUsage(5000);
    const stats = monitor.getStats();
    // Negative maxContextTokens treated same as zero (getUtilization returns 0)
    expect(stats.utilization).toBe(0);
    expect(stats.level).toBe('normal');
  });

  it('should return correct utilizationPct in event', () => {
    const monitor = createContextPressureMonitor({ maxContextTokens: 1000 });
    const event = monitor.recordUsage(860); // 86% → critical
    expect(event).not.toBeNull();
    expect(event!.utilizationPct).toBe(86);
    expect(event!.tokensUsed).toBe(860);
    expect(event!.maxTokens).toBe(1000);
  });
});
