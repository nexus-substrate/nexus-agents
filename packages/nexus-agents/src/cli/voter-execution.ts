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
import {
  buildVotePrompt,
  parseVoteResponse,
  SyntheticVoteError,
  VOTE_JSON_SCHEMA,
} from './voter-response.js';

// Import timeout constants from canonical source (Issue #984)
import {
  VOTE_TIMEOUTS,
  resolveVoteTimeout as _resolveVoteTimeout,
  validateTimeout as _validateTimeout,
} from '../config/timeouts.js';

/** Default vote timeout. Canonical source: `config/timeouts.ts`. */
export const DEFAULT_VOTE_TIMEOUT_MS = VOTE_TIMEOUTS.defaultMs;

/** Resolves vote timeout with env var override. Canonical: `config/timeouts.ts`. */
export const resolveVoteTimeout = _resolveVoteTimeout;

/** Maximum vote timeout. Canonical source: `config/timeouts.ts`. */
export const MAX_VOTE_TIMEOUT_MS = VOTE_TIMEOUTS.maxMs;

/** Minimum vote timeout. Canonical source: `config/timeouts.ts`. */
export const MIN_VOTE_TIMEOUT_MS = VOTE_TIMEOUTS.minMs;

/** Maximum retries per vote. Canonical source: `config/timeouts.ts`. */
export const DEFAULT_MAX_RETRIES = VOTE_TIMEOUTS.maxRetries;

/**
 * Initial retry delay in milliseconds.
 */
const INITIAL_RETRY_DELAY_MS = 1_000;

/**
 * Retry delay for rate-limit errors in milliseconds (Issue #1319).
 * Longer than standard to respect API rate limits.
 */
export const RATE_LIMIT_RETRY_DELAY_MS = 5_000;

/**
 * Detects whether an error message indicates a rate-limit condition.
 * Delegates to canonical rate-limit-detector (DRY consolidation Issue #1596).
 */
import { isRateLimitLikeError } from '../adapters/rate-limit-detector.js';

/** @see isRateLimitLikeError — re-exported for backward compatibility */
export function isRateLimitError(message: string): boolean {
  return isRateLimitLikeError(new Error(message));
}

/**
 * Validates and clamps timeout to `[VOTE_TIMEOUTS.minMs, VOTE_TIMEOUTS.maxMs]`.
 *
 * **Canonical source:** `config/timeouts.ts`. This re-export exists for
 * back-compat — new code should import from `../config/timeouts.js`
 * directly (#2637).
 */
export const validateTimeout = _validateTimeout;

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
  scope_steward: [25, 60, 15], // Default-bias toward not shipping (#2185)
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
    // 500 was correct for short proposal-style votes but caused mid-string
    // truncation ("Unterminated string in JSON at position N") in #2241 v3
    // when voters review code diffs — the JSON envelope + reasoning + YAML
    // findings block routinely exceed 500 tokens. Bumped to 2000 (#2245);
    // refine per use case if needed.
    maxTokens: 2000,
    temperature: 0.3, // Low temperature for consistent evaluations
    // #3433: request native structured output (Claude tool_use / OpenAI+Gemini
    // json mode) so the vote arrives as a schema-valid JSON object instead of
    // prose-wrapped JSON. When an adapter DOES honor it, the
    // extractTextFromResponse + parseVoteResponse regex/Zod path below still
    // accepts the result, so it's also the fallback for prose-returning backends.
    //
    // CAVEAT (#3497): not every backend "silently ignores" an unsupported
    // responseFormat. OpenRouter implements `json_schema` via provider tool-use,
    // so a role routed to a provider without tool-use returns a hard
    // 404 "No endpoints found that support tool use" rather than ignoring the
    // field. Those voters then error → abstain (the panel degrades to the
    // succeeding voters). The real fix — gate `responseFormat` on a model
    // structured-output capability, or retry-without-it on that 404 — is tracked
    // in #3497; this comment no longer claims a universal "no behavior change".
    responseFormat: { type: 'json_schema', schema: VOTE_JSON_SCHEMA },
    // Thread the vote's budget into the adapter so its shorter standard CLI
    // timeout doesn't fire first and surface as an MCP -32001 on slow voters
    // (e.g. the Security role on complex proposals) (#3304).
    timeoutMs,
    // CLI adapters honor `timeoutMs`; API adapters honor `signal` (#3036). Pass
    // both so the slow voter is cancelled cleanly at the vote budget regardless
    // of backing (CLI subprocess SIGTERM'd via #3026, API SDK call aborted) —
    // CLI-vs-API parity for the vote timeout (#3304).
    signal: AbortSignal.timeout(timeoutMs),
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
      const isRateLimit = isRateLimitError(lastError);
      const baseDelay = isRateLimit ? RATE_LIMIT_RETRY_DELAY_MS : INITIAL_RETRY_DELAY_MS;
      const delayMs = baseDelay * Math.pow(2, attempt - 1);
      logger.debug('Retrying vote execution', { role, attempt, delayMs, isRateLimit });
      await delay(delayMs);
    }

    // #2472: per-attempt timing breakdown so investigators can see which
    // retry succeeded (or which attempt blew the cap). Total vote time
    // is already captured at the call-site; this fills the per-attempt gap.
    const attemptStart = Date.now();
    const result = await executeSingleVoteAttempt(role, proposal, adapter, timeoutMs);
    const attemptMs = Date.now() - attemptStart;
    if (result.ok) {
      logger.info('Vote attempt timing', {
        role,
        attempt: attempt + 1,
        attemptMs,
        succeeded: true,
      });
      return { vote: result.vote, ok: true };
    }

    lastError = result.error;
    const rateLimited = isRateLimitError(lastError);
    logger.info('Vote attempt timing', {
      role,
      attempt: attempt + 1,
      attemptMs,
      succeeded: false,
      rateLimited,
    });
    logger.warn('Vote attempt failed', {
      role,
      attempt: attempt + 1,
      maxRetries: maxRetries + 1,
      error: lastError,
      ...(rateLimited ? { rateLimited: true } : {}),
    });
  }

  return { error: lastError !== '' ? lastError : 'Unknown error after all retries', ok: false };
}
