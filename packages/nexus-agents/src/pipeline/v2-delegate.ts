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

import { PipelineRunner } from './pipeline-runner.js';
import { getPipelineEventBus } from './event-bus.js';
import { createDefaultPolicyEngine } from './policy-engine.js';
import { evaluatePolicy, getPolicyMode } from './policy-evaluator.js';
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
 * The pipeline has a single 'route' stage that selects the optimal model.
 * This is intentionally minimal — the routing logic lives in the stage
 * handler (placeholder here, real handler injected by the MCP tool).
 */
export function createDelegatePipeline(task: TaskContract): DelegatePipelineResult {
  const plan = buildPlan(task);
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

/**
 * Converts delegate_to_model input into a V2 TaskContract.
 * Input fields are preserved in metadata for downstream pipeline stages.
 */
export function delegateInputToTaskContract(input: DelegateInputLike): TaskContract {
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
    pipelineState: task.metadata,
  };

  const result = evaluatePolicy({ engine, mode }, context);
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
// Internal
// ============================================================================

function buildPlan(task: TaskContract): PlanContract {
  return {
    taskId: task.id,
    stages: [
      {
        id: 'route-model',
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
    timeoutMs: 30_000,
  };
}
