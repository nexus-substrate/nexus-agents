/**
 * nexus-agents/mcp - Tool Error Handler
 *
 * Shared error handling utilities for MCP tool handlers.
 * Eliminates duplicated try/catch → getErrorMessage → isError response
 * patterns across 15+ tool implementations.
 *
 * @module mcp/middleware/tool-error-handler
 * (Source: Issue #1144 — Extract shared MCP tool error handler)
 */

import type { ILogger } from '../../core/index.js';
import { getErrorMessage } from '../../core/index.js';

/** Standard MCP tool response shape. */
interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Creates a standardized MCP error response.
 *
 * @param prefix - Human-readable error context (e.g., "Memory write failed")
 * @param error - The caught error (unknown type from catch block)
 * @param logger - Optional logger to record the error
 * @returns MCP tool response with isError: true
 */
export function toolErrorResponse(prefix: string, error: unknown, logger?: ILogger): ToolResponse {
  const message = getErrorMessage(error);
  if (logger !== undefined) {
    const errorObj = error instanceof Error ? error : new Error(message);
    logger.error(prefix, errorObj);
  }
  return {
    isError: true,
    content: [{ type: 'text', text: `${prefix}: ${message}` }],
  };
}

/**
 * Wraps a tool handler function with standardized error handling.
 *
 * Catches any thrown error, logs it, and returns a consistent
 * MCP error response. Reduces boilerplate in tool implementations.
 *
 * @param prefix - Error message prefix for this tool
 * @param logger - Logger instance for error recording
 * @param fn - The async handler function to wrap
 * @returns The handler result, or a standardized error response
 *
 * @example
 * ```typescript
 * const result = await withToolError('Research add failed', logger, async () => {
 *   const data = await executeResearchAdd(input, logger);
 *   return { content: [{ type: 'text', text: JSON.stringify(data) }] };
 * });
 * ```
 */
export async function withToolError(
  prefix: string,
  logger: ILogger,
  fn: () => Promise<ToolResponse>
): Promise<ToolResponse> {
  try {
    return await fn();
  } catch (error: unknown) {
    return toolErrorResponse(prefix, error, logger);
  }
}
