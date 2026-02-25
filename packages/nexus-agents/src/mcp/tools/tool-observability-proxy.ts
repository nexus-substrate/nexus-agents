/**
 * Tool Observability Proxy for MCP Server
 *
 * Creates a Proxy around McpServer that wraps every tool callback
 * to emit tool.invoked / tool.completed events to the pipeline EventBus.
 *
 * Zero-change integration: existing tool registration functions
 * don't need modification — observability is injected transparently.
 *
 * @module mcp/tools/tool-observability-proxy
 * (Source: Issue #1186 — Extend EventBus observability to MCP tools)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IEventBus } from '../../pipeline/event-types.js';
import { getTimeProvider } from '../../core/index.js';

/** Counter for generating unique invocation IDs. */
let invocationCounter = 0;

/** Reset counter (for testing). */
export function resetInvocationCounter(): void {
  invocationCounter = 0;
}

/** Simplified callback type matching MCP tool handler signature. */
type ToolCallback = (args: unknown, extra: unknown) => Promise<unknown>;

/** Simplified tool config. */
interface ToolConfig {
  readonly title?: string;
  readonly description?: string;
  readonly inputSchema?: unknown;
  readonly outputSchema?: unknown;
  readonly annotations?: unknown;
}

/**
 * Creates a Proxy around McpServer that wraps tool callbacks
 * to emit observability events to the pipeline EventBus.
 *
 * Events emitted:
 * - `tool.invoked` — when a tool handler starts executing
 * - `tool.completed` — when a tool handler finishes (success or error)
 */
export function createToolObservabilityProxy(server: McpServer, eventBus: IEventBus): McpServer {
  return new Proxy(server, {
    get(target: McpServer, prop: string | symbol, receiver: unknown): unknown {
      if (prop === 'registerTool') {
        return (name: string, config: ToolConfig, cb: ToolCallback): unknown => {
          const wrappedCb = wrapWithObservability(name, cb, eventBus);
          return target.registerTool(name, config as never, wrappedCb as never);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

/** Wraps a tool callback to emit EventBus events. */
function wrapWithObservability(
  toolName: string,
  cb: ToolCallback,
  eventBus: IEventBus
): ToolCallback {
  return async (args: unknown, extra: unknown): Promise<unknown> => {
    const invocationId = `tool-${String(++invocationCounter)}`;
    const startTime = getTimeProvider().now();

    eventBus.emit({
      type: 'tool.invoked',
      timestamp: startTime,
      toolName,
      invocationId,
    });

    try {
      const result = await cb(args, extra);
      const durationMs = getTimeProvider().now() - startTime;

      eventBus.emit({
        type: 'tool.completed',
        timestamp: getTimeProvider().now(),
        toolName,
        invocationId,
        durationMs,
        success: true,
      });

      return result;
    } catch (error: unknown) {
      const durationMs = getTimeProvider().now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      eventBus.emit({
        type: 'tool.completed',
        timestamp: getTimeProvider().now(),
        toolName,
        invocationId,
        durationMs,
        success: false,
        errorMessage,
      });

      throw error;
    }
  };
}
