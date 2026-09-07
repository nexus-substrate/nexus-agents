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
  // #4657: this 'execute' does NOT correspond to an execute-typed stage. The
  // plan compiled below has one stage, `route-model`, declared `type: 'route'`
  // and backed by a no-op skeleton plugin — nothing in it executes.
  //
  // It is kept anyway, deliberately. Passing the real stage type ('route')
  // would make `trustTierRule` allow, which REMOVES a fail-closed refusal on
  // untrusted input in exchange for nothing: the only thing the current
  // refusal suppresses is fire-and-forget instrumentation. Weakening a
  // fail-closed path to make a label accurate is the wrong trade, and a test
  // pins this refusal as intended behaviour.
  //
  // What must not be inferred from it: a denial here is NOT evidence that an
  // execution was blocked, and an allow here is NOT evidence that an execution
  // was authorised. Real trust-tier enforcement over an actual invocation is
  // `dev-pipeline.ts` (`enforceConsensusExecutePolicy`).
  const policyResult = checkPipelinePolicy(task, 'execute');
  // #5862: `allowed` is `true` on every path the evaluator returns — `off`
  // short-circuits and `warn` is `mode === 'warn' || violations.length === 0`
  // — so under `warn` this branch is unreachable and `policyResult.violations`
  // was dropped on the floor. A run whose trust-tier rule denied logged
  // identically to one where policy found nothing, and `PipelineMetrics` is
  // the whole observable output of this path. Carry the violations either way;
  // only `policyBlocked` turns on whether execution actually stopped.
  const policyViolations = policyResult.violations.map((v) => `${v.ruleId}: ${v.reason}`);
  const policyRecord =
    policyViolations.length > 0 ? { policyViolations, policyMode: policyResult.mode } : {};

  if (!policyResult.allowed) {
    return {
      compiled: false,
      executed: false,
      stepsExecuted: 0,
      durationMs: 0,
      policyBlocked: true,
      ...policyRecord,
    };
  }

  const compiled = createDelegatePipeline(task);
  if (!compiled.ok) {
    return { compiled: false, executed: false, stepsExecuted: 0, durationMs: 0, ...policyRecord };
  }
  const runner = new PipelineRunner();
  const startMs = Date.now();
  const result = await runner.execute(compiled.value, task, {
    eventBus: getPipelineEventBus(),
  });
  const durationMs = Date.now() - startMs;
  if (!result.ok) {
    return { compiled: true, executed: false, stepsExecuted: 0, durationMs, ...policyRecord };
  }
  return {
    compiled: true,
    executed: result.value.success,
    stepsExecuted: result.value.stepsExecuted,
    durationMs,
    ...policyRecord,
  };
}
