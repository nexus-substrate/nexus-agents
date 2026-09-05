/**
 * nexus-agents/mcp - `run` tool (unified adaptive entry point)
 *
 * THE default way to ask nexus-agents to do work: give a goal, and the
 * MetaOrchestrator (epic #3548) selects the right strategy among the existing
 * specialized pipelines and tells you which to run — routing handled
 * automatically. The other pipeline tools (`run_dev_pipeline`, `run_pipeline`,
 * `run_graph_workflow`, `orchestrate`, …) remain available as advanced
 * "force-this-strategy" paths.
 *
 * Default (execute:false) is read-only: returns the routing decision plus the
 * concrete strategy tool to invoke. With `execute:true` it dispatches the
 * selected strategy through the MetaDispatcher to a real engine executor and
 * returns the result (increment B; wired so far: dev-pipeline, pipeline,
 * research, consensus — others fail closed with a typed error). Executors live
 * here at the MCP-tool layer and are injected into the dispatcher so the
 * orchestration core stays cycle-free.
 *
 * @module mcp/tools/run-tool
 * (Source: epic #3548 — unified adaptive MetaOrchestrator entry point)
 */

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IModelAdapter } from '../../core/index.js';

import { createLogger, formatZodError, getErrorMessage, type ILogger } from '../../core/index.js';
import { assertDryRunSupported, classifyDispatchError } from './run-tool-dry-run.js';
import { describeIncompletePipeline } from './run-tool-incomplete.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import {
  toolStructuredError,
  toolSuccess,
  type BaseMcpToolDeps,
  type ToolResult,
} from './tool-result.js';
import { getMcpAnnotations } from './tool-annotations.js';
import {
  createMetaOrchestrator,
  type ExecutionStrategy,
  type MetaDecision,
  type MetaOrchestratorInput,
} from '../../orchestration/meta-orchestrator.js';
import {
  getShadowSelector,
  getShadowSink,
  persistMetaOutcome,
} from '../../orchestration/meta-shadow-selector.js';
import { evaluateMetaStrategy } from '../../orchestration/meta-strategy-eval.js';
import { META_STRATEGY_CORPUS } from '../../orchestration/meta-strategy-corpus.js';
import { evaluateMetaStrategyReadiness } from '../../orchestration/meta-strategy-readiness.js';
import { isPersistenceEnabled } from '../../config/learning-persistence.js';
import {
  createMetaDispatcher,
  type StrategyExecutorMap,
  type MetaOutcomeSink,
  type MetaOutcomeObserver,
} from '../../orchestration/meta-dispatcher.js';
import { entrypointToolFor } from '../../orchestration/strategy-manifest-registry.js';
import {
  dispatchActionClass,
  type DispatchMode,
} from '../../orchestration/authority-tier-guard.js';
import { runDevPipelineForGoal } from './dev-pipeline-tool.js';
import { runPipelineForGoal } from './pipeline-tool.js';
import { runConsensusForGoal } from './consensus-vote.js';
// #3732 / epic #2631: async-mode dispatch via the shared `runAsJob` helper.
import { runAsJob } from '../jobs/run-as-job.js';

/** Input schema for the `run` tool. */
export const RunInputSchema = z.object({
  goal: z
    .string()
    .min(1)
    .describe('Natural-language goal. nexus-agents selects how to execute it.'),
  forceStrategy: z
    .enum([
      'single-shot',
      'dev-pipeline',
      'pipeline',
      'graph-workflow',
      'orchestrate',
      'consensus',
      'spec',
      'research',
    ])
    .optional()
    .describe(
      'Power-user override: force a specific strategy instead of letting the router choose.'
    ),
  requiresConsensus: z
    .boolean()
    .optional()
    .describe('Hint: the task needs a multi-perspective consensus decision.'),
  dependencyStructure: z
    .enum(['linear', 'dag', 'independent', 'unknown'])
    .optional()
    .describe('Hint: the dependency structure of the work.'),
  isNovel: z.boolean().optional().describe('Hint: this kind of task has not been seen before.'),
  execute: z
    .boolean()
    .optional()
    .describe(
      'When true, actually run the selected strategy (if an executor is wired) and return ' +
        'its result; otherwise return the routing decision only (default false, read-only).'
    ),
  /**
   * Plan and vote without implementing (#4806).
   *
   * `run` is the documented default entry point, but until now it could not
   * express the cautious caller's first request — "show me the plan, don't
   * build it". `execute: false` is not a substitute: that returns the SELECTED
   * STRATEGY, having done no planning and no voting.
   *
   * Only the dev-pipeline strategy can honour it. When the router selects any
   * other, the call is REFUSED rather than executed: silently ignoring a
   * do-not-act flag is the one outcome a governance substrate cannot allow.
   */
  dryRun: z
    .boolean()
    .optional()
    .describe(
      'Plan and vote only, no implementation (#4806). Requires the dev-pipeline strategy — ' +
        'refused (never silently executed) when the router selects another.'
    ),
  /**
   * Dispatch mode (#3732). Only meaningful with `execute: true` — `run`
   * dispatches the heaviest engines (dev-pipeline/pipeline), which can exceed
   * the MCP request timeout even with the 1800s class guard (#3734). `sync`
   * (default) runs inline; `async` returns a `{ status: 'pending', jobId }`
   * envelope immediately and runs in the background; poll
   * `get_job_result({ jobId })`. Ignored for read-only routing (execute:false).
   */
  dispatch: z
    .enum(['sync', 'async'])
    .optional()
    .describe(
      "Dispatch mode (#3732). 'sync' (default): run inline. 'async' (only with execute:true): return a jobId immediately + run in background (poll get_job_result)."
    ),
});

export type RunInput = z.infer<typeof RunInputSchema>;

/** The dispatch plan returned to the caller. */
export interface RunResponse {
  readonly strategy: ExecutionStrategy;
  readonly reasoning: string;
  readonly confidence: number;
  readonly alternatives: readonly ExecutionStrategy[];
  readonly needsShaping: boolean;
  readonly shapingQuestions?: readonly string[];
  /** The strategy tool the caller can invoke to execute this selection. */
  readonly recommendedTool: string;
  /** Decision id — correlates to the selection record / future outcome. */
  readonly decisionId: string;
  readonly note: string;
}

// #4655: the previous wording told callers to "wait for inline execution
// (run execute: true) in a later release". It shipped — `execute: true`
// dispatches the real engine (see runWithExecution below). This NOTE is
// returned on the ROUTE path, so it describes that path and points at the
// executing one rather than describing it as unavailable.
const NOTE =
  'Routing decision only (read-only). Invoke the recommendedTool to execute, or ' +
  're-run with execute: true for inline execution. The other pipeline tools ' +
  'remain available as advanced force-strategy paths.';

/**
 * Maps validated input to the MetaOrchestrator input shape.
 *
 * Threads `requiredAuthority` derived from the DISPATCH MODE (#3920, ADR-0017) —
 * this is the production writer that was missing, which left the authority-ladder
 * router refusal as dead code. The router (meta-orchestrator `select`) refuses
 * fail-closed when the selected/forced strategy would act ABOVE its declared
 * tier; `dispatchActionClass` floors both modes at `suggest` so every live
 * strategy passes and the guard fires only on a genuine above-tier action (an
 * `observe`/undeclared strategy reaching dispatch). See {@link dispatchActionClass}.
 */
function toMetaInput(
  input: RunInput,
  mode: DispatchMode
): Parameters<ReturnType<typeof createMetaOrchestrator>['select']>[0] {
  const signals: Record<string, unknown> = {};
  if (input.requiresConsensus !== undefined) signals.requiresConsensus = input.requiresConsensus;
  if (input.dependencyStructure !== undefined)
    signals.dependencyStructure = input.dependencyStructure;
  if (input.isNovel !== undefined) signals.isNovel = input.isNovel;
  return {
    goal: input.goal,
    requiredAuthority: dispatchActionClass(mode),
    // #4655: an executing dispatch must also clear the envelope precondition.
    requiresExecuteEnvelope: mode === 'execute',
    ...(Object.keys(signals).length > 0 ? { signals } : {}),
    ...(input.forceStrategy !== undefined ? { forceStrategy: input.forceStrategy } : {}),
  };
}

/**
 * Whether the learned-selector readiness signal has already been logged this
 * process. The verdict is a deterministic function of the STATIC labeled corpus, so
 * it never changes within a run — compute + log it exactly once at first shadow-enable
 * (not per decision), matching the shadow selector's own one-time hydrate log.
 */
let readinessLogged = false;

/**
 * Compute the learned-selector promotion readiness verdict once and SURFACE it for
 * operators (#4094). AUDIT-MODE ONLY — this is a non-routing observer of the offline
 * eval: it logs whether the learned arm has crossed the promotion bar so the #3552
 * shadow→route flip has a falsifiable signal to gate on. It NEVER touches the routed
 * decision. Best-effort: an eval failure is swallowed so selection never breaks.
 */
function logMetaStrategyReadinessOnce(logger: ILogger): void {
  if (readinessLogged) return;
  readinessLogged = true;
  try {
    const evalResult = evaluateMetaStrategy(META_STRATEGY_CORPUS);
    const verdict = evaluateMetaStrategyReadiness(evalResult);
    logger.info('meta-strategy learned-selector readiness', {
      ready: verdict.ready,
      delta: evalResult.delta,
      learnedAccuracy: evalResult.learnedAccuracy,
      rulesAccuracy: evalResult.rulesAccuracy,
      testCount: evalResult.testCount,
      blockers: verdict.blockers,
    });
  } catch (err) {
    logger.warn('meta-strategy readiness signal failed (non-fatal)', {
      error: getErrorMessage(err),
    });
  }
}

/**
 * Selects a strategy for a goal via the MetaOrchestrator. `mode` is the dispatch
 * mode the selection feeds (#3920): it sets the `requiredAuthority` the
 * authority-ladder router enforces, so `select` can refuse an above-tier action
 * fail-closed at the router rather than after the fact.
 */
function selectDecision(input: RunInput, mode: DispatchMode, logger?: ILogger): MetaDecision {
  // Shadow-mode learned selection (#3551): the process-scoped selector + sink
  // log a would-be learned choice alongside the executed rule-based choice.
  // Never alters what runs; builds the comparison surface for offline eval.
  const meta = createMetaOrchestrator({
    ...(logger !== undefined ? { logger } : {}),
    shadowSelector: getShadowSelector(),
    shadowSink: getShadowSink(),
  });
  // Non-routing audit signal (#4094): surface the learned-selector readiness verdict
  // alongside shadow enablement. Observed, never acted on — the routed decision below
  // is untouched by it.
  logMetaStrategyReadinessOnce(logger ?? createLogger({ component: 'RunTool' }));
  return meta.select(toMetaInput(input, mode));
}

/**
 * Core routing logic: select a strategy for a goal and build the dispatch plan
 * (read-only — no execution). Exported for testing.
 */
export function routeGoal(input: RunInput, logger?: ILogger): RunResponse {
  const decision = selectDecision(input, 'route', logger);
  return {
    strategy: decision.strategy,
    reasoning: decision.reasoning,
    confidence: decision.confidence,
    alternatives: decision.alternatives,
    needsShaping: decision.needsShaping,
    ...(decision.shapingQuestions !== undefined
      ? { shapingQuestions: decision.shapingQuestions }
      : {}),
    recommendedTool: entrypointToolFor(decision.strategy),
    decisionId: decision.decisionId,
    note: NOTE,
  };
}

/**
 * Strategies wired for inline execution (increment B). Others fail closed with
 * a typed error, by design:
 * - `graph-workflow`: graph workflows are pre-defined templates (threat_model,
 *   code_analysis, …), not a goal-only call — no generic "goal → graph" entry.
 * - `spec`: `execute_spec` needs a markdown spec document, not a plain goal.
 * - `orchestrate`: needs an OrchestratorFactory + heavy deps the tool layer
 *   doesn't carry; use the `orchestrate` tool directly.
 * - `single-shot`: `delegate_to_model` recommends a model, it doesn't execute.
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
  dryRun?: boolean
): StrategyExecutorMap {
  return {
    'dev-pipeline': (_decision, metaInput: MetaOrchestratorInput) =>
      runDevPipelineForGoal(metaInput.goal, trustTier, dryRun),
    pipeline: (_decision, metaInput: MetaOrchestratorInput) => runPipelineForGoal(metaInput.goal),
    // #3988: `research` deliberately ALIASES the `pipeline` engine — it runs the
    // SAME generic stage registry (selectStageRegistry only branches greenfield/
    // audit), shaped by the goal text, NOT a distinct research stage registry.
    // The registry's research `entrypointTool` already points at run_pipeline, so
    // this is intended aliasing, not a distinct executor. A real research-shaped
    // registry is a feature with no current consumer (YAGNI) — add it only when a
    // named loop needs research-specific stages; until then research==pipeline.
    research: (_decision, metaInput: MetaOrchestratorInput) => runPipelineForGoal(metaInput.goal),
    consensus: (_decision, metaInput: MetaOrchestratorInput) =>
      runConsensusForGoal(metaInput.goal, undefined, gatewayAdapters),
  };
}

/** Result of an inline `execute: true` run. */
export interface RunExecuteResponse {
  readonly strategy: ExecutionStrategy;
  readonly decisionId: string;
  readonly reasoning: string;
  readonly executed: true;
  readonly durationMs: number;
  readonly result: unknown;
}

/**
 * Select a strategy and execute it via the MetaDispatcher. Resolves with the
 * engine result; rejects with {@link MetaDispatchError} for strategies without a
 * wired executor (fail closed). Executors are injectable for testing.
 */
/**
 * Whether to feed live dispatch outcomes into the shadow selector + persist them
 * (#3593). Gated behind BOTH `NEXUS_META_SHADOW_TRAIN=1` (default OFF) AND
 * learning persistence being enabled. Stays SHADOW: training never alters what
 * runs and never feeds the enforce path (#3552) — it only moves the selector
 * whose choice is logged for offline comparison.
 */
export function isShadowTrainEnabled(): boolean {
  return process.env['NEXUS_META_SHADOW_TRAIN'] === '1' && isPersistenceEnabled();
}

/**
 * Builds the train edge: on each dispatch outcome (success OR failure), update
 * the process-scoped shadow selector and append a sanitized record to disk.
 * Returns undefined when training is disabled — no selector update, no write.
 */
function buildShadowTrainObserver(logger?: ILogger): MetaOutcomeObserver | undefined {
  if (!isShadowTrainEnabled()) return undefined;
  return (record, decision) => {
    getShadowSelector().recordOutcome(decision.strategy, decision, record.success);
    persistMetaOutcome(decision.strategy, decision, record.success);
    if (logger !== undefined) {
      logger.debug('meta-shadow-train: recorded outcome', {
        decisionId: decision.decisionId,
        strategy: decision.strategy,
        success: record.success,
        armStats: getShadowSelector().stats(),
      });
    }
  };
}

export async function executeGoal(
  input: RunInput,
  opts: {
    readonly logger?: ILogger | undefined;
    readonly executors?: StrategyExecutorMap | undefined;
    readonly outcomeSink?: MetaOutcomeSink | undefined;
    readonly onOutcome?: MetaOutcomeObserver | undefined;
    /**
     * Caller's content-provenance trust tier (#3712), threaded into the default
     * dev-pipeline executor so the consensus→execute seam sees the real tier
     * instead of fail-closing. Ignored when `executors` is supplied explicitly.
     */
    readonly trustTier?: string | undefined;
    /** In-process gateway model adapters routed to consensus voters (#4042). */
    readonly gatewayAdapters?: readonly IModelAdapter[] | undefined;
  } = {}
): Promise<RunExecuteResponse> {
  // The authority-ladder guard fires inside `select` (#3920): an above-tier
  // dispatch is refused fail-closed (AuthorityRefusalError) here, BEFORE any
  // executor runs.
  const decision = selectDecision(input, 'execute', opts.logger);
  // #4806: fail closed BEFORE any executor runs. Only the dev pipeline stops
  // after plan+vote; every other strategy would execute for real, so honouring
  // the request is impossible and ignoring it would act against an explicit
  // instruction not to.
  assertDryRunSupported(input.dryRun, decision.strategy);
  const onOutcome = opts.onOutcome ?? buildShadowTrainObserver(opts.logger);
  const dispatcher = createMetaDispatcher({
    executors:
      opts.executors ?? buildDefaultExecutors(opts.trustTier, opts.gatewayAdapters, input.dryRun),
    ...(opts.logger !== undefined ? { logger: opts.logger } : {}),
    ...(opts.outcomeSink !== undefined ? { outcomeSink: opts.outcomeSink } : {}),
    ...(onOutcome !== undefined ? { onOutcome } : {}),
  });
  const dispatch = await dispatcher.dispatch(decision, toMetaInput(input, 'execute'));
  return {
    strategy: dispatch.strategy,
    decisionId: dispatch.decisionId,
    reasoning: decision.reasoning,
    executed: true,
    durationMs: dispatch.durationMs,
    result: dispatch.result,
  };
}

/**
 * Detect a business failure an engine reported in its own result, or null when
 * the run is honest-success (#4362).
 *
 * The MetaDispatcher types `DispatchResult.result` as `unknown`, so this reads
 * the two shapes the wired executors actually produce:
 *
 * - `AdaptiveOrchestratorResult` (pipeline / research) — `success: false`
 * - `DevPipelineResult` (dev-pipeline) — `completed: false`
 *
 * `ExtendedVotingResult` (consensus) is deliberately absent: a `rejected`
 * outcome is the verdict the caller asked for, not an engine fault.
 */
function detectEngineFailure(
  result: unknown
): { message: string; detail?: Record<string, unknown> } | null {
  if (typeof result !== 'object' || result === null) return null;
  const record = result as Record<string, unknown>;

  if (record['success'] === false) {
    const detail = typeof record['error'] === 'string' ? record['error'] : 'no error message';
    return { message: `Engine reported failure: ${detail}` };
  }
  if (record['completed'] === false) {
    // A dry run stops before completion BY REQUEST, so `completed: false` is
    // the outcome the caller asked for rather than an engine fault. An empty
    // plan is still a failure — producing one is the whole point of the run.
    if (record['dryRun'] === true && record['planStatus'] === undefined) return null;
    return { message: describeIncompletePipeline(record), detail: record };
  }
  return null;
}

/**
 * Run the `execute: true` body — dispatch the selected strategy via the
 * MetaDispatcher and shape the `ToolResult`. The sync path awaits this inline;
 * the async dispatcher backgrounds it via {@link runAsJob} (#3732). Catches the
 * dispatch error here so a backgrounded failure records the same structured
 * envelope a sync caller would have seen.
 */
async function executeRunBody(
  input: RunInput,
  logger: ILogger,
  trustTier?: string,
  gatewayAdapters?: readonly IModelAdapter[]
): Promise<ToolResult> {
  try {
    // #3712: thread the caller's real RequestContext.trustTier into the
    // dev-pipeline executor's consensus→execute seam. undefined ⇒ seam
    // fail-closes to untrusted (4); never infer trust from absence.
    const exec = await executeGoal(input, {
      logger,
      ...(trustTier !== undefined ? { trustTier } : {}),
      ...(gatewayAdapters !== undefined ? { gatewayAdapters } : {}),
    });
    logger.info('run: executed goal', {
      decisionId: exec.decisionId,
      strategy: exec.strategy,
      durationMs: exec.durationMs,
    });
    // #4362: a dispatch that RESOLVED used to be an unconditional success, so an
    // engine reporting its own failure was handed back as `toolSuccess` — and,
    // backgrounded, recorded as a `complete` job. Only a throw was surfaced.
    const engineFailure = detectEngineFailure(exec.result);
    if (engineFailure !== null) {
      logger.warn('run: engine reported failure', {
        decisionId: exec.decisionId,
        strategy: exec.strategy,
      });
      // #4789: carry the engine's own result through. The message names the
      // reason; `detail` keeps the verdict a caller can act on.
      return toolStructuredError({
        errorCategory: 'business',
        message: engineFailure.message,
        ...(engineFailure.detail !== undefined ? { detail: engineFailure.detail } : {}),
      });
    }
    return toolSuccess(JSON.stringify(exec, null, 2));
  } catch (err) {
    return toolStructuredError({
      errorCategory: classifyDispatchError(err),
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Async-path wrapper around {@link executeRunBody} that rejects on an error
 * envelope (#4362).
 *
 * `runAsJob` records `complete` whenever its `run` callback RESOLVES, so
 * returning a structured error would still land a `complete` job — the caller
 * would poll `get_job_result`, see success, and never look at the payload.
 * Rejecting routes it through `writeJobFailed`. Increment 2 (#4363) folds this
 * into `runAsJob` itself as the fail-closed default for every caller.
 */
async function executeRunBodyOrThrow(
  input: RunInput,
  logger: ILogger,
  trustTier?: string,
  gatewayAdapters?: readonly IModelAdapter[]
): Promise<ToolResult> {
  const result = await executeRunBody(input, logger, trustTier, gatewayAdapters);
  if (result.isError === true) {
    throw new Error(result.content[0]?.text ?? 'run failed');
  }
  return result;
}

async function runHandler(
  args: unknown,
  logger: ILogger,
  trustTier?: string,
  gatewayAdapters?: readonly IModelAdapter[]
): Promise<ToolResult> {
  const parsed = RunInputSchema.safeParse(args);
  if (!parsed.success) {
    return toolStructuredError({
      errorCategory: 'validation',
      message: `Validation error: ${formatZodError(parsed.error)}`,
    });
  }

  if (parsed.data.execute === true) {
    const input = parsed.data;
    // #3732: async dispatch — `run` with execute:true routes to the heaviest
    // engines (dev-pipeline/pipeline), which can exceed the MCP request timeout
    // even with the 1800s class guard (#3734). `run` has no sessionId, so a
    // fresh `rn-<uuid>` jobId is always minted (no idempotency surface).
    // Returns `{ status: 'pending', jobId }` immediately.
    if (input.dispatch === 'async') {
      return runAsJob<RunInput, ToolResult>({
        toolName: 'run',
        input,
        freshJobId: () => `rn-${randomUUID()}`,
        run: () => executeRunBodyOrThrow(input, logger, trustTier, gatewayAdapters),
        logger,
      });
    }
    return executeRunBody(input, logger, trustTier, gatewayAdapters);
  }

  const response = routeGoal(parsed.data, logger);
  logger.info('run: routed goal', {
    decisionId: response.decisionId,
    strategy: response.strategy,
    recommendedTool: response.recommendedTool,
  });
  return toolSuccess(JSON.stringify(response, null, 2));
}

const DESCRIPTION =
  'DEFAULT ENTRY POINT: give a goal and nexus-agents picks the right strategy ' +
  '(single-shot / dev-pipeline / pipeline / graph-workflow / orchestrate / consensus / ' +
  'spec / research) via the MetaOrchestrator. Default (execute:false) is read-only — ' +
  'returns the routing decision + recommendedTool. With execute:true it runs the selected ' +
  'strategy inline (currently wired: dev-pipeline, pipeline, research, consensus; others fail closed ' +
  'with a typed error) and returns the engine result, recording the outcome. Use forceStrategy to override. ' +
  'Prefer this over choosing a pipeline tool by hand — the specialized tools remain ' +
  'available as advanced force-strategy paths.';

/** Deps for the `run` tool — adds the in-process gateway adapters (#4042). */
export interface RunToolDeps extends BaseMcpToolDeps {
  gatewayAdapters?: readonly IModelAdapter[] | undefined;
}

/** @category MCP */
export function registerRunTool(server: McpServer, deps: RunToolDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'run' });

  // 2-arg context-aware form (mirrors delegate-to-model.ts / run_dev_pipeline):
  // thread the caller's real RequestContext.trustTier so the run→dev-pipeline
  // consensus→execute seam sees the real tier (#3712) — this closes the hole
  // where a possibly-untrusted goal ran a real research stage with no tier.
  const secureHandler = createSecureHandler(
    (args: unknown, ctx: HandlerContext) =>
      runHandler(args, logger, ctx.requestContext.trustTier, deps.gatewayAdapters),
    {
      toolName: 'run',
      rateLimiter: deps.rateLimiter,
      logger,
    }
  );

  const timeoutMs = getToolTimeout('run', deps.security);
  const wrappedHandler = wrapToolWithTimeout('run', secureHandler, { timeoutMs, logger });

  const annotations = getMcpAnnotations('run');
  server.registerTool(
    'run',
    {
      description: DESCRIPTION,
      inputSchema: RunInputSchema.shape,
      ...(annotations !== undefined ? { annotations } : {}),
    },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered run tool (unified adaptive entry point)');
}
