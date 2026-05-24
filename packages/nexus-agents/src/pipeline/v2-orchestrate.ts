/**
 * V2 Orchestrate Pipeline — Instrumentation adapter (Issue #924, Phase E)
 *
 * Converts orchestrate tool input into a TaskContract with a multi-stage
 * PlanContract (analyze → route → execute → validate), then executes
 * through PipelineRunner with policy evaluation at each stage boundary.
 *
 * Phase 1 (#927): Wires PolicyEvaluator into pipeline execution so
 * block mode halts execution on policy violations.
 *
 * Runs fire-and-forget alongside V1 orchestration when
 * NEXUS_V2_ORCHESTRATE=true.
 *
 * @module pipeline/v2-orchestrate
 */
import { createDelegatePipeline, checkPipelinePolicy } from './v2-delegate.js';
import { PipelineRunner } from './pipeline-runner.js';
import { getPipelineEventBus } from './event-bus.js';
import { buildBaseTaskContract } from './task-contract-builders.js';

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

/** Optional contract-construction options (#2957). */
export interface OrchestrateContractOpts {
  /** Caller trust tier from RequestContext (`'1'..'4'`). */
  readonly trustTier?: string;
}

/** Converts orchestrate input to a TaskContract. */
export function orchestrateInputToTaskContract(
  input: OrchestrateInputLike,
  opts: OrchestrateContractOpts = {}
): TaskContract {
  const metadata: Record<string, unknown> = { source: 'orchestrate' };
  if (input.context !== undefined) metadata['context'] = input.context;
  if (input.maxIterations !== undefined) metadata['maxIterations'] = input.maxIterations;
  // Closes #2957: producer-side wiring of caller trust tier so the V2
  // policy-engine's `trust-tier` rule has the input it needs. Callers
  // thread `ctx.requestContext.trustTier` here; when omitted the
  // policy-engine defaults to `'4'` (untrusted) so the gate fails closed.
  if (opts.trustTier !== undefined) metadata['trustTier'] = opts.trustTier;
  return buildBaseTaskContract({
    idPrefix: 'orchestrate',
    task: input.task,
    analysis: { complexity: 'high', taskType: 'orchestration', ambiguityScore: 0.3 },
    metadata,
  });
}

// ============================================================================
// Execution
// ============================================================================

/** Executes the V2 orchestrate pipeline and returns metrics. */
export async function executeOrchestratePipeline(task: TaskContract): Promise<PipelineMetrics> {
  const policyResult = checkPipelinePolicy(task, 'execute');
  if (!policyResult.allowed) {
    const violations = policyResult.violations.map((v) => `${v.ruleId}: ${v.reason}`);
    return {
      compiled: false,
      executed: false,
      stepsExecuted: 0,
      durationMs: 0,
      policyBlocked: true,
      policyViolations: violations,
    };
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
