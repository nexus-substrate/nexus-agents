/**
 * nexus-agents/agents - BaseAgent Complete Flow Helpers
 *
 * Helper functions for the complete() method flow in BaseAgent.
 * Extracted to reduce file size in base-agent.ts (Issue #340).
 *
 * @module agents/base-agent-complete-flow
 */

import type {
  Result,
  CompletionRequest,
  CompletionResponse,
  IModelAdapter,
} from '../core/index.js';
import { err, AgentError } from '../core/index.js';
import type { ITokenBudgetTracker } from '../context/token-budget-tracker.js';
import type { IEventBus } from './collaboration/event-bus-types.js';
import type { ContextPruner } from './context-pruner.js';
import type { ResolvedPruningConfig, ContextPruningMetrics } from './base-agent-pruning-init.js';
import {
  executeContextPruning,
  checkBudgetBeforeComplete,
  executeModelCompletion,
} from './base-agent-complete-helpers.js';

/**
 * Context for complete flow operations.
 */
export interface CompleteFlowContext {
  agentId: string;
  adapter: IModelAdapter | undefined;
  budgetTracker: ITokenBudgetTracker;
  contextPruningEnabled: boolean;
  contextPruner: ContextPruner | undefined;
  pruningConfig: ResolvedPruningConfig;
  pruningMetrics: ContextPruningMetrics;
  eventBus: IEventBus;
}

/**
 * Validates adapter is configured.
 */
export function validateAdapter(ctx: CompleteFlowContext): Result<IModelAdapter, AgentError> {
  if (ctx.adapter === undefined) {
    return err(
      new AgentError('No model adapter configured', { context: { agentId: ctx.agentId } })
    );
  }
  return { ok: true, value: ctx.adapter };
}

/**
 * Executes pre-completion checks: budget validation and optional context pruning.
 */
export async function executePreCompletionChecks(
  ctx: CompleteFlowContext
): Promise<Result<void, AgentError>> {
  const budgetResult = checkBudgetBeforeComplete({
    agentId: ctx.agentId,
    budgetTracker: ctx.budgetTracker,
  });
  if (!budgetResult.ok) return budgetResult;

  if (ctx.contextPruningEnabled && ctx.contextPruner !== undefined) {
    await executeContextPruning({
      agentId: ctx.agentId,
      contextPruner: ctx.contextPruner,
      pruningConfig: ctx.pruningConfig,
      pruningMetrics: ctx.pruningMetrics,
      eventBus: ctx.eventBus,
    });
  }

  return { ok: true, value: undefined };
}

/**
 * Executes the model completion.
 */
export async function runModelCompletion(
  ctx: CompleteFlowContext,
  adapter: IModelAdapter,
  request: CompletionRequest
): Promise<Result<CompletionResponse, AgentError>> {
  return executeModelCompletion({
    agentId: ctx.agentId,
    adapter,
    request,
    budgetTracker: ctx.budgetTracker,
  });
}
