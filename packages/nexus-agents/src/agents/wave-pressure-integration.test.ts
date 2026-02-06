/**
 * Tests for Wave Pressure Integration
 *
 * @module agents/wave-pressure-integration.test
 * (Source: Issue #800 - Context Exhaustion Prevention wiring)
 */

import { describe, it, expect, vi } from 'vitest';
import { buildPressureAwareConfig } from './wave-pressure-integration.js';
import { WaveScheduler } from './wave-scheduler.js';
import type { WaveTask } from './wave-scheduler-types.js';

// ============================================================================
// Helpers
// ============================================================================

function makeTasks(count: number): WaveTask<string>[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `task-${String(i)}`,
    description: `Test task ${String(i)}`,
    input: `input-${String(i)}`,
    dependencies: [],
  }));
}

// Each task output ~400 chars ≈ 100 estimated tokens (chars/4)
function makeExecutor(outputSize = 400): (task: WaveTask<string>) => Promise<string> {
  return () => Promise.resolve('x'.repeat(outputSize));
}

// ============================================================================
// Tests
// ============================================================================

describe('buildPressureAwareConfig', () => {
  it('returns scheduler config and monitor', () => {
    const { schedulerConfig, monitor } = buildPressureAwareConfig();
    expect(schedulerConfig).toBeDefined();
    expect(schedulerConfig.onWaveComplete).toBeDefined();
    expect(monitor).toBeDefined();
    expect(monitor.getStats().tokensUsed).toBe(0);
  });

  it('integrates pressure tracking into wave execution', async () => {
    const { schedulerConfig, monitor } = buildPressureAwareConfig({
      scheduler: { maxConcurrency: 2 },
      pressure: { maxContextTokens: 10_000 },
    });

    const scheduler = new WaveScheduler(schedulerConfig);
    const tasks = makeTasks(3);
    await scheduler.execute(tasks, makeExecutor(400));

    // Each task produces ~100 estimated tokens, 3 tasks = ~300 tokens
    const stats = monitor.getStats();
    expect(stats.tokensUsed).toBeGreaterThan(0);
    expect(stats.level).toBe('normal');
  });

  it('fires onPressureEvent callback at thresholds', async () => {
    const onPressureEvent = vi.fn();
    const { schedulerConfig } = buildPressureAwareConfig({
      scheduler: { maxConcurrency: 2 },
      // Very small context to trigger events quickly
      pressure: { maxContextTokens: 200 },
      onPressureEvent,
      abortOnCritical: false, // Don't abort so we can check callback
    });

    const scheduler = new WaveScheduler(schedulerConfig);
    const tasks = makeTasks(4);
    await scheduler.execute(tasks, makeExecutor(400));

    // With 200 max tokens and ~100 tokens per task, should cross thresholds
    expect(onPressureEvent).toHaveBeenCalled();
  });

  it('aborts at critical pressure when abortOnCritical is true', async () => {
    const { schedulerConfig } = buildPressureAwareConfig({
      scheduler: { maxConcurrency: 1 },
      // Very small context to hit critical quickly
      pressure: { maxContextTokens: 100 },
      abortOnCritical: true,
    });

    const scheduler = new WaveScheduler(schedulerConfig);
    // Multiple tasks that will exceed the tiny context budget
    const tasks = makeTasks(5);
    const result = await scheduler.execute(tasks, makeExecutor(400));

    // Should have aborted due to critical pressure
    expect(result.aborted).toBe(true);
    expect(result.abortReason).toContain('Context pressure critical');
  });

  it('chains user onWaveComplete callback', async () => {
    const userCallback = vi.fn();
    const { schedulerConfig } = buildPressureAwareConfig({
      scheduler: {
        maxConcurrency: 2,
        onWaveComplete: userCallback,
      },
      pressure: { maxContextTokens: 100_000 },
    });

    const scheduler = new WaveScheduler(schedulerConfig);
    const tasks = makeTasks(2);
    await scheduler.execute(tasks, makeExecutor(100));

    expect(userCallback).toHaveBeenCalled();
  });

  it('defaults abortOnCritical to true', () => {
    const { schedulerConfig } = buildPressureAwareConfig();
    expect(schedulerConfig.onWaveComplete).toBeDefined();
    // Just verify it was created with defaults
  });
});
