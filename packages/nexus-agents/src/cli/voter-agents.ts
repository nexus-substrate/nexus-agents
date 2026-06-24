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

import type { VoterRole, AgentVoteResult } from './vote-types.js';
import { VOTER_ROLES } from './vote-types.js';
import type { Vote } from '../consensus/types.js';
import type { VoteUsage } from './voter-execution.js';
import type { IModelAdapter, ILogger } from '../core/index.js';
import { createLogger, getTimeProvider, getErrorMessage } from '../core/index.js';
import { getGlobalRegistry } from '../adapters/unified-registry.js';
import { getAvailableClis } from '../cli-adapters/factory.js';
import { authRemediation } from '../cli-adapters/cli-error-envelope.js';
import type { CliName } from '../cli-adapters/types.js';
import { checkCodexConcurrency } from '../cli-adapters/codex-limits.js';

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
  type ParseVoteOptions,
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
import { resolveVoteTimeout, VOTE_TIMEOUTS, getMcpSafeDeadlineMs } from '../config/timeouts.js';
import { launchVotesWithOverallDeadline } from './voter-agents-deadline.js';

/**
 * Computes an overall wall-clock deadline for a consensus vote call (#1871).
 *
 * Acts as a safety net above per-vote timeouts: even if executeAgentVote's
 * internal withTimeout race fails to resolve (e.g. subprocess adapter hang),
 * this deadline bounds total wall time and lets partial results return.
 *
 * Formula: worst-case legitimate completion (timeoutMs * (maxRetries+1))
 * plus staggered launch headroom, plus `VOTE_TIMEOUTS.overallDeadlineBufferMs`.
 */
export function computeOverallConsensusDeadlineMs(
  timeoutMs: number,
  maxRetries: number,
  roleCount: number,
  interDelayMs: number
): number {
  const perVoteBudget = timeoutMs * (maxRetries + 1);
  const staggerBudget = Math.max(0, roleCount - 1) * interDelayMs;
  return perVoteBudget + staggerBudget + VOTE_TIMEOUTS.overallDeadlineBufferMs;
}

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
 * Builds the successful LLM `AgentVoteResult`, propagating the adapter-reported
 * per-call tokens so the decision-cost rollup attributes this voter as MEASURED,
 * not unmeasured (#3910). Only attaches a token field when the adapter actually
 * reported it — an absent count stays absent (⇒ unmeasured), never a fabricated 0.
 */
function buildLlmVoteResult(
  role: VoterRole,
  vote: Vote,
  usage: VoteUsage,
  adapter: IModelAdapter,
  processingTimeMs: number
): AgentVoteResult {
  return {
    role,
    vote,
    processingTimeMs,
    source: 'llm',
    cli: adapter.providerId,
    model: adapter.modelId,
    ...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
    ...(usage.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),
  };
}

/**
 * Executes a real LLM vote for a single role with timeout and retry support.
 *
 * Per Issue #280: No simulation fallback by default. Returns error result
 * instead of simulated vote when execution fails.
 */
export async function executeAgentVote(
  role: VoterRole,
  proposal: string,
  adapter: IModelAdapter,
  logger: ILogger,
  options?: { timeoutMs?: number; maxRetries?: number; allowSimulation?: boolean }
): Promise<AgentVoteResult> {
  const start = getTimeProvider().now();
  const timeoutMs = options?.timeoutMs ?? resolveVoteTimeout();
  const maxRetries = options?.maxRetries ?? VOTE_TIMEOUTS.maxRetries;
  const allowSimulation = options?.allowSimulation ?? false;

  logger.info('Executing vote', { role, model: adapter.modelId, provider: adapter.providerId });

  const result = await executeWithRetries({
    role,
    proposal,
    adapter,
    logger,
    timeoutMs,
    maxRetries,
  });
  const processingTimeMs = getTimeProvider().now() - start;

  if (result.ok) {
    logger.info('Vote completed', { role, model: adapter.modelId, decision: result.vote.decision });
    return buildLlmVoteResult(role, result.vote, result.usage, adapter, processingTimeMs);
  }

  // All retries exhausted
  logger.error('Vote execution failed after all retries', undefined, {
    role,
    model: adapter.modelId,
    errorMessage: result.error,
  });

  if (allowSimulation) {
    logger.warn('Falling back to simulation (allowSimulation=true)', { role });
    return createSimulationVoteResult(role, proposal, processingTimeMs, result.error);
  }

  // #3350: a stale-OAuth failure (e.g. codex "refresh token already used")
  // surfaces here as a raw fail-closed error with no operator signal. Append a
  // one-line `<cli> login` remediation when the error is an auth error. Vote
  // semantics are unchanged — this is still an error (abstain) vote.
  const remediation = authRemediation(result.error, adapter.providerId);
  const errorText = remediation === null ? result.error : `${result.error}\n\n${remediation}`;
  return createErrorVoteResult(role, errorText, processingTimeMs);
}

// ============================================================================
// Batch Vote Collection
// ============================================================================

/**
 * Options for collecting votes from multiple agents.
 */
export interface CollectRealVotesOptions extends VoterAgentOptions {
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
}

/**
 * Error thrown when no adapter is available and simulation is disabled.
 */
export class NoAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoAdapterError';
  }
}

/**
 * Resolves the model adapter, handling errors per Issue #280.
 */
function resolveAdapter(
  options: CollectRealVotesOptions,
  logger: ILogger
): { adapter: IModelAdapter } | { error: string } {
  try {
    if (options.adapter !== undefined) return { adapter: options.adapter };
    // #4040: prefer an in-process gateway adapter as the fallback so a
    // gateway-only environment (no CLIs installed) never hits the CLI registry,
    // which would throw "No model adapter configured".
    const gateway = options.gatewayAdapters;
    if (gateway !== undefined && gateway.length > 0 && gateway[0] !== undefined) {
      return { adapter: gateway[0] };
    }
    const registry = getGlobalRegistry({ logger });
    return { adapter: registry.getDefault() };
  } catch (error) {
    return { error: getErrorMessage(error) };
  }
}

/**
 * #2659 — warn (don't block) when more voter roles land on Codex than its
 * default `max_threads`, e.g. a single-CLI fallback with a full panel.
 */
function warnIfCodexConcurrencyExceeded(
  roleAdapters: ReadonlyMap<VoterRole, IModelAdapter>,
  logger: ILogger
): void {
  const codexBound = [...roleAdapters.values()].filter(
    (a) => (a as { name?: string }).name === 'codex'
  ).length;
  const warning = checkCodexConcurrency(codexBound);
  if (warning !== null) {
    logger.warn('Codex concurrency limit may be exceeded', { detail: warning });
  }
}

/** Assigns a single adapter to all roles (fallback path). */
function assignUniformAdapter(
  roles: readonly VoterRole[],
  adapter: IModelAdapter
): Map<VoterRole, IModelAdapter> {
  const adapters = new Map<VoterRole, IModelAdapter>();
  for (const role of roles) adapters.set(role, adapter);
  return adapters;
}

/** Creates CLI-specific adapters for available CLIs via the unified registry. */
function createCliAdapterMap(
  clis: readonly CliName[],
  logger: ILogger
): Map<CliName, IModelAdapter> {
  const registry = getGlobalRegistry({ logger });
  const result = new Map<CliName, IModelAdapter>();
  for (const cli of clis) {
    result.set(cli, registry.getAdapterForCli(cli));
  }
  return result;
}

/**
 * Creates diverse per-role adapters using all available CLIs (Issue #845).
 * Distributes roles across CLIs in round-robin fashion for model diversity.
 * Falls back to single adapter if only one CLI is available.
 */
/**
 * Round-robin assign roles across a labeled adapter list (the shared diversity
 * primitive for both the CLI path and the gateway path #4040). `label` is the
 * model/CLI id surfaced in the assignment log so operators can confirm which
 * model each role used.
 */
function assignRoundRobinAdapters(
  roles: readonly VoterRole[],
  entries: readonly { readonly label: string; readonly adapter: IModelAdapter }[],
  logger: ILogger,
  source: string
): Map<VoterRole, IModelAdapter> {
  const adapters = new Map<VoterRole, IModelAdapter>();
  const assignments: Record<string, string> = {};
  for (let i = 0; i < roles.length; i++) {
    const role = roles[i];
    const entry = entries[i % entries.length];
    if (role === undefined || entry === undefined) continue;
    adapters.set(role, entry.adapter);
    assignments[role] = entry.label;
  }
  logger.info('Diverse adapters assigned', {
    source,
    count: entries.length,
    roleAssignments: assignments,
  });
  return adapters;
}

async function resolveDiverseAdapters(
  roles: readonly VoterRole[],
  logger: ILogger,
  fallbackAdapter: IModelAdapter,
  gatewayAdapters?: readonly IModelAdapter[]
): Promise<Map<VoterRole, IModelAdapter>> {
  // #4040: gateway path — round-robin roles across the in-process per-model
  // gateway adapters (HTTP, no subprocess). Preferred when configured.
  if (gatewayAdapters !== undefined && gatewayAdapters.length > 0) {
    if (gatewayAdapters.length === 1) {
      logger.info('Single gateway model for all roles', { model: gatewayAdapters[0]?.modelId });
      return assignUniformAdapter(roles, gatewayAdapters[0] ?? fallbackAdapter);
    }
    return assignRoundRobinAdapters(
      roles,
      gatewayAdapters.map((a) => ({ label: a.modelId, adapter: a })),
      logger,
      'gateway'
    );
  }

  let availableClis: CliName[];
  try {
    availableClis = await getAvailableClis();
  } catch (e: unknown) {
    logger.warn('Failed to resolve available CLIs; falling back to single adapter', {
      error: String(e),
    });
    availableClis = [];
  }

  if (availableClis.length <= 1) {
    logger.info('Using single adapter for all roles', { cliCount: availableClis.length });
    return assignUniformAdapter(roles, fallbackAdapter);
  }

  const cliAdapters = createCliAdapterMap(availableClis, logger);
  if (cliAdapters.size <= 1) return assignUniformAdapter(roles, fallbackAdapter);

  return assignRoundRobinAdapters(
    roles,
    [...cliAdapters.entries()].map(([cli, adapter]) => ({ label: cli, adapter })),
    logger,
    'cli'
  );
}

/** Options for staggered vote launching. */
interface StaggeredVoteInput {
  readonly roles: readonly VoterRole[];
  readonly proposal: string;
  readonly roleAdapters: Map<VoterRole, IModelAdapter>;
  readonly fallbackAdapter: IModelAdapter;
  readonly logger: ILogger;
  readonly voteOptions: { timeoutMs: number; maxRetries: number; allowSimulation: boolean };
  readonly interDelay: number;
}

/**
 * Launches votes with staggered delays to prevent rate limiting (Issue #1319)
 * and an overall wall-clock deadline to prevent indefinite hangs (Issue #1871).
 */
async function launchStaggeredVotes(
  input: StaggeredVoteInput
): Promise<readonly AgentVoteResult[]> {
  const { roles, proposal, roleAdapters, fallbackAdapter, logger, voteOptions, interDelay } = input;
  // Raw "worst legitimate completion" estimate — retained unchanged so the
  // formula still answers "how long could this vote take in principle?".
  const computedDeadlineMs = computeOverallConsensusDeadlineMs(
    voteOptions.timeoutMs,
    voteOptions.maxRetries,
    roles.length,
    interDelay
  );
  // Clamp below the outer MCP tool-wrapper timeout. Without this, the
  // middleware kills the promise chain before launchVotesWithOverallDeadline
  // can produce structured partial results — clients see a naked timeout
  // error instead of a `source: 'error' / error: 'overall consensus deadline
  // exceeded'` vote per stuck role. (Issue #2105)
  const overallDeadlineMs = getMcpSafeDeadlineMs(computedDeadlineMs, 'consensus_vote');
  if (overallDeadlineMs < computedDeadlineMs) {
    logger.debug('Consensus deadline clamped to MCP wrapper timeout', {
      computedDeadlineMs,
      overallDeadlineMs,
    });
  }
  return launchVotesWithOverallDeadline({
    roles,
    proposal,
    roleAdapters,
    fallbackAdapter,
    logger,
    voteOptions,
    interDelay,
    overallDeadlineMs,
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
export async function collectRealVotes(
  options: CollectRealVotesOptions
): Promise<readonly AgentVoteResult[]> {
  const logger = options.logger ?? defaultLogger;
  const { roles, proposal, simulate, allowSimulation } = options;
  const timeoutMs = options.timeoutMs ?? resolveVoteTimeout();
  const maxRetries = options.maxRetries ?? VOTE_TIMEOUTS.maxRetries;

  if (simulate === true) {
    logger.info('Using simulation mode (explicitly requested)');
    return createSimulatedVotes(roles, proposal);
  }

  const adapterResult = resolveAdapter(options, logger);

  if ('error' in adapterResult) {
    logger.error('No adapter available for voting', undefined, { error: adapterResult.error });

    if (allowSimulation === true) {
      logger.warn('Falling back to simulation (allowSimulation=true)');
      return createSimulatedVotes(roles, proposal, 'No adapter available');
    }

    throw new NoAdapterError(
      `No adapter available for voting: ${adapterResult.error}. ` +
        'Install a CLI (claude/gemini/codex) or set ANTHROPIC_API_KEY.'
    );
  }

  // Per Issue #845: Use diverse adapters when no explicit adapter is provided
  const roleAdapters =
    options.adapter !== undefined
      ? assignUniformAdapter(roles, adapterResult.adapter)
      : await resolveDiverseAdapters(roles, logger, adapterResult.adapter, options.gatewayAdapters);

  warnIfCodexConcurrencyExceeded(roleAdapters, logger);

  const voteOptions = { timeoutMs, maxRetries, allowSimulation: allowSimulation ?? false };
  const interDelay = options.interAgentDelayMs ?? DEFAULT_INTER_AGENT_DELAY_MS;

  return launchStaggeredVotes({
    roles,
    proposal,
    roleAdapters,
    fallbackAdapter: adapterResult.adapter,
    logger,
    voteOptions,
    interDelay,
  });
}

/**
 * Gets a description for a voter role.
 */
export function getRoleDescription(role: VoterRole): string {
  return VOTER_ROLES[role];
}
