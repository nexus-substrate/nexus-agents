/**
 * improvement_review → pipeline-bus signal emitter (#3147, epic #3143 P2).
 *
 * Emits `signal.fitness_declined` onto the typed pipeline event bus when the
 * fitness audit score falls below the governance floor. Runs in the
 * `improvement_review` MCP tool (server context), so the live shadow TuneStage
 * consumes it. Lives at the MCP layer to keep `governance/fitness-score`
 * decoupled from the pipeline bus, preserving the `A = observability /
 * B = messaging` boundary adopted for #3289 (scope Option 2).
 *
 * @module mcp/tools/improvement-review-signals
 */

import { getErrorMessage, getTimeProvider } from '../../core/index.js';
import type { ILogger } from '../../core/index.js';
import type { FitnessAudit } from '../../governance/fitness-score.js';
import type { IEventBus } from '../../pipeline/event-types.js';

/** The dimension of the finding that deducted the most points, if any. */
function worstDimension(audit: FitnessAudit): string | undefined {
  let worst: { dimension: string; pointsDeducted: number } | undefined;
  for (const finding of audit.findings) {
    if (worst === undefined || finding.pointsDeducted > worst.pointsDeducted) {
      worst = { dimension: finding.dimension, pointsDeducted: finding.pointsDeducted };
    }
  }
  return worst?.dimension;
}

/**
 * Emit `signal.fitness_declined` onto `bus` when `audit.score < fitnessFloor`.
 * No-op at or above floor. Emission errors are swallowed and logged — signalling
 * must never break the improvement-review path.
 */
export function emitFitnessDeclinedSignal(
  audit: FitnessAudit,
  fitnessFloor: number,
  bus: IEventBus,
  logger: ILogger
): void {
  if (audit.score >= fitnessFloor) return;
  try {
    const dimension = worstDimension(audit);
    bus.emit({
      type: 'signal.fitness_declined',
      timestamp: getTimeProvider().now(),
      score: audit.score,
      floor: fitnessFloor,
      ...(dimension !== undefined ? { dimension } : {}),
    });
  } catch (error) {
    logger.warn('Failed to emit signal.fitness_declined', { error: getErrorMessage(error) });
  }
}
