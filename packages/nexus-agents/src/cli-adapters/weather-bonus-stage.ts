/**
 * Weather Report Bonus Stage — converts adaptive bonuses into routing scores.
 *
 * Closes Gap 1 from Issue #1389: weather report recommendations now feed
 * back into the routing pipeline as stage score adjustments.
 *
 * @module cli-adapters/weather-bonus-stage
 * (Source: Issue #1389, Epic: close feedback loops)
 */

import type { CliName } from './types.js';
import type { TaskCategory } from '../config/task-specialization-types.js';
import { generateWeatherReport } from '../mcp/tools/weather-report.js';
import type { AdaptiveBonus } from '../mcp/tools/weather-report-types.js';
import { createLogger } from '../core/index.js';

const logger = createLogger({ component: 'weather-bonus-stage' });

/** Minimum sample count before a bonus is considered reliable. */
const MIN_SAMPLE_COUNT = 5;

/**
 * A weather-bonus read, and whether it actually happened (#5329).
 *
 * `measured: false` means the read FAILED — distinct from a successful read
 * that found no qualifying bonuses, which also yields an empty map. Collapsing
 * the two let the router rank on "no adjustment" when the truth was "no
 * reading", with nothing in the decision record able to tell them apart.
 *
 * Mirrors the vocabulary `routing/stages/capacity-stage.ts` already uses:
 * "absence of a reading is not a reading."
 */
export interface WeatherBonusRead {
  readonly scores: Map<CliName, number>;
  readonly measured: boolean;
}

/**
 * Convert weather report adaptive bonuses for a task category
 * into a routing stage score map.
 *
 * Returns a Map<CliName, number> suitable for merging with other stage scores.
 * Best-effort: returns empty map on any error.
 *
 * @param taskCategory - The detected task category
 * @returns Score map with adaptive bonus per CLI
 */
export function getWeatherBonusScores(taskCategory: TaskCategory): WeatherBonusRead {
  try {
    const report = generateWeatherReport({ includeAdaptive: true });
    return {
      scores: convertBonusesToScoreMap(report.adaptiveBonuses, taskCategory),
      measured: true,
    };
  } catch (error: unknown) {
    // `warn`, not the previous bare `catch` at `debug` (#5329): an empty score
    // map is also what a healthy report with no qualifying bonuses returns, so
    // at debug the two were indistinguishable to an operator AND to the router.
    logger.warn('Weather bonus read failed; routing proceeds without it', {
      category: taskCategory,
      error: error instanceof Error ? error.message : String(error),
    });
    return { scores: new Map(), measured: false };
  }
}

/**
 * Pure function: convert adaptive bonuses into a CLI score map.
 * Exported for testing.
 */
export function convertBonusesToScoreMap(
  bonuses: readonly AdaptiveBonus[],
  taskCategory: TaskCategory
): Map<CliName, number> {
  const scores = new Map<CliName, number>();
  for (const bonus of bonuses) {
    if (bonus.category !== taskCategory) continue;
    if (bonus.sampleCount < MIN_SAMPLE_COUNT) continue;
    if (bonus.adaptiveBonus === 0) continue;
    scores.set(bonus.cli as CliName, bonus.adaptiveBonus);
  }
  if (scores.size > 0) {
    logger.debug('Weather bonus scores applied', {
      category: taskCategory,
      clis: [...scores.keys()],
    });
  }
  return scores;
}
