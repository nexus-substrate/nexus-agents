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
import { createLogger } from '../core/index.js';
import { createAutoAdapter } from '../adapters/auto-adapter.js';

// Re-export prompts for backward compatibility
export { VOTER_SYSTEM_PROMPTS, SIMULATED_VOTE_REASONING } from './voter-prompts.js';

// Re-export response utilities for backward compatibility
export {
  VoteResponseSchema,
  type VoteResponse,
  buildVotePrompt,
  extractJsonFromResponse,
  parseVoteResponse,
} from './voter-response.js';

// Re-export execution utilities for backward compatibility
export {
  DEFAULT_VOTE_TIMEOUT_MS,
  DEFAULT_MAX_RETRIES,
  createErrorVoteResult,
  createSimulationVoteResult,
  createSimulatedVotes,
  simulateVote,
  withTimeout,
  delay,
  extractTextFromResponse,
  executeSingleVoteAttempt,
  type RetryOptions,
  executeWithRetries,
} from './voter-execution.js';

// Import from execution module for internal use
import {
  DEFAULT_VOTE_TIMEOUT_MS,
  DEFAULT_MAX_RETRIES,
  createErrorVoteResult,
  createSimulationVoteResult,
  createSimulatedVotes,
  executeWithRetries,
} from './voter-execution.js';

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
  /** Timeout per vote in milliseconds (default: 30000) */
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
  const start = Date.now();
  const timeoutMs = options?.timeoutMs ?? DEFAULT_VOTE_TIMEOUT_MS;
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const allowSimulation = options?.allowSimulation ?? false;

  const result = await executeWithRetries({
    role,
    proposal,
    adapter,
    logger,
    timeoutMs,
    maxRetries,
  });
  const processingTimeMs = Date.now() - start;

  if (result.ok) {
    return { role, vote: result.vote, processingTimeMs, source: 'llm' };
  }

  // All retries exhausted
  logger.error('Vote execution failed after all retries', undefined, {
    role,
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
async function resolveAdapter(
  options: CollectRealVotesOptions,
  logger: ILogger
): Promise<{ adapter: IModelAdapter } | { error: string }> {
  try {
    const selection =
      options.adapter !== undefined
        ? { adapter: options.adapter, source: 'provided' as const }
        : await createAutoAdapter({ logger });
    return { adapter: selection.adapter };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { error: errorMessage };
  }
}

/**
 * Collects votes from multiple voter agents.
 *
 * Per Issue #280: No automatic simulation fallback. If no adapter is
 * available and simulation is not explicitly enabled, throws NoAdapterError.
 */
export async function collectRealVotes(
  options: CollectRealVotesOptions
): Promise<readonly AgentVoteResult[]> {
  const logger = options.logger ?? defaultLogger;
  const { roles, proposal, simulate, allowSimulation } = options;
  const timeoutMs = options.timeoutMs ?? DEFAULT_VOTE_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

  if (simulate === true) {
    logger.info('Using simulation mode (explicitly requested)');
    return createSimulatedVotes(roles, proposal);
  }

  const adapterResult = await resolveAdapter(options, logger);

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

  logger.info('Using adapter for voting', { timeoutMs, maxRetries });
  const voteOptions = { timeoutMs, maxRetries, allowSimulation: allowSimulation ?? false };
  const votePromises = roles.map((role) =>
    executeAgentVote(role, proposal, adapterResult.adapter, logger, voteOptions)
  );

  return Promise.all(votePromises);
}

/**
 * Gets a description for a voter role.
 */
export function getRoleDescription(role: VoterRole): string {
  return VOTER_ROLES[role];
}
