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
 * @module pipeline/v2-delegate
 */
import { randomUUID } from 'node:crypto';

import { PipelineRunner } from './pipeline-runner.js';

import type { CompiledPipeline } from './pipeline-runner.js';
import type { TaskContract, PlanContract } from './task-contract.js';

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
  readonly estimate_tokens?: boolean | undefined;
}

/** Metrics from V2 pipeline execution. */
export interface PipelineMetrics {
  readonly compiled: boolean;
  readonly executed: boolean;
  readonly stepsExecuted: number;
  readonly durationMs: number;
}

/**
 * Converts delegate_to_model input into a V2 TaskContract.
 * Input fields are preserved in metadata for downstream pipeline stages.
 */
export function delegateInputToTaskContract(input: DelegateInputLike): TaskContract {
  const now = Date.now();
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
  if (input.estimate_tokens === true) {
    metadata['estimateTokens'] = true;
  }
  return {
    id: `delegate-${randomUUID().slice(0, 8)}`,
    description: input.task,
    status: 'approved',
    analysis: {
      complexity: 'moderate',
      taskType: 'routing',
      ambiguityScore: 0.1,
    },
    constraints: { scope: [] },
    requiredCapabilities: { tools: [], experts: [] },
    capabilityGaps: {
      available: { tools: [], experts: [] },
      gaps: [],
      allSatisfied: true,
    },
    artifacts: [],
    metadata,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Compiles and executes a V2 pipeline for the given TaskContract.
 * Returns metrics for observability — never throws.
 */
export async function executeDelegatePipeline(task: TaskContract): Promise<PipelineMetrics> {
  const compiled = createDelegatePipeline(task);
  if (!compiled.ok) {
    return { compiled: false, executed: false, stepsExecuted: 0, durationMs: 0 };
  }
  const runner = new PipelineRunner();
  const startMs = Date.now();
  const result = await runner.execute(compiled.value, task);
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
// Internal
// ============================================================================

function buildPlan(task: TaskContract): PlanContract {
  return {
    taskId: task.id,
    stages: [
      {
        id: 'route-model',
        type: 'route',
        pluginId: 'delegate-router',
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
