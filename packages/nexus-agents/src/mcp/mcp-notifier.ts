/**
 * nexus-agents/mcp - MCP Notification Helper
 *
 * Sends structured logging notifications to MCP clients via
 * the `notifications/message` protocol method.
 * Clients (e.g., Claude Code) can display these for real-time
 * observability of orchestration events.
 *
 * @module mcp/mcp-notifier
 * (Source: Issue #973, #974 — Claude Code Observability)
 * (Source: MCP Protocol 2025-11-25, Logging Specification)
 */

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

/**
 * Wraps an async operation with periodic heartbeat notifications.
 * Sends "still working" logging messages every `intervalMs` to provide
 * observability into long-running tool execution.
 *
 * Note: These are logging notifications (notifications/message), not
 * progress notifications (notifications/progress with progressToken).
 * Full progressToken support tracked in Issue #976.
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

  const timer = setInterval(() => {
    beatCount++;
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    notifier.debug(toolName, {
      event: 'heartbeat',
      elapsedSeconds: elapsed,
      beatCount,
    });
  }, intervalMs);

  try {
    return await operation();
  } finally {
    clearInterval(timer);
  }
}
