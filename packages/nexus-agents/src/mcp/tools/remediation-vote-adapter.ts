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

// @export-no-consumer-yet — see #3648
// Wired into AutoRemediationDeps.vote by the enforce entry point (#3648).

import { createLogger, type ILogger } from '../../core/index.js';
import type { ConsensusAlgorithm } from '../../consensus/types-core.js';
import { executeVoting, ConsensusVoteInputSchema } from './consensus-vote.js';
import type { AutoRemediationDeps } from './improvement-remediation-enforce.js';

/** A runnable vote — abstracted so the adapter is unit-testable without live voters. */
export type VoteRunner = (
  proposal: string,
  algorithm: ConsensusAlgorithm
) => Promise<{ approved: boolean; approvalPercentage: number }>;

/**
 * Build the consensus-vote input for a remediation proposal. Forces real voters
 * (`simulateVotes: false`) and the priority-required strategy. Exported for tests.
 */
export function buildVoteInput(
  proposal: string,
  algorithm: ConsensusAlgorithm
): ReturnType<typeof ConsensusVoteInputSchema.parse> {
  return ConsensusVoteInputSchema.parse({
    proposal,
    strategy: algorithm,
    simulateVotes: false, // never gate auto-remediation on simulated votes
  });
}

/** Default runner — the real, live-voter consensus path. */
function makeDefaultRunner(logger: ILogger): VoteRunner {
  return async (proposal, algorithm) => {
    const { result } = await executeVoting(buildVoteInput(proposal, algorithm), logger);
    return {
      approved: result.outcome === 'approved',
      approvalPercentage: result.approvalPercentage,
    };
  };
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
