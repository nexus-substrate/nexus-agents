/**
 * nexus-agents/mcp - MCP Notification Helper
 *
 * Routes operator-facing orchestration events through the existing logger
 * to stderr in server mode, leaving stdout for JSON-RPC frames.
 *
 * Also provides progress notification support via AsyncLocalStorage
 * for resetting client-side request timeouts (MCP SDK resetTimeoutOnProgress).
 *
 * @module mcp/mcp-notifier
 * (Source: Issue #973, #974 — Claude Code Observability)
 * (Source: Issue #1108 — Progress heartbeat timeout reset)
 * (Source: Issue #5167 — Migrate operator output off MCP Logging)
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger, getErrorMessage } from '../core/index.js';

/**
 * Legacy MCP logging level names retained for API compatibility.
 */
export type McpLogLevel = 'debug' | 'info' | 'notice' | 'warning' | 'error';

/**
 * Operator event logger used by MCP tools.
 */
export interface IMcpNotifier {
  /** Log info-level operator event (key orchestration events) */
  info(logger: string, data: Record<string, unknown>): void;
  /** Log debug-level operator event (detailed execution steps) */
  debug(logger: string, data: Record<string, unknown>): void;
  /** Log warning-level operator event */
  warn(logger: string, data: Record<string, unknown>): void;
}

const internalLogger = createLogger({ component: 'mcp-notifier' });

/**
 * Creates an operator notifier backed by the existing logger.
 * Server startup configures the logger destination as stderr. The server
 * argument is retained for compatibility; no MCP Logging messages are sent.
 * Logging failures never propagate to tool execution.
 */
export function createMcpNotifier(_server: McpServer): IMcpNotifier {
  function log(
    level: 'info' | 'debug' | 'warn',
    logger: string,
    data: Record<string, unknown>
  ): void {
    try {
      internalLogger[level](logger, data);
    } catch (error: unknown) {
      try {
        internalLogger.debug('Failed to log operator event', {
          level,
          logger,
          error: getErrorMessage(error),
        });
      } catch {
        // An unavailable stderr sink cannot report its own failure. Keep
        // operator logging from breaking tools or falling back to stdout.
      }
    }
  }

  return {
    info: (logger, data) => {
      log('info', logger, data);
    },
    debug: (logger, data) => {
      log('debug', logger, data);
    },
    warn: (logger, data) => {
      log('warn', logger, data);
    },
  };
}

/**
 * No-op notifier for when MCP server is not available.
 */
export const NOOP_NOTIFIER: IMcpNotifier = {
  info: () => undefined,
  debug: () => undefined,
  warn: () => undefined,
};

// ============================================================================
// Progress Notification Support (MCP SDK resetTimeoutOnProgress)
// ============================================================================

/**
 * Callback to send a progress notification to the MCP client.
 * When the client sets resetTimeoutOnProgress=true, each notification
 * resets the client's 60s request timeout.
 */
export type ProgressSender = (progress: number, total?: number) => void;

/**
 * Progress context stored via AsyncLocalStorage.
 * Set by toSdkCallbackWithProgress when a progressToken is available.
 */
export interface ProgressContext {
  readonly progressToken: string | number;
  readonly sendNotification: ProgressSender;
}

/**
 * AsyncLocalStorage for MCP progress context.
 * Allows withProgressHeartbeat to access the progress sender without
 * threading it through the entire middleware chain.
 */
export const progressContextStorage = new AsyncLocalStorage<ProgressContext>();

// ============================================================================
// Abort Signal Support (MCP SDK cancellation)
// ============================================================================

/**
 * AsyncLocalStorage for MCP abort signal.
 * Set by toSdkCallback when the SDK provides an AbortSignal.
 * Allows middleware (e.g., TimeoutGuard) to race client cancellation
 * alongside server-side timeouts.
 */
export const abortSignalStorage = new AsyncLocalStorage<AbortSignal>();

/**
 * Wraps an async operation with periodic heartbeat notifications.
 *
 * When a progressToken is available (via AsyncLocalStorage from the MCP
 * request handler), sends real `notifications/progress` that reset the
 * client's request timeout (MCP SDK resetTimeoutOnProgress feature).
 *
 * Also logs operator heartbeats at debug level.
 *
 * @param toolName - Name of the tool for notification context
 * @param notifier - MCP notifier instance
 * @param operation - The async operation to wrap
 * @param intervalMs - Heartbeat interval (default: 15000ms)
 * @returns The operation result
 */
export async function withProgressHeartbeat<T>(
  toolName: string,
  notifier: IMcpNotifier,
  operation: () => Promise<T>,
  intervalMs = 15_000
): Promise<T> {
  const startTime = Date.now();
  let beatCount = 0;
  const progressCtx = progressContextStorage.getStore();

  const timer = setInterval(() => {
    beatCount++;
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    // Send real progress notification if client provided progressToken
    if (progressCtx !== undefined) {
      progressCtx.sendNotification(beatCount);
    }

    // Log the operator heartbeat independently of client progress
    notifier.debug(toolName, {
      event: 'heartbeat',
      elapsedSeconds: elapsed,
      beatCount,
      hasProgressToken: progressCtx !== undefined,
    });
  }, intervalMs);

  try {
    return await operation();
  } finally {
    clearInterval(timer);
  }
}
