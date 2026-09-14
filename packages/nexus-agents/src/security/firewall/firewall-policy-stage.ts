/**
 * nexus-agents/security/firewall - Policy stage
 *
 * The `policyEnforcement` stage of {@link HostileInputFirewall} (#5380). It
 * used to run ONE of the seven checks `evaluatePolicy` runs — `checkRuleOfTwo`,
 * the only one that reads the `ActionContext` alone. The other six read an
 * `AgentAction`, which input-shaped `process()` never had, so they were not
 * "passing": they were never evaluated, and the result could not say so.
 *
 * This module gives the stage two honest shapes. With the action the caller
 * intends to take (`FirewallProcessOptions.action`) it runs `evaluatePolicy` in
 * full; without one it runs the Rule of Two and NAMES the six action-scoped
 * rules as unmeasured, so their absence from the violation list cannot be read
 * as a pass.
 *
 * @module security/firewall/firewall-policy-stage
 */

import { createLogger } from '../../core/index.js';
import type { AgentAction, AgentActionType } from '../action-schema.js';
import type { AuditTrail } from '../audit-trail.js';
import { ACTION_SCOPED_POLICY_RULES, checkRuleOfTwo, evaluatePolicy } from '../policy-gate.js';
import type { ActionContext, Violation } from '../policy-gate.js';
import type { TrustTier } from '../trust-types.js';
import type { FirewallPolicyMode } from './firewall-policy-mode.js';
import type { FirewallError, FirewallProcessOptions } from './firewall-types.js';

const logger = createLogger({ component: 'HostileInputFirewall' });

/**
 * What the `policyEnforcement` stage evaluated, and against what (#5380).
 *
 * A discriminated union keeps a reader from mistaking one shape for the other:
 *
 * - `scope: 'action'` — an action was supplied; all seven checks ran and
 *   `violations` is the complete list. `allowed` and `requiresApproval` are
 *   the decision's own fields (`PolicyDecision`), surfaced, not re-derived;
 *   the firewall does not act on `requiresApproval` any more than the
 *   production gate does (#4735: Rule of Two is refuse-only, and there is no
 *   approval path here).
 * - `scope: 'context'` — no action was supplied; only the Rule of Two (the one
 *   check that reads the context alone) ran. The six action-scoped checks are
 *   listed in `unmeasured` by rule id, and `requiresApproval` — which depends
 *   on the action type — is not reported at all rather than defaulted.
 */
export type FirewallPolicyEvaluation =
  | {
      readonly scope: 'action';
      readonly actionType: AgentActionType;
      readonly allowed: boolean;
      readonly requiresApproval: boolean;
      readonly violations: readonly Violation[];
      /** Always empty for a full evaluation; present so both shapes read the same way. */
      readonly unmeasured: readonly string[];
    }
  | {
      readonly scope: 'context';
      /** Why the six action-scoped checks did not run. */
      readonly reason: 'no-action-supplied';
      /** At most the `RULE_OF_TWO` violation. */
      readonly violations: readonly Violation[];
      /** The rule ids `evaluatePolicy` could not evaluate without an action. */
      readonly unmeasured: readonly string[];
    };

/**
 * Builds the `ActionContext` for one call from the facts the pipeline has:
 * the ENFORCED tier (post reputation gate), the call's access posture, and the
 * repository label set when the caller supplied one. `existingLabels` is
 * spread in only when present so `evaluatePolicy` sees absence as absence and
 * fails the label-validity check closed (`LABEL_SET_UNAVAILABLE`).
 */
export function buildActionContext(
  effectiveTrustTier: TrustTier,
  context: { readonly hasWriteAccess: boolean; readonly hasSecretAccess: boolean },
  options: FirewallProcessOptions | undefined
): ActionContext {
  return {
    inputTrustTier: effectiveTrustTier,
    hasWriteAccess: context.hasWriteAccess,
    hasSecretAccess: context.hasSecretAccess,
    ...(options?.existingLabels !== undefined ? { existingLabels: options.existingLabels } : {}),
  };
}

/**
 * Runs the policy checks the call's facts allow.
 *
 * With an action: `evaluatePolicy` in full — the seven checks production runs
 * — with the decision recorded on `auditTrail` as a `policy_gate` event when
 * one is given, so the durable record carries the verdict and not just the
 * trust tier. Without one: the Rule of Two alone (previously the stage's whole
 * behaviour, #3198), with the action-scoped rule ids reported as unmeasured.
 */
export function evaluateFirewallPolicy(
  context: ActionContext,
  action: AgentAction | undefined,
  auditTrail: AuditTrail | undefined
): FirewallPolicyEvaluation {
  if (action === undefined) {
    const violation = checkRuleOfTwo(context);
    return {
      scope: 'context',
      reason: 'no-action-supplied',
      violations: violation !== undefined ? [violation] : [],
      unmeasured: ACTION_SCOPED_POLICY_RULES,
    };
  }
  const decision = evaluatePolicy(action, context, auditTrail);
  return {
    scope: 'action',
    actionType: action.type,
    allowed: decision.allowed,
    requiresApproval: decision.requiresApproval,
    violations: decision.violations,
    unmeasured: [],
  };
}

/**
 * The violations that refuse under `enforce` and count as `wouldRefuse` under
 * `audit`: every `severity: 'block'` entry, whichever check produced it. A
 * `warn` violation never refuses, and an absent evaluation (stage disabled)
 * yields none — the mode gates the response to a violation, never its
 * detection.
 */
export function blockingViolations(
  policy: FirewallPolicyEvaluation | undefined
): readonly Violation[] {
  return policy?.violations.filter((v) => v.severity === 'block') ?? [];
}

/**
 * The fail-closed half of the #5382 gate: under `enforce`, a blocking policy
 * violation refuses the input instead of riding along as a signal on an
 * `ok()` result that a caller checking only `result.ok` walks straight past.
 *
 * This gates the RESPONSE to a violation, never its detection. It cannot
 * manufacture a refusal where the `policyEnforcement` stage never ran, and it
 * cannot refuse a non-blocking (`warn`) violation — so `enforce` is not a
 * kill switch, and an allowlisted maintainer stays served. Any `block`
 * violation refuses, whichever of the seven checks produced it (#5380), and
 * the message names every blocking rule. `requiresApproval` never refuses —
 * it is not a violation, and there is no approval path here.
 *
 * @returns the refusal, or `undefined` when the input passes or the mode has
 *          not opted in.
 */
export function policyRefusal(
  policy: FirewallPolicyEvaluation | undefined,
  policyMode: FirewallPolicyMode,
  user: string,
  effectiveTrustTier: TrustTier
): FirewallError | undefined {
  const blocking = blockingViolations(policy);
  if (blocking.length === 0 || policyMode !== 'enforce') return undefined;
  logger.warn('Firewall REFUSED input under enforce mode', {
    user,
    effectiveTrustTier,
    rules: blocking.map((v) => v.rule),
  });
  return {
    code: 'POLICY_REFUSED',
    message:
      `Refused by firewall policy: ` + blocking.map((v) => `${v.rule} — ${v.message}`).join('; '),
    stage: 'policy',
  };
}
