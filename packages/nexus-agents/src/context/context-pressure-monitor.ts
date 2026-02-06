/**
 * nexus-agents/context - Context Pressure Monitor
 *
 * Tracks cumulative token usage across waves and emits warnings at
 * configurable thresholds. At critical level, signals auto-checkpoint.
 *
 * (Source: Context Exhaustion Prevention - Issue #769 follow-up)
 *
 * @module context/context-pressure-monitor
 */

import { createLogger } from '../core/logger.js';
import type {
  ContextPressureConfig,
  PressureLevel,
  PressureEvent,
  PressureStats,
} from './context-pressure-types.js';
import { DEFAULT_PRESSURE_CONFIG } from './context-pressure-types.js';

const logger = createLogger({ component: 'context-pressure' });

/** Ordered pressure levels from lowest to highest. */
const LEVEL_ORDER: PressureLevel[] = ['normal', 'info', 'warning', 'critical'];

// ============================================================================
// Level Calculation
// ============================================================================

/**
 * Map a utilization ratio (0-1) to a pressure level.
 */
export function calculateLevel(utilization: number, config: ContextPressureConfig): PressureLevel {
  if (utilization >= config.criticalThreshold) return 'critical';
  if (utilization >= config.warnThreshold) return 'warning';
  if (utilization >= config.infoThreshold) return 'info';
  return 'normal';
}

/**
 * Return a human-readable recommended action for a pressure level.
 */
export function getRecommendedAction(level: PressureLevel): string {
  switch (level) {
    case 'critical':
      return 'Auto-checkpoint triggered. Reduce scope or start a new session.';
    case 'warning':
      return 'Approaching context limit. Summarize results and limit remaining waves.';
    case 'info':
      return 'Context usage moderate. Monitor token consumption in upcoming waves.';
    case 'normal':
      return 'Context usage within safe bounds.';
  }
}

/**
 * Determine whether the monitor should trigger an auto-checkpoint.
 */
export function shouldAutoCheckpoint(stats: PressureStats, config: ContextPressureConfig): boolean {
  return stats.utilization >= config.criticalThreshold;
}

// ============================================================================
// Monitor API
// ============================================================================

/** The context pressure monitor API returned by the factory. */
export interface ContextPressureMonitor {
  /** Record token usage and check for threshold crossings. */
  readonly recordUsage: (tokens: number) => PressureEvent | null;
  /** Get current pressure statistics. */
  readonly getStats: () => PressureStats;
  /** Reset accumulated usage (e.g., for a new session). */
  readonly reset: () => void;
}

/**
 * Build a pressure event if the level has escalated, otherwise return null.
 */
function buildEscalationEvent(
  prevLevel: PressureLevel,
  currentLevel: PressureLevel,
  tokensUsed: number,
  maxTokens: number,
  utilization: number
): PressureEvent | null {
  if (currentLevel === prevLevel || currentLevel === 'normal') return null;

  const prevIdx = LEVEL_ORDER.indexOf(prevLevel);
  const currIdx = LEVEL_ORDER.indexOf(currentLevel);
  if (currIdx <= prevIdx) return null;

  const utilizationPct = Math.round(utilization * 100);

  logger.warn('Context pressure threshold crossed', {
    level: currentLevel,
    tokensUsed,
    maxTokens,
    utilizationPct,
  });

  return {
    level: currentLevel,
    tokensUsed,
    maxTokens,
    utilizationPct,
    recommendedAction: getRecommendedAction(currentLevel),
  };
}

/**
 * Create a context pressure monitor with the given configuration.
 *
 * The monitor accumulates token usage and emits pressure events
 * when utilization crosses threshold boundaries. Events are only
 * emitted on level transitions (not on every call).
 */
export function createContextPressureMonitor(
  config?: Partial<ContextPressureConfig>
): ContextPressureMonitor {
  const cfg: ContextPressureConfig = { ...DEFAULT_PRESSURE_CONFIG, ...config };
  let tokensUsed = 0;
  let previousLevel: PressureLevel = 'normal';

  function getUtilization(): number {
    if (cfg.maxContextTokens <= 0) return 0;
    return Math.min(tokensUsed / cfg.maxContextTokens, 1);
  }

  return {
    recordUsage(tokens: number): PressureEvent | null {
      tokensUsed += tokens;
      const utilization = getUtilization();
      const currentLevel = calculateLevel(utilization, cfg);
      const event = buildEscalationEvent(
        previousLevel,
        currentLevel,
        tokensUsed,
        cfg.maxContextTokens,
        utilization
      );
      previousLevel = currentLevel;
      return event;
    },

    getStats(): PressureStats {
      const utilization = getUtilization();
      return {
        tokensUsed,
        maxTokens: cfg.maxContextTokens,
        utilization,
        level: calculateLevel(utilization, cfg),
      };
    },

    reset(): void {
      tokensUsed = 0;
      previousLevel = 'normal';
    },
  };
}
