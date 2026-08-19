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
/**
 * Builds the vote completion request. `withResponseFormat` toggles the native
 * structured-output ask (#3433): on for the first attempt, off for the #3497
 * retry against backends that route `json_schema` through provider tool-use.
 * The `parseVoteResponse` regex/Zod path below accepts prose-wrapped JSON, so
 * omitting `responseFormat` is safe — it just loses the schema-enforced shape.
 */
function buildVoteRequest(
  role: VoterRole,
  proposal: string,
  timeoutMs: number,
  withResponseFormat: boolean,
  options?: readonly string[]
): CompletionRequest {
  const base: CompletionRequest = {
    messages: [
      { role: 'system', content: VOTER_SYSTEM_PROMPTS[role] },
      { role: 'user', content: buildVotePrompt(proposal, options) },
    ],
    // 4000 (#4131): headroom so a findings-bearing verdict (JSON envelope +
    // reasoning + structured findings) isn't cut mid-JSON by the token cap and
    // silently dropped. Was 2000 (#2245, up from 500); large contrarian findings
    // still overflowed it. Non-findings votes stop at natural completion, so the
    // higher cap adds no cost for them.
    maxTokens: 4000,
    temperature: 0.3, // Low temperature for consistent evaluations
    // Thread the vote budget so the CLI timeout doesn't fire first (#3304); pass
    // signal too for CLI-vs-API cancellation parity (#3036/#3304).
    timeoutMs,
    signal: AbortSignal.timeout(timeoutMs),
  };
  return withResponseFormat
    ? { ...base, responseFormat: { type: 'json_schema', schema: VOTE_JSON_SCHEMA } }
    : base;
}

/**
 * #3497: some backends don't silently ignore an unsupported `responseFormat`.
 * OpenRouter implements `json_schema` via provider tool-use, so a role routed to
 * a provider without tool-use returns a hard 404 "No endpoints found that
 * support tool use" instead of ignoring the field — silently shrinking the panel
 * (observed on devex/catfish). Detect it so the caller retries without it.
 */
function isStructuredOutputUnsupported(errorMessage: string): boolean {
  return /support tool use/i.test(errorMessage);
}

/**
 * Per-call token usage reported by the adapter for one voter completion (#3910).
 * Propagated up so per-decision cost aggregation can attribute spend per voter.
 *
 * Token fields are OPTIONAL: an adapter that does not report usage (CLI
 * subscription, or a `usage` object missing the counts) leaves them `undefined`
 * so the voter stays honestly UNMEASURED downstream — never a fabricated 0.
 */
export interface VoteUsage {
  readonly inputTokens?: number | undefined;
  readonly outputTokens?: number | undefined;
  /** Input tokens read from an existing prompt cache, when reported (#4435). */
  readonly cachedInputTokens?: number | undefined;
  /** Input tokens spent writing the cache, when reported (#4435). */
  readonly cacheCreationInputTokens?: number | undefined;
}

/** Read a usage token count when the adapter actually reported a number (#3910). */
function readTokenCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** One completion attempt: build → complete (timeout-bounded) → extract text + usage. */
interface VoteCompletionArgs {
  readonly role: VoterRole;
  readonly proposal: string;
  readonly adapter: IModelAdapter;
  readonly timeoutMs: number;
  readonly withResponseFormat: boolean;
  /** Declared options for a multi-option proposal (#4472). */
  readonly options?: readonly string[] | undefined;
}

async function runVoteCompletion({
  role,
  proposal,
  adapter,
  timeoutMs,
  withResponseFormat,
  options,
}: VoteCompletionArgs): Promise<
  { ok: true; output: string; usage: VoteUsage } | { ok: false; error: string }
> {
  const request = buildVoteRequest(role, proposal, timeoutMs, withResponseFormat, options);
  const timeoutResult = await withTimeout(
    adapter.complete(request),
    timeoutMs,
    `Vote timeout after ${String(timeoutMs)}ms for role: ${role}`
  );
  if (!timeoutResult.ok) return { ok: false, error: timeoutResult.error };
  const response = timeoutResult.value;
  if (!response.ok) return { ok: false, error: response.error.message };
  // #3910: capture the adapter-reported per-call usage so it can ride up into
  // the AgentVoteResult and feed the decision-cost rollup as MEASURED. Cast
  // through a loose shape: the type guarantees `usage`, but a real adapter (or a
  // partial response) may omit the counts — read each defensively so a
  // non-reporting call stays unmeasured rather than throwing or fabricating 0.
  const reported = response.value.usage as unknown as
    | {
        inputTokens?: unknown;
        outputTokens?: unknown;
        cachedInputTokens?: unknown;
        cacheCreationInputTokens?: unknown;
      }
    | undefined;
  const usage: VoteUsage = {
    inputTokens: readTokenCount(reported?.inputTokens),
    outputTokens: readTokenCount(reported?.outputTokens),
    // #4435: an `inputTokens: 2` next to 3,980 cached tokens tells a very
    // different story than `inputTokens: 2` alone.
    cachedInputTokens: readTokenCount(reported?.cachedInputTokens),
    cacheCreationInputTokens: readTokenCount(reported?.cacheCreationInputTokens),
  };
  return { ok: true, output: extractTextFromResponse(response.value.content), usage };
}

export async function executeSingleVoteAttempt(
  role: VoterRole,
  proposal: string,
  adapter: IModelAdapter,
  timeoutMs: number,
  options?: readonly string[]
): Promise<
  { ok: true; vote: Vote; output: string; usage: VoteUsage } | { ok: false; error: string }
> {
  const completionArgs = { role, proposal, adapter, timeoutMs, options };
  let completion = await runVoteCompletion({ ...completionArgs, withResponseFormat: true });
  // #3497: retry once WITHOUT responseFormat when the backend rejects the
  // tool-use-backed structured-output ask, so the panel keeps full strength.
  if (!completion.ok && isStructuredOutputUnsupported(completion.error)) {
    completion = await runVoteCompletion({ ...completionArgs, withResponseFormat: false });
  }
  if (!completion.ok) return { ok: false, error: completion.error };

  try {
    // parseVoteResponse throws SyntheticVoteError if parsing fails — we only
    // accept real LLM votes, not synthetic fallbacks.
    const vote = parseVoteResponse(completion.output, role, options);
    return { ok: true, vote, output: completion.output, usage: completion.usage };
  } catch (error) {
    if (error instanceof SyntheticVoteError) {
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
  /** Declared options for a multi-option proposal (#4472); absent for yes/no. */
  readonly options?: readonly string[];
}

/**
 * Executes vote attempts with retry logic.
 * Returns the error message from last failed attempt, or undefined if successful.
 */
export async function executeWithRetries(
  opts: RetryOptions
): Promise<{ vote: Vote; usage: VoteUsage; ok: true } | { error: string; ok: false }> {
  const { role, proposal, adapter, logger, timeoutMs, maxRetries, options } = opts;
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
    const result = await executeSingleVoteAttempt(role, proposal, adapter, timeoutMs, options);
    const attemptMs = Date.now() - attemptStart;
    if (result.ok) {
      logger.info('Vote attempt timing', {
        role,
        attempt: attempt + 1,
        attemptMs,
        succeeded: true,
      });
      return { vote: result.vote, usage: result.usage, ok: true };
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
