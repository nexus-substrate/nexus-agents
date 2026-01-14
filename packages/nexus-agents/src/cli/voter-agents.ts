/**
 * nexus-agents voter agents
 *
 * Real LLM-powered voter agents for consensus voting.
 * Replaces simulated voting with actual agent execution that
 * analyzes proposals.
 *
 * (Source: Issue #226, Sprint #229)
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
}

// Re-export AgentVoteResult for convenience
export type { AgentVoteResult };

const defaultLogger = createLogger({ component: 'voter-agents' });

/**
 * Executes a real LLM vote for a single role.
 */
export async function executeAgentVote(
  role: VoterRole,
  proposal: string,
  adapter: IModelAdapter,
  logger: ILogger
): Promise<AgentVoteResult> {
  const start = Date.now();

  const request: CompletionRequest = {
    messages: [
      { role: 'system', content: VOTER_SYSTEM_PROMPTS[role] },
      { role: 'user', content: buildVotePrompt(proposal) },
    ],
    maxTokens: 500,
    temperature: 0.3, // Low temperature for consistent evaluations
  };

  try {
    const response = await adapter.complete(request);

    if (!response.ok) {
      logger.warn('Vote execution failed', { role, error: response.error.message });
      return {
        role,
        vote: simulateVote(role, proposal),
        processingTimeMs: Date.now() - start,
        source: 'simulation',
        error: response.error.message,
      };
    }

    const output = extractTextFromResponse(response.value.content);
    const vote = parseVoteResponse(output, role);

    return {
      role,
      vote,
      processingTimeMs: Date.now() - start,
      source: 'llm',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('Vote execution error', { role, error: message });
    return {
      role,
      vote: simulateVote(role, proposal),
      processingTimeMs: Date.now() - start,
      source: 'simulation',
      error: message,
    };
  }
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
  /** Use simulation mode (fallback for dry-run or no adapter) */
  readonly simulate?: boolean;
}

/**
 * Collects votes from multiple voter agents.
 * Attempts real LLM execution, falls back to simulation if unavailable.
 */
export async function collectRealVotes(
  options: CollectRealVotesOptions
): Promise<readonly AgentVoteResult[]> {
  const logger = options.logger ?? defaultLogger;
  const { roles, proposal, simulate } = options;

  // If simulation mode requested, use simulation
  if (simulate === true) {
    logger.info('Using simulation mode');
    return roles.map((role) => ({
      role,
      vote: simulateVote(role, proposal),
      processingTimeMs: Math.floor(Math.random() * 100),
      source: 'simulation' as const,
    }));
  }

  // Try to get an adapter
  let adapter: IModelAdapter;
  try {
    const selection =
      options.adapter !== undefined
        ? { adapter: options.adapter, source: 'provided' as const }
        : await createAutoAdapter({ logger });
    adapter = selection.adapter;
    logger.info('Using adapter for voting', {
      source: 'source' in selection ? selection.source : 'api',
    });
  } catch (error) {
    logger.warn('No adapter available, falling back to simulation', {
      error: error instanceof Error ? error.message : String(error),
    });
    return roles.map((role) => ({
      role,
      vote: simulateVote(role, proposal),
      processingTimeMs: Math.floor(Math.random() * 100),
      source: 'simulation' as const,
      error: 'No adapter available',
    }));
  }

  // Execute votes in parallel for all roles
  const votePromises = roles.map((role) => executeAgentVote(role, proposal, adapter, logger));

  return Promise.all(votePromises);
}

/**
 * Gets a description for a voter role.
 */
export function getRoleDescription(role: VoterRole): string {
  return VOTER_ROLES[role];
}
