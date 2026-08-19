/**
 * nexus-agents voter response parsing
 *
 * Schema and parsing utilities for structured vote responses from LLM.
 *
 * (Source: Extracted from voter-agents.ts per Issue #285)
 */

import { z } from 'zod';
import type { Vote } from '../consensus/types.js';
import { matchDeclaredOption } from '../consensus/option-tally.js';
import type { VoterRole } from './vote-types.js';
import { getErrorMessage } from '../core/index.js';

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Error thrown when vote response parsing fails.
 * (Source: Issue #512 - Fail-safe voting response parsing)
 *
 * parseVoteResponse always throws this error when JSON parsing or validation
 * fails — voting is fail-closed; no synthetic vote is ever fabricated (#4177
 * removed the opt-in `allowSyntheticVote` escape hatch, which had zero
 * production callers).
 */
export class SyntheticVoteError extends Error {
  constructor(
    reason: string,
    public readonly rawOutput: string
  ) {
    super(`Vote response parsing failed: ${reason}`);
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
  /** Chosen option when the proposal declared `options` (#4472). Validated
   * against the declared list by the caller; an unmatched value is dropped
   * rather than recorded, so a parse miss surfaces as absent. */
  selectedOption: z.string().optional().describe('Which declared option you choose'),
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
    // #4472: without this, `additionalProperties: false` makes it impossible
    // for a structured-output voter to emit a selection at all.
    selectedOption: {
      type: 'string',
      description: 'Which declared option you choose (multi-option proposals only)',
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
export function buildVotePrompt(proposal: string, options?: readonly string[]): string {
  return `Evaluate the following proposal and provide your vote.

PROPOSAL:
${proposal}
${buildOptionsBlock(options)}
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
${buildSelectionFieldDoc(options)}
${VOTE_PROMPT_EXAMPLES}`;
}

/**
 * The OPTIONS block, present only when the proposal declares options (#4472).
 *
 * Empty string when none are declared, so a proposal without options produces
 * a prompt byte-identical to the pre-#4472 one.
 */
function buildOptionsBlock(options?: readonly string[]): string {
  if (options === undefined || options.length === 0) return '';
  const list = options.map((o) => `- ${o}`).join('\n');
  return `
OPTIONS — choose exactly ONE of these and name it verbatim in \`selectedOption\`:
${list}
`;
}

/** The `selectedOption` field doc, present only when options are declared. */
function buildSelectionFieldDoc(options?: readonly string[]): string {
  if (options === undefined || options.length === 0) return '';
  return '- selectedOption: REQUIRED. Exactly one option from the OPTIONS list above, copied verbatim. Do not invent an option, combine two, or leave it blank — your selection is what the threshold is measured over.';
}

// ============================================================================
// Vote Response Parsing
// ============================================================================

/**
 * Extract the FIRST balanced top-level JSON object from `text`, respecting
 * string literals + escapes so braces/brackets inside strings don't miscount
 * (#4131). Returns the object substring, or undefined if no `{` is present.
 *
 * If the object is TRUNCATED (containers still open at end-of-input — e.g. a
 * large findings-bearing vote cut off by the completion token cap), it returns a
 * best-effort repair: the open string is closed and the open `{`/`[` containers
 * are closed in order. Since a well-formed vote emits `decision`/`reasoning`/
 * `confidence` before the optional `findings` array, a truncation inside
 * `findings` still yields a parseable verdict. If the repair is still invalid,
 * the caller's JSON.parse throws exactly as before (no regression).
 */
/** Mutable scan state for {@link extractFirstJsonObject}. */
interface JsonScanState {
  readonly closers: string[];
  inString: boolean;
  escaped: boolean;
}

type ScanResult = 'complete' | 'unbalanced' | 'continue';

/** Handle one char while inside a JSON string literal. */
function stepInString(state: JsonScanState, ch: string): void {
  if (ch === '\\') state.escaped = true;
  else if (ch === '"') state.inString = false;
}

/** Handle one structural (non-string) char, tracking open/close containers. */
function stepStructural(state: JsonScanState, ch: string): ScanResult {
  if (ch === '"') state.inString = true;
  else if (ch === '{') state.closers.push('}');
  else if (ch === '[') state.closers.push(']');
  else if (ch === '}' || ch === ']') {
    if (state.closers.pop() === undefined) return 'unbalanced';
    if (state.closers.length === 0) return 'complete';
  }
  return 'continue';
}

/** Advance the balanced-object scan by one char. Returns whether the object closed / broke. */
function stepJsonScan(state: JsonScanState, ch: string): ScanResult {
  if (state.escaped) {
    state.escaped = false;
    return 'continue';
  }
  if (state.inString) {
    stepInString(state, ch);
    return 'continue';
  }
  return stepStructural(state, ch);
}

/** Best-effort close of an object truncated mid-scan (open string + open containers). */
function repairTruncatedObject(fragment: string, state: JsonScanState): string {
  let repaired = state.inString ? `${fragment}"` : fragment;
  for (let i = state.closers.length - 1; i >= 0; i--) {
    const closer = state.closers[i];
    if (closer !== undefined) repaired += closer;
  }
  return repaired;
}

function extractFirstJsonObject(text: string): string | undefined {
  const start = text.indexOf('{');
  if (start === -1) return undefined;
  const state: JsonScanState = { closers: [], inString: false, escaped: false };
  for (let i = start; i < text.length; i++) {
    const result = stepJsonScan(state, text[i] as string);
    if (result === 'complete') return text.slice(start, i + 1);
    if (result === 'unbalanced') return undefined;
  }
  // Loop ran off the end with containers still open ⇒ truncated; repair best-effort.
  return state.closers.length > 0 ? repairTruncatedObject(text.slice(start), state) : undefined;
}

/**
 * Extracts the JSON vote object from raw LLM response text (#4131).
 *
 * Robust to the ways a voter's output shape used to silently DROP the voter:
 *  1. Prefer an explicit ` ```json ` fence.
 *  2. Otherwise scan every fenced block and use the first whose content is a
 *     JSON object — so a ` ```yaml findings ` block (pr-review mode) is SKIPPED
 *     instead of being handed to JSON.parse (the `Unexpected token 'y'` drop).
 *  3. Otherwise take the first balanced JSON object anywhere in the text, so a
 *     verdict followed by a trailing prose / YAML block still parses, and a
 *     truncated object is repaired.
 *  4. Fallback: the trimmed text (JSON.parse will surface a real malformation).
 */
export function extractJsonFromResponse(text: string): string {
  const jsonFence = /```json\s*([\s\S]*?)```/i.exec(text);
  if (jsonFence?.[1] !== undefined) {
    return extractFirstJsonObject(jsonFence[1]) ?? jsonFence[1].trim();
  }

  for (const match of text.matchAll(/```[a-zA-Z0-9]*\s*([\s\S]*?)```/g)) {
    const inner = match[1];
    if (inner?.trimStart().startsWith('{') === true) {
      const obj = extractFirstJsonObject(inner);
      if (obj !== undefined) return obj;
    }
  }

  return extractFirstJsonObject(text) ?? text.trim();
}

/** Caps mirroring {@link VoteResponseSchema} (reasoning) + {@link RawFindingSchema} (claim). */
const REASONING_MAX_CHARS = 4000;
const CLAIM_MAX_CHARS = 2000;
const TRUNCATION_MARKER = ' …[truncated]';

/** Truncate `s` to `max` chars with a marker; a no-op when already within cap. */
function clampWithMarker(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - TRUNCATION_MARKER.length)) + TRUNCATION_MARKER;
}

/**
 * Clamp the capped string fields of a parsed vote to their schema limits with a
 * truncation marker BEFORE validation (#4131). A thorough voter (esp. the
 * contrarian, which writes the most detailed findings) whose `reasoning` exceeds
 * the 4000-char cap previously hard-failed validation and was SILENTLY DROPPED
 * from the panel denominator. Clamping records a (clipped, clearly-marked) real
 * vote instead. Only shape (oversize strings) is repaired — a genuinely
 * malformed vote (missing decision, bad confidence) still fails `safeParse`.
 */
function clampOversizeVoteStrings(parsed: unknown): unknown {
  if (typeof parsed !== 'object' || parsed === null) return parsed;
  const obj = { ...(parsed as Record<string, unknown>) };
  if (typeof obj['reasoning'] === 'string') {
    obj['reasoning'] = clampWithMarker(obj['reasoning'], REASONING_MAX_CHARS);
  }
  if (Array.isArray(obj['findings'])) {
    obj['findings'] = (obj['findings'] as unknown[]).map((finding): unknown => {
      if (
        typeof finding === 'object' &&
        finding !== null &&
        typeof (finding as Record<string, unknown>)['claim'] === 'string'
      ) {
        const f = finding as Record<string, unknown>;
        return { ...f, claim: clampWithMarker(f['claim'] as string, CLAIM_MAX_CHARS) };
      }
      return finding;
    });
  }
  return obj;
}

/** Maps a validated VoteResponse into a ParsedVote, threading optional fields. */
function buildParsedVote(data: VoteResponse, options?: readonly string[]): ParsedVote {
  // #4472: resolve the voter's raw selection against the declared options.
  // An unmatched or absent selection stays absent — never defaulted — so the
  // tally can price it as unattributed rather than inventing agreement.
  const selectedOption =
    options === undefined ? undefined : matchDeclaredOption(data.selectedOption, options);
  return {
    decision: data.decision,
    reasoning: data.reasoning,
    confidence: data.confidence,
    ...(data.conditions !== undefined ? { conditions: data.conditions } : {}),
    ...(data.rejectionCategories !== undefined
      ? { rejectionCategories: data.rejectionCategories }
      : {}),
    ...(data.findings !== undefined ? { findings: data.findings } : {}),
    ...(selectedOption !== undefined ? { selectedOption } : {}),
    source: 'parsed',
  };
}

/**
 * Parses vote response from LLM output.
 *
 * Fail-closed: throws SyntheticVoteError if parsing or validation fails.
 * No synthetic vote is ever fabricated from unparseable output (#4177).
 *
 * (Source: Issue #512 - Fail-safe voting response parsing)
 *
 * @param output - Raw LLM output text
 * @param _role - Voter role for context
 * @returns ParsedVote with source tracking
 * @throws SyntheticVoteError if parsing or validation fails
 */
export function parseVoteResponse(
  output: string,
  _role: VoterRole,
  options?: readonly string[]
): ParsedVote {
  try {
    const jsonStr = extractJsonFromResponse(output);
    const parsed = JSON.parse(jsonStr) as unknown;
    // #4131: clip oversize reasoning/claims (with a marker) so a thorough voter
    // records a real vote instead of being silently dropped on the char cap.
    const validated = VoteResponseSchema.safeParse(clampOversizeVoteStrings(parsed));

    if (validated.success) {
      return buildParsedVote(validated.data, options);
    }

    const reason = `Validation failed: ${validated.error.issues.map((e: { message: string }) => e.message).join(', ')}`;
    throw new SyntheticVoteError(reason, output);
  } catch (error) {
    // If it's already a SyntheticVoteError, rethrow it
    if (error instanceof SyntheticVoteError) {
      throw error;
    }

    throw new SyntheticVoteError(getErrorMessage(error, 'Unknown parse error'), output);
  }
}
