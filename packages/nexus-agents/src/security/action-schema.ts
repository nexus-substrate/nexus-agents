/**
 * nexus-agents/security - Typed Action Schema
 *
 * Zod schemas and TypeScript types for the typed action constraint system.
 * Agents processing untrusted GitHub input MUST emit only predefined typed
 * actions (never free-form tool calls). This module defines those action
 * schemas, validates them at runtime, and classifies them as read-only or
 * mutating for the policy gate.
 *
 * @module security/action-schema
 * (Source: Issue #818, #820)
 */

import { z } from 'zod';

import { TrustTierSchema } from './trust-types.js';

// ============================================================================
// Result Type (local — avoids circular dependency with core/types)
// ============================================================================

/** Validation result using the project Result pattern. */
export type ActionValidationResult =
  { ok: true; value: AgentAction } | { ok: false; error: string };

// ============================================================================
// Source Citations
// ============================================================================

/** Source citation from a file tracked in the repository. */
const RepoFileSource = z.object({
  type: z.literal('repoFile'),
  path: z.string().min(1),
  line: z.number().int().positive().optional(),
  commit: z
    .string()
    .regex(/^[a-f0-9]{7,40}$/)
    .optional(),
});

/** Source citation from a GitHub issue comment. */
const IssueCommentSource = z.object({
  type: z.literal('issueComment'),
  issueNumber: z.number().int().positive(),
  commentId: z.number().int().positive(),
  author: z.string().min(1),
  authorTrustTier: TrustTierSchema,
});

/**
 * Source citation from the body of a GitHub issue (#4667).
 *
 * Triage previously cited the issue as a `repoFile` with a synthesised path
 * (`issues/42`). That is not a repo file, and the mislabel is why corroboration
 * always passed: `hasSourceAtTier` treats repo files as Tier 1 unconditionally,
 * so untrusted issue text was corroborating actions at maintainer trust.
 *
 * Modelled on `IssueCommentSource` — it carries the author and their tier, so
 * the trust of the content travels with the citation. It is deliberately NOT an
 * `issueComment`: that requires a `commentId`, and faking one to fix a mislabel
 * would trade an honest error for a dishonest one.
 */
const IssueBodySource = z.object({
  type: z.literal('issueBody'),
  issueNumber: z.number().int().positive(),
  author: z.string().min(1),
  authorTrustTier: TrustTierSchema,
});

/** Source citation from a CI pipeline result. */
const CIResultSource = z.object({
  type: z.literal('ciResult'),
  runId: z.number().int().positive(),
  status: z.enum(['pass', 'fail']),
  job: z.string().min(1),
});

/** Source citation from a policy or governance document. */
const PolicyDocSource = z.object({
  type: z.literal('policyDoc'),
  path: z.string().min(1),
  section: z.string().min(1),
});

/** Source citation from a maintainer slash-command or explicit instruction. */
const MaintainerCommandSource = z.object({
  type: z.literal('maintainerCommand'),
  username: z.string().min(1),
  commentId: z.number().int().positive(),
});

/**
 * Discriminated union of all valid source citation types.
 * Every decision-making action MUST cite at least one source.
 */
export const SourceCitationSchema = z.discriminatedUnion('type', [
  IssueBodySource,
  RepoFileSource,
  IssueCommentSource,
  CIResultSource,
  PolicyDocSource,
  MaintainerCommandSource,
]);

/** Inferred TypeScript type for a source citation. */
export type SourceCitation = z.infer<typeof SourceCitationSchema>;

// ============================================================================
// Typed Actions
// ============================================================================

/** Read-only analysis action: summarize an issue with citations. */
const SummarizeIssueAction = z.object({
  type: z.literal('SummarizeIssue'),
  summary: z.string().min(10).max(2000),
  sources: z.array(SourceCitationSchema).min(1).max(20),
});

/** Suggest labels for an issue (max 5, must match existing label set). */
const ProposeLabelsAction = z.object({
  type: z.literal('ProposeLabels'),
  labels: z.array(z.string()).min(1).max(5),
  reason: z.string().min(10).max(500),
  sources: z.array(SourceCitationSchema).min(1).max(20),
});

/** Draft a reply comment (always requires human approval before posting). */
export const DRAFT_REPLY_BODY_MAX_LENGTH = 2000;

const DraftReplyAction = z.object({
  type: z.literal('DraftReply'),
  body: z.string().min(10).max(DRAFT_REPLY_BODY_MAX_LENGTH),
  requiresApproval: z.literal(true),
  sources: z.array(SourceCitationSchema).min(1).max(20),
});

/** Explicit escalation to a human maintainer with reason and context. */
const RequestHumanApprovalAction = z.object({
  type: z.literal('RequestHumanApproval'),
  reason: z.string().min(10).max(500),
  context: z.string().min(10).max(2000),
});

/**
 * Propose a set of file modifications (requires maintainer corroboration).
 * Forbidden from Tier 3-4 input without maintainer corroboration.
 */
const GeneratePatchPlanAction = z.object({
  type: z.literal('GeneratePatchPlan'),
  files: z
    .array(
      z.object({
        path: z.string().min(1),
        operation: z.enum(['modify', 'create', 'delete']),
        description: z.string().min(10).max(500),
      })
    )
    .min(1)
    .max(10),
  rationale: z.string().min(10).max(1000),
  requiresApproval: z.literal(true),
  sources: z.array(SourceCitationSchema).min(2).max(20),
});

/** Categorize an issue by type with confidence score. */
const ClassifyIssueAction = z.object({
  type: z.literal('ClassifyIssue'),
  category: z.enum(['bug', 'feature', 'question', 'documentation', 'security', 'performance']),
  confidence: z.number().min(0).max(1),
  sources: z.array(SourceCitationSchema).min(1).max(20),
});

/** Identify potential duplicate issues with similarity scores. */
const IdentifyDuplicatesAction = z.object({
  type: z.literal('IdentifyDuplicates'),
  candidates: z.array(z.number().int().positive()).min(1).max(10),
  similarity: z.array(z.number().min(0).max(1)),
  sources: z.array(SourceCitationSchema).min(1).max(20),
});

/** Explicit refusal to act, with escalation target. */
const RefuseActionAction = z.object({
  type: z.literal('RefuseAction'),
  reason: z.string().min(10).max(500),
  escalateTo: z.enum(['maintainer', 'security']),
});

/** Handoff delegation from one agent to another by capability. (Issue #834) */
const HandoffMessageAction = z.object({
  type: z.literal('HandoffMessage'),
  targetCapability: z.string().min(1).max(100),
  reason: z.string().min(5).max(500),
  inputTrustTier: z.enum(['1', '2', '3', '4']),
  sources: z.array(SourceCitationSchema).min(1).max(20),
});

/**
 * Discriminated union of all valid agent actions.
 * This is the ONLY schema agents may emit when processing untrusted input.
 */
export const AgentActionSchema = z.discriminatedUnion('type', [
  SummarizeIssueAction,
  ProposeLabelsAction,
  DraftReplyAction,
  RequestHumanApprovalAction,
  GeneratePatchPlanAction,
  ClassifyIssueAction,
  IdentifyDuplicatesAction,
  RefuseActionAction,
  HandoffMessageAction,
]);

/** Inferred TypeScript type for an agent action. */
export type AgentAction = z.infer<typeof AgentActionSchema>;

/** All valid action type discriminator values. */
export type AgentActionType = AgentAction['type'];

// ============================================================================
// Action Classification
// ============================================================================

/**
 * Action types that are read-only and do not modify GitHub state.
 * These can be executed without human approval (subject to policy gate).
 */
const READ_ONLY_ACTIONS: ReadonlySet<AgentActionType> = new Set<AgentActionType>([
  'SummarizeIssue',
  'ClassifyIssue',
  'IdentifyDuplicates',
  'RefuseAction',
  'RequestHumanApproval',
  'HandoffMessage',
]);

/**
 * Action types that can modify GitHub state (labels, comments, code).
 *
 * Used for the untrusted-input influence block: low-trust input must not drive
 * ANY of these, approved or not. NOT the approval set — see
 * {@link APPROVAL_REQUIRED_ACTIONS}, which is narrower (#4463).
 */
const MUTATING_ACTIONS: ReadonlySet<AgentActionType> = new Set<AgentActionType>([
  'ProposeLabels',
  'DraftReply',
  'GeneratePatchPlan',
]);

/**
 * Action types that MUST include at least one source citation.
 * Escalation and refusal actions are exempt (they report inability to act).
 */
const CITATION_REQUIRED_ACTIONS: ReadonlySet<AgentActionType> = new Set<AgentActionType>([
  'SummarizeIssue',
  'ProposeLabels',
  'DraftReply',
  'GeneratePatchPlan',
  'ClassifyIssue',
  'IdentifyDuplicates',
  'HandoffMessage',
]);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validate an unknown value against the AgentActionSchema.
 * Returns a Result: `{ ok: true; value }` on success or `{ ok: false; error }` on failure.
 *
 * @param input - The value to validate (typically parsed JSON from an agent).
 * @returns Validation result following the project Result pattern.
 */
export function validateAgentAction(input: unknown): ActionValidationResult {
  const result = AgentActionSchema.safeParse(input);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  const messages = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  return { ok: false, error: `Action validation failed: ${messages.join('; ')}` };
}

/**
 * Check whether an action type is read-only (does not modify GitHub state).
 *
 * @param actionType - The action type discriminator value.
 * @returns True if the action is read-only.
 */
export function isReadOnlyAction(actionType: AgentActionType): boolean {
  return READ_ONLY_ACTIONS.has(actionType);
}

/**
 * Check whether an action type can modify GitHub state.
 * Mutating actions always require human approval before execution.
 *
 * @param actionType - The action type discriminator value.
 * @returns True if the action can modify state.
 */
export function isMutatingAction(actionType: AgentActionType): boolean {
  return MUTATING_ACTIONS.has(actionType);
}

/**
 * Action types that still require human approval after every policy check has
 * passed (#4463).
 *
 * Deliberately narrower than {@link MUTATING_ACTIONS}. Approval is a gate on
 * IRREVERSIBILITY and EXTERNAL VISIBILITY, not on mutation as such:
 *
 * - `ProposeLabels` — reversible in one click, internal to the tracker, and its
 *   schema carries no `requiresApproval` field. Not gated: it reaches this point
 *   having already passed citation, trust-tier, influence-block, Rule-of-Two and
 *   label-validity checks, so pausing bought delay, not safety.
 * - `DraftReply` — **publishes text under the project's identity**, on a surface
 *   other people read. Untrusted issue/PR content is in scope by definition
 *   here, so a prompt-injected reply is attacker-authored text posted publicly.
 *   Deleting it afterwards does not un-publish it.
 * - `GeneratePatchPlan` — gated, and deliberately so: its own schema encodes
 *   `requiresApproval: z.literal(true)` alongside a two-source corroboration
 *   minimum (`sources.min(2)`). Dropping the gate here while the schema still
 *   mandates the flag would put two sources of truth in conflict, and the
 *   two-factor design is intentional for an action that proposes file writes
 *   from potentially untrusted input.
 */
const APPROVAL_REQUIRED_ACTIONS: ReadonlySet<AgentActionType> = new Set<AgentActionType>([
  'DraftReply',
  'GeneratePatchPlan',
]);

/**
 * Whether an action needs human approval even after passing every policy check.
 *
 * Distinct from {@link isMutatingAction}, which stays broad because it also
 * drives the untrusted-input influence block — low-trust input must not be able
 * to drive ANY mutating action, approved or not.
 *
 * @param actionType - The action type discriminator value.
 * @returns True if a human must approve before execution.
 */
export function requiresHumanApproval(actionType: AgentActionType): boolean {
  return APPROVAL_REQUIRED_ACTIONS.has(actionType);
}

/**
 * Check whether an action type requires at least one source citation.
 * Escalation (RequestHumanApproval) and refusal (RefuseAction) are exempt.
 *
 * @param actionType - The action type discriminator value.
 * @returns True if the action must include source citations.
 */
export function requiresCitation(actionType: AgentActionType): boolean {
  return CITATION_REQUIRED_ACTIONS.has(actionType);
}
