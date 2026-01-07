/**
 * nexus-agents/testing/framework - Metrics Collector Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsCollector, createMetricsCollector } from './metrics-collector.js';
import type { CliName, TokenUsage } from '../../cli-adapters/types.js';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  describe('constructor', () => {
    it('should create an empty collector', () => {
      expect(collector.getPendingCount()).toBe(0);
      expect(collector.getRawLatencyMeasurements()).toHaveLength(0);
    });
  });

  describe('startMeasurement', () => {
    it('should create a measurement handle', () => {
      const handle = collector.startMeasurement('task-1', 'claude');

      expect(handle).toBeDefined();
      expect(typeof handle.complete).toBe('function');
      expect(typeof handle.abort).toBe('function');
      expect(collector.getPendingCount()).toBe(1);
    });

    it('should throw when starting duplicate measurement', () => {
      collector.startMeasurement('task-1', 'claude');

      expect(() => collector.startMeasurement('task-1', 'claude')).toThrow(
        'Measurement already in progress for task task-1 on claude'
      );
    });

    it('should allow same taskId with different CLI', () => {
      collector.startMeasurement('task-1', 'claude');
      collector.startMeasurement('task-1', 'gemini');

      expect(collector.getPendingCount()).toBe(2);
    });

    it('should allow different taskIds with same CLI', () => {
      collector.startMeasurement('task-1', 'claude');
      collector.startMeasurement('task-2', 'claude');

      expect(collector.getPendingCount()).toBe(2);
    });
  });

  describe('MeasurementHandle.complete', () => {
    it('should record measurement on complete', () => {
      const handle = collector.startMeasurement('task-1', 'claude');

      handle.complete();

      expect(collector.getPendingCount()).toBe(0);
      const measurements = collector.getRawLatencyMeasurements();
      expect(measurements).toHaveLength(1);

      const first = measurements[0];
      expect(first).toBeDefined();
      if (first) {
        expect(first.taskId).toBe('task-1');
        expect(first.cli).toBe('claude');
        expect(first.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should throw when completing non-existent measurement', () => {
      const handle = collector.startMeasurement('task-1', 'claude');
      handle.complete();

      expect(() => {
        handle.complete();
      }).toThrow('No pending measurement for task task-1 on claude');
    });

    it('should record correct duration', async () => {
      const handle = collector.startMeasurement('task-1', 'claude');

      // Wait a small amount of time
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });

      handle.complete();

      const measurements = collector.getRawLatencyMeasurements();
      const first = measurements[0];
      expect(first).toBeDefined();
      if (first) {
        expect(first.durationMs).toBeGreaterThan(5);
      }
    });

    it('should use high-resolution timing', () => {
      const handle = collector.startMeasurement('task-1', 'claude');
      handle.complete();

      const measurement = collector.getRawLatencyMeasurements()[0];
      expect(measurement).toBeDefined();
      if (measurement) {
        expect(typeof measurement.startTime).toBe('bigint');
        expect(typeof measurement.endTime).toBe('bigint');
        expect(measurement.endTime).toBeGreaterThanOrEqual(measurement.startTime);
      }
    });
  });

  describe('MeasurementHandle.abort', () => {
    it('should remove pending measurement on abort', () => {
      const handle = collector.startMeasurement('task-1', 'claude');

      handle.abort('Test abort');

      expect(collector.getPendingCount()).toBe(0);
      expect(collector.getRawLatencyMeasurements()).toHaveLength(0);
    });

    it('should not throw when aborting non-existent measurement', () => {
      const handle = collector.startMeasurement('task-1', 'claude');
      handle.abort('First abort');

      // Second abort should not throw
      expect(() => {
        handle.abort('Second abort');
      }).not.toThrow();
    });
  });

  describe('recordTokenUsage', () => {
    it('should record token usage', () => {
      const usage: TokenUsage = {
        inputTokens: 100,
        outputTokens: 50,
      };

      collector.recordTokenUsage('task-1', 'claude', usage);

      const metrics = collector.calculateTokenMetrics();
      expect(metrics.totalInputTokens).toBe(100);
      expect(metrics.totalOutputTokens).toBe(50);
      expect(metrics.taskCount).toBe(1);
    });

    it('should accumulate multiple records', () => {
      collector.recordTokenUsage('task-1', 'claude', { inputTokens: 100, outputTokens: 50 });
      collector.recordTokenUsage('task-2', 'claude', { inputTokens: 200, outputTokens: 100 });

      const metrics = collector.calculateTokenMetrics();
      expect(metrics.totalInputTokens).toBe(300);
      expect(metrics.totalOutputTokens).toBe(150);
      expect(metrics.taskCount).toBe(2);
    });
  });

  describe('recordSuccess', () => {
    it('should record successful task', () => {
      collector.recordSuccess('task-1', 'claude');

      const metrics = collector.calculateReliabilityMetrics();
      expect(metrics.successCount).toBe(1);
      expect(metrics.failureCount).toBe(0);
      expect(metrics.successRate).toBe(1);
    });

    it('should accumulate multiple successes', () => {
      collector.recordSuccess('task-1', 'claude');
      collector.recordSuccess('task-2', 'gemini');

      const metrics = collector.calculateReliabilityMetrics();
      expect(metrics.successCount).toBe(2);
      expect(metrics.totalTasks).toBe(2);
    });
  });

  describe('recordFailure', () => {
    it('should record failed task', () => {
      collector.recordFailure('task-1', 'claude', 3);

      const metrics = collector.calculateReliabilityMetrics();
      expect(metrics.failureCount).toBe(1);
      expect(metrics.successCount).toBe(0);
      expect(metrics.totalRetries).toBe(3);
    });

    it('should track retry counts', () => {
      collector.recordFailure('task-1', 'claude', 2);
      collector.recordFailure('task-2', 'claude', 4);

      const metrics = collector.calculateReliabilityMetrics();
      expect(metrics.totalRetries).toBe(6);
      expect(metrics.meanRetriesPerFailure).toBe(3);
    });
  });

  describe('calculateLatencyMetrics', () => {
    it('should return empty metrics when no measurements', () => {
      const metrics = collector.calculateLatencyMetrics();

      expect(metrics.count).toBe(0);
      expect(metrics.minMs).toBe(0);
      expect(metrics.maxMs).toBe(0);
      expect(metrics.meanMs).toBe(0);
    });

    it('should calculate basic statistics', () => {
      // Simulate measurements with known durations
      addSimulatedMeasurements(collector, [10, 20, 30, 40, 50]);

      const metrics = collector.calculateLatencyMetrics();

      expect(metrics.count).toBe(5);
      expect(metrics.minMs).toBe(10);
      expect(metrics.maxMs).toBe(50);
      expect(metrics.meanMs).toBe(30);
    });

    it('should calculate percentiles correctly', () => {
      // Add measurements with predictable values
      addSimulatedMeasurements(collector, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

      const metrics = collector.calculateLatencyMetrics();

      expect(metrics.p50Ms).toBe(5.5);
      expect(metrics.p90Ms).toBe(9.1);
      expect(metrics.p99Ms).toBe(9.91);
    });

    it('should calculate standard deviation', () => {
      addSimulatedMeasurements(collector, [10, 10, 10, 10, 10]);

      const metrics = collector.calculateLatencyMetrics();

      // All same values should have 0 std dev
      expect(metrics.stdDevMs).toBe(0);
    });

    it('should handle single measurement', () => {
      addSimulatedMeasurements(collector, [42]);

      const metrics = collector.calculateLatencyMetrics();

      expect(metrics.count).toBe(1);
      expect(metrics.minMs).toBe(42);
      expect(metrics.maxMs).toBe(42);
      expect(metrics.meanMs).toBe(42);
      expect(metrics.p50Ms).toBe(42);
      expect(metrics.p99Ms).toBe(42);
    });
  });

  describe('calculateReliabilityMetrics', () => {
    it('should return empty metrics when no outcomes', () => {
      const metrics = collector.calculateReliabilityMetrics();

      expect(metrics.totalTasks).toBe(0);
      expect(metrics.successRate).toBe(0);
    });

    it('should calculate success rate', () => {
      collector.recordSuccess('task-1', 'claude');
      collector.recordSuccess('task-2', 'claude');
      collector.recordFailure('task-3', 'claude', 1);

      const metrics = collector.calculateReliabilityMetrics();

      expect(metrics.successRate).toBeCloseTo(0.667, 2);
    });

    it('should track first attempt success rate', () => {
      collector.recordSuccess('task-1', 'claude');
      collector.recordSuccess('task-2', 'claude');
      collector.recordFailure('task-3', 'claude', 2);
      collector.recordFailure('task-4', 'claude', 0);

      const metrics = collector.calculateReliabilityMetrics();

      expect(metrics.firstAttemptSuccessCount).toBe(2);
      expect(metrics.firstAttemptSuccessRate).toBe(0.5);
    });

    it('should handle all successes', () => {
      collector.recordSuccess('task-1', 'claude');
      collector.recordSuccess('task-2', 'claude');

      const metrics = collector.calculateReliabilityMetrics();

      expect(metrics.successRate).toBe(1);
      expect(metrics.failureCount).toBe(0);
      expect(metrics.meanRetriesPerFailure).toBe(0);
    });

    it('should handle all failures', () => {
      collector.recordFailure('task-1', 'claude', 3);
      collector.recordFailure('task-2', 'claude', 2);

      const metrics = collector.calculateReliabilityMetrics();

      expect(metrics.successRate).toBe(0);
      expect(metrics.successCount).toBe(0);
    });
  });

  describe('calculateTokenMetrics', () => {
    it('should return empty metrics when no records', () => {
      const metrics = collector.calculateTokenMetrics();

      expect(metrics.taskCount).toBe(0);
      expect(metrics.totalTokens).toBe(0);
    });

    it('should calculate totals', () => {
      collector.recordTokenUsage('task-1', 'claude', { inputTokens: 100, outputTokens: 50 });
      collector.recordTokenUsage('task-2', 'gemini', { inputTokens: 200, outputTokens: 100 });

      const metrics = collector.calculateTokenMetrics();

      expect(metrics.totalInputTokens).toBe(300);
      expect(metrics.totalOutputTokens).toBe(150);
      expect(metrics.totalTokens).toBe(450);
    });

    it('should calculate means', () => {
      collector.recordTokenUsage('task-1', 'claude', { inputTokens: 100, outputTokens: 50 });
      collector.recordTokenUsage('task-2', 'gemini', { inputTokens: 200, outputTokens: 150 });

      const metrics = collector.calculateTokenMetrics();

      expect(metrics.meanInputTokens).toBe(150);
      expect(metrics.meanOutputTokens).toBe(100);
    });
  });

  describe('getAggregateMetrics', () => {
    it('should return complete aggregate metrics', () => {
      addSimulatedMeasurements(collector, [10, 20], 'claude');
      addSimulatedMeasurements(collector, [30, 40], 'gemini');
      collector.recordSuccess('task-1', 'claude');
      collector.recordFailure('task-2', 'gemini', 1);
      collector.recordTokenUsage('task-1', 'claude', { inputTokens: 100, outputTokens: 50 });

      const metrics = collector.getAggregateMetrics();

      expect(metrics.latency.count).toBe(4);
      expect(metrics.reliability.totalTasks).toBe(2);
      expect(metrics.tokens.taskCount).toBe(1);
      expect(metrics.timestamp).toBeInstanceOf(Date);
    });

    it('should include per-CLI breakdowns', () => {
      addSimulatedMeasurements(collector, [10, 20], 'claude');
      addSimulatedMeasurements(collector, [30, 40], 'gemini');

      const metrics = collector.getAggregateMetrics();

      expect(metrics.latencyByCli.claude).not.toBeNull();
      expect(metrics.latencyByCli.claude?.count).toBe(2);
      expect(metrics.latencyByCli.gemini).not.toBeNull();
      expect(metrics.latencyByCli.gemini?.count).toBe(2);
      expect(metrics.latencyByCli.codex).toBeNull();
    });

    it('should have null for CLIs with no data', () => {
      addSimulatedMeasurements(collector, [10], 'claude');

      const metrics = collector.getAggregateMetrics();

      expect(metrics.latencyByCli.claude).not.toBeNull();
      expect(metrics.latencyByCli.gemini).toBeNull();
      expect(metrics.latencyByCli.codex).toBeNull();
    });
  });

  describe('per-CLI breakdowns', () => {
    it('should separate latency by CLI', () => {
      addSimulatedMeasurements(collector, [100, 200], 'claude');
      addSimulatedMeasurements(collector, [10, 20], 'gemini');

      const metrics = collector.getAggregateMetrics();

      expect(metrics.latencyByCli.claude?.meanMs).toBe(150);
      expect(metrics.latencyByCli.gemini?.meanMs).toBe(15);
    });

    it('should separate reliability by CLI', () => {
      collector.recordSuccess('task-1', 'claude');
      collector.recordSuccess('task-2', 'claude');
      collector.recordFailure('task-3', 'gemini', 1);

      const metrics = collector.getAggregateMetrics();

      expect(metrics.reliabilityByCli.claude?.successRate).toBe(1);
      expect(metrics.reliabilityByCli.gemini?.successRate).toBe(0);
    });

    it('should separate tokens by CLI', () => {
      collector.recordTokenUsage('task-1', 'claude', { inputTokens: 100, outputTokens: 50 });
      collector.recordTokenUsage('task-2', 'gemini', { inputTokens: 500, outputTokens: 200 });

      const metrics = collector.getAggregateMetrics();

      expect(metrics.tokensByCli.claude?.totalInputTokens).toBe(100);
      expect(metrics.tokensByCli.gemini?.totalInputTokens).toBe(500);
    });
  });

  describe('reset', () => {
    it('should clear all measurements', () => {
      addSimulatedMeasurements(collector, [10, 20]);
      collector.recordSuccess('task-1', 'claude');
      collector.recordTokenUsage('task-1', 'claude', { inputTokens: 100, outputTokens: 50 });
      collector.startMeasurement('pending-task', 'claude');

      collector.reset();

      expect(collector.getRawLatencyMeasurements()).toHaveLength(0);
      expect(collector.calculateLatencyMetrics().count).toBe(0);
      expect(collector.calculateReliabilityMetrics().totalTasks).toBe(0);
      expect(collector.calculateTokenMetrics().taskCount).toBe(0);
      expect(collector.getPendingCount()).toBe(0);
    });
  });

  describe('percentile calculations', () => {
    it('should interpolate between values', () => {
      addSimulatedMeasurements(collector, [0, 10]);

      const metrics = collector.calculateLatencyMetrics();

      expect(metrics.p50Ms).toBe(5);
    });

    it('should handle edge percentiles', () => {
      addSimulatedMeasurements(collector, [1, 2, 3, 4, 5]);

      const metrics = collector.calculateLatencyMetrics();

      // p0 would be 1, p100 would be 5
      expect(metrics.minMs).toBe(1);
      expect(metrics.maxMs).toBe(5);
    });

    it('should handle unsorted input', () => {
      // Internal implementation sorts, so verify correctness
      addSimulatedMeasurements(collector, [50, 10, 30, 40, 20]);

      const metrics = collector.calculateLatencyMetrics();

      expect(metrics.minMs).toBe(10);
      expect(metrics.maxMs).toBe(50);
      expect(metrics.p50Ms).toBe(30);
    });
  });

  describe('createMetricsCollector', () => {
    it('should create a new collector instance', () => {
      const newCollector = createMetricsCollector();

      expect(newCollector).toBeInstanceOf(MetricsCollector);
      expect(newCollector.getPendingCount()).toBe(0);
    });
  });

  describe('concurrent measurements', () => {
    it('should handle multiple concurrent measurements', () => {
      const handle1 = collector.startMeasurement('task-1', 'claude');
      const handle2 = collector.startMeasurement('task-2', 'gemini');
      const handle3 = collector.startMeasurement('task-3', 'codex');

      expect(collector.getPendingCount()).toBe(3);

      handle2.complete();
      expect(collector.getPendingCount()).toBe(2);

      handle1.abort('cancelled');
      expect(collector.getPendingCount()).toBe(1);

      handle3.complete();
      expect(collector.getPendingCount()).toBe(0);

      // Only 2 completed (1 aborted)
      expect(collector.getRawLatencyMeasurements()).toHaveLength(2);
    });
  });

  describe('edge cases', () => {
    it('should handle zero token counts', () => {
      collector.recordTokenUsage('task-1', 'claude', { inputTokens: 0, outputTokens: 0 });

      const metrics = collector.calculateTokenMetrics();

      expect(metrics.totalTokens).toBe(0);
      expect(metrics.meanInputTokens).toBe(0);
    });

    it('should handle large numbers', () => {
      collector.recordTokenUsage('task-1', 'claude', {
        inputTokens: 1_000_000,
        outputTokens: 500_000,
      });

      const metrics = collector.calculateTokenMetrics();

      expect(metrics.totalTokens).toBe(1_500_000);
    });

    it('should handle rapid measurements', () => {
      for (let i = 0; i < 100; i++) {
        const handle = collector.startMeasurement(`task-${String(i)}`, 'claude');
        handle.complete();
      }

      expect(collector.getRawLatencyMeasurements()).toHaveLength(100);
    });
  });
});

/**
 * Helper function to add simulated measurements with known durations.
 * Bypasses the actual timing by directly manipulating internal state.
 */
function addSimulatedMeasurements(
  collector: MetricsCollector,
  durationsMs: number[],
  cli: CliName = 'claude'
): void {
  // Access private array through type assertion
  const measurements = (collector as unknown as { latencyMeasurements: unknown[] })
    .latencyMeasurements;

  for (let i = 0; i < durationsMs.length; i++) {
    const duration = durationsMs[i];
    if (duration === undefined) continue;

    const startTime = BigInt(i * 1_000_000_000); // Use index as base
    const endTime = startTime + BigInt(duration * 1_000_000); // Add duration in ns

    measurements.push({
      taskId: `simulated-${String(i)}`,
      cli,
      startTime,
      endTime,
      durationMs: duration,
    });
  }
}
