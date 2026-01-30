/**
 * nexus-agents/mcp - Delegate to Model Tool
 *
 * MCP tool for capability-matched task routing.
 * Routes tasks to optimal model based on task requirements and available capacity.
 * Supports intelligent routing via CompositeRouter when available.
 *
 * (Source: MCP Protocol 2025-11-25)
 * (Source: cli-project_plan.md v2.0.0)
 * (Source: Issue #169, Epic #164)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger } from '../../core/index.js';
import { createLogger } from '../../core/index.js';
import { wrapToolWithTimeout, toSdkCallback } from '../middleware/tool-wrapper.js';
import {
  mapCompositeDecisionToOutput,
  routeViaCompositeRouter,
} from './delegate-to-model-router.js';
import type { DelegateDeps, ToolResult } from './delegate-to-model-types.js';
import { DelegateInputSchema, TOOL_SCHEMA } from './delegate-to-model-types.js';
import {
  analyzeTask,
  selectModel,
  checkRateLimit,
  buildDelegateOutput,
  successResult,
  errorResult,
  scoreModel,
} from './delegate-to-model-helpers.js';

// Re-export types for backward compatibility
export type {
  PreferredCapability,
  CapabilityProfile,
  DelegateInput,
  DelegateOutput,
  DelegateDeps,
  TaskRequirements,
  ScoredModel,
  ToolResult,
} from './delegate-to-model-types.js';
export {
  MODEL_CAPABILITIES,
  DelegateInputSchema,
  DelegateOutputSchema,
  TOOL_SCHEMA,
} from './delegate-to-model-types.js';

/**
 * Creates the handler for the delegate_to_model tool.
 * Uses CompositeRouter when available for intelligent routing.
 * Falls back to local model selection when router is not provided.
 */
function createDelegateHandler(
  deps: DelegateDeps,
  logger: ILogger
): (args: unknown) => Promise<ToolResult> {
  return async (args: unknown): Promise<ToolResult> => {
    const rateLimitError = checkRateLimit(deps.rateLimiter);
    if (rateLimitError) return rateLimitError;

    const validated = DelegateInputSchema.safeParse(args);
    if (!validated.success) {
      const msg = validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      logger.warn('Invalid delegate_to_model input', { errors: validated.error.issues });
      return errorResult(`Validation error: ${msg}`);
    }

    const input = validated.data;
    logger.info('Analyzing task for model routing', {
      taskLength: input.task.length,
      hasRouter: deps.router !== undefined,
    });

    const requirements = analyzeTask(input.task);
    logger.debug('Task requirements analyzed', { ...requirements });

    // Try CompositeRouter first if available (Issue #169)
    if (deps.router !== undefined) {
      const routingResult = await routeViaCompositeRouter(
        input.task,
        deps.router,
        deps.feedbackIntegration,
        logger
      );

      if (routingResult !== null) {
        const output = mapCompositeDecisionToOutput(
          routingResult.decision,
          requirements.estimatedTokens
        );
        logger.info('Model recommendation via CompositeRouter', {
          recommendedModel: output.recommended_model,
          confidence: routingResult.decision.confidence,
          stages: routingResult.decision.stagesExecuted,
          routingId: routingResult.routingId,
        });
        return successResult(JSON.stringify(output, null, 2));
      }

      logger.info('Falling back to local model selection');
    }

    // Fall back to local model selection
    const selection = selectModel(input, requirements);
    const output = buildDelegateOutput(selection, requirements);

    if (!output) return errorResult(`Unknown model: ${selection.model}`);

    logger.info('Model recommendation complete', { recommendedModel: output.recommended_model });
    return successResult(JSON.stringify(output, null, 2));
  };
}

/**
 * Registers the delegate_to_model tool with the MCP server.
 *
 * Includes timeout protection for CVE-2026-0621 mitigation (Issue #271).
 *
 * @param server - MCP server instance
 * @param deps - Dependencies
 */
export function registerDelegateToModelTool(server: McpServer, deps: DelegateDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'delegate_to_model' });
  const description =
    'Route a task to the optimal model based on capability matching. Returns model recommendation with reasoning.';

  // Wrap handler with timeout protection (Issue #271, CVE-2026-0621)
  const handler = createDelegateHandler(deps, logger);
  const timeoutMs = deps.security?.timeout?.defaultTimeoutMs;
  const wrappedHandler = wrapToolWithTimeout(
    'delegate_to_model',
    handler,
    timeoutMs !== undefined ? { timeoutMs, logger } : { logger }
  );

  // eslint-disable-next-line @typescript-eslint/no-deprecated -- server.tool() is deprecated but still used
  server.tool('delegate_to_model', description, TOOL_SCHEMA, toSdkCallback(wrappedHandler));
  logger.info('Registered delegate_to_model tool with timeout protection');
}

/**
 * Exports for testing.
 */
export const _testing = {
  analyzeTask,
  scoreModel,
  selectModel,
};
