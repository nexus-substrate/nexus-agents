/**
 * Annotation Proxy for MCP Server
 *
 * Creates a Proxy around McpServer that auto-injects tool annotations
 * from the canonical TOOL_ANNOTATIONS registry into every registerTool call.
 *
 * This allows zero-change integration: existing tool registration functions
 * don't need to know about annotations — they're injected transparently.
 *
 * @module mcp/tools/annotation-proxy
 * (Source: Issue #993 — Document MCP tool side effects in schema metadata)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getMcpAnnotations } from './tool-annotations.js';

/** Simplified tool config — matches the shape of registerTool's config param. */
interface ToolConfig {
  readonly title?: string;
  readonly description?: string;
  readonly inputSchema?: unknown;
  readonly outputSchema?: unknown;
  readonly annotations?: unknown;
  readonly _meta?: Record<string, unknown>;
}

/** Simplified callback type. */
type ToolCallback = (args: unknown, extra: unknown) => Promise<unknown>;

/**
 * Creates a Proxy around McpServer that auto-injects MCP annotations
 * from TOOL_ANNOTATIONS into every registerTool call.
 *
 * If the tool already has annotations set, they are preserved (no override).
 */
export function createAnnotationsProxy(server: McpServer): McpServer {
  return new Proxy(server, {
    get(target: McpServer, prop: string | symbol, receiver: unknown): unknown {
      if (prop === 'registerTool') {
        return (name: string, config: ToolConfig, cb: ToolCallback): unknown => {
          const annotations = getMcpAnnotations(name);
          const enrichedConfig =
            annotations !== undefined && config.annotations === undefined
              ? { ...config, annotations }
              : config;

          // SDK generic boundary: registerTool uses overloaded signatures that can't be matched from Proxy
          return target.registerTool(name, enrichedConfig as never, cb as never);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}
