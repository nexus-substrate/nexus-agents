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
import type { AgentVoteResult, SeatAttemptTiming, VoterRole } from './vote-types.js';
import { createErrorVoteResult, delay } from './voter-execution.js';
import { crossCliFallback, withAssignedCli } from './voter-fallback.js';

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
 * Preserve the panel resolver's primary assignment across fallback execution:
 * the model it pinned, and (#6115) the CLI it chose, which unlike the model is
 * known before detection and so survives the `pending-detection` placeholder.
 */
function withAssignment(
  result: AgentVoteResult,
  pinnedModel: string,
  assignedKey: string
): AgentVoteResult {
  return withAssignedCli({ ...result, pinnedModel }, assignedKey);
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

/** Both attempts travel with a recovered seat (#6103): the failed primary's timing first. */
function withPrimaryAttempts(
  primary: AgentVoteResult,
  recovered: AgentVoteResult
): AgentVoteResult {
  return {
    ...recovered,
    timing: {
      attempts: [...(primary.timing?.attempts ?? []), ...(recovered.timing?.attempts ?? [])],
    },
  };
}

type VoteOnAdapter = (
  role: VoterRole,
  adapter: IModelAdapter,
  fallback: boolean
) => Promise<AgentVoteResult>;

async function launchRoleVote(
  role: VoterRole,
  index: number,
  input: LaunchVotesInput,
  voteOnAdapter: VoteOnAdapter
): Promise<AgentVoteResult> {
  if (index > 0 && input.interDelay > 0) await delay(input.interDelay);
  const adapter = input.roleAdapters.get(role) ?? input.fallbackAdapter;
  const pinnedModel = adapter.modelId;
  const assignedKey = adapterCliKey(adapter);
  const stamp = (r: AgentVoteResult): AgentVoteResult =>
    withAssignment(r, pinnedModel, assignedKey);
  if (cancelled(input.signal)) {
    // Refused before any attempt: the timing says so with an empty list.
    return stamp({
      ...createErrorVoteResult(role, CANCELLED_MESSAGE, 0),
      timing: { attempts: [] },
    });
  }
  const primary = await voteOnAdapter(role, adapter, false);
  if (!shouldRetryOnFallback(primary, adapter, input.fallbackAdapter)) return stamp(primary);
  if (cancelled(input.signal)) return stamp(primary);
  input.logger.warn('Voter failed on diverse adapter; retrying on fallback (#3587)', {
    role,
    failedCli: assignedKey,
    fallbackCli: adapterCliKey(input.fallbackAdapter),
    error: primary.error,
  });
  const recovered = withPrimaryAttempts(
    primary,
    await voteOnAdapter(role, input.fallbackAdapter, true)
  );
  if (recovered.source === 'error') return stamp(recovered);
  // #6115: the seat ANSWERED somewhere other than where it was assigned. Say
  // where it was meant to answer and which error class moved it, so a panel
  // that collapsed onto one model during a capacity window is legible in the
  // result rather than only in this log line. A seat that errored on the
  // fallback too answered nowhere and carries no fallback.
  const fallback = crossCliFallback(adapter, assignedKey, primary.error ?? '');
  return stamp({ ...recovered, fallback });
}

export async function launchVotesWithOverallDeadline(
  input: LaunchVotesInput
): Promise<readonly AgentVoteResult[]> {
  const { roles, proposal, logger, voteOptions, overallDeadlineMs, voteFn } = input;

  const startedAt = Date.now();
  const serialize = createKeyedSerializer();

  // One serialized, deadline-bounded vote attempt on a specific adapter.
  // #6103: the attempt's timing rides on the result — queued (enqueue → start)
  // and ran (start → settle) — so a slow panel can be attributed to the lane
  // or to the model. The caller folds attempts into the seat's `timing`.
  const voteOnAdapter = (
    role: VoterRole,
    adapter: IModelAdapter,
    fallback: boolean
  ): Promise<AgentVoteResult> => {
    const cli = adapterCliKey(adapter);
    const enqueuedAt = Date.now();
    // Serialize per CLI so concurrent same-CLI calls don't race that CLI's
    // OAuth refresh (#3348). The deadline is measured when the vote actually
    // starts, so a queued role still gets a correct remaining budget.
    return serialize(cli, async () => {
      const runStartedAt = Date.now();
      const remaining = Math.max(1, overallDeadlineMs - (runStartedAt - startedAt));
      const result = await raceWithDeadline(
        voteFn(role, proposal, adapter, logger, voteOptions),
        role,
        remaining
      );
      const attempt: SeatAttemptTiming = {
        cli,
        queuedMs: runStartedAt - enqueuedAt,
        ranMs: Date.now() - runStartedAt,
        fallback,
      };
      return { ...result, timing: { attempts: [...(result.timing?.attempts ?? []), attempt] } };
    });
  };

  const wrapped = roles.map((role, index) => launchRoleVote(role, index, input, voteOnAdapter));

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
