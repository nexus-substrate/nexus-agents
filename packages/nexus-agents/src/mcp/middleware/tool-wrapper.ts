/**
 * nexus-agents/mcp - Tool Wrapper Helper
 *
 * Provides a convenient wrapper for MCP tools that automatically applies
 * the middleware chain with timeout protection (CVE-2026-0621 mitigation).
 *
 * @module mcp/middleware/tool-wrapper
 * (Source: Issue #271, CVE-2026-0621 mitigation)
 */

import type { ILogger } from '../../core/index.js';
import type { TimeoutConfig, SecurityConfig } from '../../config/schemas.js';
import type { IPolicyFirewall, ExecutionMode } from './policy.js';
import type { RateLimiterConfig } from './rate-limiter.js';
import { RateLimiter } from './rate-limiter.js';
import {
  withMiddleware,
  createMiddlewareFactory,
  type ToolHandler,
  type ContextAwareToolHandler,
  type MiddlewareChainConfig,
} from './middleware-chain.js';

/**
 * Default timeout configuration (30s default, 5min max).
 * Used when no config is provided.
 */
export const DEFAULT_TIMEOUT_CONFIG: TimeoutConfig = {
  defaultTimeoutMs: 30_000,
  maxTimeoutMs: 300_000,
  enableLogging: true,
  uriValidation: true,
};

/**
 * Configuration for creating a tool factory.
 */
export interface ToolFactoryConfig {
  /** Logger instance */
  logger?: ILogger | undefined;
  /** Security configuration (includes timeout config) */
  security?: SecurityConfig | undefined;
  /** Policy firewall instance */
  policyFirewall?: IPolicyFirewall | undefined;
  /** Rate limiter configuration */
  rateLimiter?: RateLimiterConfig | RateLimiter | undefined;
  /** Allowed paths for file operations */
  allowedPaths?: readonly string[] | undefined;
}

/**
 * Per-tool configuration options.
 */
export interface ToolWrapperOptions {
  /** Execution mode for policy evaluation (default: 'read-only') */
  executionMode?: ExecutionMode | undefined;
  /** Custom timeout in ms (overrides default) */
  timeoutMs?: number | undefined;
  /** Skip timeout protection (use sparingly) */
  skipTimeout?: boolean | undefined;
  /** Skip rate limiting */
  skipRateLimit?: boolean | undefined;
}

/**
 * Gets timeout configuration from security config or uses defaults.
 */
function getTimeoutConfig(
  security?: SecurityConfig,
  overrideMs?: number
): MiddlewareChainConfig['timeout'] {
  const timeoutConfig = security?.timeout ?? DEFAULT_TIMEOUT_CONFIG;

  return {
    defaultTimeoutMs: overrideMs ?? timeoutConfig.defaultTimeoutMs,
    maxTimeoutMs: timeoutConfig.maxTimeoutMs,
    enableLogging: timeoutConfig.enableLogging,
  };
}

/**
 * Creates a tool factory with shared configuration.
 *
 * This factory produces wrapped handlers that include timeout protection,
 * rate limiting, and other middleware as configured.
 *
 * @example
 * ```typescript
 * const wrapTool = createToolFactory({
 *   security: appConfig.security,
 *   rateLimiter: { capacity: 100, refillRate: 10 },
 * });
 *
 * const handler = wrapTool('my_tool', async (args) => {
 *   // Your tool logic here
 *   return { content: [{ type: 'text', text: 'Done' }] };
 * });
 * ```
 */
export function createToolFactory(
  config: ToolFactoryConfig
): (
  toolName: string,
  handler: ContextAwareToolHandler | ToolHandler,
  options?: ToolWrapperOptions
) => ToolHandler {
  const { security, policyFirewall, rateLimiter, allowedPaths, logger } = config;

  return (toolName, handler, options) => {
    const skip = {
      timeout: options?.skipTimeout,
      rateLimit: options?.skipRateLimit,
    };

    const chainConfig: Omit<MiddlewareChainConfig, 'toolName'> = {
      logger,
      policyFirewall,
      executionMode: options?.executionMode ?? 'read-only',
      allowedPaths,
      rateLimiter,
      timeout: skip.timeout === true ? undefined : getTimeoutConfig(security, options?.timeoutMs),
      skip,
    };

    return withMiddleware(toolName, handler, chainConfig);
  };
}

/**
 * Wraps a single tool handler with timeout protection.
 *
 * This is a convenience function for simple cases where you don't need
 * the full factory setup.
 *
 * @example
 * ```typescript
 * const handler = wrapToolWithTimeout('my_tool', async (args) => {
 *   return { content: [{ type: 'text', text: 'Done' }] };
 * });
 * ```
 */
export function wrapToolWithTimeout(
  toolName: string,
  handler: ContextAwareToolHandler | ToolHandler,
  options?: {
    timeoutMs?: number;
    logger?: ILogger;
  }
): ToolHandler {
  return withMiddleware(toolName, handler, {
    timeout: getTimeoutConfig(undefined, options?.timeoutMs),
    logger: options?.logger,
  });
}

/**
 * Adapts a ToolHandler to the MCP SDK's expected callback signature.
 *
 * The MCP SDK's registerTool expects a callback that receives (args, extra)
 * and returns CallToolResult. Our ToolHandler receives just args and returns
 * ToolResult. This adapter bridges the two types safely.
 *
 * @param handler - Our internal ToolHandler
 * @returns SDK-compatible callback function
 *
 * @example
 * ```typescript
 * const handler = wrapToolWithTimeout('my_tool', async (args) => {
 *   return { content: [{ type: 'text', text: 'Done' }] };
 * });
 * server.registerTool('my_tool', config, toSdkCallback(handler));
 * ```
 */
export function toSdkCallback(
  handler: ToolHandler
): (args: unknown, extra: unknown) => Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  return async (args: unknown, _extra: unknown) => {
    const result = await handler(args);
    // Our ToolResult is structurally compatible with CallToolResult
    return result;
  };
}

/**
 * Re-export middleware factory for advanced use cases.
 */
export { createMiddlewareFactory, withMiddleware };
