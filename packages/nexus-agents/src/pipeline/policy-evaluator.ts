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

import { resolveV2Config } from './v2-config.js';
import type {
  IPolicyEngine,
  PolicyDecision,
  PolicyContext,
  PipelineStateSnapshot,
} from './policy-engine.js';
import type { IEventBus, PipelineEvent } from './event-types.js';
import type { AuditTrail } from '../security/audit-trail.js';
import { emitPipelinePolicyEvent } from '../security/audit-trail.js';

const logger = createLogger({ component: 'PolicyEvaluator' });

// ============================================================================
// Types
// ============================================================================

/** Policy enforcement mode. */
export type PolicyMode = 'off' | 'warn' | 'block';

/** Options for PolicyEvaluator. */
export interface PolicyEvaluatorOptions {
  /** Only `listRules()` is consumed, so the interface — not the class — suffices. */
  readonly engine: IPolicyEngine;
  readonly eventBus?: IEventBus;
  readonly mode?: PolicyMode;
  /**
   * Optional DURABLE audit trail (#3710). When present, each violation is ALSO
   * appended to the hash-chained store (dual-emit) carrying mode/ruleIds/
   * stageType — so soak(warn)-vs-enforce(block) evidence survives process exit
   * for the tune/readiness loop. The in-memory `eventBus` emit is unchanged
   * (back-compat). When absent, behavior is byte-identical to before.
   */
  readonly auditTrail?: AuditTrail;
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
// Stage-boundary gate enforcement (#3177)
// ============================================================================

/**
 * Dedicated error thrown when a policy gate denies a stage boundary in BLOCK
 * mode. Distinct from a generic `Error` so retry/telemetry can recognize a
 * policy denial: it is non-retryable (a re-run with the same inputs will fail
 * identically) and carries the offending gate id + the violations that fired.
 *
 * The executor catches this in `executeSingleNode`; the failure category
 * coarsens to `permission`, which `defaultRetryable` marks non-retryable —
 * so a policy block halts even under `continueOnFailure` (#3177 condition 3).
 */
export class PolicyBlockedError extends Error {
  readonly gateId: string;
  readonly violations: readonly PolicyViolation[];

  constructor(gateId: string, violations: readonly PolicyViolation[]) {
    const summary = violations.map((v) => v.ruleId).join(', ');
    super(`Policy gate '${gateId}' blocked stage boundary (rules: ${summary || 'none'})`);
    this.name = 'PolicyBlockedError';
    this.gateId = gateId;
    this.violations = violations;
  }
}

/**
 * Policy-enforcement bundle threaded to a compiled gate node (#3177).
 *
 * When attached to `PlanCompileOptions`, each policy gate node evaluates
 * `evaluatePipelinePolicy` at runtime instead of being a no-op pass. When
 * absent, gates stay no-op passes (back-compat).
 */
export interface GatePolicyEnforcement {
  /** Engine whose rules are evaluated at the gate boundary. */
  readonly engine: IPolicyEngine;
  /**
   * Snapshot of pipeline state available to policy rules (carries `trustTier`).
   * Captured at compile time from the TaskContract metadata by the caller.
   */
  readonly pipelineState: PipelineStateSnapshot;
  /** Optional event bus; policy.evaluated events are emitted on violations. */
  readonly eventBus?: IEventBus;
  /**
   * Optional DURABLE audit trail (#3710) — forwarded to
   * {@link evaluatePipelinePolicy} so gate decisions are persisted to the
   * hash-chained store in addition to the in-memory bus.
   */
  readonly auditTrail?: AuditTrail;
  /**
   * Effective enforcement mode for gate nodes. WARN by default (#3177
   * condition 1): a gate with no explicit mode does NOT halt, so a stage
   * lacking trust metadata is not blocked out of the box. Block is opt-in.
   */
  readonly mode?: PolicyMode;
}

/** Identifies the gate boundary being enforced. */
export interface GateEnforceTarget {
  readonly gateId: string;
  readonly taskId: string;
  /** Type of the stage the gate guards (its `beforeStage`). */
  readonly stageType: string;
}

/**
 * Resolves the enforcement mode for a gate node. WARN by default (#3177
 * condition 1) — NOT `block`, even though the V2 umbrella `getPolicyMode()`
 * defaults to `block` in full mode. Block is opt-in via `NEXUS_POLICY_GATE_MODE`
 * (or an explicit per-gate `mode`). This keeps legitimate stages from halting
 * on missing trust metadata out of the box.
 */
export function getGateEnforcementMode(): PolicyMode {
  const env = process.env['NEXUS_POLICY_GATE_MODE'];
  if (env === 'off' || env === 'warn' || env === 'block') return env;
  return 'warn';
}

/**
 * Evaluates policy at a gate boundary and enforces the verdict (#3177).
 *
 * - OFF mode: skips evaluation entirely (no `listRules` call).
 * - WARN mode (default): evaluates, emits/logs violations, but does NOT throw.
 * - BLOCK mode + `!allowed`: throws {@link PolicyBlockedError}.
 *
 * `escalate` is treated as `block` (fail-closed) — there is no grounded
 * gate-boundary HITL approval path that feeds a verdict back into policy
 * re-evaluation today (#3177 condition 4 follow-up).
 */
export function enforceGatePolicy(
  enforcement: GatePolicyEnforcement,
  target: GateEnforceTarget
): PolicyEvalResult {
  const mode = enforcement.mode ?? getGateEnforcementMode();

  const result = evaluatePipelinePolicy(
    {
      engine: enforcement.engine,
      mode,
      ...(enforcement.eventBus !== undefined ? { eventBus: enforcement.eventBus } : {}),
      ...(enforcement.auditTrail !== undefined ? { auditTrail: enforcement.auditTrail } : {}),
    },
    {
      taskId: target.taskId,
      stageId: target.gateId,
      stageType: target.stageType,
      pipelineState: enforcement.pipelineState,
    }
  );

  // Only throw when the mode resolves to `block` AND the verdict denies
  // (#3177 condition 2). In `warn`/`off` modes execution continues.
  if (mode === 'block' && !result.allowed) {
    throw new PolicyBlockedError(target.gateId, result.violations);
  }
  return result;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Reads policy mode from V2 config (umbrella + individual override).
 * Default: `block` in full mode, `warn` in partial, `off` when V2 is off.
 */
export function getPolicyMode(): PolicyMode {
  return resolveV2Config().policyMode;
}

/**
 * Evaluates all registered policy rules for a stage boundary.
 *
 * In WARN mode, violations are logged and emitted but execution continues.
 * In BLOCK mode, violations halt the pipeline.
 * In OFF mode, evaluation is skipped entirely.
 */
export function evaluatePipelinePolicy(
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
    let decision: PolicyDecision;
    try {
      decision = rule.evaluate(context);
    } catch (err: unknown) {
      // Fail closed: a rule that throws is counted as a violation. This stops
      // a buggy or hostile rule from crashing the entire pipeline (CWE-248).
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Policy rule threw during evaluation', error, {
        ruleId: rule.id,
        stageId: context.stageId,
      });
      const message = error.message;
      violations.push({
        ruleId: rule.id,
        reason: `Rule threw during evaluation: ${message}`,
      });
      continue;
    }
    if (!decision.allow) {
      violations.push({
        ruleId: rule.id,
        reason: decision.reason,
        ...(decision.escalateTo !== undefined ? { escalateTo: decision.escalateTo } : {}),
      });
    }
  }

  if (violations.length > 0) {
    // Dual-emit (#3710): the in-memory bus emit is KEPT untouched (back-compat,
    // TraceWriter-consumed). When a durable trail is wired, ALSO append one
    // hash-chained record per violation carrying mode/ruleIds/stageType — the
    // canonical source for tune/readiness aggregation that survives process exit.
    emitPolicyEvents(options.eventBus, context, violations);
    emitDurablePolicyEvents(options.auditTrail, context, violations, mode);
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

/**
 * Appends ONE durable `policy_gate` record per violation (#3710 condition 3 —
 * count parity with the bus emit above). Each record carries `mode` (warn/block,
 * the soak-vs-enforce signal), `ruleIds`, and `stageType` so the persisted event
 * round-trips the data the tune/readiness loop needs (#3710 condition 1). No-op
 * when no trail is wired — the no-sink path stays byte-identical (condition 4).
 *
 * `allowed` reflects the run-level verdict the violation produced: in `warn`
 * execution continues (allowed=true), in `block` the gate denies (allowed=false).
 */
function emitDurablePolicyEvents(
  auditTrail: AuditTrail | undefined,
  context: PolicyContext,
  violations: readonly PolicyViolation[],
  mode: PolicyMode
): void {
  if (auditTrail === undefined) return;
  const allowed = mode === 'warn';
  for (const v of violations) {
    emitPipelinePolicyEvent(auditTrail, {
      allowed,
      requiresApproval: false,
      // Pipeline policy is provenance/stage-driven, not user-driven; the snapshot
      // tier (if any) lives in PolicyContext but no single tier identifies the
      // gate decision, so the durable record uses the fail-closed default.
      inputTrustTier: '4',
      violationRules: [v.ruleId],
      mode,
      ruleIds: [v.ruleId],
      stageType: context.stageType,
    });
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
