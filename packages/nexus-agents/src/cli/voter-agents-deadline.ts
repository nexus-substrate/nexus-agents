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
  /**
   * Cancellation for in-flight panels (#5393).
   *
   * Checked after each stagger delay, so a cancel stops LAUNCHING the voters
   * that have not started. Votes already in flight are left to settle — an
   * adapter call is a subprocess or an HTTP request whose cost is already
   * incurred, and abandoning it would lose the result without saving the spend.
   * The win is the remaining panel: cancelling a 7-voter vote after two have
   * run stops five model calls.
   *
   * Absent or un-aborted changes nothing.
   */
  readonly signal?: AbortSignal | undefined;
}

const DEADLINE_MESSAGE = 'overall consensus deadline exceeded';
/**
 * #5393: reported for a voter the panel never launched. An ERROR result, never
 * a default decision — a cancelled voter returning `approve` would manufacture
 * consensus out of work that never ran.
 */
const CANCELLED_MESSAGE = 'cancelled before this voter was launched';

/**
 * #3587: a voter routed to a diverse CLI that hard-fails (e.g. an OpenRouter
 * model without tool-use → "no endpoints that support tool use", which the
 * responseFormat retry can't fix) would silently shrink the panel. Retry once on
 * the known-good fallback adapter so one bad CLI cannot drop a voter.
 *
 * Should a failed vote be retried on the fallback adapter? Only when the diverse
 * adapter produced a genuine error (not the overall-deadline filler, which means
 * there's no time left) AND it wasn't already the fallback (#3587).
 */
function shouldRetryOnFallback(
  result: AgentVoteResult,
  used: IModelAdapter,
  fallback: IModelAdapter
): boolean {
  return (
    result.source === 'error' &&
    result.error !== DEADLINE_MESSAGE &&
    adapterCliKey(used) !== adapterCliKey(fallback)
  );
}

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

/**
 * Read through a function, not inline (#5393): after one
 * `signal?.aborted === true` check TypeScript narrows the field to `false` for
 * the rest of the enclosing closure, which is unsound across an `await` — the
 * whole point is that it can flip while a vote is in flight.
 */
function cancelled(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

/*
 * #5393 added two guards — one per model call this function can make — to a body
 * already at the 50-line cap. Splitting the staggered mapper out would need six
 * closed-over values threaded through an options object, which is more structure
 * than two `if` statements justify; the #3587 rationale moved onto
 * `shouldRetryOnFallback` to pay for what it could. Revisit if this grows again.
 */
// eslint-disable-next-line max-lines-per-function -- see the note above (#5393)
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

  // One serialized, deadline-bounded vote attempt on a specific adapter.
  const voteOnAdapter = (role: VoterRole, adapter: IModelAdapter): Promise<AgentVoteResult> =>
    // Serialize per CLI so concurrent same-CLI calls don't race that CLI's
    // OAuth refresh (#3348). The deadline is measured when the vote actually
    // starts, so a queued role still gets a correct remaining budget.
    serialize(adapterCliKey(adapter), () => {
      const remaining = Math.max(1, overallDeadlineMs - (Date.now() - startedAt));
      return raceWithDeadline(
        voteFn(role, proposal, adapter, logger, voteOptions),
        role,
        remaining
      );
    });

  const wrapped = roles.map(async (role, i): Promise<AgentVoteResult> => {
    if (i > 0 && interDelay > 0) await delay(interDelay);
    if (cancelled(input.signal)) return createErrorVoteResult(role, CANCELLED_MESSAGE, 0);
    const adapter = roleAdapters.get(role) ?? fallbackAdapter;
    const primary = await voteOnAdapter(role, adapter);
    if (!shouldRetryOnFallback(primary, adapter, fallbackAdapter)) return primary;
    // A retry is a second model call; do not spend it on a cancelled panel.
    if (cancelled(input.signal)) return primary;
    logger.warn('Voter failed on diverse adapter; retrying on fallback (#3587)', {
      role,
      failedCli: adapterCliKey(adapter),
      fallbackCli: adapterCliKey(fallbackAdapter),
      error: primary.error,
    });
    return voteOnAdapter(role, fallbackAdapter);
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
