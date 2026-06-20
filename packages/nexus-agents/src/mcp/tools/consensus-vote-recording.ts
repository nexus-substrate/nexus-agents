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
  voteRecordNoRootMessage,
} from '../../audit/vote-record-store.js';
import { getToolMemory } from './tool-memory.js';
import {
  getOutcomeStore,
  categorizeOutcomeErrorMessage,
} from '../../orchestration/outcomes/index.js';
import {
  DEFAULT_CLI,
  CLI_NAMES,
  type CliNameLiteral,
} from '../../config/model-capabilities-types.js';

const logger = createLogger({ tool: 'consensus-vote' });

/**
 * Records a successful consensus vote to session memory AND outcome store. Best-effort.
 *
 * When every vote is simulated, this is a no-op: simulated votes are random
 * (#2319) and must not seed the learning store or outcome store, otherwise
 * test/demo runs poison real routing decisions.
 */
export function recordVoteSuccess(
  proposal: string,
  strategy: string,
  outcome: string,
  duration: number,
  votes?: readonly AgentVoteResult[]
): void {
  const allSimulated =
    votes !== undefined && votes.length > 0 && votes.every((v) => v.source === 'simulation');
  if (allSimulated) {
    logger.debug('Skipping memory + outcome recording — all votes simulated');
    return;
  }

  try {
    const memory = getToolMemory();
    memory.recordTask({
      approach: `Consensus vote: ${strategy} on "${proposal.slice(0, 50)}"`,
      challenges: [],
      durationMs: duration,
    });
    memory.recordLearning({
      pattern: `${strategy} vote → ${outcome}`,
      context: `proposal="${proposal.slice(0, 40)}" duration=${String(duration)}ms`,
      confidence: 0.8,
      source: 'consensus-vote',
    });
    void memory.runPromotionPipeline().catch((error: unknown) => {
      logger.warn('Promotion pipeline failed', { error });
    });
  } catch (error: unknown) {
    logger.warn('Failed to record vote success to memory', { error: getErrorMessage(error) });
  }

  // Also record to outcome store for adaptive routing feedback (#1551).
  // recordVoteOutcomes already filters per-vote `source === 'simulation'`,
  // but we keep the all-simulated guard above to skip the memory writes too.
  if (votes !== undefined) {
    recordVoteOutcomes(votes);
  }
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
 * whether the committable record was written and, when not, WHY + how to fix —
 * previously a skipped/failed persist was only a server-side WARN invisible to
 * MCP clients (a live 2.135.0 vote produced no persisted record with no visible
 * signal). Observability only: the persistence/cwd-resolution logic is unchanged.
 */
export type VoteRecordPersistOutcome =
  | { readonly persisted: true; readonly record: VoteRecord }
  | {
      readonly persisted: false;
      readonly reason: 'all-simulated' | 'no-repo-root' | 'write-failed';
      readonly detail: string;
    };

/**
 * Persist an authentic, self-hashed vote record (tamper-evident record set +
 * monotonic sequence, #3927) to the committable governance
 * artifact at vote time (#3897). Best-effort: a persist failure must never fail
 * the vote, so the store swallows + logs. Skips all-simulated runs (random
 * output must not seed a committed record).
 *
 * Returns a structured {@link VoteRecordPersistOutcome} (#3991) so the caller
 * can surface the result to MCP clients instead of leaving a skip invisible:
 *  - `all-simulated` — every vote was simulated; a committed record would seed
 *    governance from random output (#2319);
 *  - `no-repo-root` — no committable location (server outside the repo, no
 *    override); `detail` reuses the server WARN's actionable guidance;
 *  - `write-failed` — a location resolved but the append threw.
 * Persistence remains best-effort; this only reports what happened.
 */
export function recordAuthenticVote(args: {
  proposal: string;
  strategy: string;
  result: ConsensusResult;
  votes: readonly AgentVoteResult[];
  correlationId?: string | undefined;
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
  // Resolve the committable location up front (mirrors the store's own
  // precedence: env override > repo-root detection) so a no-root skip surfaces
  // a DISTINCT, actionable reason vs a genuine write failure. The persist path
  // and cwd-resolution logic are unchanged — this only classifies the outcome.
  if (resolveVoteRecordsPath() === undefined) {
    const detail = voteRecordNoRootMessage();
    // Defense-in-depth: keep the server-side WARN (#3991). persistVoteRecord
    // won't be reached below to log its own, so emit it here.
    logger.warn(detail);
    return { persisted: false, reason: 'no-repo-root', detail };
  }
  const id = `vote-${String(getTimeProvider().now())}-${getRandomProvider().random().toString(36).slice(2, 9)}`;
  const record = persistVoteRecord({
    id,
    proposal: args.proposal,
    strategy: toRecordStrategy(args.strategy),
    result: args.result,
    votes: args.votes,
    ...(args.correlationId !== undefined ? { correlationId: args.correlationId } : {}),
    logger,
  });
  if (record === undefined) {
    // Location resolved but the append threw — persistVoteRecord already WARNed
    // with the underlying error + path.
    return {
      persisted: false,
      reason: 'write-failed',
      detail: 'Vote record write failed; see server logs for the underlying filesystem error.',
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
      const cliName: CliNameLiteral =
        vote.cli !== undefined && (CLI_NAMES as readonly string[]).includes(vote.cli)
          ? (vote.cli as CliNameLiteral)
          : DEFAULT_CLI;
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
