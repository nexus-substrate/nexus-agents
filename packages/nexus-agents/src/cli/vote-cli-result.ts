/**
 * The CLI's narrowed view of an `executeVoting` result, and the one function
 * that narrows it. Moved out of `vote-command.ts` when #6258 put that file
 * over its line cap; every field the narrowing drops is a field the summary,
 * the comment and the audit record can no longer see, so each carried field is
 * listed explicitly below.
 *
 * @module cli/vote-cli-result
 */
import type { VotingResult } from './vote-types.js';
import type { ResolvedVoterProject } from './voter-project.js';
import type {
  ContrarianCheckStatus,
  ErrorPolicy,
  ExtendedVotingResult,
  VoteDecisionStatus,
} from '../mcp/tools/consensus-vote-types.js';
import { mapOutcomeToDecision } from '../consensus/decision/verdict.js';

/** The view of a vote the CLI printers and recorders consume. */
export type CliVoteResult = VotingResult & {
  readonly decision: VoteDecisionStatus;
  readonly strategy: string;
  readonly policyReason?: string;
  /**
   * #5362: `executeVoting` has always returned this; the CLI's narrower
   * return type dropped it, so the summary line could not say that an option
   * veto — not the approval bar — caused a rejection.
   */
  readonly optionGate?: ExtendedVotingResult['optionGate'];
  /** #6111: the quick-mode contrarian check; `skipped` when it did not run. */
  readonly contrarianCheck: ContrarianCheckStatus;
  /** #6110: the project the panel judged, for the summary and the comment. */
  readonly project?: ResolvedVoterProject | undefined;
  /** #6211: the effective error policy `executeVoting` stamped, for the record. */
  readonly errorPolicy?: ErrorPolicy | undefined;
  /** #6258: the directory the seats were handed, for the summary. */
  readonly workspace?: string | undefined;
};

/**
 * `ExtendedVotingResult` is a superset of `VotingResult` — return the
 * narrower view since the CLI pretty-printers only consume the base
 * fields and don't render `higherOrderResult`. #4135: also carry
 * the response-layer `decision` (incl. `no_quorum`) so the command can honor a
 * quorum void; fall back to mapping the engine outcome when it's absent.
 */
export function toCliVoteResult(result: ExtendedVotingResult): CliVoteResult {
  return {
    proposal: result.proposal,
    threshold: result.threshold,
    result: result.result,
    votes: result.votes,
    totalTimeMs: result.totalTimeMs,
    simulateVotes: result.simulateVotes,
    decision: result.decision ?? mapOutcomeToDecision(result.result.outcome),
    // Carried past the narrowing above so the audit record states the strategy
    // that was applied. `threshold` is the display value and can differ (#4924).
    strategy: result.strategy,
    // Likewise: an error-policy short-circuit voided the vote, and without it
    // the record calls a void a `rejected` (#4953).
    ...(result.policyReason !== undefined ? { policyReason: result.policyReason } : {}),
    // #5362 widened the RETURN TYPE for this and never added it to the literal,
    // so `explainOutcome`'s gate arm — written to consume it — was unreachable
    // and every option veto fell through to the generic threshold message,
    // blaming an approval bar the vote had cleared. TypeScript stayed silent
    // because the field is optional.
    ...(result.optionGate !== undefined ? { optionGate: result.optionGate } : {}),
    // #6111: `executeVoting` stamps this on every path; the field is optional
    // on its result type only for direct unit constructions, where the check
    // genuinely did not run.
    contrarianCheck: result.contrarianCheck ?? 'skipped',
    ...(result.project !== undefined ? { project: result.project } : {}),
    // #6211: the record states the policy the panel ran under; this is the
    // same narrowing that dropped `optionGate` (#5362), so it is carried
    // explicitly and asserted at the recorder hop.
    ...(result.errorPolicy !== undefined ? { errorPolicy: result.errorPolicy } : {}),
    // #6258: carried past the same narrowing, or the summary line always reads `none`.
    ...(result.workspace !== undefined ? { workspace: result.workspace } : {}),
  };
}
