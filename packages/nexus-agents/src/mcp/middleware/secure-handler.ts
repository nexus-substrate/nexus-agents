/**
 * nexus-agents/mcp - Secure Handler Middleware
 *
 * Higher-order function that wraps MCP tool handlers with security middleware:
 * - RequestContext creation and tracking
 * - PolicyFirewall evaluation
 * - Logging with request context
 *
 * (Source: Issue #185 Phase 1 - PolicyFirewall integration)
 *
 * @module mcp/middleware/secure-handler
 */

import type { ILogger } from '../../core/index.js';
import { createLogger } from '../../core/index.js';
import {
  createRequestContext,
  contextForLogging,
  type RequestContext,
  type CallerInfo,
} from './request-context.js';
import { type IPolicyFirewall, type ExecutionMode, createPolicyContext } from './policy.js';
import type { RateLimiter } from './rate-limiter.js';

/**
 * MCP tool result type.
 */
export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Tool handler function signature.
 */
export type ToolHandler = (args: unknown) => Promise<ToolResult>;

/**
 * Configuration for the secure handler wrapper.
 */
export interface SecureHandlerConfig {
  /** Tool name for logging and policy evaluation */
  toolName: string;
  /** Policy firewall instance (optional - if not provided, policy checks are skipped) */
  policyFirewall?: IPolicyFirewall;
  /** Execution mode for policy evaluation */
  executionMode?: ExecutionMode;
  /** Allowed paths for file operations */
  allowedPaths?: readonly string[];
  /** Rate limiter instance (optional) */
  rateLimiter?: RateLimiter;
  /** Logger instance (optional - creates default if not provided) */
  logger?: ILogger;
  /** Caller information extractor (optional) */
  callerInfo?: CallerInfo;
}

/**
 * Extended handler context passed to the wrapped handler.
 */
export interface HandlerContext {
  /** Request context for this invocation */
  requestContext: RequestContext;
  /** Logger with request context attached */
  logger: ILogger;
}

/**
 * Tool handler with context signature.
 */
export type ContextAwareHandler = (args: unknown, ctx: HandlerContext) => Promise<ToolResult>;

/**
 * Creates a rate limit error response.
 */
function rateLimitError(nextTokenMs: number): ToolResult {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: `Rate limit exceeded. Try again in ${String(nextTokenMs)}ms.`,
      },
    ],
  };
}

/**
 * Creates a policy denial error response.
 */
function policyDeniedError(reason: string, requestId: string): ToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: `Policy denied: ${reason} (request: ${requestId})` }],
  };
}

/**
 * Creates an internal error response.
 */
function internalError(message: string, requestId: string): ToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: `Internal error: ${message} (request: ${requestId})` }],
  };
}

/**
 * Checks rate limiter and returns error if exceeded.
 */
function checkRateLimit(rateLimiter: RateLimiter, logger: ILogger): ToolResult | null {
  const acquired = rateLimiter.tryAcquire();
  if (!acquired) {
    const state = rateLimiter.getState();
    logger.warn('Rate limit exceeded');
    return rateLimitError(state.nextTokenMs);
  }
  return null;
}

/** Options for policy check */
interface PolicyCheckOptions {
  firewall: IPolicyFirewall;
  toolName: string;
  args: unknown;
  mode: ExecutionMode;
  allowedPaths?: readonly string[] | undefined;
  logger: ILogger;
  requestId: string;
}

/**
 * Evaluates policy firewall and returns error if denied.
 */
function checkPolicy(opts: PolicyCheckOptions): ToolResult | null {
  const ctxOpts = {
    mode: opts.mode,
    ...(opts.allowedPaths && { allowedPaths: opts.allowedPaths }),
  };
  const decision = opts.firewall.evaluate(createPolicyContext(opts.toolName, opts.args, ctxOpts));

  if (!decision.allowed) {
    opts.logger.warn('Policy denied tool execution', {
      reason: decision.reason,
      ruleName: decision.ruleName,
    });
    return policyDeniedError(decision.reason, opts.requestId);
  }
  opts.logger.debug('Policy check passed', { reason: decision.reason });
  return null;
}

/**
 * Executes handler and logs result.
 */
async function executeHandler(
  handler: ToolHandler | ContextAwareHandler,
  args: unknown,
  ctx: HandlerContext,
  logger: ILogger
): Promise<ToolResult> {
  const startTime = Date.now();
  const result =
    handler.length >= 2
      ? await (handler as ContextAwareHandler)(args, ctx)
      : await (handler as ToolHandler)(args);

  const durationMs = Date.now() - startTime;
  if (result.isError === true) {
    logger.warn('Tool execution completed with error', { durationMs });
  } else {
    logger.info('Tool execution completed', { durationMs });
  }
  return result;
}

/**
 * Wraps a tool handler with security middleware.
 *
 * @param handler - The original tool handler or context-aware handler
 * @param config - Security configuration
 * @returns Wrapped handler with security middleware
 */
export function createSecureHandler(
  handler: ToolHandler | ContextAwareHandler,
  config: SecureHandlerConfig
): ToolHandler {
  const logger = config.logger ?? createLogger({ tool: config.toolName });
  const mode = config.executionMode ?? 'read-only';

  return async (args: unknown): Promise<ToolResult> => {
    const ctxOpts = {
      toolName: config.toolName,
      ...(config.callerInfo && { caller: config.callerInfo }),
    };
    const requestContext = createRequestContext(ctxOpts);
    const requestLogger = logger.child(contextForLogging(requestContext));

    requestLogger.info('Tool invocation started');

    if (config.rateLimiter) {
      const rateLimitResult = checkRateLimit(config.rateLimiter, requestLogger);
      if (rateLimitResult) return rateLimitResult;
    }

    if (config.policyFirewall) {
      const policyResult = checkPolicy({
        firewall: config.policyFirewall,
        toolName: config.toolName,
        args,
        mode,
        allowedPaths: config.allowedPaths,
        logger: requestLogger,
        requestId: requestContext.requestId,
      });
      if (policyResult) return policyResult;
    }

    try {
      return await executeHandler(
        handler,
        args,
        { requestContext, logger: requestLogger },
        requestLogger
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      requestLogger.error('Tool execution failed', error instanceof Error ? error : undefined);
      return internalError(message, requestContext.requestId);
    }
  };
}

/**
 * Creates a secure handler factory with shared configuration.
 * Useful for registering multiple tools with the same security settings.
 *
 * @param sharedConfig - Shared security configuration
 * @returns Factory function for creating secure handlers
 */
export function createSecureHandlerFactory(
  sharedConfig: Omit<SecureHandlerConfig, 'toolName'>
): (toolName: string, handler: ToolHandler | ContextAwareHandler) => ToolHandler {
  return (toolName: string, handler: ToolHandler | ContextAwareHandler) =>
    createSecureHandler(handler, { ...sharedConfig, toolName });
}
