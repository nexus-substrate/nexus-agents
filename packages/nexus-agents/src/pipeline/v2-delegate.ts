/**
 * V2 Delegate Pipeline — creates a V2 pipeline for delegate_to_model (Issue #914, Phase 6-1)
 *
 * Converts a TaskContract into a single-stage routing pipeline that can
 * be executed by the PipelineRunner. This is the V2 equivalent of the
 * current delegate_to_model handler's inline logic.
 *
 * Phase A (Issue #920): Adds DelegateInput→TaskContract conversion and
 * pipeline execution metrics for config-flag-gated V2 instrumentation.
 *
 * Phase 1 (#927): Wires PolicyEvaluator into pipeline execution so
 * block mode halts execution on policy violations.
 *
 * @module pipeline/v2-delegate
 */
import { createLogger } from '../core/index.js';
import { API_TIMEOUTS } from '../config/timeouts.js';

import { PipelineRunner } from './pipeline-runner.js';
import { getPipelineEventBus } from './event-bus.js';
import { createDefaultPolicyEngine, type PipelineStateSnapshot } from './policy-engine.js';
import {
  evaluatePipelinePolicy,
  getPolicyMode,
  getGateEnforcementMode,
} from './policy-evaluator.js';
import { START } from '../orchestration/graph/graph-types.js';

/**
 * Narrows the untyped `task.metadata` bag into the policy engine's typed
 * snapshot (#2932). Adding a new field here forces the call site that
 * writes it on `TaskContract.metadata` to keep up.
 */
function toPipelineStateSnapshot(metadata: Record<string, unknown>): PipelineStateSnapshot {
  const trustTier = metadata['trustTier'];
  return typeof trustTier === 'string' ? { trustTier } : {};
}
import { buildBaseTaskContract } from './task-contract-builders.js';

import type { CompiledPipeline } from './pipeline-runner.js';
import type { TaskContract, PlanContract, PolicyGateSpec } from './task-contract.js';
import type { IPolicyEngine, PolicyContext } from './policy-engine.js';
import type {
  GatePolicyEnforcement,
  PolicyEvalResult,
  PolicyViolation,
} from './policy-evaluator.js';
import type { IEventBus } from './event-types.js';

const logger = createLogger({ component: 'V2Delegate' });

/** Result of creating a delegate pipeline. */
type DelegatePipelineResult =
  | { readonly ok: true; readonly value: CompiledPipeline }
  | { readonly ok: false; readonly error: string };

// ============================================================================
// Public API
// ============================================================================

/**
 * Creates a compiled V2 pipeline for delegate_to_model from a TaskContract.
 *
 * The pipeline has a single 'route' stage guarded by an entry policy gate.
 * Routing logic lives in the stage handler (placeholder here, real handler
 * injected by the MCP tool).
 *
 * Activation (#3703): the compile call now supplies a **default-WARN**
 * `policyEnforcement` bundle, so the entry gate evaluates real policy at the
 * stage boundary in production. WARN mode never throws and never blocks — it
 * only logs + emits `policy.evaluated` events on a violation, generating the
 * autonomy-soak evidence #3653 needs. This is scoped to v2-delegate's own
 * compile call: the shared `compilePlan` default (no enforcement) is
 * unchanged, so every other `compilePlan` caller is unaffected.
 */
export function createDelegatePipeline(task: TaskContract): DelegatePipelineResult {
  const plan = buildDelegatePlan(task);
  const runner = new PipelineRunner();
  return runner.compile(plan, { policyEnforcement: buildWarnPolicyEnforcement(task) });
}

/**
 * Builds the default-WARN policy-enforcement bundle for the v2-delegate entry
 * gate (#3703). The mode resolves via `getGateEnforcementMode()` (warn by
 * default; block/off opt-in via `NEXUS_POLICY_GATE_MODE`), so this is safe to
 * activate in production — warn never throws.
 *
 * `overrides` exists for tests (inject a denying engine / capture events); the
 * production call passes none, getting the default engine + the shared pipeline
 * event bus.
 */
export function buildWarnPolicyEnforcement(
  task: TaskContract,
  overrides: { engine?: IPolicyEngine; eventBus?: IEventBus } = {}
): GatePolicyEnforcement {
  return {
    engine: overrides.engine ?? createDefaultPolicyEngine(),
    pipelineState: toPipelineStateSnapshot(task.metadata),
    eventBus: overrides.eventBus ?? getPipelineEventBus(),
    mode: getGateEnforcementMode(),
  };
}

// ============================================================================
// DelegateInput → TaskContract Conversion (Issue #920, Phase A)
// ============================================================================

/** Minimal input shape matching DelegateInput. Avoids circular mcp/tools import. */
export interface DelegateInputLike {
  readonly task: string;
  readonly preferred_capability?: string | undefined;
  readonly model_hint?: string | undefined;
  readonly billing_mode?: string | undefined;
}

/** Metrics from V2 pipeline execution. */
export interface PipelineMetrics {
  readonly compiled: boolean;
  readonly executed: boolean;
  readonly stepsExecuted: number;
  readonly durationMs: number;
  readonly policyBlocked?: boolean;
  readonly policyViolations?: readonly string[];
}

/** Optional contract-construction options (#2957). */
export interface DelegateContractOpts {
  /** Caller trust tier from RequestContext (`'1'..'4'`). */
  readonly trustTier?: string;
}

/**
 * Converts delegate_to_model input into a V2 TaskContract.
 * Input fields are preserved in metadata for downstream pipeline stages.
 */
export function delegateInputToTaskContract(
  input: DelegateInputLike,
  opts: DelegateContractOpts = {}
): TaskContract {
  const metadata: Record<string, unknown> = { source: 'delegate_to_model' };
  if (input.preferred_capability !== undefined) {
    metadata['preferredCapability'] = input.preferred_capability;
  }
  if (input.model_hint !== undefined) {
    metadata['modelHint'] = input.model_hint;
  }
  if (input.billing_mode !== undefined) {
    metadata['billingMode'] = input.billing_mode;
  }
  // Closes #2957: producer-side wiring of caller trust tier. With this in
  // place the V2 policy-engine's `trust-tier` rule actually gates the V2
  // delegate pipeline; missing trustTier defaults to '4' (untrusted) in
  // policy-engine.ts so the gate fails closed.
  if (opts.trustTier !== undefined) metadata['trustTier'] = opts.trustTier;
  // estimate_tokens flag removed (#2723) — was never read downstream.
  return buildBaseTaskContract({
    idPrefix: 'delegate',
    task: input.task,
    analysis: { complexity: 'moderate', taskType: 'routing', ambiguityScore: 0.1 },
    metadata,
  });
}

/**
 * Compiles and executes a V2 pipeline for the given TaskContract.
 * Evaluates policy before execution — block mode halts the pipeline.
 * Returns metrics for observability — never throws.
 */
export async function executeDelegatePipeline(task: TaskContract): Promise<PipelineMetrics> {
  const policyResult = checkPipelinePolicy(task, 'route');
  if (!policyResult.allowed) {
    return policyBlockedMetrics(policyResult);
  }

  const compiled = createDelegatePipeline(task);
  if (!compiled.ok) {
    return { compiled: false, executed: false, stepsExecuted: 0, durationMs: 0 };
  }
  const runner = new PipelineRunner();
  const startMs = Date.now();
  const result = await runner.execute(compiled.value, task, {
    eventBus: getPipelineEventBus(),
  });
  const durationMs = Date.now() - startMs;
  if (!result.ok) {
    return { compiled: true, executed: false, stepsExecuted: 0, durationMs };
  }
  return {
    compiled: true,
    executed: result.value.success,
    stepsExecuted: result.value.stepsExecuted,
    durationMs,
  };
}

// ============================================================================
// Policy Enforcement (#927, Phase 1)
// ============================================================================

/**
 * Evaluates pipeline policy before execution.
 * Builds PolicyContext from TaskContract metadata and stage type.
 * Uses the default PolicyEngine with 5 built-in rules.
 */
export function checkPipelinePolicy(task: TaskContract, stageType: string): PolicyEvalResult {
  const mode = getPolicyMode();
  if (mode === 'off') {
    return { allowed: true, violations: [], mode };
  }

  const engine = createDefaultPolicyEngine();
  const context: PolicyContext = {
    taskId: task.id,
    stageId: `pre-execution-${stageType}`,
    stageType,
    // #2932: typed extraction. The untyped `task.metadata` is the producer
    // surface — we narrow to the policy snapshot here so adding a new rule
    // forces an explicit producer wire-up at this single chokepoint.
    pipelineState: toPipelineStateSnapshot(task.metadata),
  };

  const result = evaluatePipelinePolicy({ engine, mode }, context);
  if (!result.allowed) {
    logger.warn('Pipeline blocked by policy', {
      taskId: task.id,
      violations: result.violations.map((v) => v.ruleId),
    });
  }
  return result;
}

/** Creates PipelineMetrics for a policy-blocked execution. */
function policyBlockedMetrics(result: PolicyEvalResult): PipelineMetrics {
  const violations = result.violations.map(formatViolation);
  return {
    compiled: false,
    executed: false,
    stepsExecuted: 0,
    durationMs: 0,
    policyBlocked: true,
    policyViolations: violations,
  };
}

/** Formats a PolicyViolation for metrics output. */
function formatViolation(v: PolicyViolation): string {
  const base = `${v.ruleId}: ${v.reason}`;
  return v.escalateTo !== undefined ? `${base} [escalate: ${v.escalateTo}]` : base;
}

// ============================================================================
// Plan construction
// ============================================================================

/** Id of the entry stage the policy gate guards. */
const ROUTE_STAGE_ID = 'route-model';

/**
 * Entry gate for the v2-delegate pipeline (#3703). Sits on the START boundary
 * before the route stage so policy is evaluated before any routing work runs.
 * Enforcement is resolved by the runtime enforcement bundle (warn by default;
 * block opt-in via `NEXUS_POLICY_GATE_MODE`), NOT a per-gate field (#4019).
 */
const ENTRY_GATE: PolicyGateSpec = {
  id: 'gate-delegate-entry',
  afterStage: START,
  beforeStage: ROUTE_STAGE_ID,
  rules: ['trust-tier'],
};

/**
 * Builds the v2-delegate PlanContract: a single route stage guarded by the
 * entry policy gate. Exported so the activation path and tests share one
 * canonical plan shape (#3703).
 */
export function buildDelegatePlan(task: TaskContract): PlanContract {
  return {
    taskId: task.id,
    stages: [
      {
        id: ROUTE_STAGE_ID,
        type: 'route',
        pluginId: 'nexus:model-router',
        inputArtifacts: [],
        outputArtifacts: ['routing-decision'],
        dependencies: [],
        config: {
          taskType: task.analysis.taskType,
          complexity: task.analysis.complexity,
        },
      },
    ],
    policyGates: [ENTRY_GATE],
    estimatedCost: {
      totalTokensIn: 0,
      totalTokensOut: 0,
      estimatedCostUsd: 0,
      modelCalls: 1,
    },
    approvalRequired: false,
    maxIterations: 1,
    // Centralized to the existing named v2-delegate guard (#3736); same 30s value.
    timeoutMs: API_TIMEOUTS.v2DelegateMs,
  };
}
