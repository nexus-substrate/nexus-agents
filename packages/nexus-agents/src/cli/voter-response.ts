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
 * Pre-verified finding shape — voter emits this; downstream
 * `isFindingVerified` adds the derived `verified` flag.
 *
 * #2245 follow-up: voters previously asked to embed YAML findings inside
 * the JSON `reasoning` field. That format is lossy across JSON
 * serialization (backticks/newlines). The v4 retest produced 0 findings
 * across 9 request_changes voters because the LLM either dropped the
 * YAML to keep JSON valid, or produced invalid JSON the parser rejected.
 * Solution: expose findings as a top-level array on the vote response.
 */
export const RawFindingSchema = z.object({
  summary: z.string().min(1).max(500).describe('One-line summary of the issue'),
  location: z.string().min(1).max(200).describe('path/file.ext:line'),
  severity: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  gate: z.object({
    reread_cited_line: z.enum(['passed', 'failed', 'skipped']).default('skipped'),
    traced_call_path: z.enum(['passed', 'failed', 'skipped']).default('skipped'),
    named_assertion: z
      .string()
      .default('')
      .describe('Concrete failing assertion — substantive, not a rubber-stamp word'),
    ruled_out_language_non_issue: z.enum(['passed', 'failed', 'skipped']).default('skipped'),
  }),
  claim: z.string().min(1).max(2000).describe('What is wrong and why it justifies blocking'),
});

export type RawFinding = z.infer<typeof RawFindingSchema>;

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
  /** Top-level structured findings for PR-review mode (#2245 v4 follow-up).
   * Replaces the YAML-in-reasoning encoding that proved lossy. */
  findings: z.array(RawFindingSchema).optional().describe('Structured findings (PR review only)'),
});

export type VoteResponse = z.infer<typeof VoteResponseSchema>;

/**
 * Hand-authored JSON Schema mirroring {@link VoteResponseSchema} (#3433).
 *
 * Used as the `input_schema` for a forced Claude `tool_use` call so the
 * ClaudeAdapter can honor `responseFormat: { type: 'json_schema' }` for votes.
 * `zod-to-json-schema` is intentionally NOT a dependency — this object is the
 * single source of truth for the JSON-Schema view of a vote response.
 *
 * Drift between this and `VoteResponseSchema` is caught by the contract test
 * in `voter-response.test.ts` (every Zod key must appear here and vice-versa).
 */
export const VOTE_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['decision', 'reasoning', 'confidence'],
  properties: {
    decision: {
      type: 'string',
      enum: ['approve', 'reject', 'abstain'],
      description: 'Your vote decision',
    },
    reasoning: {
      type: 'string',
      minLength: 10,
      maxLength: 4000,
      description: 'Explanation for your vote (10-4000 chars)',
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Confidence level 0-1',
    },
    conditions: {
      type: 'array',
      items: { type: 'string' },
      description: 'Optional conditions for approval',
    },
    rejectionCategories: {
      type: 'array',
      items: {
        type: 'string',
        enum: [
          'YAGNI',
          'DRY_VIOLATION',
          'OVER_ENGINEERING',
          'SCOPE_CREEP',
          'SECURITY_RISK',
          'MISALIGNED',
          'INSUFFICIENT_EVIDENCE',
        ],
      },
      description: 'Rejection reason categories when decision is reject',
    },
    findings: {
      type: 'array',
      description: 'Structured findings (PR review only)',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['summary', 'location', 'severity', 'gate', 'claim'],
        properties: {
          summary: {
            type: 'string',
            minLength: 1,
            maxLength: 500,
            description: 'One-line summary of the issue',
          },
          location: {
            type: 'string',
            minLength: 1,
            maxLength: 200,
            description: 'path/file.ext:line',
          },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          gate: {
            type: 'object',
            additionalProperties: false,
            required: [
              'reread_cited_line',
              'traced_call_path',
              'named_assertion',
              'ruled_out_language_non_issue',
            ],
            properties: {
              reread_cited_line: { type: 'string', enum: ['passed', 'failed', 'skipped'] },
              traced_call_path: { type: 'string', enum: ['passed', 'failed', 'skipped'] },
              named_assertion: {
                type: 'string',
                description: 'Concrete failing assertion — substantive, not a rubber-stamp word',
              },
              ruled_out_language_non_issue: {
                type: 'string',
                enum: ['passed', 'failed', 'skipped'],
              },
            },
          },
          claim: {
            type: 'string',
            minLength: 1,
            maxLength: 2000,
            description: 'What is wrong and why it justifies blocking',
          },
        },
      },
    },
  },
};

// ============================================================================
// Vote Prompt Construction
// ============================================================================

/** Example responses appended to vote prompts. Kept as a constant to keep
 * `buildVotePrompt` under the max-lines-per-function lint cap. */
const VOTE_PROMPT_EXAMPLES = `Example approve response:
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
}

Example PR-review request_changes response with structured findings:
{
  "decision": "reject",
  "reasoning": "Off-by-one in clampPageSize and missing null guard on response.timing — both visible in the diff.",
  "confidence": 0.9,
  "rejectionCategories": ["INSUFFICIENT_EVIDENCE"],
  "findings": [
    {
      "summary": "Off-by-one in clampPageSize",
      "location": "packages/nexus-agents/src/api/pagination.ts:18",
      "severity": "high",
      "gate": {
        "reread_cited_line": "passed",
        "traced_call_path": "passed",
        "named_assertion": "Test would assert clampPageSize(50, 100) === 50; this returns 49.",
        "ruled_out_language_non_issue": "passed"
      },
      "claim": "Function name says 'clamp to range' but returns requested-1 in the in-range path."
    }
  ]
}`;

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
- findings: PR-REVIEW MODE ONLY. Optional top-level array of structured findings — see "PR-review mode" in the system prompt. OMIT this field entirely when reviewing a non-diff proposal or when approving a diff.

${VOTE_PROMPT_EXAMPLES}`;
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

/** Maps a validated VoteResponse into a ParsedVote, threading optional fields. */
function buildParsedVote(data: VoteResponse): ParsedVote {
  return {
    decision: data.decision,
    reasoning: data.reasoning,
    confidence: data.confidence,
    ...(data.conditions !== undefined ? { conditions: data.conditions } : {}),
    ...(data.rejectionCategories !== undefined
      ? { rejectionCategories: data.rejectionCategories }
      : {}),
    ...(data.findings !== undefined ? { findings: data.findings } : {}),
    source: 'parsed',
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
      return buildParsedVote(validated.data);
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
