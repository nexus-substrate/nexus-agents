/**
 * nexus-agents/mcp - MCP Notification Helper
 *
 * Sends structured logging notifications to MCP clients via
 * the `notifications/message` protocol method.
 * Clients (e.g., Claude Code) can display these for real-time
 * observability of orchestration events.
 *
 * Also provides progress notification support via AsyncLocalStorage
 * for resetting client-side request timeouts (MCP SDK resetTimeoutOnProgress).
 *
 * @module mcp/mcp-notifier
 * (Source: Issue #973, #974 — Claude Code Observability)
 * (Source: Issue #1108 — Progress heartbeat timeout reset)
 * (Source: MCP Protocol 2025-11-25, Logging Specification)
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger, getErrorMessage } from '../core/index.js';

/**
 * Logging levels for MCP notifications (RFC 5424 syslog).
 */
export type McpLogLevel = 'debug' | 'info' | 'notice' | 'warning' | 'error';

/**
 * MCP notifier for sending structured log events to clients.
 */
export interface IMcpNotifier {
  /** Send info-level notification (key orchestration events) */
  info(logger: string, data: Record<string, unknown>): void;
  /** Send debug-level notification (detailed execution steps) */
  debug(logger: string, data: Record<string, unknown>): void;
  /** Send warning-level notification */
  warn(logger: string, data: Record<string, unknown>): void;
}

const internalLogger = createLogger({ component: 'mcp-notifier' });

/**
 * Creates an MCP notifier that sends logging notifications to connected clients.
 *
 * Notifications are fire-and-forget — failures are logged but never
 * propagate to callers. This ensures observability never breaks tool execution.
 */
export function createMcpNotifier(server: McpServer): IMcpNotifier {
  function send(level: McpLogLevel, logger: string, data: Record<string, unknown>): void {
    try {
      server.sendLoggingMessage({ level, logger, data }).catch((error: unknown) => {
        internalLogger.debug('Failed to send MCP notification', {
          level,
          logger,
          error: getErrorMessage(error),
        });
      });
    } catch (error: unknown) {
      internalLogger.debug('Failed to send MCP notification', {
        level,
        logger,
        error: getErrorMessage(error),
      });
    }
  }

  return {
    info: (logger, data) => {
      send('info', logger, data);
    },
    debug: (logger, data) => {
      send('debug', logger, data);
    },
    warn: (logger, data) => {
      send('warning', logger, data);
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
 * Always sends logging notifications for observability regardless.
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

    // Always send logging notification for observability
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
