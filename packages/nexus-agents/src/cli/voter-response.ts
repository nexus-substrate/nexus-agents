/**
 * nexus-agents voter response parsing
 *
 * Schema and parsing utilities for structured vote responses from LLM.
 *
 * (Source: Extracted from voter-agents.ts per Issue #285)
 */

import { z } from 'zod';
import type { Vote } from '../consensus/types.js';
import type { VoterRole } from './vote-types.js';
import { getErrorMessage, createLogger } from '../core/index.js';

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Error thrown when vote response parsing fails and synthetic votes not allowed.
 * (Source: Issue #512 - Fail-safe voting response parsing)
 *
 * By default, parseVoteResponse throws this error when JSON parsing or validation
 * fails. To use synthetic fallback votes (NOT RECOMMENDED), pass
 * `allowSyntheticVote: true` to the options parameter.
 */
export class SyntheticVoteError extends Error {
  constructor(
    reason: string,
    public readonly rawOutput: string
  ) {
    super(
      `Vote response parsing failed: ${reason}. ` +
        'To use synthetic fallback votes (NOT RECOMMENDED), set allowSyntheticVote: true'
    );
    this.name = 'SyntheticVoteError';
  }
}

/**
 * Vote source tracking - indicates whether vote is real or synthetic.
 * (Source: Issue #512 - Voting integrity)
 */
export type ParsedVoteSource = 'parsed' | 'fallback';

/**
 * Extended vote with source tracking.
 */
export interface ParsedVote extends Vote {
  readonly source: ParsedVoteSource;
}

/**
 * Options for parseVoteResponse.
 */
export interface ParseVoteOptions {
  /**
   * Allow synthetic fallback votes when parsing fails.
   * Default: false (throws SyntheticVoteError)
   * (Source: Issue #512 - Fail-safe voting)
   */
  readonly allowSyntheticVote?: boolean;
}

// ============================================================================
// Structured Vote Response Schema
// ============================================================================

/**
 * Zod schema for parsing structured vote responses from LLM.
 */
export const VoteResponseSchema = z.object({
  decision: z.enum(['approve', 'reject', 'abstain']).describe('Your vote decision'),
  reasoning: z.string().min(10).max(4000).describe('Explanation for your vote (10-4000 chars)'),
  confidence: z.number().min(0).max(1).describe('Confidence level 0-1'),
  conditions: z.array(z.string()).optional().describe('Optional conditions for approval'),
  /** Structured rejection categories for reject→refine→re-vote loops (Issue #1213). */
  rejectionCategories: z
    .array(
      z.enum([
        'YAGNI',
        'DRY_VIOLATION',
        'OVER_ENGINEERING',
        'SCOPE_CREEP',
        'SECURITY_RISK',
        'MISALIGNED',
        'INSUFFICIENT_EVIDENCE',
      ])
    )
    .optional()
    .describe('Rejection reason categories when decision is reject'),
});

export type VoteResponse = z.infer<typeof VoteResponseSchema>;

// ============================================================================
// Vote Prompt Construction
// ============================================================================

/**
 * Constructs the user prompt for vote evaluation.
 * Includes workflow-test evaluation criteria (Issue #1212) and
 * rejection category instructions (Issue #1213).
 */
export function buildVotePrompt(proposal: string): string {
  return `Evaluate the following proposal and provide your vote.

PROPOSAL:
${proposal}

In addition to your role-specific criteria, assess these workflow-test dimensions:
- Testability: Can the proposed changes be verified with automated tests?
- Workflow integration: Does this fit into existing CI/make/test workflows?
- Incremental verifiability: Can progress be measured at each step?

Respond with a JSON object containing:
- decision: "approve", "reject", or "abstain"
- reasoning: Explanation for your vote (10-4000 characters). Include your workflow-test assessment.
- confidence: Number between 0 and 1
- conditions: Optional array of conditions for approval
- rejectionCategories: Required when rejecting. Array of categories from: YAGNI, DRY_VIOLATION, OVER_ENGINEERING, SCOPE_CREEP, SECURITY_RISK, MISALIGNED, INSUFFICIENT_EVIDENCE

Example approve response:
{
  "decision": "approve",
  "reasoning": "The proposal aligns with architectural patterns. Testability: high — unit tests can verify each component. Workflow integration: fits existing CI pipeline.",
  "confidence": 0.85,
  "conditions": ["Add unit tests before merge"]
}

Example reject response:
{
  "decision": "reject",
  "reasoning": "This adds speculative abstractions for hypothetical future needs. Testability: unclear — no concrete test plan provided.",
  "confidence": 0.80,
  "rejectionCategories": ["YAGNI", "OVER_ENGINEERING"]
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
 * Creates a fallback vote when parsing fails.
 * Attempts to infer decision from text content.
 * ONLY used when allowSyntheticVote is explicitly true.
 * (Source: Issue #512 - Fail-safe voting)
 */
function createFallbackVote(output: string, _role: VoterRole, reason: string): ParsedVote {
  const lower = output.toLowerCase();
  let decision: Vote['decision'] = 'abstain';

  // Simple keyword detection - heuristic only
  // Check reject keywords FIRST since "disagree" contains "agree" substring
  if (lower.includes('reject') || lower.includes('decline') || lower.includes('disagree')) {
    decision = 'reject';
  } else if (lower.includes('approve') || lower.includes('accept') || lower.includes('agree')) {
    decision = 'approve';
  }

  // Log warning about synthetic vote
  createLogger({ component: 'voter-response' }).warn(
    'Creating synthetic vote (NOT parsed from LLM output)',
    { decision, reason }
  );

  return {
    decision,
    reasoning: `[SYNTHETIC: ${reason}] ${output.slice(0, 200)}`,
    confidence: 0.5,
    source: 'fallback', // Mark as synthetic
  };
}

/**
 * Parses vote response from LLM output.
 *
 * By default, throws SyntheticVoteError if parsing fails. To use synthetic
 * fallback votes (NOT RECOMMENDED), pass `allowSyntheticVote: true`.
 *
 * (Source: Issue #512 - Fail-safe voting response parsing)
 *
 * @param output - Raw LLM output text
 * @param role - Voter role for context
 * @param options - Parsing options including allowSyntheticVote
 * @returns ParsedVote with source tracking
 * @throws SyntheticVoteError if parsing fails and allowSyntheticVote is false
 */
export function parseVoteResponse(
  output: string,
  role: VoterRole,
  options?: ParseVoteOptions
): ParsedVote {
  const allowSyntheticVote = options?.allowSyntheticVote ?? false;

  try {
    const jsonStr = extractJsonFromResponse(output);
    const parsed = JSON.parse(jsonStr) as unknown;
    const validated = VoteResponseSchema.safeParse(parsed);

    if (validated.success) {
      return {
        decision: validated.data.decision,
        reasoning: validated.data.reasoning,
        confidence: validated.data.confidence,
        ...(validated.data.conditions !== undefined
          ? { conditions: validated.data.conditions }
          : {}),
        ...(validated.data.rejectionCategories !== undefined
          ? { rejectionCategories: validated.data.rejectionCategories }
          : {}),
        source: 'parsed', // Real vote from LLM
      };
    }

    // Validation failed - throw or fallback based on config
    const reason = `Validation failed: ${validated.error.issues.map((e: { message: string }) => e.message).join(', ')}`;
    if (!allowSyntheticVote) {
      throw new SyntheticVoteError(reason, output);
    }
    return createFallbackVote(output, role, reason);
  } catch (error) {
    // If it's already a SyntheticVoteError, rethrow it
    if (error instanceof SyntheticVoteError) {
      throw error;
    }

    // Parse error - throw or fallback based on config
    const reason = getErrorMessage(error, 'Unknown parse error');
    if (!allowSyntheticVote) {
      throw new SyntheticVoteError(reason, output);
    }
    return createFallbackVote(output, role, reason);
  }
}
