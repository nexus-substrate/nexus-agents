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
import { getRandomProvider } from '../core/index.js';
import { delay, withTimeout } from '../utils/async-utils.js';
import { VOTER_SYSTEM_PROMPTS, SIMULATED_VOTE_REASONING } from './voter-prompts.js';
import { buildVotePrompt, parseVoteResponse, SyntheticVoteError } from './voter-response.js';

/**
 * Default vote execution timeout (120 seconds).
 * Increased from 90s per Issue #983 - complex proposals with 6 agents
 * need adequate time, especially on slower CLIs (Gemini/Codex).
 * Override with NEXUS_VOTE_TIMEOUT_MS environment variable.
 */
export const DEFAULT_VOTE_TIMEOUT_MS = 120_000;

/**
 * Resolves vote timeout from env var or returns default.
 * NEXUS_VOTE_TIMEOUT_MS env var overrides the default, clamped to [MIN, MAX].
 * (Source: Issue #983)
 */
export function resolveVoteTimeout(): number {
  const envVal = process.env['NEXUS_VOTE_TIMEOUT_MS'];
  if (envVal !== undefined) {
    const parsed = Number(envVal);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return validateTimeout(parsed).value;
    }
  }
  return DEFAULT_VOTE_TIMEOUT_MS;
}

/**
 * Maximum vote execution timeout (5 minutes).
 * Upper bound to prevent indefinite waiting for stalled agents.
 * (Source: Issue #607)
 */
export const MAX_VOTE_TIMEOUT_MS = 300_000;

/**
 * Minimum vote execution timeout (30 seconds).
 * Lower bound to ensure agents have adequate processing time.
 */
export const MIN_VOTE_TIMEOUT_MS = 30_000;

/**
 * Maximum retries for vote execution.
 */
export const DEFAULT_MAX_RETRIES = 2;

/**
 * Initial retry delay in milliseconds.
 */
const INITIAL_RETRY_DELAY_MS = 1_000;

/**
 * Validates and constrains timeout to allowed range [MIN, MAX].
 * Returns clamped value and whether it was adjusted.
 * (Source: Issue #607)
 */
export function validateTimeout(requestedMs: number): { value: number; clamped: boolean } {
  if (requestedMs < MIN_VOTE_TIMEOUT_MS) {
    return { value: MIN_VOTE_TIMEOUT_MS, clamped: true };
  }
  if (requestedMs > MAX_VOTE_TIMEOUT_MS) {
    return { value: MAX_VOTE_TIMEOUT_MS, clamped: true };
  }
  return { value: requestedMs, clamped: false };
}

// ============================================================================
// Vote Result Helpers
// ============================================================================

/**
 * Creates an error vote result (abstain with error message).
 * Issue #523: Uses source: 'error' instead of 'llm' for accuracy.
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
    source: 'error',
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
  const random = getRandomProvider();
  return roles.map((role) =>
    createSimulationVoteResult(role, proposal, random.randomInt(0, 100), error)
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
  catfish: [20, 65, 15], // Deliberately contrarian - challenges proposals (arXiv:2505.21503)
};

/**
 * Selects a decision based on weighted probabilities.
 */
function selectWeightedDecision(
  weights: [number, number, number]
): 'approve' | 'reject' | 'abstain' {
  const random = getRandomProvider();
  const total = weights[0] + weights[1] + weights[2];
  const rand = random.random() * total;

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
  const random = getRandomProvider();
  const weights = ROLE_VOTE_DISTRIBUTIONS[role];
  const decision = selectWeightedDecision(weights);

  // Confidence varies by decision type and role
  // Rejections tend to be higher confidence (found specific issue)
  // Approvals are moderate confidence (no issues found, but limited analysis)
  // Abstains are low confidence (insufficient information)
  let baseConfidence: number;
  if (decision === 'reject') {
    baseConfidence = 0.6 + random.random() * 0.3; // 0.6-0.9
  } else if (decision === 'approve') {
    baseConfidence = 0.5 + random.random() * 0.3; // 0.5-0.8
  } else {
    baseConfidence = 0.3 + random.random() * 0.2; // 0.3-0.5
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

// Re-export from canonical source for backward compatibility
export { withTimeout, delay } from '../utils/async-utils.js';

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
 *
 * By default, throws SyntheticVoteError if response parsing fails.
 * This ensures we only get real LLM votes, not synthetic fallbacks.
 * (Source: Issue #512 - Fail-safe voting)
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

  try {
    // parseVoteResponse throws SyntheticVoteError by default if parsing fails
    // This ensures we only accept real LLM votes, not synthetic fallbacks
    const vote = parseVoteResponse(output, role);
    return { ok: true, vote, output };
  } catch (error) {
    if (error instanceof SyntheticVoteError) {
      // Parsing failed - return error to trigger retry
      return { ok: false, error: `Vote parsing failed: ${error.message}` };
    }
    throw error; // Re-throw unexpected errors
  }
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
