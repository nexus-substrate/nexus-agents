/**
 * Error-policy handling for consensus_vote (#2630).
 *
 * When a voter errors or times out (`source === 'error'`), the response
 * shape already distinguishes it via `voteCounts.error` (see
 * consensus-vote-types.ts:188). What was missing: a configurable
 * decision policy for how those error voters interact with the strategy
 * threshold, plus a safety floor for "too many errors to call a
 * consensus."
 *
 * Three policies, plus a hard floor:
 *
 * - `reduce_denominator` (default for non-strict strategies): errors
 *   filtered out before the engine sees votes. Denominator = non-error
 *   votes. Pragmatic for operational decisions.
 * - `count_as_abstain`: errors reach the engine as abstain. Conservative
 *   — error voter is treated as having withheld approval.
 * - `fail_closed` (default for unanimous only, #3138): any error
 *   short-circuits to vote-void.
 *
 * Hard floor: if errors > `ERROR_FLOOR_FRACTION` of total voters, the
 * vote always fails regardless of policy. "All CLIs are down" is not a
 * consensus.
 *
 * @module mcp/tools/consensus-vote-error-policy
 */

import type { AgentVoteResult } from '../../cli/vote-types.js';
import type { ErrorPolicy } from './consensus-vote-types.js';
import { ERROR_FLOOR_FRACTION } from './consensus-vote-types.js';

export interface ErrorPolicyDecision {
  /** True when the vote should short-circuit to failed without reaching the engine. */
  readonly shortCircuit: boolean;
  /** Human-readable reason when shortCircuit is true. */
  readonly reason?: string;
  /**
   * Votes to feed to the engine. Empty when shortCircuit is true.
   * Otherwise: errors filtered out (`reduce_denominator`) or converted
   * to abstain (`count_as_abstain`).
   */
  readonly engineVotes: readonly AgentVoteResult[];
}

function isHardFloorTripped(errorCount: number, totalCount: number): boolean {
  if (totalCount === 0) return false;
  return errorCount / totalCount > ERROR_FLOOR_FRACTION;
}

/**
 * Apply the configured error policy to the raw voter list. Returns a
 * decision describing whether the vote should short-circuit and what
 * votes (if any) should reach the consensus engine.
 *
 * The hard floor (`errors / total > ERROR_FLOOR_FRACTION`) takes
 * precedence over any policy — even `reduce_denominator` short-circuits
 * when most voters errored, because the remaining minority isn't a real
 * consensus.
 *
 * The per-voter response list is built from the ORIGINAL `votes` array
 * upstream; this helper only shapes what the engine sees.
 */
export function applyErrorPolicy(
  votes: readonly AgentVoteResult[],
  policy: ErrorPolicy
): ErrorPolicyDecision {
  const errorVotes = votes.filter((v) => v.source === 'error');
  const errorCount = errorVotes.length;
  const totalCount = votes.length;

  if (isHardFloorTripped(errorCount, totalCount)) {
    return {
      shortCircuit: true,
      reason: `Errors exceeded ${String(Math.round(ERROR_FLOOR_FRACTION * 100))}% of voters (${String(errorCount)}/${String(totalCount)})`,
      engineVotes: [],
    };
  }

  if (policy === 'fail_closed' && errorCount > 0) {
    return {
      shortCircuit: true,
      reason: `fail_closed: ${String(errorCount)} voter(s) errored`,
      engineVotes: [],
    };
  }

  if (policy === 'count_as_abstain') {
    // Errors stay in the engine input but as abstain decisions.
    // The original `source: 'error'` is preserved so the per-voter
    // response shape and `voteCounts.error` still report the error.
    return {
      shortCircuit: false,
      engineVotes: votes.map((v) =>
        v.source === 'error' ? { ...v, vote: { ...v.vote, decision: 'abstain' as const } } : v
      ),
    };
  }

  // reduce_denominator (default): errors filtered out before engine sees them.
  return {
    shortCircuit: false,
    engineVotes: votes.filter((v) => v.source !== 'error'),
  };
}
