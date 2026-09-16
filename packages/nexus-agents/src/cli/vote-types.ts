/**
 * nexus-agents vote command types
 *
 * Type definitions for the consensus voting CLI command.
 *
 * (Source: Issue #212, Process Automation Epic #209)
 */

import type { ConsensusAlgorithm, Vote, ConsensusResult } from '../consensus/types.js';
import type {
  ErrorPolicy,
  VoteThreshold,
  VotingStrategy,
} from '../mcp/tools/consensus-vote-types.js';
import type { VoteRecordPrBinding } from '../audit/vote-record.js';
import type { VoterRole } from './voter-roles.js';

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
  /**
   * Legacy spelling of the bar (`--threshold majority|supermajority|unanimous`).
   * Passed to the engine alongside {@link strategy}; `resolveStrategy` lets
   * `strategy` win when both are given (#6227), as it does for the MCP tool.
   */
  readonly threshold?: VoteThreshold;
  /**
   * The bar as the tool spells it (`--strategy`, #6227): the same enum
   * `consensus_vote` takes, handed to `executeVoting` unchanged. The governor
   * bar is `supermajority` (with `errorPolicy: 'absolute_quorum'`).
   */
  readonly strategy?: VotingStrategy;
  /**
   * Governor-path PR binding (`--ratifies-pr <n>@<sha>`, #6227 / #5130):
   * already parsed into the record's own shape. Bound into the persisted
   * record's self-hash as `ratifiesPr`, so
   * `scripts/append-ratification-record.ts --record-id` can copy it into the
   * committed ledger and the governor gate can match it to the PR head.
   */
  readonly ratifiesPr?: VoteRecordPrBinding;
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
  /**
   * #6110: the project the panel judges (maps from `--project`). Replaces
   * `nexus-agents` in every voter's system prompt; derived from the working
   * directory when absent, and the summary discloses which source answered.
   */
  readonly project?: string;
}

/**
 * `VoterRole` and `VOTER_ROLES` moved to `voter-roles.ts` (#6000 step 1) so
 * the panel's seat configuration can be governed on its own path. Re-exported
 * here so every existing import keeps resolving.
 */
export { VOTER_ROLES, type VoterRole } from './voter-roles.js';

/**
 * Which evidence classified a seat as `unverifiable` (#6094).
 *
 * - `stderr`: the structured signal — the CLI transport captured a sandbox /
 *   shell failure on stderr while serving the completion.
 * - `reasoning`: the fallback — the seat's own reasoning text said it could
 *   not read the artifact: the `UNVERIFIABLE:` prefix, or an error string
 *   with no recovery asserted (`UNVERIFIABLE_REASONING_RE`, #6104).
 */
export type UnverifiableSignal = 'stderr' | 'reasoning';

/**
 * Why a seat answered somewhere other than where it was assigned (#6115).
 *
 * The adapter error class that triggered the fallover, named with the
 * predicates the adapters already classify by (`rate-limit-detector`,
 * `cli-error-envelope`, the subprocess timeout patterns, the #6094 sandbox
 * signal). `capacity` is a DURABLE cap (out of usage credits, a spend
 * ceiling); `rate-limit` a transient throttle. `unknown` is the named empty
 * case — the message matched no class — never a default standing in for one.
 */
export type FallbackReason = 'rate-limit' | 'capacity' | 'auth' | 'timeout' | 'sandbox' | 'unknown';

/**
 * A seat that answered on a different CLI or model than assigned (#6115).
 *
 * Present only when it happened. Two producers: the #3587 cross-CLI fallover
 * (`fromCli` is the assigned CLI, the answer's `cli` is where it went) and
 * the #6120 in-family model substitution (`fromCli` equals the answer's
 * `cli`; `fromModel` is the alias the seat asked for). `fromModel` is absent
 * when the assigned adapter never detected a model — the placeholder is not
 * a model and is not disclosed as one.
 */
export interface SeatFallback {
  readonly fromCli: string;
  readonly fromModel?: string | undefined;
  readonly reason: FallbackReason;
}

/** One attempt's timing on one CLI lane (#6103). */
export interface SeatAttemptTiming {
  /** The CLI key the attempt was serialized on (`adapterCliKey`). */
  readonly cli: string;
  /** Milliseconds between enqueueing on that CLI's lane and the attempt actually starting. */
  readonly queuedMs: number;
  /** Milliseconds the attempt ran once started, until it settled (answer, error or deadline). */
  readonly ranMs: number;
  /** True for the cross-CLI fallback attempt (#3587); false for the primary. */
  readonly fallback: boolean;
}

/**
 * What a recovered seat was retried FROM (#6246).
 *
 * `retryErroredRoles` replaces an absent first-pass seat — errored, or
 * unverifiable — with the retry's result. Before this the first pass was
 * discarded at that point: the merged panel, the summary row and the ledger
 * entry said the seat was retried, but not what it recovered from. On the
 * #6241 ratification panel the catfish seat's first pass errored on two
 * response-parse failures and the retry came back unverifiable; nothing joined
 * the two, and #6244 read the parse errors as a misclassification.
 *
 * `source` is the first pass's `source` — only the two absent values, a
 * literal union so a record cannot claim a first pass that was never retried.
 * `error` is the first pass's `error` string, present only when it had one
 * (an unverifiable seat's cause lives in its reasoning and carries no
 * `error`), with control characters replaced and bounded by the #5373 record
 * clip; `errorTruncated` is that clip's marker, present only when it fired.
 */
export interface RetriedFrom {
  readonly source: 'error' | 'unverifiable';
  readonly error?: string | undefined;
  readonly errorTruncated?: true | undefined;
}

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
   * - 'unverifiable': the seat answered but could not read the artifact
   *   (#6094). A DISTINCT value, not a flag on `abstain`, so no aggregation
   *   over `vote.decision` can fold it back into the abstain bucket. The
   *   `vote.decision` is always `abstain` — an unverifiable seat never carries
   *   approve/reject, whatever the model returned.
   */
  readonly source: 'llm' | 'simulation' | 'error' | 'unverifiable';
  /**
   * Present only when `source === 'unverifiable'`: which evidence classified
   * the seat (#6094). Lets an auditor tell a structured stderr signal from the
   * reasoning-text heuristic.
   */
  readonly unverifiableSignal?: UnverifiableSignal | undefined;
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
   * What this seat was retried from (#6246): the first pass's source and, when
   * it had one, its error string. Present only on a seat the per-role retry
   * REPLACED — never on a first-attempt result, and never on a seat whose retry
   * failed again (that seat keeps its first attempt, unmarked). Orthogonal to
   * {@link retried}: that flag says a recovery happened; this says what it
   * recovered from.
   */
  readonly retriedFrom?: RetriedFrom | undefined;
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
   * The CLI the round-robin or `NEXUS_VOTER_MODEL_<ROLE>` pin chose for this
   * seat (#6115), as a bare name (`claude`, not `cli-claude`). Unlike
   * {@link pinnedModel} it is known BEFORE detection, so it survives the
   * `pending-detection` placeholder and says where a seat was meant to
   * answer. Compare with `cli` to see where it did. Absent on results built
   * outside the panel launcher (simulation, direct `executeAgentVote` calls).
   */
  readonly assignedCli?: string | undefined;
  /**
   * Present only when the seat answered on a different CLI or model than
   * assigned (#6115). Three consecutive 7-seat panels ran every seat on one
   * model because claude was out of credits and codex could not spawn, and
   * nothing in the result said so — a single-model panel is a weaker
   * independence claim than the assignment, and the tally read identically.
   */
  readonly fallback?: SeatFallback | undefined;
  /**
   * Per-attempt timing of this seat (#6103): how long each attempt QUEUED
   * behind its CLI's serialized lane (#3348) and how long it RAN, in launch
   * order — the primary attempt first, then the cross-CLI fallback (#3587)
   * when one was made. Absent on a seat that never reached the launcher
   * (simulation, a direct `executeAgentVote`); an empty `attempts` list on a
   * seat the launcher refused before any attempt (cancelled). Recorded so the
   * panel wall-clock can be attributed to queueing versus model time before
   * a fallback lane is designed; never folded into the vote record.
   */
  readonly timing?: { readonly attempts: readonly SeatAttemptTiming[] } | undefined;
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
