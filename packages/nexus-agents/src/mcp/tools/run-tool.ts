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
 * Increment A (this module) is read-only: it returns the routing decision plus
 * the concrete strategy tool to invoke (a dispatch plan). Inline execution
 * (`execute: true` driving the MetaDispatcher with real engine executors) lands
 * in increment B.
 *
 * @module mcp/tools/run-tool
 * (Source: epic #3548 — unified adaptive MetaOrchestrator entry point)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { createLogger, formatZodError, type ILogger } from '../../core/index.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler } from '../middleware/secure-handler.js';
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
} from '../../orchestration/meta-orchestrator.js';

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

/**
 * Core routing logic: select a strategy for a goal and build the dispatch plan.
 * Pure aside from the MetaOrchestrator's decision logging. Exported for testing.
 */
export function routeGoal(input: RunInput, logger?: ILogger): RunResponse {
  const meta = createMetaOrchestrator(logger !== undefined ? { logger } : undefined);
  const decision = meta.select(toMetaInput(input));
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

function runHandler(args: unknown, logger: ILogger): Promise<ToolResult> {
  const parsed = RunInputSchema.safeParse(args);
  if (!parsed.success) {
    return Promise.resolve(
      toolStructuredError({
        errorCategory: 'validation',
        message: `Validation error: ${formatZodError(parsed.error)}`,
      })
    );
  }

  const response = routeGoal(parsed.data, logger);
  logger.info('run: routed goal', {
    decisionId: response.decisionId,
    strategy: response.strategy,
    recommendedTool: response.recommendedTool,
  });
  return Promise.resolve(toolSuccess(JSON.stringify(response, null, 2)));
}

const DESCRIPTION =
  'DEFAULT ENTRY POINT: give a goal and nexus-agents picks the right strategy ' +
  '(single-shot / dev-pipeline / pipeline / graph-workflow / orchestrate / consensus / ' +
  'spec / research) via the MetaOrchestrator and returns the routing decision plus the ' +
  'recommendedTool to run it. Read-only in this release (returns a decision, executes ' +
  'nothing). Use forceStrategy to override. Prefer this over choosing a pipeline tool ' +
  'by hand — the specialized tools remain available as advanced force-strategy paths.';

/** @category MCP */
export function registerRunTool(server: McpServer, deps: BaseMcpToolDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'run' });

  const secureHandler = createSecureHandler((args: unknown) => runHandler(args, logger), {
    toolName: 'run',
    rateLimiter: deps.rateLimiter,
    logger,
  });

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
