/**
 * V2 Delegate Pipeline — creates a V2 pipeline for delegate_to_model (Issue #914, Phase 6-1)
 *
 * Converts a TaskContract into a single-stage routing pipeline that can
 * be executed by the PipelineRunner. This is the V2 equivalent of the
 * current delegate_to_model handler's inline logic.
 *
 * @module pipeline/v2-delegate
 */
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
