/**
 * nexus-agents voter execution utilities
 *
 * Vote execution helpers including result creation, timeout handling,
 * retry logic, and simulation fallback.
 *
 * (Source: Extracted from voter-agents.ts per Issue #285)
 */

import type { Vote } from '../consensus/types.js';
import type { VoterRole, AgentVoteResult } from './vote-types.js';
import type { IModelAdapter, CompletionRequest, ILogger } from '../core/index.js';
import { VOTER_SYSTEM_PROMPTS, SIMULATED_VOTE_REASONING } from './voter-prompts.js';
import { buildVotePrompt, parseVoteResponse } from './voter-response.js';

/**
 * Default vote execution timeout (30 seconds).
 * Reduced from CLI adapter default (60s) for faster feedback.
 */
export const DEFAULT_VOTE_TIMEOUT_MS = 30_000;

/**
 * Maximum retries for vote execution.
 */
export const DEFAULT_MAX_RETRIES = 2;

/**
 * Initial retry delay in milliseconds.
 */
const INITIAL_RETRY_DELAY_MS = 1_000;

// ============================================================================
// Vote Result Helpers
// ============================================================================

/**
 * Creates an error vote result (abstain with error message).
 */
export function createErrorVoteResult(
  role: VoterRole,
  errorMsg: string,
  processingTimeMs: number
): AgentVoteResult {
  return {
    role,
    vote: {
      decision: 'abstain',
      reasoning: `[Error] Vote execution failed: ${errorMsg}`,
      confidence: 0,
    },
    processingTimeMs,
    source: 'llm',
    error: errorMsg,
  };
}

/**
 * Creates a simulation vote result.
 */
export function createSimulationVoteResult(
  role: VoterRole,
  proposal: string,
  processingTimeMs: number,
  error?: string
): AgentVoteResult {
  return {
    role,
    vote: simulateVote(role, proposal),
    processingTimeMs,
    source: 'simulation',
    ...(error !== undefined && { error }),
  };
}

/**
 * Creates simulated votes for multiple roles.
 */
export function createSimulatedVotes(
  roles: readonly VoterRole[],
  proposal: string,
  error?: string
): readonly AgentVoteResult[] {
  return roles.map((role) =>
    createSimulationVoteResult(role, proposal, Math.floor(Math.random() * 100), error)
  );
}

/**
 * Role-specific vote distributions for simulation.
 * Each role has weighted probabilities reflecting their typical concerns:
 * - security: More skeptical, finds potential issues
 * - architect: Technically focused, generally supportive of good design
 * - devex: Balanced, considers usability
 * - ai_ml: Technically focused, evaluates AI aspects
 * - pm: Business focused, generally supportive of value
 *
 * Format: [approve_weight, reject_weight, abstain_weight]
 */
const ROLE_VOTE_DISTRIBUTIONS: Record<VoterRole, [number, number, number]> = {
  security: [40, 45, 15], // More skeptical - security concerns
  architect: [55, 30, 15], // Generally approving of good design
  devex: [50, 30, 20], // Balanced - considers usability
  ai_ml: [55, 30, 15], // Technical focus
  pm: [55, 25, 20], // Business focus - generally supportive
};

/**
 * Selects a decision based on weighted probabilities.
 */
function selectWeightedDecision(
  weights: [number, number, number]
): 'approve' | 'reject' | 'abstain' {
  const total = weights[0] + weights[1] + weights[2];
  const rand = Math.random() * total;

  if (rand < weights[0]) return 'approve';
  if (rand < weights[0] + weights[1]) return 'reject';
  return 'abstain';
}

/**
 * Fallback simulation when LLM is unavailable.
 * Uses role-specific vote distributions to provide more realistic simulation.
 * Clearly marks output as simulated.
 *
 * (Improved per Issue #453 - remove hardcoded 60% approve bias)
 */
export function simulateVote(role: VoterRole, proposal: string): Vote {
  const weights = ROLE_VOTE_DISTRIBUTIONS[role];
  const decision = selectWeightedDecision(weights);

  // Confidence varies by decision type and role
  // Rejections tend to be higher confidence (found specific issue)
  // Approvals are moderate confidence (no issues found, but limited analysis)
  // Abstains are low confidence (insufficient information)
  let baseConfidence: number;
  if (decision === 'reject') {
    baseConfidence = 0.6 + Math.random() * 0.3; // 0.6-0.9
  } else if (decision === 'approve') {
    baseConfidence = 0.5 + Math.random() * 0.3; // 0.5-0.8
  } else {
    baseConfidence = 0.3 + Math.random() * 0.2; // 0.3-0.5
  }

  return {
    decision,
    reasoning: `[Simulated - no LLM available] ${SIMULATED_VOTE_REASONING[role]} Proposal: "${proposal.slice(0, 50)}..."`,
    confidence: baseConfidence,
  };
}

// ============================================================================
// Timeout and Retry Utilities
// ============================================================================

/**
 * Wraps a promise with a timeout.
 * Returns an error result if timeout is exceeded.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    return { ok: true, value: result };
  } catch (error) {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Delays for the specified milliseconds.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Vote Attempt Execution
// ============================================================================

/**
 * Extracts text content from completion response.
 */
export function extractTextFromResponse(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === 'object' && block !== null && 'type' in block) {
          const typed = block as { type: string; text?: string };
          if (typed.type === 'text' && typeof typed.text === 'string') {
            return typed.text;
          }
        }
        return '';
      })
      .join('');
  }
  return String(content);
}

/**
 * Executes a single vote attempt (no retries).
 */
export async function executeSingleVoteAttempt(
  role: VoterRole,
  proposal: string,
  adapter: IModelAdapter,
  timeoutMs: number
): Promise<{ ok: true; vote: Vote; output: string } | { ok: false; error: string }> {
  const request: CompletionRequest = {
    messages: [
      { role: 'system', content: VOTER_SYSTEM_PROMPTS[role] },
      { role: 'user', content: buildVotePrompt(proposal) },
    ],
    maxTokens: 500,
    temperature: 0.3, // Low temperature for consistent evaluations
  };

  const timeoutResult = await withTimeout(
    adapter.complete(request),
    timeoutMs,
    `Vote timeout after ${String(timeoutMs)}ms for role: ${role}`
  );

  if (!timeoutResult.ok) {
    return { ok: false, error: timeoutResult.error };
  }

  const response = timeoutResult.value;

  if (!response.ok) {
    return { ok: false, error: response.error.message };
  }

  const output = extractTextFromResponse(response.value.content);
  const vote = parseVoteResponse(output, role);

  return { ok: true, vote, output };
}

/** Options for executeWithRetries. */
export interface RetryOptions {
  readonly role: VoterRole;
  readonly proposal: string;
  readonly adapter: IModelAdapter;
  readonly logger: ILogger;
  readonly timeoutMs: number;
  readonly maxRetries: number;
}

/**
 * Executes vote attempts with retry logic.
 * Returns the error message from last failed attempt, or undefined if successful.
 */
export async function executeWithRetries(
  opts: RetryOptions
): Promise<{ vote: Vote; ok: true } | { error: string; ok: false }> {
  const { role, proposal, adapter, logger, timeoutMs, maxRetries } = opts;
  let lastError = '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      logger.debug('Retrying vote execution', { role, attempt, delayMs });
      await delay(delayMs);
    }

    const result = await executeSingleVoteAttempt(role, proposal, adapter, timeoutMs);
    if (result.ok) {
      return { vote: result.vote, ok: true };
    }

    lastError = result.error;
    logger.warn('Vote attempt failed', {
      role,
      attempt: attempt + 1,
      maxRetries: maxRetries + 1,
      error: lastError,
    });
  }

  return { error: lastError !== '' ? lastError : 'Unknown error after all retries', ok: false };
}
