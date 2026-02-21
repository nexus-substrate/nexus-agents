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
import { MCP_TIMEOUTS } from '../../config/timeouts.js';
import { progressContextStorage, type ProgressContext } from '../mcp-notifier.js';
import { createLogger as createInternalLogger, getErrorMessage } from '../../core/index.js';

/**
 * Default timeout configuration.
 * Values sourced from config/timeouts.ts (Issue #984).
 */
export const DEFAULT_TIMEOUT_CONFIG: TimeoutConfig = {
  defaultTimeoutMs: MCP_TIMEOUTS.defaultMs,
  maxTimeoutMs: MCP_TIMEOUTS.maxMs,
  enableLogging: true,
  uriValidation: true,
};

/**
 * Default per-tool timeout overrides.
 * Sourced from config/timeouts.ts (Issue #984).
 */
export const DEFAULT_TOOL_TIMEOUTS: Record<string, number> = {
  ...MCP_TIMEOUTS.perTool,
};

/**
 * Resolves the timeout for a specific tool.
 * Priority: explicit override > security config perToolTimeout > DEFAULT_TOOL_TIMEOUTS > global default.
 * (Issue #657 - Per-tool timeout configuration)
 */
export function getToolTimeout(
  toolName: string,
  security?: SecurityConfig,
  explicitMs?: number
): number {
  // Explicit override takes highest priority
  if (explicitMs !== undefined) {
    return explicitMs;
  }
  // Check security config per-tool overrides
  const perToolConfig = security?.timeout?.perToolTimeout;
  const perToolMs = perToolConfig?.[toolName];
  if (perToolMs !== undefined) {
    return perToolMs;
  }
  // Check built-in per-tool defaults
  const builtInDefault = DEFAULT_TOOL_TIMEOUTS[toolName];
  if (builtInDefault !== undefined) {
    return builtInDefault;
  }
  // Fall back to global default
  return security?.timeout?.defaultTimeoutMs ?? DEFAULT_TIMEOUT_CONFIG.defaultTimeoutMs;
}

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

/** Shape of the MCP SDK's extra._meta for progress tokens. */
interface SdkMeta {
  readonly progressToken?: string | number;
}

/** Shape of the MCP SDK's extra object passed to tool handlers. */
interface SdkExtra {
  readonly _meta?: SdkMeta;
  readonly sendNotification?: (notification: {
    method: string;
    params?: Record<string, unknown>;
  }) => Promise<void>;
}

const wrapperLogger = createInternalLogger({ component: 'tool-wrapper' });

/** Extract progress context from MCP SDK extra if progressToken present. */
function extractProgressContext(extra: unknown): ProgressContext | undefined {
  const sdk = extra as SdkExtra | undefined;
  const token = sdk?._meta?.progressToken;
  const sendFn = sdk?.sendNotification;
  if (token === undefined || sendFn === undefined) return undefined;

  return {
    progressToken: token,
    sendNotification: (progress: number, total?: number) => {
      const params: Record<string, unknown> = {
        progressToken: token,
        progress,
      };
      if (total !== undefined) params['total'] = total;
      sendFn({ method: 'notifications/progress', params }).catch((err: unknown) => {
        wrapperLogger.debug('Failed to send progress notification', {
          error: getErrorMessage(err),
        });
      });
    },
  };
}

/**
 * Adapts a ToolHandler to the MCP SDK's expected callback signature.
 *
 * When the client provides a progressToken in _meta, runs the handler
 * within an AsyncLocalStorage context so withProgressHeartbeat can
 * send real progress notifications that reset the client timeout.
 *
 * @param handler - Our internal ToolHandler
 * @returns SDK-compatible callback function
 */
export function toSdkCallback(
  handler: ToolHandler
): (
  args: unknown,
  extra: unknown
) => Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  return async (args: unknown, extra: unknown) => {
    const progressCtx = extractProgressContext(extra);

    // Run within progress context if progressToken is available
    if (progressCtx !== undefined) {
      return progressContextStorage.run(progressCtx, () => handler(args));
    }

    return handler(args);
  };
}

/**
 * Re-export middleware factory for advanced use cases.
 */
export { createMiddlewareFactory, withMiddleware };
