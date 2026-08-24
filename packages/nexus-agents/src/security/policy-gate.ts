/**
 * nexus-agents/security - Policy Gate
 *
 * Deterministic rule engine that validates all agent actions before
 * GitHub state mutations can occur. No LLM in the validation path.
 *
 * Defense layer 2 of the three-layer hardening architecture.
 * See: docs/architecture/UNTRUSTED_INPUT_HARDENING.md
 *
 * @module security/policy-gate
 * (Source: Issue #818, #822 — Phase 2: Policy Gate)
 */

import { z } from 'zod';

import type { AgentAction, AgentActionType, SourceCitation } from './action-schema.js';
import {
  isMutatingAction,
  isReadOnlyAction,
  requiresCitation,
  requiresHumanApproval,
} from './action-schema.js';
import type { TrustTier } from './trust-types.js';
import { TRUST_TIER_NUMERIC } from './trust-types.js';
import { getRequiredTrustTier, canInfluenceDecisions } from './trust-classifier.js';
import type { AuditTrail } from './audit-trail.js';
import { emitPolicyEvent } from './audit-trail.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Violation detected by the policy gate.
 */
export const ViolationSchema = z.object({
  /** Machine-readable rule identifier. */
  rule: z.string().min(1),
  /** Human-readable description of the violation. */
  message: z.string().min(1),
  /** Severity: 'block' prevents execution, 'warn' logs only. */
  severity: z.enum(['block', 'warn']),
});
export type Violation = z.infer<typeof ViolationSchema>;

/**
 * Decision returned by the policy gate.
 */
export interface PolicyDecision {
  /** Whether the action is allowed to proceed. */
  readonly allowed: boolean;
  /** Whether human approval is required before execution. */
  readonly requiresApproval: boolean;
  /** All detected violations (blocking and warnings). */
  readonly violations: readonly Violation[];
  /** Timestamp of the evaluation (ISO 8601). */
  readonly evaluatedAt: string;
}

/**
 * Context for evaluating a policy decision.
 */
export interface ActionContext {
  /** Trust tier of the primary input source. */
  readonly inputTrustTier: TrustTier;
  /** Whether the agent currently has write access to the repository. */
  readonly hasWriteAccess: boolean;
  /** Whether the agent currently has access to secrets/tokens. */
  readonly hasSecretAccess: boolean;
  /** Set of labels that exist on the repository (for ProposeLabels validation). */
  readonly existingLabels?: ReadonlySet<string>;
}

// ============================================================================
// Policy Rules
// ============================================================================

/** Extract sources from an action, handling actions that lack a sources field. */
function getActionSources(action: AgentAction): readonly SourceCitation[] {
  if ('sources' in action) {
    return action.sources;
  }
  return [];
}

/** Check that citations exist for actions that require them. */
function checkCitationRequirement(action: AgentAction): Violation | undefined {
  if (!requiresCitation(action.type)) return undefined;
  const sources = getActionSources(action);
  if (sources.length === 0) {
    return {
      rule: 'REQUIRE_CITATION',
      message: `Action '${action.type}' requires at least one source citation`,
      severity: 'block',
    };
  }
  return undefined;
}

/** Check that the input trust tier meets action requirements. */
function checkTrustRequirement(action: AgentAction, context: ActionContext): Violation | undefined {
  const requiredTier = getRequiredTrustTier(action.type);
  const requiredNumeric = TRUST_TIER_NUMERIC[requiredTier];
  const inputNumeric = TRUST_TIER_NUMERIC[context.inputTrustTier];

  if (inputNumeric > requiredNumeric) {
    return {
      rule: 'INSUFFICIENT_TRUST',
      message: `Action '${action.type}' requires Tier ${requiredTier} but input is Tier ${context.inputTrustTier}`,
      severity: 'block',
    };
  }
  return undefined;
}

/** Check that Tier 3-4 input cannot drive decisions. */
function checkInfluenceBlock(action: AgentAction, context: ActionContext): Violation | undefined {
  if (!canInfluenceDecisions(context.inputTrustTier) && isMutatingAction(action.type)) {
    return {
      rule: 'UNTRUSTED_INFLUENCE',
      message: `Tier ${context.inputTrustTier} input cannot drive mutating action '${action.type}'`,
      severity: 'block',
    };
  }
  return undefined;
}

/**
 * Enforce the Rule of Two: no agent may simultaneously
 * (a) process untrusted input, (b) have write access, AND (c) access secrets.
 *
 * Exported (#3198) so the firewall's `policyEnforcement` stage can surface the
 * same assessment during input composition without duplicating the predicate.
 */
export function checkRuleOfTwo(context: ActionContext): Violation | undefined {
  const isUntrusted = TRUST_TIER_NUMERIC[context.inputTrustTier] >= 3;
  if (isUntrusted && context.hasWriteAccess && context.hasSecretAccess) {
    return {
      rule: 'RULE_OF_TWO',
      message:
        'Rule of Two violation: agent simultaneously processes untrusted input, has write access, and accesses secrets',
      severity: 'block',
    };
  }
  return undefined;
}

/**
 * Labels that GRANT PRIVILEGE or REDUCE SCRUTINY, and so may never be proposed
 * by an agent acting on external input (#4688).
 *
 * These are not ordinary taxonomy labels. In this repository they are control
 * inputs to CI:
 *
 * - `owner-ratified` — the label `check-governor-ratification.ts` accepts as
 *   proof of owner ratification. Applying it BYPASSES the governance-of-the-
 *   governor gate on `src/audit/`, `.rules/`, `CODEOWNERS` and friends.
 * - `skip-pr-review` — suppresses the PR review workflow.
 * - `pr-review-ci` — triggers the review workflow; less dangerous than the
 *   two above, but still a workflow control rather than a description.
 *
 * Why this exists BEFORE it is needed: no production code applies a proposed
 * label today (`addLabels` has no non-test caller), so the path is latent. But
 * the consensus panel's dissenting seat was right that labels are not
 * zero-blast-radius, and the day someone wires triage output to `addLabels` is
 * the day an issue body can propose its own ratification. A guard added after
 * that wiring is a guard added after the incident.
 *
 * This is deliberately checked on the ACTION's effect rather than the author's
 * trust: an OWNER-authored body proposing `owner-ratified` is precisely the
 * self-modification the governor exists to prevent, so author trust must not
 * soften it.
 */
const PRIVILEGE_GRANTING_LABELS: ReadonlySet<string> = new Set([
  'owner-ratified',
  'skip-pr-review',
  'pr-review-ci',
]);

/**
 * Refuse any proposal naming a privilege-granting label.
 *
 * Independent of {@link checkLabelValidity} on purpose: that check returns
 * early when the repository label set is unknown, and a denylist layered on
 * top of it would inherit that vacuous pass. This one needs no world state.
 */
function checkPrivilegedLabels(action: AgentAction): Violation | undefined {
  if (action.type !== 'ProposeLabels') return undefined;

  const privileged = action.labels.filter((l) => PRIVILEGE_GRANTING_LABELS.has(l));
  if (privileged.length === 0) return undefined;

  return {
    rule: 'PRIVILEGED_LABEL',
    message:
      `Proposed labels grant privilege or reduce review scrutiny: ` +
      `${privileged.join(', ')}. These are CI control inputs, not descriptions, ` +
      `and are never proposable from agent-processed input (#4688).`,
    severity: 'block',
  };
}

/** Check that proposed labels exist in the repository's label set. */
function checkLabelValidity(action: AgentAction, context: ActionContext): Violation | undefined {
  if (action.type !== 'ProposeLabels') return undefined;
  const labels = context.existingLabels;
  if (labels === undefined) return undefined;

  const invalid = action.labels.filter((l) => !labels.has(l));
  if (invalid.length > 0) {
    return {
      rule: 'INVALID_LABELS',
      message: `Proposed labels not in repository: ${invalid.join(', ')}`,
      severity: 'block',
    };
  }
  return undefined;
}

/** Check that source citations meet trust requirements for the action. */
function checkSourceTrustTiers(action: AgentAction): Violation | undefined {
  const sources = getActionSources(action);
  if (sources.length === 0) return undefined;

  const requiredTier = getRequiredTrustTier(action.type);
  const requiredNumeric = TRUST_TIER_NUMERIC[requiredTier];

  for (const source of sources) {
    if (source.type === 'issueComment') {
      const sourceTierNumeric = TRUST_TIER_NUMERIC[source.authorTrustTier];
      if (sourceTierNumeric > requiredNumeric) {
        return {
          rule: 'SOURCE_TRUST_MISMATCH',
          message: `Source from '${source.author}' (Tier ${source.authorTrustTier}) insufficient for action requiring Tier ${requiredTier}`,
          severity: 'warn',
        };
      }
    }
  }
  return undefined;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Evaluate an agent action against the policy gate.
 *
 * This is a deterministic check — no LLM in the loop. Returns a
 * PolicyDecision indicating whether the action is allowed, requires
 * human approval, or is blocked.
 *
 * @param action - The validated AgentAction to evaluate.
 * @param context - The current execution context.
 * @returns PolicyDecision with violations and approval requirements.
 */
export function evaluatePolicy(
  action: AgentAction,
  context: ActionContext,
  auditTrail?: AuditTrail
): PolicyDecision {
  const violations: Violation[] = [];

  const checks = [
    checkCitationRequirement(action),
    checkTrustRequirement(action, context),
    checkInfluenceBlock(action, context),
    checkRuleOfTwo(context),
    checkLabelValidity(action, context),
    checkPrivilegedLabels(action),
    checkSourceTrustTiers(action),
  ];

  for (const violation of checks) {
    if (violation !== undefined) {
      violations.push(violation);
    }
  }

  const hasBlockingViolation = violations.some((v) => v.severity === 'block');
  // #4463: gate on irreversibility + external visibility, not on mutation as
  // such. ProposeLabels and GeneratePatchPlan are reversible and internal, and
  // reach here having already cleared citation, trust-tier, influence-block,
  // Rule-of-Two and label-validity checks. DraftReply still gates because it
  // publishes text under the project's identity on a surface others read.
  // `isMutatingAction` stays broad above (line ~113) for the influence block:
  // low-trust input must not drive ANY mutating action, approved or not.
  const needsApproval = !hasBlockingViolation && requiresHumanApproval(action.type);

  const decision: PolicyDecision = {
    allowed: !hasBlockingViolation,
    requiresApproval: needsApproval,
    violations,
    evaluatedAt: new Date().toISOString(),
  };

  // #3191: when an audit trail is supplied, record the decision so policy
  // outcomes are part of the durable audit record (the gate previously emitted
  // nothing). Optional — pure callers pass no trail and incur no side effect.
  if (auditTrail !== undefined) {
    emitPolicyEvent(auditTrail, {
      actionType: action.type,
      allowed: decision.allowed,
      requiresApproval: decision.requiresApproval,
      inputTrustTier: context.inputTrustTier,
      violationRules: violations.map((v) => v.rule),
    });
  }

  return decision;
}

/**
 * Quick check: can this action type proceed at all given the input trust tier?
 * Useful for early rejection before full policy evaluation.
 */
export function canProceed(actionType: AgentActionType, inputTrustTier: TrustTier): boolean {
  if (isReadOnlyAction(actionType)) {
    const requiredTier = getRequiredTrustTier(actionType);
    return TRUST_TIER_NUMERIC[inputTrustTier] <= TRUST_TIER_NUMERIC[requiredTier];
  }
  return canInfluenceDecisions(inputTrustTier);
}
