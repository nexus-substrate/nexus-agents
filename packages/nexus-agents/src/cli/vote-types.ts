/**
 * nexus-agents vote command types
 *
 * Type definitions for the consensus voting CLI command.
 *
 * (Source: Issue #212, Process Automation Epic #209)
 */

import type { ConsensusAlgorithm, Vote, ConsensusResult } from '../consensus/types.js';
import type { ErrorPolicy, VoteThreshold } from '../mcp/tools/consensus-vote-types.js';

/**
 * #4135: how the `vote` command maps a `no_quorum` decision — a quorum void
 * (a missing/errored voice under the opt-in `absolute_quorum` error policy, or an
 * error-policy short-circuit), which is DISTINCT from a genuine rejection.
 *
 * - `fail` (default): exit 1, exactly as a rejection would — back-compat.
 * - `exit2`: exit with a distinct code 2 so scripts can tell a quorum void apart
 *   from an approval (0) or a rejection (1).
 * - `retry`: re-run the vote ONCE (the plan is fine, a voice was missing); if it
 *   still cannot reach quorum, fall back to `fail` (exit 1).
 */
export type NoQuorumPolicy = 'fail' | 'exit2' | 'retry';

/**
 * Options for the vote command.
 */
export interface VoteCommandOptions {
  readonly proposal: string;
  /**
   * Named alternatives for a multi-option proposal (#4472, #4941).
   *
   * Without these, the record of a three-way decision reads `approved` with a
   * null `optionTally` — it cannot say WHICH option won, which is the point of
   * asking a panel a multi-way question in the first place.
   */
  readonly options?: readonly string[];
  readonly threshold?: VoteThreshold;
  /** Use simulated votes instead of LLM execution (maps from --dry-run CLI flag) */
  readonly dryRun?: boolean;
  readonly quick?: boolean;
  readonly verbose?: boolean;
  readonly createIssue?: boolean;
  readonly issueNumber?: number;
  /** Timeout per vote in milliseconds (default: 90000 per Issue #607) */
  readonly timeoutMs?: number;
  /**
   * How to treat voters that errored or timed out (#2630). When undefined,
   * the same per-strategy default `executeVoting` uses applies:
   * `fail_closed` for unanimous, `reduce_denominator` otherwise.
   */
  readonly errorPolicy?: ErrorPolicy;
  /**
   * #4135: how to map a `no_quorum` decision (a recoverable quorum void, not a
   * rejection). Default `fail` (exit 1) preserves back-compat. See
   * {@link NoQuorumPolicy}.
   */
  readonly onNoQuorum?: NoQuorumPolicy;
}

/**
 * Voter agent role definitions.
 *
 * `scope_steward` (#2185) was added 2026-04-25 to address a build-vs-buy
 * blind spot in the original 6-role panel: the panel approved a proposal
 * to build a USB-flasher CLI without flagging that Rufus already solves
 * the problem. The scope-steward role explicitly checks for existing tools
 * + biases toward "don't build."
 */
export type VoterRole =
  'architect' | 'security' | 'devex' | 'ai_ml' | 'pm' | 'catfish' | 'scope_steward';

/**
 * Agent role descriptions for prompt generation.
 */
export const VOTER_ROLES: Record<VoterRole, string> = {
  architect: 'Software Architect - evaluates technical design, scalability, and maintainability',
  security:
    'Security Engineer - evaluates security implications, vulnerabilities, and attack vectors',
  devex: 'Developer Experience - evaluates usability, documentation, and developer workflow',
  ai_ml: 'AI/ML Engineer - evaluates AI/ML aspects, model selection, and learning capabilities',
  pm: 'Product Manager - evaluates business value, user impact, and resource allocation',
  catfish:
    'Contrarian Analyst - deliberately challenges proposals to prevent agreement bias (arXiv:2505.21503)',
  scope_steward:
    'Scope Steward - asks whether to build at all; checks existing tools, biases toward kill-the-feature (#2185)',
};

/**
 * Individual agent vote with metadata.
 */
export interface AgentVoteResult {
  readonly role: VoterRole;
  readonly vote: Vote;
  readonly processingTimeMs: number;
  /**
   * Source of the vote:
   * - 'llm': Real LLM execution
   * - 'simulation': Fallback simulation (opt-in only)
   * - 'error': Error during execution (Issue #523)
   */
  readonly source: 'llm' | 'simulation' | 'error';
  /** CLI that executed this vote (for adaptive routing feedback). */
  readonly cli?: string | undefined;
  /**
   * Which named option this voter chose, when the proposal declared `options`
   * (#4452). Absent on an ordinary yes/no vote.
   *
   * The approve/reject/abstain tally cannot express option choice: on a
   * multi-option proposal every engaged voter returns `approve`, so a real 6-1
   * split records as unanimous. This is what makes the split recoverable
   * without parsing free-text `reasoning`.
   */
  readonly selectedOption?: string | undefined;
  /**
   * True when this vote came from the per-role retry of an errored seat
   * (#5578). A first-attempt vote never carries it.
   *
   * The panel launches once; a voter that errors is dropped, so under
   * `reduce_denominator` its seat silently leaves the denominator and under
   * `absolute_quorum` the whole vote voids and the caller replays all N
   * voters for a single failure. Retrying just the errored roles recovers the
   * seat for one extra call — and this flag is what makes the recovery
   * visible instead of indistinguishable from a clean first attempt.
   */
  readonly retried?: boolean | undefined;
  /**
   * Model id that executed this vote, when known (e.g. 'claude-sonnet'). Carried
   * so per-decision cost aggregation can attribute spend per model (#3855). Absent
   * for error/simulation votes that never reached a model.
   */
  readonly model?: string | undefined;
  /**
   * Model assigned to this role before execution. Unlike `model`, this stays on
   * the primary assignment when router failover serves the vote elsewhere.
   */
  readonly pinnedModel?: string | undefined;
  /**
   * Input tokens the adapter reported for this voter's LLM call, when known
   * (#3910). Propagated from `CompletionResponse.usage` so per-decision cost
   * aggregation resolves from `unmeasured` to MEASURED. Absent for
   * error/simulation votes that never reached a model, or for adapters that do
   * not report usage (CLI subscriptions) — those stay honestly `unmeasured`.
   */
  readonly inputTokens?: number | undefined;
  /**
   * Output tokens the adapter reported for this voter's LLM call, when known
   * (#3910). See {@link AgentVoteResult.inputTokens}.
   */
  readonly outputTokens?: number | undefined;
  /**
   * Input tokens read from an existing prompt cache, when the adapter
   * reported them (#4435). Separate from {@link inputTokens} because cache
   * reads bill at roughly a tenth of the uncached rate.
   */
  readonly cachedInputTokens?: number | undefined;
  /**
   * Input tokens spent writing the cache, when reported (#4435). Bills at
   * roughly 1.25x the uncached rate — the opposite end from a cache read.
   */
  readonly cacheCreationInputTokens?: number | undefined;
  /** Error message if vote fell back to simulation or encountered an error */
  readonly error?: string;
}

/**
 * Full voting result.
 */
export interface VotingResult {
  readonly proposal: string;
  readonly threshold: ConsensusAlgorithm;
  readonly result: ConsensusResult;
  readonly votes: readonly AgentVoteResult[];
  readonly totalTimeMs: number;
  /** Whether simulated votes were used instead of LLM execution */
  readonly simulateVotes: boolean;
}

/**
 * Vote verification hash for audit trail.
 */
export interface VoteHash {
  readonly role: VoterRole;
  readonly hash: string;
  readonly timestamp: string;
}
