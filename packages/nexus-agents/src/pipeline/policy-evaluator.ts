/**
 * PolicyEvaluator — V2 Pipeline Policy Enforcement Adapter (Issue #923, Phase D)
 *
 * Wraps PolicyEngine with mode awareness (off/warn/block) and EventBus
 * integration. Evaluates policy rules at stage boundaries.
 *
 * WARN mode (default): violations are logged + emitted as events, execution continues.
 * BLOCK mode: violations halt the pipeline.
 * OFF mode: policy evaluation is skipped entirely.
 *
 * @module pipeline/policy-evaluator
 */
import { createLogger } from '../core/index.js';

import type { PolicyEngine, PolicyDecision, PolicyContext } from './policy-engine.js';
import type { IEventBus, PipelineEvent } from './event-types.js';

const logger = createLogger({ component: 'PolicyEvaluator' });

// ============================================================================
// Types
// ============================================================================

/** Policy enforcement mode. */
export type PolicyMode = 'off' | 'warn' | 'block';

/** Options for PolicyEvaluator. */
export interface PolicyEvaluatorOptions {
  readonly engine: PolicyEngine;
  readonly eventBus?: IEventBus;
  readonly mode?: PolicyMode;
}

/** Result of a policy evaluation at a stage boundary. */
export interface PolicyEvalResult {
  readonly allowed: boolean;
  readonly violations: readonly PolicyViolation[];
  readonly mode: PolicyMode;
}

/** A single policy violation. */
export interface PolicyViolation {
  readonly ruleId: string;
  readonly reason: string;
  readonly escalateTo?: string;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Reads `NEXUS_V2_POLICY_MODE` from env, defaulting to 'warn'.
 */
export function getPolicyMode(): PolicyMode {
  const env = process.env['NEXUS_V2_POLICY_MODE'];
  if (env === 'off' || env === 'block') return env;
  return 'warn';
}

/**
 * Evaluates all registered policy rules for a stage boundary.
 *
 * In WARN mode, violations are logged and emitted but execution continues.
 * In BLOCK mode, violations halt the pipeline.
 * In OFF mode, evaluation is skipped entirely.
 */
export function evaluatePolicy(
  options: PolicyEvaluatorOptions,
  context: PolicyContext
): PolicyEvalResult {
  const mode = options.mode ?? getPolicyMode();

  if (mode === 'off') {
    return { allowed: true, violations: [], mode };
  }

  const violations: PolicyViolation[] = [];
  const rules = options.engine.listRules();

  for (const rule of rules) {
    const decision: PolicyDecision = rule.evaluate(context);
    if (!decision.allow) {
      violations.push({
        ruleId: rule.id,
        reason: decision.reason,
        ...(decision.escalateTo !== undefined ? { escalateTo: decision.escalateTo } : {}),
      });
    }
  }

  if (violations.length > 0) {
    emitPolicyEvents(options.eventBus, context, violations);
    logViolations(context, violations, mode);
  }

  const allowed = mode === 'warn' || violations.length === 0;
  return { allowed, violations, mode };
}

// ============================================================================
// Internal Helpers
// ============================================================================

/** Emits policy.evaluated events for each violation. */
function emitPolicyEvents(
  eventBus: IEventBus | undefined,
  context: PolicyContext,
  violations: readonly PolicyViolation[]
): void {
  if (eventBus === undefined) return;
  for (const v of violations) {
    const event: PipelineEvent = {
      type: 'policy.evaluated',
      timestamp: Date.now(),
      executionId: context.taskId,
      gateId: `${context.stageId}:${v.ruleId}`,
      decision: 'deny',
    };
    eventBus.emit(event);
  }
}

/** Logs violations at appropriate level based on mode. */
function logViolations(
  context: PolicyContext,
  violations: readonly PolicyViolation[],
  mode: PolicyMode
): void {
  const summary = violations.map((v) => v.ruleId).join(', ');
  if (mode === 'block') {
    logger.warn('Policy BLOCKED stage', {
      stageId: context.stageId,
      violations: summary,
      count: violations.length,
    });
  } else {
    logger.info('Policy WARN (violations logged)', {
      stageId: context.stageId,
      violations: summary,
      count: violations.length,
    });
  }
}
