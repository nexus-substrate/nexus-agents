/**
 * @nexus-agents/mcp - Logging Middleware
 *
 * Structured logger context for MCP operations.
 * Provides consistent logging across all MCP tools and handlers.
 */

import { createLogger, type ILogger, type LogContext } from '@nexus-agents/core';

/**
 * MCP-specific log context fields.
 */
export interface McpLogContext extends LogContext {
  /** The tool being executed */
  tool?: string;
  /** Request ID for tracing */
  requestId?: string;
  /** Duration of the operation in milliseconds */
  durationMs?: number;
  /** Whether the operation succeeded */
  success?: boolean;
  /** Error code if operation failed */
  errorCode?: string;
}

/**
 * Creates a logger with MCP-specific context.
 *
 * @param baseContext - Base context to include in all log entries
 * @returns An ILogger instance with MCP context
 *
 * @example
 * ```typescript
 * const logger = createMcpLogger({ requestId: 'req-123' });
 * logger.info('Processing request', { tool: 'orchestrate' });
 * ```
 */
export function createMcpLogger(baseContext?: McpLogContext): ILogger {
  return createLogger({
    component: 'mcp',
    ...baseContext,
  });
}

/**
 * Creates a child logger for a specific tool execution.
 *
 * @param parentLogger - The parent logger instance
 * @param toolName - Name of the tool being executed
 * @param requestId - Optional request ID for tracing
 * @returns A child logger with tool context
 */
export function createToolLogger(
  parentLogger: ILogger,
  toolName: string,
  requestId?: string
): ILogger {
  const context: McpLogContext = {
    tool: toolName,
  };

  if (requestId !== undefined) {
    context.requestId = requestId;
  }

  return parentLogger.child(context);
}

/**
 * Logs the start of a tool execution.
 *
 * @param logger - The logger to use
 * @param toolName - Name of the tool
 * @param args - Tool arguments (sanitized for logging)
 */
export function logToolStart(
  logger: ILogger,
  toolName: string,
  args?: Record<string, unknown>
): void {
  logger.info('Tool execution started', {
    tool: toolName,
    hasArgs: args !== undefined,
    argKeys: args !== undefined ? Object.keys(args) : [],
  });
}

/**
 * Logs the successful completion of a tool execution.
 *
 * @param logger - The logger to use
 * @param toolName - Name of the tool
 * @param durationMs - Duration of the execution in milliseconds
 * @param resultInfo - Optional information about the result
 */
export function logToolSuccess(
  logger: ILogger,
  toolName: string,
  durationMs: number,
  resultInfo?: Record<string, unknown>
): void {
  logger.info('Tool execution completed', {
    tool: toolName,
    durationMs,
    success: true,
    ...resultInfo,
  });
}

/**
 * Logs a failed tool execution.
 *
 * @param logger - The logger to use
 * @param toolName - Name of the tool
 * @param error - The error that occurred
 * @param durationMs - Duration of the execution in milliseconds
 */
export function logToolError(
  logger: ILogger,
  toolName: string,
  error: Error,
  durationMs: number
): void {
  logger.error('Tool execution failed', error, {
    tool: toolName,
    durationMs,
    success: false,
    errorCode: 'code' in error ? (error as { code: string }).code : undefined,
  });
}

/**
 * Creates a timing utility for measuring operation duration.
 *
 * @returns An object with start time and elapsed() method
 *
 * @example
 * ```typescript
 * const timer = createTimer();
 * // ... perform operation
 * const durationMs = timer.elapsed();
 * ```
 */
export function createTimer(): { elapsed: () => number } {
  const startTime = Date.now();
  return {
    elapsed: () => Date.now() - startTime,
  };
}

/**
 * Higher-order function that wraps a tool handler with logging.
 *
 * @template TArgs - Tool argument type
 * @template TResult - Tool result type
 * @param toolName - Name of the tool
 * @param handler - The tool handler function
 * @param logger - The logger to use
 * @returns A wrapped handler with automatic logging
 *
 * @example
 * ```typescript
 * const wrappedHandler = withLogging(
 *   'my_tool',
 *   async (args) => { ... },
 *   logger
 * );
 * ```
 */
export function withLogging<TArgs, TResult>(
  toolName: string,
  handler: (args: TArgs) => Promise<TResult>,
  logger: ILogger
): (args: TArgs) => Promise<TResult> {
  const toolLogger = createToolLogger(logger, toolName);

  return async (args: TArgs): Promise<TResult> => {
    const timer = createTimer();
    logToolStart(toolLogger, toolName, args as Record<string, unknown>);

    try {
      const result = await handler(args);
      logToolSuccess(toolLogger, toolName, timer.elapsed());
      return result;
    } catch (error) {
      logToolError(
        toolLogger,
        toolName,
        error instanceof Error ? error : new Error(String(error)),
        timer.elapsed()
      );
      throw error;
    }
  };
}
