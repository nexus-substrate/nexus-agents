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

import { createLogger, formatZodError, type ILogger } from '../../core/index.js';
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
import { isPersistenceEnabled } from '../../config/learning-persistence.js';
import {
  createMetaDispatcher,
  MetaDispatchError,
  type StrategyExecutorMap,
  type MetaOutcomeSink,
  type MetaOutcomeObserver,
} from '../../orchestration/meta-dispatcher.js';
import { runDevPipelineForGoal } from './dev-pipeline-tool.js';
import { runPipelineForGoal } from './pipeline-tool.js';
import { runConsensusForGoal } from './consensus-vote.js';
// #3732 / epic #2631: async-mode dispatch via the shared `runAsJob` helper.
import { runAsJob } from '../jobs/run-as-job.js';

/**
 * The concrete MCP tool / engine each strategy routes to. Used to tell the
 * caller which "force-strategy" path executes a given selection until inline
 * execution lands (increment B).
 */
export const STRATEGY_ENTRYPOINT_TOOL: Readonly<Record<ExecutionStrategy, string>> = {
  'single-shot': 'delegate_to_model',
  'dev-pipeline': 'run_dev_pipeline',
  pipeline: 'run_pipeline',
  'graph-workflow': 'run_graph_workflow',
  orchestrate: 'orchestrate',
  consensus: 'consensus_vote',
  spec: 'execute_spec',
  research: 'run_pipeline',
};

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

const NOTE =
  'Routing decision only (read-only). Invoke the recommendedTool to execute, or ' +
  'wait for inline execution (run execute: true) in a later release. The other ' +
  'pipeline tools remain available as advanced force-strategy paths.';

/** Maps validated input to the MetaOrchestrator input shape. */
function toMetaInput(
  input: RunInput
): Parameters<ReturnType<typeof createMetaOrchestrator>['select']>[0] {
  const signals: Record<string, unknown> = {};
  if (input.requiresConsensus !== undefined) signals.requiresConsensus = input.requiresConsensus;
  if (input.dependencyStructure !== undefined)
    signals.dependencyStructure = input.dependencyStructure;
  if (input.isNovel !== undefined) signals.isNovel = input.isNovel;
  return {
    goal: input.goal,
    ...(Object.keys(signals).length > 0 ? { signals } : {}),
    ...(input.forceStrategy !== undefined ? { forceStrategy: input.forceStrategy } : {}),
  };
}

/** Selects a strategy for a goal via the MetaOrchestrator. */
function selectDecision(input: RunInput, logger?: ILogger): MetaDecision {
  // Shadow-mode learned selection (#3551): the process-scoped selector + sink
  // log a would-be learned choice alongside the executed rule-based choice.
  // Never alters what runs; builds the comparison surface for offline eval.
  const meta = createMetaOrchestrator({
    ...(logger !== undefined ? { logger } : {}),
    shadowSelector: getShadowSelector(),
    shadowSink: getShadowSink(),
  });
  return meta.select(toMetaInput(input));
}

/**
 * Core routing logic: select a strategy for a goal and build the dispatch plan
 * (read-only — no execution). Exported for testing.
 */
export function routeGoal(input: RunInput, logger?: ILogger): RunResponse {
  const decision = selectDecision(input, logger);
  return {
    strategy: decision.strategy,
    reasoning: decision.reasoning,
    confidence: decision.confidence,
    alternatives: decision.alternatives,
    needsShaping: decision.needsShaping,
    ...(decision.shapingQuestions !== undefined
      ? { shapingQuestions: decision.shapingQuestions }
      : {}),
    recommendedTool: STRATEGY_ENTRYPOINT_TOOL[decision.strategy],
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
export function buildDefaultExecutors(trustTier?: string): StrategyExecutorMap {
  return {
    'dev-pipeline': (_decision, metaInput: MetaOrchestratorInput) =>
      runDevPipelineForGoal(metaInput.goal, trustTier),
    pipeline: (_decision, metaInput: MetaOrchestratorInput) => runPipelineForGoal(metaInput.goal),
    research: (_decision, metaInput: MetaOrchestratorInput) => runPipelineForGoal(metaInput.goal),
    consensus: (_decision, metaInput: MetaOrchestratorInput) => runConsensusForGoal(metaInput.goal),
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
  } = {}
): Promise<RunExecuteResponse> {
  const decision = selectDecision(input, opts.logger);
  const onOutcome = opts.onOutcome ?? buildShadowTrainObserver(opts.logger);
  const dispatcher = createMetaDispatcher({
    executors: opts.executors ?? buildDefaultExecutors(opts.trustTier),
    ...(opts.logger !== undefined ? { logger: opts.logger } : {}),
    ...(opts.outcomeSink !== undefined ? { outcomeSink: opts.outcomeSink } : {}),
    ...(onOutcome !== undefined ? { onOutcome } : {}),
  });
  const dispatch = await dispatcher.dispatch(decision, toMetaInput(input));
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
 * Run the `execute: true` body — dispatch the selected strategy via the
 * MetaDispatcher and shape the `ToolResult`. The sync path awaits this inline;
 * the async dispatcher backgrounds it via {@link runAsJob} (#3732). Catches the
 * dispatch error here so a backgrounded failure records the same structured
 * envelope a sync caller would have seen.
 */
async function executeRunBody(
  input: RunInput,
  logger: ILogger,
  trustTier?: string
): Promise<ToolResult> {
  try {
    // #3712: thread the caller's real RequestContext.trustTier into the
    // dev-pipeline executor's consensus→execute seam. undefined ⇒ seam
    // fail-closes to untrusted (4); never infer trust from absence.
    const exec = await executeGoal(input, {
      logger,
      ...(trustTier !== undefined ? { trustTier } : {}),
    });
    logger.info('run: executed goal', {
      decisionId: exec.decisionId,
      strategy: exec.strategy,
      durationMs: exec.durationMs,
    });
    return toolSuccess(JSON.stringify(exec, null, 2));
  } catch (err) {
    const noExecutor = err instanceof MetaDispatchError && err.code === 'no_executor';
    return toolStructuredError({
      errorCategory: noExecutor ? 'business' : 'internal',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

async function runHandler(args: unknown, logger: ILogger, trustTier?: string): Promise<ToolResult> {
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
        run: () => executeRunBody(input, logger, trustTier),
        logger,
      });
    }
    return executeRunBody(input, logger, trustTier);
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

/** @category MCP */
export function registerRunTool(server: McpServer, deps: BaseMcpToolDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'run' });

  // 2-arg context-aware form (mirrors delegate-to-model.ts / run_dev_pipeline):
  // thread the caller's real RequestContext.trustTier so the run→dev-pipeline
  // consensus→execute seam sees the real tier (#3712) — this closes the hole
  // where a possibly-untrusted goal ran a real research stage with no tier.
  const secureHandler = createSecureHandler(
    (args: unknown, ctx: HandlerContext) => runHandler(args, logger, ctx.requestContext.trustTier),
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
