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
 * Creates a fallback vote when parsing fails.
 * Attempts to infer decision from text content.
 */
function createFallbackVote(output: string, _role: VoterRole, reason: string): Vote {
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
