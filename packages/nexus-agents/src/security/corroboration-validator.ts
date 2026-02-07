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

/** Check if at least one source meets a minimum trust tier. */
function hasSourceAtTier(sources: readonly SourceCitation[], maxTier: TrustTier): boolean {
  const maxNumeric = TRUST_TIER_NUMERIC[maxTier];
  return sources.some((s) => {
    if (s.type === 'issueComment') {
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
        description: 'Keyword match in issue body (repo file) OR maintainer instruction',
        isSatisfied: (s) => hasRepoFileRef(s) || hasMaintainerCommand(s) || hasPolicyDocRef(s),
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
