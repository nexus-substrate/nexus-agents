/**
 * nexus-agents voter agents
 *
 * Real LLM-powered voter agents for consensus voting.
 * Replaces simulated voting with actual agent execution that
 * analyzes proposals.
 *
 * (Source: Issue #226, Sprint #229)
 * (Updated: Issue #280 - Fixed timeout handling, removed simulation fallback)
 * (Refactored: Issue #285 - Extracted response and execution utilities)
 *
 * File structure:
 * - voter-prompts.ts: System prompts for each voter role
 * - voter-response.ts: Response parsing and validation
 * - voter-execution.ts: Execution utilities (timeout, retry, result creation)
 * - voter-agents.ts: Main API (this file)
 */

import type {
  VoterRole,
  AgentVoteResult,
  VoteExecutionOverrides,
  VoteExecutionSettings,
} from './vote-types.js';
import { captureModelPinWarnings } from './voter-model-overrides.js';
import { VOTER_ROLES } from './voter-roles.js';
import { createLogger, getTimeProvider, type IModelAdapter, type ILogger } from '../core/index.js';
import { unavailableSeat } from './voter-route-breaker.js';
import { authRemediation } from '../cli-adapters/cli-error-envelope.js';
import { reportVoteIndependence } from './panel-independence.js';
import { DEFAULT_ERRORED_ROLE_BACKOFF_MS, retryErroredRoles } from './voter-retry.js';
import { createVoterRetryState } from './voter-retry.js';
import { resolveAdapterOrFail, warnIfCodexConcurrencyExceeded } from './voter-adapter-resolve.js';
import {
  classifyUnverifiable,
  markUnverifiable,
  type UnverifiableReasoningRule,
} from './voter-unverifiable.js';
import { resolveAttemptCollector, withVoterAttemptTelemetry } from './voter-attempt-events.js';
import { buildLlmVoteResult, carryAttemptUsage } from './voter-attempt-usage.js';
import { withResolvedAssignment } from './vote-diversity.js';
import { assignPanelSeats } from './voter-seat-assignment.js';

// Re-exported: `exports/consensus.ts` and the voter tests import it from here (#5578 moved the class).
export { NoAdapterError } from './voter-adapter-resolve.js';
export { assignPanelSeats, resolveGatewayRoleAdapters } from './voter-seat-assignment.js';
export type { VoteExecutionOverrides } from './vote-types.js';

// Re-export prompts for backward compatibility
export { VOTER_SYSTEM_PROMPTS, SIMULATED_VOTE_REASONING } from './voter-prompts.js';

// Re-export response utilities for backward compatibility
export {
  VoteResponseSchema,
  type VoteResponse,
  buildVotePrompt,
  extractJsonFromResponse,
  parseVoteResponse,
  SyntheticVoteError,
  type ParsedVote,
  type ParsedVoteSource,
} from './voter-response.js';

// Re-export execution utilities for backward compatibility
export {
  DEFAULT_VOTE_TIMEOUT_MS,
  MAX_VOTE_TIMEOUT_MS,
  MIN_VOTE_TIMEOUT_MS,
  DEFAULT_MAX_RETRIES,
  RATE_LIMIT_RETRY_DELAY_MS,
  createErrorVoteResult,
  createSimulationVoteResult,
  createSimulatedVotes,
  simulateVote,
  isRateLimitError,
  withTimeout,
  delay,
  extractTextFromResponse,
  executeSingleVoteAttempt,
  resolveVoteTimeout,
  type RetryOptions,
  executeWithRetries,
} from './voter-execution.js';

// Import from execution module for internal use
import {
  createErrorVoteResult,
  createSimulationVoteResult,
  createSimulatedVotes,
  executeWithRetries,
} from './voter-execution.js';
import { resolveVoteTimeout, VOTE_TIMEOUTS } from '../config/timeouts.js';
import * as voterDeadline from './voter-agents-deadline.js';
import { resolvePanelWorkspace } from './panel-workspace.js';
import { ensureGatewayDiscovered } from '../adapters/gateway-rediscovery.js';

// Preserve the established public import while the deadline owner lives beside the launcher.
export { computeOverallConsensusDeadlineMs } from './voter-agents-deadline.js';

// ============================================================================
// Agent Vote Execution
// ============================================================================

/**
 * Options for executing voter agents.
 */
/** Default inter-agent delay to prevent rate limiting (ms). Raised from 1s to 2s (#1802). */
export const DEFAULT_INTER_AGENT_DELAY_MS = 2000;

export interface VoterAgentOptions {
  /** Logger instance */
  readonly logger?: ILogger;
  /** Model adapter to use (auto-selected if not provided) */
  readonly adapter?: IModelAdapter;
  /** Timeout per vote in milliseconds (default: 120000, override via NEXUS_VOTE_TIMEOUT_MS) */
  readonly timeoutMs?: number;
  /** Maximum retries per vote (default: 2) */
  readonly maxRetries?: number;
  /** Whether to allow simulation fallback (default: false per Issue #280) */
  readonly allowSimulation?: boolean;
  /** Delay between launching each agent vote to prevent rate limiting (default: 1000ms). Set to 0 to disable. */
  readonly interAgentDelayMs?: number;
}

// Re-export AgentVoteResult for convenience
export type { AgentVoteResult };

const defaultLogger = createLogger({ component: 'voter-agents' });

/**
 * The parsed vote, or — when the seat could not read the artifact — the same
 * seat re-recorded as `unverifiable` with its returned decision discarded and
 * logged (#6094). Classification prefers the transport's stderr (structured)
 * over the reasoning text (fallback); the log names which one fired.
 */
function finalizeParsedVote(
  built: AgentVoteResult,
  cliStderr: string | undefined,
  logger: ILogger
): AgentVoteResult {
  const { role, model } = built;
  const signal = classifyUnverifiable(
    { cliStderr, reasoning: built.vote.reasoning },
    (rule: UnverifiableReasoningRule) => {
      logger.debug('Unverifiable reasoning fallback fired', { role, rule });
    }
  );
  if (signal === undefined) {
    logger.info('Vote completed', { role, model, decision: built.vote.decision });
    return built;
  }
  logger.warn('Seat could not read the artifact — recorded as unverifiable, decision discarded', {
    role,
    model,
    signal,
    discardedDecision: built.vote.decision,
    ...(built.selectedOption !== undefined ? { discardedOption: built.selectedOption } : {}),
  });
  return markUnverifiable(built, signal);
}

/**
 * Executes a real LLM vote for a single role with timeout and retry support.
 *
 * Per Issue #280: No simulation fallback by default. Returns error result
 * instead of simulated vote when execution fails.
 */
/** Resolve per-call vote execution settings against their defaults. */
function resolveVoteExecution(options: VoteExecutionOverrides = {}): VoteExecutionSettings {
  return {
    timeoutMs: options.timeoutMs ?? resolveVoteTimeout(),
    maxRetries: options.maxRetries ?? VOTE_TIMEOUTS.maxRetries,
    allowSimulation: options.allowSimulation ?? false,
    declaredOptions: options.declaredOptions,
    project: options.project,
    workspace: options.workspace,
    workspaceSha: options.workspaceSha,
    onError: options.onError,
  };
}

export async function executeAgentVote(
  role: VoterRole,
  proposal: string,
  adapter: IModelAdapter,
  logger: ILogger,
  options: VoteExecutionOverrides = {}
): Promise<AgentVoteResult> {
  const unavailable = unavailableSeat(adapter, role);
  if (unavailable !== undefined) return unavailable;
  const start = getTimeProvider().now();
  // `settings` is timeoutMs, maxRetries, project and workspace — the retry hop's own fields.
  const { allowSimulation, declaredOptions, ...settings } = resolveVoteExecution(options);

  logger.info('Executing vote', { role, model: adapter.modelId, provider: adapter.providerId });

  // #6729: the panel's cancel rides along so it reaches this seat's adapter call.
  const collector = resolveAttemptCollector(options);
  const attach = (vote: AgentVoteResult): AgentVoteResult =>
    withVoterAttemptTelemetry(vote, () => collector.snapshot());
  const retryOptions = {
    role,
    proposal,
    adapter,
    logger,
    ...settings,
    signal: options.signal,
    attemptCollector: collector,
    attemptKind: options.attemptKind,
    withinRoleRetry: options.withinRoleRetry,
  };
  const result = await executeWithRetries({ ...retryOptions, options: declaredOptions });
  const processingTimeMs = getTimeProvider().now() - start;

  if (result.ok) {
    const built = buildLlmVoteResult(role, result, adapter, processingTimeMs);
    const finalized = finalizeParsedVote(built, result.cliStderr, logger);
    if (finalized.source !== 'llm') collector.discardFinal();
    return attach(finalized);
  }

  // Retries exhausted or explicitly refused by the adapter.
  options.onError?.(role, result.retryable);
  logger.error('Vote execution failed after all retries', undefined, {
    role,
    model: adapter.modelId,
    errorMessage: result.error,
  });

  if (allowSimulation) {
    logger.warn('Falling back to simulation (allowSimulation=true)', { role });
    const simulated = createSimulationVoteResult(role, proposal, processingTimeMs, result.error);
    return attach(carryAttemptUsage(result, simulated));
  }

  // #3350: a stale-OAuth failure (e.g. codex "refresh token already used")
  // surfaces here as a raw fail-closed error with no operator signal. Append a
  // one-line `<cli> login` remediation when the error is an auth error. Vote
  // semantics are unchanged — this is still an error (abstain) vote.
  const remediation = authRemediation(result.error, adapter.providerId);
  const errorText = remediation === null ? result.error : `${result.error}\n\n${remediation}`;
  const errored = createErrorVoteResult(role, errorText, processingTimeMs, adapter.providerId);
  return attach(carryAttemptUsage(result, errored));
}

// ============================================================================
// Batch Vote Collection
// ============================================================================

/**
 * Options for collecting votes from multiple agents.
 */
export interface CollectRealVotesOptions extends VoterAgentOptions {
  /** Repository checkout used by every panel seat. */
  readonly workspace?: string | undefined;
  readonly workspaceSha?: string | undefined;
  /** Voter roles to include */
  readonly roles: readonly VoterRole[];
  /** Proposal text */
  readonly proposal: string;
  /** Use simulation mode (explicit opt-in only) */
  readonly simulate?: boolean;
  /**
   * In-process gateway model adapters (#4040) — one per discovered gateway model.
   * When provided (and no explicit `adapter` override), voters route through these
   * HTTP adapters instead of shelling out to CLIs: roles are round-robined across
   * them for per-role model diversity, the API key stays in-process (no subprocess
   * env-forwarding), and the nested-spawn class (#4033) cannot occur. Empty/omitted
   * ⇒ the CLI round-robin path is used (unchanged).
   */
  readonly gatewayAdapters?: readonly IModelAdapter[] | undefined;
  /** Named alternatives for a multi-option proposal (#4472); each voter picks one. */
  readonly declaredOptions?: readonly string[] | undefined;
  /**
   * The project the panel is judging, already resolved and validated by the
   * caller (#6110). Reaches every seat's system prompt. Absent ⇒ `nexus-agents`.
   */
  readonly project?: string | undefined;
  /**
   * Cancellation for an in-flight panel. Stops LAUNCHING voters that have not
   * started (#5393), aborts the adapter call of every seat already in flight
   * (#6729), and skips the errored-seat retry pass. Absent changes nothing.
   */
  readonly signal?: AbortSignal | undefined;
  /**
   * Per-seat progress callback (#6162): invoked with each seat's result as it
   * settles, on every pass (first, fallback, retry). The async-job heartbeat
   * for vote bodies; absent changes nothing.
   */
  readonly onVoteCollected?: ((vote: AgentVoteResult) => void) | undefined;
  /**
   * Delay before the per-role retry of errored voters (#5578). Defaults to
   * {@link DEFAULT_ERRORED_ROLE_BACKOFF_MS}; 0 disables the wait, which is what
   * tests want. The retry itself is not optional — the panel applies it under
   * every error policy, per the #5578 design panel (option b, 6 of 6).
   */
  readonly erroredRoleBackoffMs?: number | undefined;
  /**
   * Seats already assigned by {@link assignPanelSeats} (#6003): a caller that
   * must know the panel's models BEFORE the vote (the pr_review budget reads
   * their windows) resolves the seats once and hands them back, so the panel
   * runs on exactly what it was budgeted for. Ignored when `adapter` is set.
   */
  readonly roleAdapters?: ReadonlyMap<VoterRole, IModelAdapter> | undefined;
}

/** Options for staggered vote launching. */
/** Caller-supplied vote execution overrides; unset fields take defaults. */

interface StaggeredVoteInput {
  readonly roles: readonly VoterRole[];
  readonly proposal: string;
  readonly roleAdapters: Map<VoterRole, IModelAdapter>;
  readonly fallbackAdapter: IModelAdapter;
  readonly logger: ILogger;
  /** Passed straight to executeAgentVote; declaredOptions per #4472. */
  readonly voteOptions: VoteExecutionSettings;
  readonly interDelay: number;
  /** Cancellation for the un-launched remainder of the panel (#5393). */
  readonly signal?: AbortSignal | undefined;
  /** Per-seat heartbeat (#6162), forwarded to the deadline launcher. */
  readonly onVoteCollected?: ((vote: AgentVoteResult) => void) | undefined;
}

/**
 * Launches votes with staggered delays to prevent rate limiting (Issue #1319)
 * and an overall wall-clock deadline to prevent indefinite hangs (Issue #1871).
 */
async function launchStaggeredVotes(
  input: StaggeredVoteInput,
  overallDeadlineMs: number,
  deadlineAtMs: number
): Promise<readonly AgentVoteResult[]> {
  // `StaggeredVoteInput` is `LaunchVotesInput` minus the deadline and the
  // launcher, so the input passes through whole — including `signal` (#5393)
  // and `onVoteCollected` (#6162).
  return voterDeadline.launchVotesWithOverallDeadline({
    ...input,
    overallDeadlineMs,
    deadlineAtMs,
    voteFn: executeAgentVote,
  });
}

/**
 * Collects votes from multiple voter agents.
 *
 * Per Issue #280: No automatic simulation fallback. If no adapter is
 * available and simulation is not explicitly enabled, throws NoAdapterError.
 * Per Issue #845: Uses diverse CLIs when multiple are available.
 */

async function collectPanelPasses(
  input: StaggeredVoteInput,
  deadline: ReturnType<typeof voterDeadline.resolvePanelDeadline>,
  nonRetryableRoles: ReadonlySet<VoterRole>,
  backoffMs: number
): Promise<readonly AgentVoteResult[]> {
  const { overallDeadlineMs, deadlineAtMs } = deadline;
  const first = await launchStaggeredVotes(input, overallDeadlineMs, deadlineAtMs);
  const final = await retryErroredRoles(
    first,
    (roles) =>
      launchStaggeredVotes(
        { ...input, roles, voteOptions: { ...input.voteOptions, attemptKind: 'role_retry' } },
        overallDeadlineMs,
        deadlineAtMs
      ),
    input.logger,
    backoffMs,
    { signal: input.signal, deadlineAtMs, nonRetryableRoles }
  );
  // Supplementary selections cannot spend the shared retry window (#4495).
  return voterDeadline.reaskUnresolvedOptions(final, input, deadlineAtMs);
}

export async function collectRealVotes(
  options: CollectRealVotesOptions
): Promise<readonly AgentVoteResult[]> {
  const logger = options.logger ?? defaultLogger;
  const { roles, proposal, simulate, allowSimulation } = options;

  if (simulate === true) {
    logger.info('Using simulation mode (explicitly requested)');
    return createSimulatedVotes(roles, proposal);
  }

  // #6608: a gateway down at boot is re-discovered here (backoff-bounded)
  // and fills `options.gatewayAdapters` in place before seats are assigned.
  await ensureGatewayDiscovered();
  const adapterResult = resolveAdapterOrFail(options, logger, allowSimulation === true);
  if ('simulated' in adapterResult)
    return createSimulatedVotes(roles, proposal, 'No adapter available');

  const roleAdapters = await assignPanelSeats(adapterResult.adapter, options, logger);

  const discloseModelPins = captureModelPinWarnings(options);
  warnIfCodexConcurrencyExceeded(roleAdapters, logger);

  // The same resolver executeAgentVote applies, so the two paths cannot drift
  // on a default. Carried through: timeoutMs / maxRetries / allowSimulation;
  // declaredOptions (#4472) into the prompt and the selection resolver; the
  // target project (#6110) into every system prompt; and the working
  // directory (#6358) — explicitly passed to every subprocess seat, which the
  // gemini arm now also gets as --add-dir — read once so every seat of the
  // panel names the same tree in its REPOSITORY ACCESS block.
  const workspace = resolvePanelWorkspace(options.workspace);
  const { nonRetryableRoles, onError } = createVoterRetryState();
  const voteOptions = resolveVoteExecution({ ...options, workspace, onError });
  const interDelay = options.interAgentDelayMs ?? DEFAULT_INTER_AGENT_DELAY_MS;

  const launchInput: StaggeredVoteInput = {
    roles,
    proposal,
    roleAdapters,
    fallbackAdapter: adapterResult.adapter,
    logger,
    voteOptions,
    interDelay,
    signal: options.signal,
    onVoteCollected: options.onVoteCollected,
  };
  // Clamp once, then share the same cutoff across both passes and backoff (#6811).
  const { overallDeadlineMs, deadlineAtMs } = voterDeadline.resolvePanelDeadline(
    voteOptions.timeoutMs,
    voteOptions.maxRetries,
    roles.length,
    interDelay,
    logger
  );
  const results = await collectPanelPasses(
    launchInput,
    { overallDeadlineMs, deadlineAtMs },
    nonRetryableRoles,
    options.erroredRoleBackoffMs ?? DEFAULT_ERRORED_ROLE_BACKOFF_MS
  );

  // #4983/#5546: this is the only point the question is answerable. Assess the
  // successful result provenance, not the assigned adapters: a failed primary
  // may have been replaced by a vote from the shared fallback model.
  reportVoteIndependence(results, logger);
  return results.map((vote) => discloseModelPins(withResolvedAssignment(vote)));
}

/**
 * Gets a description for a voter role.
 */
export function getRoleDescription(role: VoterRole): string {
  return VOTER_ROLES[role];
}
