/**
 * PolicyEngine — V2 Pipeline Policy Enforcement (Issue #913, Phase 5-1)
 *
 * Evaluates policy rules at pipeline gate points.
 * Rules are registered at startup and evaluated in priority order.
 *
 * @see docs/v2/07-policy-governance-gates.md
 * @module pipeline/policy-engine
 */
import { createLogger } from '../core/index.js';

import type { PolicyGateSpec } from './task-contract.js';

const logger = createLogger({ component: 'PolicyEngine' });

// ============================================================================
// Types
// ============================================================================

/** Decision returned by a policy rule evaluation. */
export type PolicyDecision =
  | { readonly allow: true }
  | {
      readonly allow: false;
      readonly reason: string;
      readonly escalateTo?: string;
    };

/**
 * Typed snapshot of the pipeline state available to policy rules (#2932).
 *
 * Listing the fields by name (instead of an untyped `Record<string, unknown>`)
 * surfaces missing-producer bugs at compile time. The pre-#2932 untyped
 * shape let `securityReviewRule`, `costBudgetRule`, `highRiskApprovalRule`,
 * and `boundedIterationRule` read keys that no producer ever wrote — every
 * comparison evaluated against `undefined`, so every rule allowed. Those
 * four rules were deleted in the same change; this interface lists only
 * the fields with a real producer chain.
 *
 * Adding a new rule means adding its input field here AND wiring a
 * producer that writes it onto `TaskContract.metadata` upstream of
 * `checkPipelinePolicy`.
 */
export interface PipelineStateSnapshot {
  /**
   * Caller trust tier (`'1'`..`'4'` per `security/trust-types.ts`). Producers
   * include `trust-classifier`, `input-sanitizer`, `firewall-pipeline`, and
   * `mcp/middleware/request-context`; threading the value into
   * `TaskContract.metadata.trustTier` is owner-scoped follow-up work — see
   * the corresponding issue.
   *
   * ABSENT MEANS UNTRUSTED, NOT ALLOWED (#4821). An absent or non-numeric
   * value is coerced to `4` and DENIES — see `trustTierRule` below. This doc
   * previously claimed the opposite ("fail-open default for unknown trust"),
   * describing a pre-hardening behaviour the code no longer has.
   *
   * That is the correct default and should stay: fail-closed on unknown
   * provenance is what `.rules/untrusted-input.md` requires. Do not "fix" the
   * rule to match the old comment. The practical consequence, worth knowing
   * before planning enforcement work, is that an UNWIRED producer is the DENY
   * case rather than the safe one.
   */
  readonly trustTier?: string;
}

/** Context provided to policy rules for evaluation. */
export interface PolicyContext {
  readonly taskId: string;
  readonly stageId: string;
  readonly stageType: string;
  readonly pipelineState: PipelineStateSnapshot;
}

/** A policy rule with priority-ordered evaluation. */
export interface PolicyRule {
  readonly id: string;
  readonly priority: number;
  evaluate(context: PolicyContext): PolicyDecision;
}

/** Policy engine interface. */
export interface IPolicyEngine {
  evaluate(gate: PolicyGateSpec, context: PolicyContext): PolicyDecision;
  registerRule(rule: PolicyRule): void;
  listRules(): readonly PolicyRule[];
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * In-memory policy engine with priority-ordered rule evaluation.
 *
 * Rules are evaluated in descending priority order.
 * First blocking rule short-circuits evaluation.
 */
export class PolicyEngine implements IPolicyEngine {
  private readonly rules = new Map<string, PolicyRule>();

  registerRule(rule: PolicyRule): void {
    if (this.rules.has(rule.id)) {
      throw new Error(`Policy rule duplicate: "${rule.id}"`);
    }
    this.rules.set(rule.id, rule);
  }

  evaluate(gate: PolicyGateSpec, context: PolicyContext): PolicyDecision {
    const sorted = this.getRulesForGate(gate);

    for (const rule of sorted) {
      const decision = rule.evaluate(context);
      if (!decision.allow) {
        logger.info('Policy rule blocked', {
          ruleId: rule.id,
          gateId: gate.id,
          reason: decision.reason,
        });
        return decision;
      }
    }

    return { allow: true };
  }

  listRules(): readonly PolicyRule[] {
    return [...this.rules.values()].sort((a, b) => b.priority - a.priority);
  }

  private getRulesForGate(gate: PolicyGateSpec): PolicyRule[] {
    const matched: PolicyRule[] = [];
    for (const ruleId of gate.rules) {
      const rule = this.rules.get(ruleId);
      if (rule !== undefined) {
        matched.push(rule);
      }
    }
    return matched.sort((a, b) => b.priority - a.priority);
  }
}

// ============================================================================
// Built-in Rules
// ============================================================================

/**
 * Trust-tier enforcement: untrusted input (tier `'3'` or `'4'`) cannot
 * trigger `execute`-stage work. The trust tier comes from the caller
 * context — `trust-classifier`, `input-sanitizer`, `firewall-pipeline`,
 * `mcp/middleware/request-context` all produce it; threading the value
 * into `TaskContract.metadata.trustTier` is the producer-side wiring
 * task (see the #2932 follow-up issue).
 *
 * #2860 fixed the pre-existing number-only coercion bug; #2932 typed
 * the snapshot shape so the missing-producer class can't recur.
 *
 * The four sibling rules that used to live here (`security-review`,
 * `bounded-iteration`, `cost-budget`, `high-risk-approval`) were
 * deleted in #2932: each read a key — `securityReviewRequired`,
 * `stageAttempts`, `costAccumulator`, `highRisk` — that no producer
 * ever wrote, so every comparison evaluated against `undefined` and
 * every rule allowed. They were aspirational scaffolding, not real
 * gates. Add them back when a producer subsystem exists.
 */
const trustTierRule: PolicyRule = {
  id: 'trust-tier',
  priority: 100,
  evaluate(context): PolicyDecision {
    // Closes #2994 (with producer-side wiring from #2957):
    // pre-fix, a missing or non-numeric pipelineState.trustTier was
    // tolerated via "tier === undefined → allow", so any V2 pipeline path
    // whose producer forgot to write trustTier silently bypassed this —
    // the only built-in policy rule. Now: missing / invalid trustTier
    // defaults to 4 (untrusted), so the gate fails closed.
    //
    // Producers must write `metadata.trustTier` (a TrustTier string
    // '1'..'4') onto the TaskContract. The two current producers wire it
    // through `orchestrateInputToTaskContract` and
    // `delegateInputToTaskContract`'s `opts.trustTier`.
    const tierVal = context.pipelineState.trustTier;
    const numericTier = tierVal === undefined ? Number.NaN : Number(tierVal);
    const tier = Number.isFinite(numericTier) ? numericTier : 4;
    if (tier >= 3 && context.stageType === 'execute') {
      return {
        allow: false,
        reason:
          tierVal === undefined || !Number.isFinite(numericTier)
            ? `Missing or invalid trustTier on pipeline state; defaulting to untrusted (4). Producer must set TaskContract.metadata.trustTier (#2957).`
            : 'Untrusted input cannot trigger execute stages',
        escalateTo: 'user',
      };
    }
    return { allow: true };
  },
};

/** All built-in policy rules. */
export const BUILT_IN_RULES: readonly PolicyRule[] = [trustTierRule];

/**
 * Creates a PolicyEngine with all built-in rules registered.
 */
export function createDefaultPolicyEngine(): PolicyEngine {
  const engine = new PolicyEngine();
  for (const rule of BUILT_IN_RULES) {
    engine.registerRule(rule);
  }
  return engine;
}
