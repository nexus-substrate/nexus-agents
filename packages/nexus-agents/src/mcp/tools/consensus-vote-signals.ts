/**
 * Consensus → pipeline-bus signal emitter (#3147, epic #3143 P2).
 *
 * Emits the `signal.vote_rejected` observability signal onto the typed pipeline
 * event bus when a consensus vote resolves to `rejected`, closing the
 * self-tuning loop (the shadow TuneStage consumes it). Lives at the MCP
 * integration layer ON PURPOSE: the pure `ConsensusEngine` stays decoupled from
 * the pipeline bus, preserving the `A = observability / B = messaging` boundary
 * adopted for #3289 (scope Option 2 — observability signals route through bus A,
 * the collaboration messaging bus is untouched).
 *
 * @module mcp/tools/consensus-vote-signals
 */

import { getErrorMessage, getTimeProvider } from '../../core/index.js';
import type { ILogger } from '../../core/index.js';
import type { ConsensusResult } from '../../consensus/types.js';
import type { IEventBus } from '../../pipeline/event-types.js';

/** Distinct rejection categories across the reject votes, or undefined if none. */
function rejectionRulesFrom(result: ConsensusResult): readonly string[] | undefined {
  const rules = new Set<string>();
  for (const vote of result.votes.values()) {
    if (vote.decision === 'reject' && vote.rejectionCategories !== undefined) {
      for (const category of vote.rejectionCategories) rules.add(category);
    }
  }
  return rules.size > 0 ? [...rules] : undefined;
}

/**
 * Emit `signal.vote_rejected` onto `bus` when `result.outcome === 'rejected'`.
 * No-op for any other outcome. Emission errors are swallowed and logged —
 * observability signalling must never break the vote path.
 */
export function emitVoteRejectedSignal(
  result: ConsensusResult,
  bus: IEventBus,
  logger: ILogger
): void {
  if (result.outcome !== 'rejected') return;
  try {
    const rejectionRules = rejectionRulesFrom(result);
    bus.emit({
      type: 'signal.vote_rejected',
      timestamp: getTimeProvider().now(),
      proposalId: result.proposalId,
      approvalPercentage: result.approvalPercentage,
      ...(rejectionRules !== undefined ? { rejectionRules } : {}),
    });
  } catch (error) {
    logger.warn('Failed to emit signal.vote_rejected', { error: getErrorMessage(error) });
  }
}
