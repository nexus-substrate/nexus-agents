/**
 * nexus-agents/agents - Wave Pressure Integration
 *
 * Connects the context pressure monitor to the wave scheduler via
 * the onWaveComplete callback. This gives the scheduler context-aware
 * abort signals without modifying the scheduler internals.
 *
 * (Source: Issue #800 - Context Exhaustion Prevention wiring)
 *
 * @module agents/wave-pressure-integration
 */

import type { WaveSchedulerConfig, WaveTaskResult } from './wave-scheduler-types.js';
import { DEFAULT_WAVE_CONFIG } from './wave-scheduler-types.js';
import type { ContextPressureMonitor } from '../context/context-pressure-monitor.js';
import { createContextPressureMonitor } from '../context/context-pressure-monitor.js';
import type { ContextPressureConfig, PressureEvent } from '../context/context-pressure-types.js';
import { createLogger } from '../core/logger.js';

const logger = createLogger({ component: 'wave-pressure' });

/**
 * Configuration for pressure-aware wave scheduling.
 */
export interface PressureAwareConfig {
  /** Wave scheduler config overrides. */
  readonly scheduler?: Partial<WaveSchedulerConfig>;
  /** Context pressure config overrides. */
  readonly pressure?: Partial<ContextPressureConfig>;
  /** Callback when pressure event fires. */
  readonly onPressureEvent?: (event: PressureEvent) => void;
  /** Whether to abort at critical pressure. Default: true. */
  readonly abortOnCritical?: boolean;
}

/**
 * Build a wave scheduler config with context pressure monitoring wired
 * into the onWaveComplete callback.
 *
 * The returned config tracks cumulative token usage across waves and
 * aborts execution when context pressure reaches critical level.
 *
 * @example
 * ```typescript
 * const config = buildPressureAwareConfig({
 *   scheduler: { maxConcurrency: 3 },
 *   pressure: { maxContextTokens: 80_000 },
 * });
 * const scheduler = createWaveScheduler(config.schedulerConfig);
 * const result = await scheduler.execute(tasks, executor);
 * console.log(config.monitor.getStats()); // Check final pressure
 * ```
 */
export function buildPressureAwareConfig(options: PressureAwareConfig = {}): {
  schedulerConfig: WaveSchedulerConfig;
  monitor: ContextPressureMonitor;
} {
  const monitor = createContextPressureMonitor(options.pressure);
  const abortOnCritical = options.abortOnCritical ?? true;
  const userOnWaveComplete = options.scheduler?.onWaveComplete;

  const onWaveComplete = async (
    waveIndex: number,
    results: readonly WaveTaskResult[],
    cumulativeTokens: number
  ): Promise<void> => {
    // Record total tokens from this wave
    const waveTokens = results.reduce((sum, r) => sum + r.estimatedTokens, 0);
    const event = monitor.recordUsage(waveTokens);

    if (event !== null) {
      logger.warn('Context pressure event during wave execution', {
        waveIndex,
        level: event.level,
        utilizationPct: event.utilizationPct,
        action: event.recommendedAction,
      });
      options.onPressureEvent?.(event);

      if (abortOnCritical && event.level === 'critical') {
        throw new Error(
          `Context pressure critical (${String(event.utilizationPct)}% used). ${event.recommendedAction}`
        );
      }
    }

    // Chain to user's onWaveComplete if provided
    if (userOnWaveComplete !== undefined) {
      await userOnWaveComplete(waveIndex, results, cumulativeTokens);
    }
  };

  const schedulerConfig: WaveSchedulerConfig = {
    ...DEFAULT_WAVE_CONFIG,
    ...options.scheduler,
    onWaveComplete,
  };

  return { schedulerConfig, monitor };
}
