/**
 * nexus-agents/mcp - Query Task State MCP Tool (#2046).
 *
 * Read-only MCP tool that reads the structured task-state log written
 * by the orchestrate tool when NEXUS_TASK_STATE_ENABLED=1, reducing it
 * to the current `StructuredTaskState` snapshot.
 *
 * @module mcp/tools/query-task-state-tool
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger, formatZodError } from '../../core/index.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import { toolError, toolSuccess, type BaseMcpToolDeps, type ToolResult } from './tool-result.js';
import { readTaskState } from '../../context/structured-task-state.js';
import type { StructuredTaskState } from '../../context/structured-task-state-types.js';

export const QueryTaskStateInputSchema = z.object({
  taskId: z.string().min(1).max(128).describe('Task ID whose structured state log should be read'),
});

export type QueryTaskStateInput = z.infer<typeof QueryTaskStateInputSchema>;

export interface QueryTaskStateResponse {
  readonly taskId: string;
  readonly found: boolean;
  readonly state?: StructuredTaskState;
  readonly errorMessage?: string;
}

export type QueryTaskStateDeps = BaseMcpToolDeps;

function queryTaskStateHandler(args: unknown, ctx: HandlerContext): Promise<ToolResult> {
  const parsed = QueryTaskStateInputSchema.safeParse(args);
  if (!parsed.success) {
    return Promise.resolve(toolError(`Validation error: ${formatZodError(parsed.error)}`));
  }
  const result = readTaskState(parsed.data.taskId);
  if (result.ok) {
    const response: QueryTaskStateResponse = {
      taskId: parsed.data.taskId,
      found: true,
      state: result.value,
    };
    return Promise.resolve(toolSuccess(JSON.stringify(response, null, 2)));
  }
  ctx.logger.info('Task state not found or unreadable', {
    taskId: parsed.data.taskId,
    error: result.error.message,
  });
  const response: QueryTaskStateResponse = {
    taskId: parsed.data.taskId,
    found: false,
    errorMessage: result.error.message,
  };
  return Promise.resolve(toolSuccess(JSON.stringify(response, null, 2)));
}

/** @category MCP */
export function registerQueryTaskStateTool(server: McpServer, deps: QueryTaskStateDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'query_task_state' });
  const toolSchema = {
    taskId: z
      .string()
      .min(1)
      .max(128)
      .describe('Task ID whose structured state log should be read'),
  };

  const description =
    'Read the structured state log for a task ID and return the current ' +
    'snapshot. Structured state is only written when NEXUS_TASK_STATE_ENABLED=1 ' +
    'was set during the orchestrate invocation.';

  const secureHandler = createSecureHandler(queryTaskStateHandler, {
    toolName: 'query_task_state',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  const timeoutMs = getToolTimeout('query_task_state', deps.security);
  const wrappedHandler = wrapToolWithTimeout('query_task_state', secureHandler, {
    timeoutMs,
    logger,
  });

  server.registerTool(
    'query_task_state',
    { description, inputSchema: toolSchema },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered query_task_state tool');
}
