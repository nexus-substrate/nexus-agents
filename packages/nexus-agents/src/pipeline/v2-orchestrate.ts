/**
 * V2 Orchestrate Pipeline — Instrumentation adapter (Issue #924, Phase E)
 *
 * Converts orchestrate tool input into a TaskContract with a multi-stage
 * PlanContract (analyze → route → execute → validate), then executes
 * through PipelineRunner with policy evaluation at each stage boundary.
 *
 * Runs fire-and-forget alongside V1 orchestration when
 * NEXUS_V2_ORCHESTRATE=true.
 *
 * @module pipeline/v2-orchestrate
 */
import { randomUUID } from 'node:crypto';

import { createDelegatePipeline } from './v2-delegate.js';
import { PipelineRunner } from './pipeline-runner.js';

import type { TaskContract } from './task-contract.js';
import type { PipelineMetrics } from './v2-delegate.js';

// ============================================================================
// Types
// ============================================================================

/** Minimal shape of orchestrate input (avoids circular import). */
export interface OrchestrateInputLike {
  readonly task: string;
  readonly context?: Record<string, unknown>;
  readonly maxIterations?: number;
}

// ============================================================================
// Conversion
// ============================================================================

/** Converts orchestrate input to a TaskContract. */
export function orchestrateInputToTaskContract(input: OrchestrateInputLike): TaskContract {
  const now = Date.now();
  const metadata: Record<string, unknown> = { source: 'orchestrate' };
  if (input.context !== undefined) metadata['context'] = input.context;
  if (input.maxIterations !== undefined) metadata['maxIterations'] = input.maxIterations;

  return {
    id: `orchestrate-${randomUUID().slice(0, 8)}`,
    description: input.task,
    status: 'approved',
    analysis: { complexity: 'high', taskType: 'orchestration', ambiguityScore: 0.3 },
    constraints: { scope: [] },
    requiredCapabilities: { tools: [], experts: [] },
    capabilityGaps: { available: { tools: [], experts: [] }, gaps: [], allSatisfied: true },
    artifacts: [],
    metadata,
    createdAt: now,
    updatedAt: now,
  };
}

// ============================================================================
// Execution
// ============================================================================

/** Executes the V2 orchestrate pipeline and returns metrics. */
export async function executeOrchestratePipeline(task: TaskContract): Promise<PipelineMetrics> {
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
