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
import type { IModelAdapter, ILogger } from '../core/index.js';
import { createLogger, getTimeProvider, getErrorMessage } from '../core/index.js';
import { getGlobalRegistry } from '../adapters/unified-registry.js';
import { getAvailableClis } from '../cli-adapters/factory.js';
import type { CliName } from '../cli-adapters/types.js';

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
  createErrorVoteResult,
  createSimulationVoteResult,
  createSimulatedVotes,
  simulateVote,
  withTimeout,
  delay,
  extractTextFromResponse,
  executeSingleVoteAttempt,
  validateTimeout,
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

// ============================================================================
// Agent Vote Execution
// ============================================================================

/**
 * Options for executing voter agents.
 */
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
}

// Re-export AgentVoteResult for convenience
export type { AgentVoteResult };

const defaultLogger = createLogger({ component: 'voter-agents' });

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
    return { role, vote: result.vote, processingTimeMs, source: 'llm', cli: adapter.providerId };
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

  return createErrorVoteResult(role, result.error, processingTimeMs);
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
    const registry = getGlobalRegistry({ logger });
    return { adapter: registry.getDefault() };
  } catch (error) {
    return { error: getErrorMessage(error) };
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
async function resolveDiverseAdapters(
  roles: readonly VoterRole[],
  logger: ILogger,
  fallbackAdapter: IModelAdapter
): Promise<Map<VoterRole, IModelAdapter>> {
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

  // Round-robin assign roles to diverse CLIs
  const cliList = [...cliAdapters.entries()];
  const adapters = new Map<VoterRole, IModelAdapter>();
  const assignments: Record<string, string> = {};
  for (let i = 0; i < roles.length; i++) {
    const role = roles[i];
    const entry = cliList[i % cliList.length];
    if (role === undefined || entry === undefined) continue;
    adapters.set(role, entry[1]);
    assignments[role] = entry[0];
  }

  logger.info('Diverse adapters assigned', {
    cliCount: cliAdapters.size,
    clis: [...cliAdapters.keys()],
    roleAssignments: assignments,
  });
  return adapters;
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
      : await resolveDiverseAdapters(roles, logger, adapterResult.adapter);
  const voteOptions = { timeoutMs, maxRetries, allowSimulation: allowSimulation ?? false };
  const votePromises = roles.map((role) => {
    const adapter = roleAdapters.get(role) ?? adapterResult.adapter;
    return executeAgentVote(role, proposal, adapter, logger, voteOptions);
  });

  return Promise.all(votePromises);
}

/**
 * Gets a description for a voter role.
 */
export function getRoleDescription(role: VoterRole): string {
  return VOTER_ROLES[role];
}
