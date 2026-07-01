/**
 * Consensus vote adapter for the auto-remediation enforce path (#3540 phase 3 / #3648).
 *
 * The `AutoRemediationDeps.vote` implementation — it runs a REAL consensus vote
 * (live voters, never simulated) at the priority-required algorithm (#3653) via
 * the canonical {@link executeVoting} path, and maps the result to the orchestrator's
 * `{ approved, approvalPercentage }` shape. The proposal handed to voters is the
 * strict typed plan rendering (#3613) — no untrusted free-form text.
 *
 * `simulateVotes` is hard-forced to false here: auto-remediation must never gate
 * on random simulated votes (CLAUDE.md / #2319).
 *
 * @module mcp/tools/remediation-vote-adapter
 */

import { createLogger, type ILogger } from '../../core/index.js';
import type { ConsensusAlgorithm } from '../../consensus/types-core.js';
import { executeVoting, ConsensusVoteInputSchema } from './consensus-vote.js';
import type { VoteDecisionStatus } from './consensus-vote-types.js';
import type { AutoRemediationDeps } from './improvement-remediation-enforce.js';

/**
 * A vote verdict as the auto-remediation gate consumes it. `decision` (#4138) is
 * the response-layer {@link VoteDecisionStatus} (the #4135-stamped view, incl.
 * `'no_quorum'`) surfaced alongside the legacy 2-valued `approved` flag so the
 * gate can honor an `absolute_quorum` `no_quorum` void (bounded re-run → explicit
 * terminal skip) instead of misreading it as a rejection. Absent on paths that
 * never ran `executeVoting`; callers then fall back to the legacy `approved` map.
 */
export interface VoteVerdict {
  readonly approved: boolean;
  readonly approvalPercentage: number;
  readonly decision?: VoteDecisionStatus;
}

/** A runnable vote — abstracted so the adapter is unit-testable without live voters. */
export type VoteRunner = (proposal: string, algorithm: ConsensusAlgorithm) => Promise<VoteVerdict>;

/**
 * Build the consensus-vote input for a remediation proposal. Forces real voters
 * (`simulateVotes: false`) and the priority-required strategy. Opts into the
 * anti-DoS `absolute_quorum` error policy (#4132/#4138): an errored voter —
 * especially the contrarian (catfish) — DEGRADES the verdict to a recoverable
 * `no_quorum` instead of being dropped from the denominator, so a voter you can
 * knock offline can only ever force a re-run, never flip an autonomous-execution
 * gate. Exported for tests.
 */
export function buildVoteInput(
  proposal: string,
  algorithm: ConsensusAlgorithm
): ReturnType<typeof ConsensusVoteInputSchema.parse> {
  return ConsensusVoteInputSchema.parse({
    proposal,
    strategy: algorithm,
    simulateVotes: false, // never gate auto-remediation on simulated votes
    errorPolicy: 'absolute_quorum', // #4138: an errored voice → no_quorum, never a flipped verdict
  });
}

/** Default runner — the real, live-voter consensus path. */
function makeDefaultRunner(logger: ILogger): VoteRunner {
  return async (proposal, algorithm) => {
    const voting = await executeVoting(buildVoteInput(proposal, algorithm), logger);
    return {
      approved: voting.result.outcome === 'approved',
      approvalPercentage: voting.result.approvalPercentage,
      // #4138: carry the #4135-stamped response-layer decision (incl. no_quorum) so
      // the gate honors an absolute_quorum void instead of collapsing it to reject.
      // Conditional spread keeps `decision` absent (not `undefined`) under
      // exactOptionalPropertyTypes when executeVoting left it unstamped.
      ...(voting.decision !== undefined ? { decision: voting.decision } : {}),
    };
  };
}

/**
 * #4138: bounded re-run for an `absolute_quorum` `no_quorum` void. Re-invokes
 * `runVote` while the verdict is `no_quorum` and retries remain, returning the
 * last verdict (recovered → its real approved/rejected decision; still degraded →
 * the terminal `no_quorum`). Tiny + pure so both the adapter default path and the
 * auto-remediation gate share ONE re-run loop (not `iterative-consensus`'s private,
 * plan-coupled `voteWithQuorumRecovery`).
 */
export async function retryOnNoQuorum(
  runVote: () => Promise<VoteVerdict>,
  maxRetries: number
): Promise<VoteVerdict> {
  let verdict = await runVote();
  for (let attempt = 0; attempt < maxRetries && verdict.decision === 'no_quorum'; attempt++) {
    verdict = await runVote();
  }
  return verdict;
}

/**
 * Build the {@link AutoRemediationDeps.vote} adapter. Defaults to the real
 * live-voter path; tests inject a fake {@link VoteRunner}.
 */
export function makeVoteAdapter(
  runner?: VoteRunner,
  logger: ILogger = createLogger({ tool: 'auto-remediation-vote' })
): AutoRemediationDeps['vote'] {
  const run = runner ?? makeDefaultRunner(logger);
  return (input) => run(input.proposal, input.algorithm);
}
