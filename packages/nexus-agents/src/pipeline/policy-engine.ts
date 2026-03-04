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

/** Context provided to policy rules for evaluation. */
export interface PolicyContext {
  readonly taskId: string;
  readonly stageId: string;
  readonly stageType: string;
  readonly pipelineState: Readonly<Record<string, unknown>>;
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

const DEFAULT_MAX_ATTEMPTS = 3;
const COST_WARNING_THRESHOLD = 0.8;

/** Rule 1: Trust tier enforcement. */
const trustTierRule: PolicyRule = {
  id: 'trust-tier',
  priority: 100,
  evaluate(context): PolicyDecision {
    const state = context.pipelineState;
    const tierVal = state['trustTier'];
    const tier = typeof tierVal === 'number' ? tierVal : undefined;
    if (tier !== undefined && tier >= 3 && context.stageType === 'execute') {
      return {
        allow: false,
        reason: 'Untrusted input cannot trigger execute stages',
        escalateTo: 'user',
      };
    }
    return { allow: true };
  },
};

/** Rule 2: Security review gate. */
const securityReviewRule: PolicyRule = {
  id: 'security-review',
  priority: 90,
  evaluate(context): PolicyDecision {
    const state = context.pipelineState;
    const needsReview = state['securityReviewRequired'] === true;
    const hasReview = state['securityReviewComplete'] === true;
    if (needsReview && !hasReview && context.stageType === 'execute') {
      return {
        allow: false,
        reason: 'Security review required before implementation',
      };
    }
    return { allow: true };
  },
};

/** Rule 3: Bounded iteration. */
const boundedIterationRule: PolicyRule = {
  id: 'bounded-iteration',
  priority: 80,
  evaluate(context): PolicyDecision {
    const state = context.pipelineState;
    const attemptsVal = state['stageAttempts'];
    const attempts = typeof attemptsVal === 'number' ? attemptsVal : undefined;
    if (attempts !== undefined && attempts >= DEFAULT_MAX_ATTEMPTS) {
      return {
        allow: false,
        reason: `Stage "${context.stageId}" exceeded max retries`,
      };
    }
    return { allow: true };
  },
};

/** Rule 4: Cost budget. */
const costBudgetRule: PolicyRule = {
  id: 'cost-budget',
  priority: 70,
  evaluate(context): PolicyDecision {
    const state = context.pipelineState;
    const spentVal = state['costAccumulator'];
    const spent = typeof spentVal === 'number' ? spentVal : undefined;
    const budgetVal = state['costBudget'];
    const budget = typeof budgetVal === 'number' ? budgetVal : undefined;
    if (spent !== undefined && budget !== undefined) {
      if (spent > budget * COST_WARNING_THRESHOLD) {
        return {
          allow: false,
          reason: 'Approaching cost budget limit',
          escalateTo: 'user',
        };
      }
    }
    return { allow: true };
  },
};

/** Rule 5: High-risk action approval. */
const highRiskApprovalRule: PolicyRule = {
  id: 'high-risk-approval',
  priority: 60,
  evaluate(context): PolicyDecision {
    const state = context.pipelineState;
    const isHighRisk = state['highRisk'] === true;
    const approved = state['userApproved'] === true;
    if (isHighRisk && !approved) {
      return {
        allow: false,
        reason: 'High-risk action requires user approval',
        escalateTo: 'user',
      };
    }
    return { allow: true };
  },
};

/** All built-in policy rules. */
export const BUILT_IN_RULES: readonly PolicyRule[] = [
  trustTierRule,
  securityReviewRule,
  boundedIterationRule,
  costBudgetRule,
  highRiskApprovalRule,
];

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
