/**
 * Consensus Vote — Recording Helpers
 *
 * Memory and outcome store recording for consensus votes.
 * Extracted from consensus-vote.ts for file size compliance.
 *
 * @module mcp/tools/consensus-vote-recording
 * (Source: Issue #753 memory, Issue #1134 cold start)
 */

import {
  createLogger,
  getErrorMessage,
  getTimeProvider,
  getRandomProvider,
} from '../../core/index.js';
import type { AgentVoteResult } from '../../cli/vote-types.js';
import type { ConsensusResult } from '../../consensus/types.js';
import type { VoteRecord } from '../../audit/vote-record.js';
import {
  persistVoteRecord,
  resolveVoteRecordsPath,
  voteRecordWriteFailedMessage,
} from '../../audit/vote-record-store.js';
import { getToolMemory } from './tool-memory.js';
import {
  getOutcomeStore,
  categorizeOutcomeErrorMessage,
} from '../../orchestration/outcomes/index.js';
import { CLI_NAMES, type CliNameLiteral } from '../../config/model-capabilities-types.js';

const logger = createLogger({ tool: 'consensus-vote' });

/**
 * Records a completed consensus vote to session memory and, when measured,
 * the learning and outcome stores. Best-effort.
 *
 * When every vote is simulated, this is a no-op: simulated votes are random
 * (#2319) and must not seed the learning store or outcome store, otherwise
 * test/demo runs poison real routing decisions.
 * A `no_quorum` decision records only the task occurrence because the panel
 * measured no verdict to learn from or feed into adaptive routing (#5544).
 */
export function recordVoteSuccess(args: {
  proposal: string;
  strategy: string;
  decision: VoteRecord['decision'];
  durationMs: number;
  approvalPercentage?: number;
  votes?: readonly AgentVoteResult[];
}): void {
  const allSimulated =
    args.votes !== undefined &&
    args.votes.length > 0 &&
    args.votes.every((v) => v.source === 'simulation');
  if (allSimulated) {
    logger.debug('Skipping memory + outcome recording — all votes simulated');
    return;
  }

  try {
    const memory = getToolMemory();
    memory.recordTask({
      approach: `Consensus vote: ${args.strategy} on "${args.proposal.slice(0, 50)}"`,
      challenges: [],
      durationMs: args.durationMs,
    });
    if (args.decision !== 'no_quorum') {
      memory.recordLearning({
        pattern: `${args.strategy} vote → ${args.decision}`,
        context: `proposal="${args.proposal.slice(0, 40)}" duration=${String(args.durationMs)}ms`,
        confidence: learningConfidence(args.decision, args.approvalPercentage),
        source: 'consensus-vote',
      });
      void memory.runPromotionPipeline().catch((error: unknown) => {
        logger.warn('Promotion pipeline failed', { error });
      });
    }
  } catch (error: unknown) {
    logger.warn('Failed to record vote success to memory', { error: getErrorMessage(error) });
  }

  if (args.decision === 'no_quorum') return;
  // Also record to outcome store for adaptive routing feedback (#1551).
  // recordVoteOutcomes already filters per-vote `source === 'simulation'`,
  // but we keep the all-simulated guard above to skip the memory writes too.
  if (args.votes !== undefined) {
    recordVoteOutcomes(args.votes);
  }
}

function learningConfidence(
  decision: Exclude<VoteRecord['decision'], 'no_quorum'>,
  approvalPercentage: number | undefined
): number {
  if (approvalPercentage === undefined) return 0.8;
  const approvalConfidence = approvalPercentage / 100;
  return decision === 'approved' ? approvalConfidence : 1 - approvalConfidence;
}

/** Strategy values that map cleanly onto a {@link VoteRecord} strategy. */
const VOTE_RECORD_STRATEGIES: ReadonlySet<VoteRecord['strategy']> = new Set([
  'simple_majority',
  'supermajority',
  'unanimous',
  'higher_order',
  'opinion_wise',
  'proof_of_learning',
]);

/** Narrow an arbitrary strategy string to the record enum, defaulting safely. */
function toRecordStrategy(strategy: string): VoteRecord['strategy'] {
  return VOTE_RECORD_STRATEGIES.has(strategy as VoteRecord['strategy'])
    ? (strategy as VoteRecord['strategy'])
    : 'simple_majority';
}

/**
 * Structured outcome of the best-effort authentic-vote-record persistence
 * (#3991). Surfaced in the `consensus_vote` result so an MCP caller can SEE
 * whether the record was written and, when not, WHY + how to fix — previously a
 * skipped/failed persist was only a server-side WARN invisible to MCP clients.
 *
 * Reason vocabulary (#3991, Option B). Since the runtime ledger now routes
 * through `nexusDataPath` under `governance/`, the path essentially always
 * resolves to a writable `.nexus-agents/governance/` location — so the normal
 * case is `persisted: true`. The former `'no-repo-root'` reason is OBSOLETE
 * (there is always a homedir/sandbox/repo fallback): a non-persist is now either
 * `'all-simulated'` (skipped by design) or `'write-failed'` (the data dir was
 * unwritable, or a fail-closed traversal rejection). Observability only.
 */
export type VoteRecordPersistOutcome =
  | { readonly persisted: true; readonly record: VoteRecord }
  | {
      readonly persisted: false;
      readonly reason: 'all-simulated' | 'write-failed';
      readonly detail: string;
    };

/**
 * Persist an authentic, self-hashed vote record (tamper-evident record set +
 * monotonic sequence, #3927) at vote time (#3897). Best-effort: a persist
 * failure must never fail the vote, so the store swallows + logs. Skips
 * all-simulated runs (random output must not seed a committed record).
 *
 * RUNTIME LEDGER (#3991, design vote 7-0 Option B): the path routes through
 * `nexusDataPath('governance', ...)`, landing in a writable
 * `.nexus-agents/governance/` location (sandbox / repo-preferred / homedir), so
 * `persisted: true` is the normal case. Returns a structured
 * {@link VoteRecordPersistOutcome} so the caller can surface a non-persist to MCP
 * clients:
 *  - `all-simulated` — every vote was simulated; a committed record would seed
 *    governance from random output (#2319);
 *  - `write-failed` — the data dir was unwritable (or a fail-closed traversal
 *    rejection); `detail` carries the actionable unwritable-data-dir guidance.
 */
export function recordAuthenticVote(args: {
  proposal: string;
  strategy: string;
  result: ConsensusResult;
  votes: readonly AgentVoteResult[];
  correlationId?: string | undefined;
  /** Authority-tier ratification subject (#4004) — bound into the record's self-hash. */
  ratifies?: string | undefined;
  /** #4053: vote voided by an error-policy short-circuit → persist `no_quorum`. */
  errorVoided?: boolean | undefined;
  /**
   * The decision `resolveVoteDecision` already produced for the response.
   *
   * Required — including its `undefined` case — because deriving it a second
   * time inside the record store is what let the chain say `approved` for a
   * vote the tool reported as `no_quorum` (#4986). A caller that has the
   * resolved decision must hand it over rather than let the store guess.
   */
  resolvedDecision: VoteRecord['decision'] | undefined;
}): VoteRecordPersistOutcome {
  const allSimulated = args.votes.length > 0 && args.votes.every((v) => v.source === 'simulation');
  if (allSimulated) {
    logger.debug('Skipping authentic vote record — all votes simulated');
    return {
      persisted: false,
      reason: 'all-simulated',
      detail:
        'All votes were simulated; a committed vote record would seed governance ' +
        'from random output (#2319), so persistence is skipped by design.',
    };
  }
  // Resolve the data-dir path up front (mirrors the store's own precedence: env
  // override > nexusDataPath) so a fail-closed/unwritable case surfaces an
  // actionable note carrying the resolved path. Post-#3991 this almost always
  // returns a path; `undefined` is the rare traversal-rejection/resolver-failure
  // case and is classified as write-failed.
  const resolvedPath = resolveVoteRecordsPath();
  if (resolvedPath === undefined) {
    const detail = voteRecordWriteFailedMessage('<unresolved>');
    // persistVoteRecord won't be reached below to log its own WARN, so emit here.
    logger.warn(detail);
    return { persisted: false, reason: 'write-failed', detail };
  }
  const id = `vote-${String(getTimeProvider().now())}-${getRandomProvider().random().toString(36).slice(2, 9)}`;
  const record = persistVoteRecord({
    id,
    proposal: args.proposal,
    strategy: toRecordStrategy(args.strategy),
    result: args.result,
    votes: args.votes,
    resolvedDecision: args.resolvedDecision,
    ...(args.errorVoided !== undefined ? { errorVoided: args.errorVoided } : {}),
    ...(args.correlationId !== undefined ? { correlationId: args.correlationId } : {}),
    ...(args.ratifies !== undefined ? { ratifies: args.ratifies } : {}),
    logger,
  });
  if (record === undefined) {
    // The path resolved but the append threw (data dir unwritable) —
    // persistVoteRecord already WARNed with the underlying error + path. Surface
    // the actionable unwritable-data-dir guidance with the concrete path.
    return {
      persisted: false,
      reason: 'write-failed',
      detail: voteRecordWriteFailedMessage(resolvedPath),
    };
  }
  return { persisted: true, record };
}

/** Records a failed consensus vote to session memory. Best-effort. */
export function recordVoteError(proposal: string, errorMessage: string): void {
  try {
    const memory = getToolMemory();
    memory.recordError({
      error: `Consensus vote failed: ${errorMessage.slice(0, 150)}`,
      solution: 'Pending - vote execution failed',
      filePattern: 'mcp/tools/consensus-vote',
    });
  } catch (error: unknown) {
    logger.warn('Failed to record vote error', { error: getErrorMessage(error) });
  }
}

/**
 * Records per-vote outcomes to the outcome store for adaptive routing.
 * Each successful LLM vote contributes a sample to its CLI×category pair.
 * (Issue #1134 — cold start mitigation)
 */
export function recordVoteOutcomes(votes: readonly AgentVoteResult[]): void {
  try {
    const store = getOutcomeStore();
    const now = new Date().toISOString();
    for (const vote of votes) {
      if (vote.source === 'simulation') continue;
      const cliName =
        vote.cli !== undefined && (CLI_NAMES as readonly string[]).includes(vote.cli)
          ? (vote.cli as CliNameLiteral)
          : ('unknown' as const);
      const voteSuccess = vote.source === 'llm';
      store.append({
        id: `vote-${String(getTimeProvider().now())}-${getRandomProvider().random().toString(36).slice(2, 8)}`,
        cli: cliName,
        category: 'planning',
        model: 'consensus',
        success: voteSuccess,
        durationMs: vote.processingTimeMs,
        timestamp: now,
        source: 'consensus',
        // #2662 — carry the voter role so the stratified outcome report
        // can break consensus results down by role.
        voterRole: vote.role,
        ...(!voteSuccess && vote.error !== undefined
          ? {
              failureCategory: categorizeOutcomeErrorMessage(vote.error),
              errorMessage: vote.error.slice(0, 500),
            }
          : {}),
      });
    }
  } catch (error: unknown) {
    logger.debug('Best-effort vote outcome recording failed', { error: getErrorMessage(error) });
  }
}
