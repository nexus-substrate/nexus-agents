/**
 * Gateway Server Proxy
 *
 * Creates a proxy around McpServer that intercepts `registerTool()` calls
 * and wraps all tool callbacks with gateway tier-aware dispatch logging.
 *
 * This allows zero-change integration: existing tool registration functions
 * are unmodified — the gateway wrapping is applied transparently.
 *
 * NOTE: This module requires limited `any` escapes at the McpServer boundary
 * because `registerTool()` uses complex generics (`<OutputArgs, InputArgs>`)
 * that cannot be preserved through a JavaScript Proxy. Each escape is
 * documented with an eslint-disable comment explaining why.
 *
 * @module mcp/gateway/gateway-server-proxy
 * (Source: Issue #896, Epic #888)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  createGateway,
  type GatewayConfig,
  type GatewayInstance,
  type GatewayToolResult,
} from './gateway-middleware.js';

/** Simplified callback type — matches the runtime shape of SDK ToolCallback. */
type SdkCallback = (args: unknown, extra: unknown) => Promise<unknown>;

/** Simplified tool config — matches the shape of registerTool's config param. */
interface ToolRegistrationConfig {
  readonly title?: string;
  readonly description?: string;
  readonly inputSchema?: unknown;
  readonly outputSchema?: unknown;
  readonly annotations?: unknown;
  readonly _meta?: Record<string, unknown>;
}

/**
 * Creates a Proxy around McpServer that wraps all `registerTool()` callbacks
 * with gateway tier-aware dispatch logging.
 *
 * When the gateway is disabled (`enabled: false`), returns the original
 * server unchanged (zero overhead).
 */
export function createGatewayServerProxy(server: McpServer, config: GatewayConfig): McpServer {
  const gateway = createGateway(config);
  if (!gateway.enabled) return server;

  return new Proxy(server, {
    get(target: McpServer, prop: string | symbol, receiver: unknown): unknown {
      if (prop === 'registerTool') {
        return createWrappedRegisterTool(target, gateway);
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

/**
 * Returns a function that wraps the callback argument with gateway tier
 * dispatch before delegating to the real server's registerTool.
 *
 * Uses `any` at the final `server.registerTool()` call because the SDK
 * method has generic type parameters (`<OutputArgs, InputArgs>`) that
 * cannot be expressed through a Proxy interception. The runtime types
 * are validated by Zod schemas inside each tool handler.
 */
function createWrappedRegisterTool(
  server: McpServer,
  gateway: GatewayInstance
): (name: string, config: ToolRegistrationConfig, cb: SdkCallback) => unknown {
  return (name: string, config: ToolRegistrationConfig, cb: SdkCallback): unknown => {
    if (typeof cb !== 'function') {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- SDK generic boundary
      return server.registerTool(name, config as any, cb as any);
    }

    // Wrap SDK callback with gateway tier-aware dispatch.
    // Creates a per-invocation handler to preserve `extra` passthrough.
    const wrappedCb: SdkCallback = (args: unknown, extra: unknown): Promise<GatewayToolResult> => {
      const innerHandler = (a: unknown): Promise<GatewayToolResult> =>
        cb(a, extra) as Promise<GatewayToolResult>;
      return gateway.wrapTool(name, innerHandler)(args);
    };

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- SDK generic boundary: registerTool requires ToolCallback<InputArgs> which can't be constructed without the original generic context
    return server.registerTool(name, config as any, wrappedCb as any);
  };
}
