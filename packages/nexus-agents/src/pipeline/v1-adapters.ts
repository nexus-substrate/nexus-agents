/**
 * V1↔V2 Adapter Functions (Issue #909, E1-3)
 *
 * Converts between V1 types (TaskAnalysisResult, RoutingDecision)
 * and V2 types (TaskContract, PlanContract) for gradual migration.
 *
 * @module pipeline/v1-adapters
 */
import { randomUUID } from 'node:crypto';

import type { TaskAnalysisResult } from '../core/task-analysis/shared-task-analyzer.js';
import type { TaskContract, ArtifactRef } from './task-contract.js';

// ============================================================================
// V1 → V2 Converters
// ============================================================================

/**
 * Converts a V1 TaskAnalysisResult into a V2 TaskContract.
 *
 * Creates a new TaskContract in 'intake' status with the analysis
 * results embedded. The contract is ready for planning.
 */
export function analysisToTaskContract(
  description: string,
  analysis: TaskAnalysisResult
): TaskContract {
  const now = Date.now();

  return {
    id: `task-${randomUUID().slice(0, 8)}`,
    description,
    status: 'intake',
    analysis: {
      complexity: analysis.complexity,
      taskType: analysis.taskType,
      ambiguityScore: analysis.ambiguityScore,
    },
    constraints: {
      time: analysis.constraints.time,
      quality: analysis.constraints.quality,
      scope: [...analysis.constraints.scope],
    },
    requiredCapabilities: {
      tools: [...analysis.requiredCapabilities.tools],
      experts: [...analysis.requiredCapabilities.experts],
    },
    capabilityGaps: {
      available: { tools: [], experts: [] },
      gaps: [],
      allSatisfied: true,
    },
    artifacts: [],
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

// ============================================================================
// V2 → Tool Response
// ============================================================================

/** MCP tool response derived from a completed TaskContract. */
export interface TaskToolResponse {
  readonly taskId: string;
  readonly status: string;
  readonly description: string;
  readonly artifacts: readonly ArtifactRef[];
  readonly durationMs: number;
  readonly error?: string;
}

/**
 * Converts a V2 TaskContract into an MCP tool response object.
 */
export function taskContractToToolResponse(contract: TaskContract): TaskToolResponse {
  const durationMs =
    contract.completedAt !== undefined
      ? contract.completedAt - contract.createdAt
      : Date.now() - contract.createdAt;

  const response: TaskToolResponse = {
    taskId: contract.id,
    status: contract.status,
    description: contract.description,
    artifacts: contract.artifacts,
    durationMs,
  };

  if (contract.error !== undefined) {
    return { ...response, error: contract.error };
  }
  return response;
}
