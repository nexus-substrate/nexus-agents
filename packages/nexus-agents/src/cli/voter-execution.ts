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
import { withTimeout } from '../utils/async-utils.js';
import { cancelledSeat, isCancelled, seatSignal, unlessCancelled } from './voter-cancel.js';
import { waitForVoteRetry } from './voter-cancel.js';
import { getVoterPrompts, SIMULATED_VOTE_REASONING } from './voter-prompts.js';
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
import { CLI_NAMES, type CliNameLiteral } from '../config/model-capabilities-types.js';
import { extractTextFromResponse, isStructuredOutputUnsupported } from './voter-response-text.js';
import { foldCompletionUsage, type AttemptUsage } from '../observability/attempt-usage.js';

export { extractTextFromResponse };

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

// Rate-limit detection and failed-attempt logging live in a sibling (#6821
// made room here); `isRateLimitError` stays exported from this module.
import { isRateLimitError, logAbandonedRetries, logFailedAttempt } from './voter-attempt-log.js';
export { isRateLimitError };

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
  processingTimeMs: number,
  providerId?: string
): AgentVoteResult {
  const bareCli =
    providerId?.startsWith('cli-') === true ? providerId.slice('cli-'.length) : providerId;
  const cli =
    bareCli !== undefined && (CLI_NAMES as readonly string[]).includes(bareCli)
      ? (bareCli as CliNameLiteral)
      : undefined;
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
    ...(cli !== undefined ? { cli } : {}),
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
function buildVoteRequest({
  role,
  proposal,
  timeoutMs,
  withResponseFormat,
  options,
  project,
  workspace,
  workspaceSha,
  signal,
}: VoteCompletionArgs): CompletionRequest {
  const base: CompletionRequest = {
    messages: [
      // #6110: the seat judges the caller's target project, not this
      // repository's. `undefined` renders the `nexus-agents` default.
      { role: 'system', content: getVoterPrompts(project)[role] },
      // #6254: and the working directory the seats run in, so a seat with
      // file tools knows where the artifact is and that reading it is expected.
      { role: 'user', content: buildVotePrompt(proposal, options, workspace, workspaceSha) },
    ],
    // 4000 (#4131): headroom so a findings-bearing verdict (JSON envelope +
    // reasoning + structured findings) isn't cut mid-JSON by the token cap and
    // silently dropped. Was 2000 (#2245, up from 500); large contrarian findings
    // still overflowed it. Non-findings votes stop at natural completion, so the
    // higher cap adds no cost for them.
    maxTokens: 4000,
    temperature: 0.3, // Low temperature for consistent evaluations
    // Thread the vote budget so the CLI timeout doesn't fire first (#3304); pass
    // signal too for CLI-vs-API cancellation parity (#3036/#3304). #6729: the
    // signal also carries panel cancel and the overall cutoff, so neither
    // leaves the underlying adapter running after the seat is discarded.
    timeoutMs,
    ...(workspace !== undefined && workspace.trim() !== '' ? { workDir: workspace } : {}),
    // #6754: every seat — consensus_vote, pr_review and the other panels that
    // share this path — reads the artifact and answers; it never needs to run
    // commands, edit files or fetch. A CLI that cannot enforce that refuses
    // the seat, and the panel's error policy counts it.
    accessMode: 'read-only-analysis',
    signal: seatSignal(timeoutMs, signal),
  };
  return withResponseFormat
    ? { ...base, responseFormat: { type: 'json_schema', schema: VOTE_JSON_SCHEMA } }
    : base;
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
  /**
   * The target project named in the system prompt (#6110). Required as a KEY
   * so a hop that forgets to pass it fails to compile; `undefined` is the
   * `nexus-agents` default.
   */
  readonly project: string | undefined;
  /**
   * The working directory every seat's tools run in (#6254), named in the
   * user prompt. Required as a KEY for the same reason as `project`;
   * `undefined` renders no REPOSITORY ACCESS block.
   */
  readonly workspace: string | undefined;
  readonly workspaceSha?: string | undefined;
  /** Panel cancel or overall cutoff, combined with the per-attempt deadline. */
  readonly signal?: AbortSignal | undefined;
}

async function runVoteCompletion(
  args: VoteCompletionArgs
): Promise<Omit<VoteAttemptSuccess, 'vote'> | VoteAttemptFailure> {
  const timeoutResult = await withTimeout(
    unlessCancelled(args.adapter.complete(buildVoteRequest(args)), args.signal),
    args.timeoutMs,
    `Vote timeout after ${String(args.timeoutMs)}ms for role: ${args.role}`
  );
  if (!timeoutResult.ok) return { ok: false, error: timeoutResult.error };
  const response = timeoutResult.value;
  if (!response.ok) {
    return { ok: false, error: response.error.message, retryable: response.error.retryable };
  }
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
  return {
    ok: true,
    output: extractTextFromResponse(response.value.content),
    usage,
    // #6094: the transport's captured stderr rides up with the vote so the
    // caller can classify a seat that could not read the artifact from the
    // structured signal rather than from its prose.
    cliStderr: response.value.cliStderr,
    // #6115: the alias the seat asked for, when the CLI answered on another
    // one of its family (#6120) — the seat's result discloses it as a fallback.
    fallbackFrom: response.value.fallbackFrom,
    // #6660: the model the adapter reported answering — not `adapter.modelId`,
    // the alias requested. An empty report is no report.
    servedModel: response.value.model === '' ? undefined : response.value.model,
  };
}

/** A parsed vote plus what the transport reported alongside it. Module-private: its only consumer is the return type below. */
interface VoteAttemptSuccess {
  readonly ok: true;
  readonly vote: Vote;
  readonly output: string;
  readonly usage: VoteUsage;
  /** Stderr the CLI transport captured for this completion, when any (#6094). */
  readonly cliStderr: string | undefined;
  /** The requested model alias when the CLI answered on another of its family (#6120). */
  readonly fallbackFrom: string | undefined;
  /** The model the adapter reported answering (#6660); undefined when it reported none. */
  readonly servedModel: string | undefined;
}

/** What the prompt carries beyond the proposal: declared options (#4472), the target project (#6110) and the working directory (#6254). */
interface VotePromptContext {
  readonly options?: readonly string[] | undefined;
  /** Target project for the system prompt; omitted ⇒ `nexus-agents`. */
  readonly project?: string | undefined;
  /** Working directory named in the user prompt; omitted ⇒ no REPOSITORY ACCESS block. */
  readonly workspace?: string | undefined;
  readonly workspaceSha?: string | undefined;
  /** The panel's cancel (#6729); aborts the adapter call in flight. */
  readonly signal?: AbortSignal | undefined;
}

/**
 * A failed attempt. `cliStderr` is present only on the parse-failure branch —
 * the transport completed but the output was not a vote (#6269): it says WHY
 * the answer was empty. An adapter error carries its cause in `error`.
 */
interface VoteAttemptFailure {
  readonly ok: false;
  readonly error: string;
  /** Only explicit false suppresses retries; timeout and parse errors remain retryable. */
  readonly retryable?: boolean | undefined;
  readonly cliStderr?: string | undefined;
  /**
   * Parse-failure branch only (#6821): the transport completed and billed, so
   * its reported usage rides on the failure instead of being discarded.
   */
  readonly usage?: VoteUsage | undefined;
  /**
   * Set by {@link executeWithRetries} (#6821): usage summed over every attempt
   * that settled with a response. Absent when none did.
   */
  readonly attemptUsage?: AttemptUsage | undefined;
}

export async function executeSingleVoteAttempt(
  role: VoterRole,
  proposal: string,
  adapter: IModelAdapter,
  timeoutMs: number,
  context: VotePromptContext = {}
): Promise<VoteAttemptSuccess | VoteAttemptFailure> {
  const completionArgs = {
    role,
    proposal,
    adapter,
    timeoutMs,
    project: context.project,
    workspace: context.workspace,
    ...context,
  };
  let completion = await runVoteCompletion({ ...completionArgs, withResponseFormat: true });
  // #3497: retry once WITHOUT responseFormat when the backend rejects the
  // tool-use-backed structured-output ask, so the panel keeps full strength.
  if (
    !completion.ok &&
    completion.retryable !== false &&
    isStructuredOutputUnsupported(completion.error)
  ) {
    completion = await runVoteCompletion({ ...completionArgs, withResponseFormat: false });
  }
  if (!completion.ok) return completion;

  try {
    // parseVoteResponse throws SyntheticVoteError if parsing fails — we only
    // accept real LLM votes, not synthetic fallbacks.
    const vote = parseVoteResponse(completion.output, role, context.options);
    return {
      ok: true,
      vote,
      output: completion.output,
      usage: completion.usage,
      cliStderr: completion.cliStderr,
      fallbackFrom: completion.fallbackFrom,
      servedModel: completion.servedModel,
    };
  } catch (error) {
    if (error instanceof SyntheticVoteError) {
      return {
        ok: false,
        error: `Vote parsing failed: ${error.message}`,
        cliStderr: completion.cliStderr,
        usage: completion.usage,
      };
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
  readonly options?: readonly string[] | undefined;
  /** Target project for the system prompt (#6110); absent ⇒ `nexus-agents`. */
  readonly project?: string | undefined;
  /** Working directory named in the user prompt (#6254); absent ⇒ no REPOSITORY ACCESS block. */
  readonly workspace?: string | undefined;
  readonly workspaceSha?: string | undefined;
  /**
   * Panel cancel or overall cutoff. Reaches the adapter call in flight,
   * combined with the per-attempt deadline, and stops further attempts.
   */
  readonly signal?: AbortSignal | undefined;
}

/**
 * What a successful vote attempt hands the result builder: the parsed vote,
 * its usage, the transport's stderr (#6094) and any in-family model
 * substitution (#6120, disclosed as a fallback by #6115).
 */
export interface VoteOutcome {
  readonly vote: Vote;
  readonly usage: VoteUsage;
  readonly cliStderr: string | undefined;
  readonly fallbackFrom: string | undefined;
  /** The model the adapter reported answering (#6660); undefined when it reported none. */
  readonly servedModel: string | undefined;
  /**
   * Usage summed over EVERY attempt of this seat that settled with a response,
   * the answering one included (#6821). `usage` stays the answering
   * completion's own report.
   */
  readonly attemptUsage: AttemptUsage;
}

/** Fold an attempt's reported usage, when the transport returned a response. */
function foldAttempt(
  acc: AttemptUsage | undefined,
  usage: VoteUsage | undefined
): AttemptUsage | undefined {
  return usage === undefined ? acc : foldCompletionUsage(acc, usage);
}

/** A failure carrying the seat's attempt usage, when any attempt settled. */
function withAttemptUsage(
  failure: VoteAttemptFailure,
  attemptUsage: AttemptUsage | undefined
): VoteAttemptFailure {
  const { usage: _single, ...rest } = failure;
  return attemptUsage === undefined ? rest : { ...rest, attemptUsage };
}

/** The success a retry loop returns: the answer plus every attempt's usage (#6821). */
function toOutcome(
  result: VoteAttemptSuccess,
  prior: AttemptUsage | undefined
): VoteOutcome & { ok: true } {
  const { vote, usage, cliStderr, fallbackFrom, servedModel } = result;
  const attemptUsage = foldCompletionUsage(prior, usage);
  return { vote, usage, cliStderr, fallbackFrom, servedModel, attemptUsage, ok: true };
}

/**
 * Executes vote attempts with retry logic. A failure carries the last
 * attempt's error; both outcomes carry the usage of every settled attempt.
 */
export async function executeWithRetries(
  opts: RetryOptions
): Promise<(VoteOutcome & { ok: true }) | VoteAttemptFailure> {
  const { role, proposal, adapter, logger, timeoutMs, maxRetries } = opts;
  let lastError = '';
  // #6821: every settled completion is billed, so every one is recorded.
  let attemptUsage: AttemptUsage | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // #6729: a cancelled panel makes no further adapter call, first or retry.
    if (isCancelled(opts.signal)) return withAttemptUsage(cancelledSeat(lastError), attemptUsage);
    if (attempt > 0) {
      const isRateLimit = isRateLimitError(lastError);
      const baseDelay = isRateLimit ? RATE_LIMIT_RETRY_DELAY_MS : INITIAL_RETRY_DELAY_MS;
      const delayMs = baseDelay * Math.pow(2, attempt - 1);
      logger.debug('Retrying vote execution', { role, attempt, delayMs, isRateLimit });
      if (!(await waitForVoteRetry(delayMs, opts.signal))) {
        return withAttemptUsage(cancelledSeat(lastError), attemptUsage);
      }
    }

    // #2472: per-attempt timing breakdown so investigators can see which
    // retry succeeded (or which attempt blew the cap). Total vote time
    // is already captured at the call-site; this fills the per-attempt gap.
    const attemptStart = Date.now();
    const result = await executeSingleVoteAttempt(role, proposal, adapter, timeoutMs, opts);
    const attemptMs = Date.now() - attemptStart;
    if (result.ok) {
      logger.info('Vote attempt timing', {
        role,
        attempt: attempt + 1,
        attemptMs,
        succeeded: true,
      });
      return toOutcome(result, attemptUsage);
    }

    attemptUsage = foldAttempt(attemptUsage, result.usage);
    lastError = result.error;
    const terminal = logFailedAttempt(logger, {
      role,
      attempt,
      maxRetries,
      attemptMs,
      error: lastError,
      retryable: result.retryable,
      cliStderr: result.cliStderr,
    });
    if (terminal !== null) {
      logAbandonedRetries(logger, role, attempt, maxRetries, terminal);
      if (result.retryable === false) return withAttemptUsage(result, attemptUsage);
      break;
    }
  }

  const error = lastError !== '' ? lastError : 'Unknown error after all retries';
  return withAttemptUsage({ error, ok: false }, attemptUsage);
}
