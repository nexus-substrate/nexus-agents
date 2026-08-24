/**
 * nexus-agents/security - Corroboration Validator
 *
 * Validates that agent decisions are backed by sufficient evidence from
 * authoritative sources. Each action type has specific corroboration
 * requirements (e.g., closing issues requires CI pass or maintainer comment).
 *
 * Defense layer 3 of the three-layer hardening architecture.
 * See: docs/architecture/UNTRUSTED_INPUT_HARDENING.md
 *
 * @module security/corroboration-validator
 * (Source: Issue #818, #823 — Phase 2: Corroboration Validator)
 */

import type { AgentAction, AgentActionType, SourceCitation } from './action-schema.js';
import type { TrustTier } from './trust-types.js';
import { TRUST_TIER_NUMERIC } from './trust-types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of corroboration validation.
 */
export interface CorroborationResult {
  /** Whether corroboration requirements are satisfied. */
  readonly satisfied: boolean;
  /** Sources that contributed to corroboration. */
  readonly corroboratingSources: readonly SourceCitation[];
  /** Missing corroboration requirements (empty when satisfied). */
  readonly missing: readonly string[];
  /** Action type that was validated. */
  readonly actionType: AgentActionType;
}

/**
 * Rule defining what corroboration an action requires.
 */
export interface CorroborationRule {
  /** Human-readable description of what's required. */
  readonly description: string;
  /** Predicate: does this set of sources satisfy the requirement? */
  readonly isSatisfied: (sources: readonly SourceCitation[]) => boolean;
}

// ============================================================================
// Source Helpers
// ============================================================================

/** Check if sources include a passing CI result. */
function hasCIPass(sources: readonly SourceCitation[]): boolean {
  return sources.some((s) => s.type === 'ciResult' && s.status === 'pass');
}

/** Check if sources include a maintainer command. */
function hasMaintainerCommand(sources: readonly SourceCitation[]): boolean {
  return sources.some((s) => s.type === 'maintainerCommand');
}

/** Check if sources include a Tier 1 issue comment. */
function hasTier1Comment(sources: readonly SourceCitation[]): boolean {
  return sources.some((s) => s.type === 'issueComment' && s.authorTrustTier === '1');
}

/** Check if sources include a repo file reference. */
function hasRepoFileRef(sources: readonly SourceCitation[]): boolean {
  return sources.some((s) => s.type === 'repoFile');
}

/** Check if sources include a repo file with line reference. */
function hasCodeLevelEvidence(sources: readonly SourceCitation[]): boolean {
  return sources.some((s) => s.type === 'repoFile' && s.line !== undefined);
}

/** Check if sources include a policy document reference. */
function hasPolicyDocRef(sources: readonly SourceCitation[]): boolean {
  return sources.some((s) => s.type === 'policyDoc');
}

/**
 * True when an ISSUE BODY source is authored at or above `maxTier` (#4667).
 *
 * Deliberately narrower than {@link hasSourceAtTier}, which returns `true` for
 * any non-authored source — repo files, CI results and policy docs are all
 * Tier 1 there. Reusing it here made a CI result alone satisfy ProposeLabels,
 * which the corroboration tests correctly forbid.
 */
function hasIssueBodyAtTier(sources: readonly SourceCitation[], maxTier: TrustTier): boolean {
  const maxNumeric = TRUST_TIER_NUMERIC[maxTier];
  return sources.some(
    (s) => s.type === 'issueBody' && TRUST_TIER_NUMERIC[s.authorTrustTier] <= maxNumeric
  );
}

/** Check if at least one source meets a minimum trust tier. */
function hasSourceAtTier(sources: readonly SourceCitation[], maxTier: TrustTier): boolean {
  const maxNumeric = TRUST_TIER_NUMERIC[maxTier];
  return sources.some((s) => {
    // Author-attributed content carries its author's trust, not the repo's.
    // `issueBody` was previously cited as a `repoFile` and so counted as Tier 1
    // unconditionally — untrusted issue text corroborating at maintainer trust
    // (#4667).
    if (s.type === 'issueComment' || s.type === 'issueBody') {
      return TRUST_TIER_NUMERIC[s.authorTrustTier] <= maxNumeric;
    }
    // Repo files, CI results, policy docs, maintainer commands = Tier 1
    return true;
  });
}

// ============================================================================
// Per-Action Corroboration Rules
// ============================================================================

/**
 * Corroboration rules for each action type.
 * See CLAUDE.md "Corroboration Requirements" table.
 */
const ACTION_CORROBORATION_RULES: Readonly<Record<AgentActionType, readonly CorroborationRule[]>> =
  {
    SummarizeIssue: [
      {
        description: 'At least one Tier 1/2 source',
        isSatisfied: (s) => hasSourceAtTier(s, '2'),
      },
    ],
    ProposeLabels: [
      {
        // #4667: the old description read "issue body (repo file)" — the rule
        // was written when triage cited the issue as a `repoFile`, so an issue
        // body satisfied it unconditionally regardless of who wrote it. Now
        // that the citation is honest (`issueBody`, carrying its author's
        // tier), the rule has to say what it always meant: an issue body
        // corroborates a label proposal only from a sufficiently trusted
        // author. Dropping the clause entirely would make this rule
        // unsatisfiable for every author including the repo owner — trading a
        // check that could never fail for one that can never pass.
        description:
          'Issue body from a Tier 1/2 author, OR repo file / maintainer instruction / policy doc',
        isSatisfied: (s) =>
          hasIssueBodyAtTier(s, '2') ||
          hasRepoFileRef(s) ||
          hasMaintainerCommand(s) ||
          hasPolicyDocRef(s),
      },
    ],
    DraftReply: [
      {
        description: 'At least one Tier 1 source citation',
        isSatisfied: (s) =>
          hasRepoFileRef(s) ||
          hasCIPass(s) ||
          hasMaintainerCommand(s) ||
          hasPolicyDocRef(s) ||
          hasTier1Comment(s),
      },
    ],
    GeneratePatchPlan: [
      {
        description: 'Failing test OR bug reproduction steps (code-level evidence)',
        isSatisfied: (s) => hasCodeLevelEvidence(s) || hasCIPass(s),
      },
      {
        description: 'Maintainer corroboration',
        isSatisfied: (s) => hasMaintainerCommand(s) || hasTier1Comment(s),
      },
    ],
    ClassifyIssue: [
      {
        description: 'At least one source citation',
        isSatisfied: (s) => s.length > 0,
      },
    ],
    IdentifyDuplicates: [
      {
        description: 'At least one source citation',
        isSatisfied: (s) => s.length > 0,
      },
    ],
    RequestHumanApproval: [],
    RefuseAction: [],
    HandoffMessage: [
      {
        description: 'At least one source citation for trust tier propagation',
        isSatisfied: (s) => s.length > 0,
      },
    ],
  };

// ============================================================================
// Public API
// ============================================================================

/**
 * Validate that an agent action has sufficient corroboration from
 * authoritative sources.
 *
 * @param action - The validated AgentAction to check.
 * @returns CorroborationResult indicating whether requirements are met.
 */
export function validateCorroboration(action: AgentAction): CorroborationResult {
  const rules = ACTION_CORROBORATION_RULES[action.type];
  const sources: readonly SourceCitation[] = 'sources' in action ? action.sources : [];

  if (rules.length === 0) {
    return {
      satisfied: true,
      corroboratingSources: sources,
      missing: [],
      actionType: action.type,
    };
  }

  const missing: string[] = [];
  const corroborating: SourceCitation[] = [];

  for (const rule of rules) {
    if (rule.isSatisfied(sources)) {
      for (const s of sources) {
        if (!corroborating.includes(s)) {
          corroborating.push(s);
        }
      }
    } else {
      missing.push(rule.description);
    }
  }

  return {
    satisfied: missing.length === 0,
    corroboratingSources: corroborating,
    missing,
    actionType: action.type,
  };
}

/**
 * Get the corroboration rules for an action type.
 * Useful for displaying requirements to users.
 */
export function getCorroborationRules(actionType: AgentActionType): readonly CorroborationRule[] {
  return ACTION_CORROBORATION_RULES[actionType];
}
