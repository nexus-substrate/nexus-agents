/**
 * MCP SDK Types Re-export
 *
 * Provides typed access to McpServer and related types from the SDK.
 *
 * @module mcp/sdk-types
 * (Source: Epic #4485 — MCP split v2 SDK migration Batch 1)
 */

export { McpServer } from '@modelcontextprotocol/server';
export type { ToolAnnotations } from './sdk-facade/index.js';

export interface RegisteredTool {
  disable(): void;
  update(config: Record<string, unknown>): void;
  [key: string]: unknown;
}
export type ToolCallback<Args = unknown> = (args: Args, extra: unknown) => unknown;

declare module '@modelcontextprotocol/server' {
  interface McpServer {
    /**
     * SDK v1 compatible registerTool overload.
     */
    registerTool<Args = unknown>(
      name: string,
      config: {
        description?: string;
        inputSchema?: unknown;
        outputSchema?: unknown;
        annotations?: unknown;
      },
      callback: ToolCallback<Args>
    ): RegisteredTool;
    /**
     * Experimental task registration surface (SDK v1 compatibility seam).
     */
    readonly experimental: {
      readonly tasks: {
        registerToolTask: (name: string, config: unknown, handler: unknown) => void;
        getTaskResult?: (taskId: string) => Promise<unknown>;
      };
    };
    /**
     * @deprecated Deprecated tool registration surface (SDK v1 compatibility seam).
     */
    tool(
      name: string,
      schema: unknown,
      handler: (args: Record<string, unknown>, extra: unknown) => unknown
    ): void;
  }
}
