/**
 * Gateway Server Proxy
 *
 * Creates a proxy around McpServer that intercepts `registerTool()` calls
 * and wraps all tool callbacks with gateway tier-aware dispatch logging.
 *
 * This allows zero-change integration: existing tool registration functions
 * are unmodified — the gateway wrapping is applied transparently.
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
 * Returns a function matching the `registerTool` signature that wraps
 * the callback argument with gateway tier dispatch before delegating
 * to the real server.
 */
function createWrappedRegisterTool(
  server: McpServer,
  gateway: GatewayInstance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): (...args: any[]) => any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (name: string, config: any, cb: any): any => {
    if (typeof cb !== 'function') {
      // Pass through if no callback (shouldn't happen in our codebase)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return server.registerTool(name, config, cb);
    }

    // Wrap SDK callback: (args, extra) => result
    // Gateway wrapTool expects (args) => result, so we adapt per-invocation
    // to preserve `extra` passthrough for forward compatibility.
    const wrappedCb = (args: unknown, extra: unknown): Promise<GatewayToolResult> => {
      const innerHandler = (a: unknown): Promise<GatewayToolResult> =>
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        cb(a, extra) as Promise<GatewayToolResult>;
      return gateway.wrapTool(name, innerHandler)(args);
    };

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
    return server.registerTool(name, config, wrappedCb as any);
  };
}
