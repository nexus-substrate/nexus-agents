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
 * #4657: the plan declares NO policy gate. The entry gate #3703 added could
 * never deny (`trustTierRule` denies only execute-typed stages; the only stage
 * is route-typed), and this graph runs fire-and-forget beside the real
 * delegation (`mcp/tools/delegate-to-model.ts`), so a gate that did fire would
 * record a denial the delegation never honoured. Trust-tier enforcement that
 * can refuse lives at `v2-orchestrate.ts` (`checkPipelinePolicy(task,
 * 'execute')`) and `dev-pipeline.ts` (`enforceConsensusExecutePolicy`).
 *
 * @module pipeline/v2-delegate
 */
import { createLogger } from '../core/index.js';
import { API_TIMEOUTS } from '../config/timeouts.js';

import { PipelineRunner } from './pipeline-runner.js';
import { getPipelineEventBus } from './event-bus.js';
import { createDefaultPolicyEngine, type PipelineStateSnapshot } from './policy-engine.js';
import { evaluatePipelinePolicy, getPolicyMode } from './policy-evaluator.js';

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
import type { TaskContract, PlanContract } from './task-contract.js';
import type { PolicyContext } from './policy-engine.js';
import type { PolicyEvalResult, PolicyViolation } from './policy-evaluator.js';

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
 * The pipeline has a single 'route' stage and no policy gate (#4657), so the
 * compile call passes no `policyEnforcement` bundle: with zero gates there is
 * no node that would consult one, and supplying it read as "policy enforced
 * at the stage boundary" when nothing was. Routing logic lives in the stage
 * handler (placeholder here, real handler injected by the MCP tool).
 */
export function createDelegatePipeline(task: TaskContract): DelegatePipelineResult {
  const plan = buildDelegatePlan(task);
  const runner = new PipelineRunner();
  return runner.compile(plan);
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
  // #2957: producer-side wiring of caller trust tier into the policy snapshot;
  // a missing trustTier defaults to '4' (untrusted) in policy-engine.ts. On
  // the delegate path itself nothing can deny on it (#4657): the pre-execution
  // check below evaluates a 'route' stage, which `trustTierRule` allows at
  // every tier. It is kept so the snapshot is populated wherever this contract
  // is evaluated against an execute stage.
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
 * Returns metrics for observability — never throws.
 *
 * The pre-execution policy check evaluates stage type 'route' — the real type
 * of the only stage — which `trustTierRule` allows at every tier, so under the
 * current rule set this path never reports `policyBlocked` (#4657). The
 * execute-stage seams that can refuse are `v2-orchestrate.ts` and
 * `dev-pipeline.ts`; this graph is fire-and-forget instrumentation beside the
 * real delegation and must not claim a refusal it cannot perform.
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
 * Uses the default PolicyEngine, whose `BUILT_IN_RULES` is the single
 * `trustTierRule`. The four siblings that once sat beside it were removed as
 * unwired (`policy-engine.ts`), so no cost, security or high-risk gate runs
 * on this path.
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

/** Id of the single route stage. */
const ROUTE_STAGE_ID = 'route-model';

/**
 * Builds the v2-delegate PlanContract: a single route stage and no policy gate.
 * Exported so the compile path and tests share one canonical plan shape.
 *
 * Why no gate (#4657): the `trust-tier` entry gate that #3703 declared here
 * guarded a route-typed stage, and `trustTierRule` denies only execute-typed
 * stages, so it could not fire in any mode at any tier. Widening the rule was
 * rejected by the panel because this graph is fire-and-forget instrumentation
 * (`instrumentV2Pipeline`) whose verdict nothing reads: a gate that fired would
 * write a denial record while the delegation proceeded. Declaring the stage
 * `execute` would be a lie too — `nexus:model-router` is a no-op skeleton
 * (`core-plugins.ts`). A gate belongs here only once the graph's verdict gates
 * the actual delegation before spend.
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
    policyGates: [],
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
