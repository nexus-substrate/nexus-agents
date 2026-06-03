/**
 * Overall-deadline racing for consensus voting (Issue #1871).
 *
 * Defensive layer above per-vote timeouts: even if a single
 * executeAgentVote() promise never settles (subprocess adapter hang,
 * IPC wait that swallows timeout, etc.), this helper guarantees the
 * whole consensus call returns bounded partial results.
 *
 * Each role's vote promise is raced against a shared wall-clock
 * deadline. Any role whose promise has not settled when the deadline
 * fires is filled with createErrorVoteResult('overall consensus
 * deadline exceeded'), preserving role order so downstream aggregation
 * stays deterministic.
 */
import type { IModelAdapter, ILogger } from '../core/index.js';
import type { AgentVoteResult, VoterRole } from './vote-types.js';
import { createErrorVoteResult, delay } from './voter-execution.js';

export interface VoteOptions {
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly allowSimulation: boolean;
}

export type VoteFn = (
  role: VoterRole,
  proposal: string,
  adapter: IModelAdapter,
  logger: ILogger,
  options: VoteOptions
) => Promise<AgentVoteResult>;

export interface LaunchVotesInput {
  readonly roles: readonly VoterRole[];
  readonly proposal: string;
  readonly roleAdapters: ReadonlyMap<VoterRole, IModelAdapter>;
  readonly fallbackAdapter: IModelAdapter;
  readonly logger: ILogger;
  readonly voteOptions: VoteOptions;
  readonly interDelay: number;
  readonly overallDeadlineMs: number;
  /** Vote launcher (injected by caller — typically executeAgentVote). */
  readonly voteFn: VoteFn;
}

const DEADLINE_MESSAGE = 'overall consensus deadline exceeded';

/** Stable per-CLI key for an adapter; CLI adapters carry the CLI name. */
function adapterCliKey(adapter: IModelAdapter): string {
  return (adapter as { name?: string }).name ?? adapter.providerId;
}

/**
 * Per-key serializer (#3348). Returns a `run(key, fn)` that chains each fn
 * behind the previous fn for the same key, so at most one runs per key at a
 * time. Different keys run concurrently.
 *
 * Why: when several voter roles round-robin onto the SAME CLI, concurrent
 * subprocesses each trigger that CLI's OAuth access-token refresh. With
 * refresh-token rotation the first call rotates the token and the rest fail
 * with "refresh token already used". Serializing per CLI lets the cold-start
 * refresh complete before the next same-CLI call begins. Cross-CLI parallelism
 * is preserved (claude/gemini/codex still overlap).
 */
function createKeyedSerializer(): <T>(key: string, fn: () => Promise<T>) => Promise<T> {
  const tails = new Map<string, Promise<unknown>>();
  return <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const prev = tails.get(key) ?? Promise.resolve();
    // Run fn whether the previous same-key call resolved or rejected.
    const run = prev.then(fn, fn);
    // Chain on a never-rejecting tail so one failure can't break ordering.
    tails.set(
      key,
      run.then(
        () => undefined,
        () => undefined
      )
    );
    return run;
  };
}

function raceWithDeadline(
  p: Promise<AgentVoteResult>,
  role: VoterRole,
  deadlineMs: number
): Promise<AgentVoteResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutP = new Promise<AgentVoteResult>((resolve) => {
    timer = setTimeout(() => {
      resolve(createErrorVoteResult(role, DEADLINE_MESSAGE, deadlineMs));
    }, deadlineMs);
  });
  return Promise.race([p, timeoutP]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

export async function launchVotesWithOverallDeadline(
  input: LaunchVotesInput
): Promise<readonly AgentVoteResult[]> {
  const {
    roles,
    proposal,
    roleAdapters,
    fallbackAdapter,
    logger,
    voteOptions,
    interDelay,
    overallDeadlineMs,
    voteFn,
  } = input;

  const startedAt = Date.now();
  const serialize = createKeyedSerializer();

  const wrapped = roles.map(async (role, i) => {
    if (i > 0 && interDelay > 0) await delay(interDelay);
    const adapter = roleAdapters.get(role) ?? fallbackAdapter;
    // Serialize per CLI so concurrent same-CLI calls don't race that CLI's
    // OAuth refresh (#3348). The deadline is measured when the vote actually
    // starts, so a queued role still gets a correct remaining budget.
    return serialize(adapterCliKey(adapter), () => {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(1, overallDeadlineMs - elapsed);
      return raceWithDeadline(
        voteFn(role, proposal, adapter, logger, voteOptions),
        role,
        remaining
      );
    });
  });

  const results = await Promise.all(wrapped);

  const expired = results.filter((r) => r.source === 'error' && r.error === DEADLINE_MESSAGE);
  if (expired.length > 0) {
    logger.warn('Consensus overall deadline reached; returning partial results', {
      totalRoles: roles.length,
      expiredRoles: expired.map((r) => r.role),
      overallDeadlineMs,
    });
  }
  return results;
}
