/**
 * Default strategy executors for `run { execute: true }`, and their
 * cancellation boundaries (#6305).
 *
 * Split out of `run-tool.ts` for its line cap; one concern — which engine each
 * wired strategy runs, and how `cancel_job`'s signal reaches it.
 *
 * @module mcp/tools/run-tool-executors
 */

import type { IModelAdapter } from '../../core/index.js';
import type { TrustTier } from '../../security/trust-types.js';
import type {
  ExecutionStrategy,
  MetaOrchestratorInput,
} from '../../orchestration/meta-orchestrator.js';
import type { StrategyExecutor, StrategyExecutorMap } from '../../orchestration/meta-dispatcher.js';
import { runDevPipelineForGoal } from './dev-pipeline-tool.js';
import { runPipelineForGoal } from './pipeline-tool.js';
import { runConsensusForGoal } from './consensus-vote.js';

/**
 * Strategies wired for inline execution (increment B). Others fail closed with
 * a typed error, by design:
 * - `graph-workflow`: graph workflows are pre-defined templates (threat_model,
 *   code_analysis, …), not a goal-only call — no generic "goal → graph" entry.
 * - `spec`: `execute_spec` needs a markdown spec document, not a plain goal.
 * - `orchestrate`: needs an OrchestratorFactory + heavy deps the tool layer
 *   doesn't carry; use the `orchestrate` tool directly.
 * - `single-shot`: `delegate_to_model` recommends a model, it doesn't execute.
 *
 * Cancellation (#6305): those four have no cancellation surface because they
 * have no executor — dispatch refuses them before any work starts. Every wired
 * executor below hands the signal to an engine that reads it, and is wrapped
 * by {@link cancellableExecutor}.
 */
/**
 * Build the default inline executors, threading the caller's content-provenance
 * `trustTier` into the dev-pipeline executor (#3712). This closes the run-path
 * hole: `run` carries a real `RequestContext` AND runs a real research stage on
 * a possibly-untrusted goal, so the dev-pipeline's consensus→execute seam MUST
 * see the CALLER's real tier — never a hardcoded trusted '1'. `undefined` (no
 * tier threaded) leaves the seam to fail-close to untrusted (tier 4). Only the
 * dev-pipeline executor consumes the tier; the others don't reach that seam.
 */
export function buildDefaultExecutors(
  trustTier?: string,
  gatewayAdapters?: readonly IModelAdapter[],
  /**
   * Options only the dev-pipeline executor reads: `dryRun` (#4806), and the
   * caller's declared provenance of the goal text (#6795) — the dev pipeline
   * is the one strategy whose gate consumes a content tier. An omitted
   * `sourceTrustTier` means '3' there.
   */
  devPipeline?: {
    readonly dryRun?: boolean | undefined;
    readonly sourceTrustTier?: TrustTier | undefined;
  },
  /**
   * Async-job heartbeat (#6162), threaded only to the consensus executor: the
   * pipeline executors heartbeat through the stage events they emit on the
   * pipeline bus, a vote body through each settled seat.
   */
  onProgress?: () => void,
  /**
   * `cancel_job`'s signal on the async path (#6305). Each executor hands it to
   * its engine: the dev pipeline checks it before every stage, the adaptive
   * pipeline before every super-step, the vote before launching each voter.
   */
  signal?: AbortSignal
): StrategyExecutorMap {
  const gated = (strategy: ExecutionStrategy, executor: StrategyExecutor): StrategyExecutor =>
    cancellableExecutor(strategy, executor, signal);
  return {
    'dev-pipeline': gated('dev-pipeline', (_decision, metaInput: MetaOrchestratorInput) =>
      runDevPipelineForGoal(
        metaInput.goal,
        trustTier,
        devPipeline?.dryRun,
        signal,
        devPipeline?.sourceTrustTier
      )
    ),
    pipeline: gated('pipeline', (_decision, metaInput: MetaOrchestratorInput) =>
      runPipelineForGoal(metaInput.goal, undefined, signal)
    ),
    // #3988: `research` deliberately ALIASES the `pipeline` engine — it runs the
    // SAME generic stage registry (selectStageRegistry only branches greenfield/
    // audit), shaped by the goal text, NOT a distinct research stage registry.
    // The registry's research `entrypointTool` already points at run_pipeline, so
    // this is intended aliasing, not a distinct executor. A real research-shaped
    // registry is a feature with no current consumer (YAGNI) — add it only when a
    // named loop needs research-specific stages; until then research==pipeline.
    research: gated('research', (_decision, metaInput: MetaOrchestratorInput) =>
      runPipelineForGoal(metaInput.goal, undefined, signal)
    ),
    consensus: gated('consensus', (_decision, metaInput: MetaOrchestratorInput) =>
      runConsensusForGoal(metaInput.goal, undefined, gatewayAdapters, onProgress, signal)
    ),
  };
}

/** Raised once `cancel_job`'s signal has fired at a `run` dispatch boundary (#6305). */
class RunCancelledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RunCancelledError';
  }
}

/**
 * Read through a call, never inline: TypeScript narrows `signal.aborted` to
 * `false` after one check, which is unsound across an `await`.
 */
function throwIfRunCancelled(signal: AbortSignal | undefined, message: string): void {
  if (signal?.aborted === true) throw new RunCancelledError(message);
}

/**
 * The pre-dispatch boundary (#6305): once the signal has fired, no executor
 * runs, so the dispatcher records no outcome for work that never started.
 */
export function assertDispatchNotCancelled(
  signal: AbortSignal | undefined,
  strategy: ExecutionStrategy
): void {
  throwIfRunCancelled(signal, `run cancelled before dispatching the ${strategy} strategy`);
}

/**
 * Re-check the signal once the engine returns (#6305). An engine stopped by a
 * cancel does not always say so: the graph executor reports a generic
 * failure, and a vote returns a verdict over the seats it launched before the
 * cancel. Either would reach the caller as a failure of the wrong kind or as
 * a partial success, so the cancel wins over whatever the engine returned.
 */
function cancellableExecutor(
  strategy: ExecutionStrategy,
  executor: StrategyExecutor,
  signal: AbortSignal | undefined
): StrategyExecutor {
  if (signal === undefined) return executor;
  return async (decision, metaInput) => {
    const result = await executor(decision, metaInput);
    throwIfRunCancelled(signal, `run cancelled during the ${strategy} strategy`);
    return result;
  };
}
