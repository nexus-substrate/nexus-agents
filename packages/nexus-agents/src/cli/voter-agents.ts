/**
 * nexus-agents voter agents
 *
 * Real LLM-powered voter agents for consensus voting.
 * Replaces simulated voting with actual agent execution that
 * analyzes proposals.
 *
 * (Source: Issue #226, Sprint #229)
 * (Updated: Issue #280 - Fixed timeout handling, removed simulation fallback)
 *
 * File structure: Prompts in voter-prompts.ts. Extracted per Issue #272.
 */

import { z } from 'zod';
import type { Vote } from '../consensus/types.js';
import type { VoterRole, AgentVoteResult } from './vote-types.js';
import { VOTER_ROLES } from './vote-types.js';
import type { IModelAdapter, CompletionRequest, ILogger } from '../core/index.js';
import { createLogger } from '../core/index.js';
import { createAutoAdapter } from '../adapters/auto-adapter.js';

// Re-export prompts for backward compatibility
export { VOTER_SYSTEM_PROMPTS, SIMULATED_VOTE_REASONING } from './voter-prompts.js';

// Local import for use in this file
import { VOTER_SYSTEM_PROMPTS, SIMULATED_VOTE_REASONING } from './voter-prompts.js';

/**
 * Default vote execution timeout (30 seconds).
 * Reduced from CLI adapter default (60s) for faster feedback.
 */
const DEFAULT_VOTE_TIMEOUT_MS = 30_000;

/**
 * Maximum retries for vote execution.
 */
const DEFAULT_MAX_RETRIES = 2;

/**
 * Initial retry delay in milliseconds.
 */
const INITIAL_RETRY_DELAY_MS = 1_000;

// ============================================================================
// Vote Result Helpers (extracted per Issue #280 for complexity reduction)
// ============================================================================

/**
 * Creates an error vote result (abstain with error message).
 */
function createErrorVoteResult(
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
function createSimulationVoteResult(
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
function createSimulatedVotes(
  roles: readonly VoterRole[],
  proposal: string,
  error?: string
): readonly AgentVoteResult[] {
  return roles.map((role) =>
    createSimulationVoteResult(role, proposal, Math.floor(Math.random() * 100), error)
  );
}

// ============================================================================
// Structured Vote Response Schema
// ============================================================================

/**
 * Zod schema for parsing structured vote responses from LLM.
 */
export const VoteResponseSchema = z.object({
  decision: z.enum(['approve', 'reject', 'abstain']).describe('Your vote decision'),
  reasoning: z.string().min(10).max(500).describe('Brief explanation for your vote (10-500 chars)'),
  confidence: z.number().min(0).max(1).describe('Confidence level 0-1'),
  conditions: z.array(z.string()).optional().describe('Optional conditions for approval'),
});

export type VoteResponse = z.infer<typeof VoteResponseSchema>;

// ============================================================================
// Vote Prompt Construction
// ============================================================================

/**
 * Constructs the user prompt for vote evaluation.
 */
export function buildVotePrompt(proposal: string): string {
  return `Evaluate the following proposal and provide your vote.

PROPOSAL:
${proposal}

Respond with a JSON object containing:
- decision: "approve", "reject", or "abstain"
- reasoning: Brief explanation (10-500 characters)
- confidence: Number between 0 and 1
- conditions: Optional array of conditions for approval

Example response:
{
  "decision": "approve",
  "reasoning": "The proposal aligns with architectural patterns and provides clear value.",
  "confidence": 0.85,
  "conditions": ["Add unit tests before merge"]
}`;
}

// ============================================================================
// Vote Response Parsing
// ============================================================================

/**
 * Extracts JSON from LLM response text.
 * Handles responses that may include markdown code blocks.
 */
export function extractJsonFromResponse(text: string): string {
  // Try to find JSON in code blocks first
  const codeBlockMatch = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (codeBlockMatch?.[1] !== undefined) {
    return codeBlockMatch[1].trim();
  }

  // Look for JSON object directly
  const jsonMatch = /\{[\s\S]*\}/i.exec(text);
  if (jsonMatch?.[0] !== undefined) {
    return jsonMatch[0];
  }

  return text.trim();
}

/**
 * Parses vote response from LLM output.
 * Returns a fallback vote if parsing fails.
 */
export function parseVoteResponse(output: string, role: VoterRole): Vote {
  try {
    const jsonStr = extractJsonFromResponse(output);
    const parsed = JSON.parse(jsonStr) as unknown;
    const validated = VoteResponseSchema.safeParse(parsed);

    if (validated.success) {
      return {
        decision: validated.data.decision,
        reasoning: validated.data.reasoning,
        confidence: validated.data.confidence,
        conditions: validated.data.conditions,
      };
    }

    // Partial parse - try to extract what we can
    return createFallbackVote(output, role, 'Validation failed');
  } catch {
    return createFallbackVote(output, role, 'Parse error');
  }
}

/**
 * Creates a fallback vote when parsing fails.
 * Attempts to infer decision from text content.
 */
function createFallbackVote(output: string, role: VoterRole, reason: string): Vote {
  const lower = output.toLowerCase();
  let decision: Vote['decision'] = 'abstain';

  // Simple keyword detection
  if (lower.includes('approve') || lower.includes('accept') || lower.includes('agree')) {
    decision = 'approve';
  } else if (lower.includes('reject') || lower.includes('decline') || lower.includes('disagree')) {
    decision = 'reject';
  }

  return {
    decision,
    reasoning: `[${reason}] ${output.slice(0, 200)}`,
    confidence: 0.5,
  };
}

// ============================================================================
// Agent Execution
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
 * Wraps a promise with a timeout.
 * Returns an error result if timeout is exceeded.
 */
async function withTimeout<T>(
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
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes a single vote attempt (no retries).
 */
async function executeSingleVoteAttempt(
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
interface RetryOptions {
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
async function executeWithRetries(
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

/**
 * Extracts text content from completion response.
 */
function extractTextFromResponse(content: unknown): string {
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
 * Fallback simulation when LLM is unavailable.
 * Matches the original simulateVote behavior.
 */
export function simulateVote(role: VoterRole, proposal: string): Vote {
  const decisions: Array<'approve' | 'reject' | 'abstain'> = [
    'approve',
    'approve',
    'approve',
    'reject',
    'abstain',
  ];
  const decision = decisions[Math.floor(Math.random() * decisions.length)] ?? 'approve';
  return {
    decision,
    reasoning: `[Simulated] ${SIMULATED_VOTE_REASONING[role]} Proposal: "${proposal.slice(0, 50)}..."`,
    confidence: 0.7 + Math.random() * 0.3,
  };
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
