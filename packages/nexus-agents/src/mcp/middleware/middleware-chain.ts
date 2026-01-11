/**
 * nexus-agents/mcp - Centralized Middleware Chain
 *
 * Provides a composable middleware chain for MCP tools with guaranteed
 * execution order: auth → validation → policy → rate-limit → timeout → audit
 *
 * @module mcp/middleware/middleware-chain
 * (Source: Issue #189 - Centralized MCP middleware chain)
 */

import type { ZodSchema } from 'zod';
import type { ILogger } from '../../core/index.js';
import { createLogger } from '../../core/index.js';
import { validateToolInput } from './validation.js';
import { RateLimiter, type RateLimiterConfig } from './rate-limiter.js';
import { type IPolicyFirewall, type ExecutionMode, createPolicyContext } from './policy.js';
import { TimeoutGuard, type TimeoutGuardConfig } from './timeout-guard.js';
import { createRequestContext, contextForLogging, type RequestContext } from './request-context.js';

/**
 * MCP tool result type.
 */
export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Middleware context passed through the chain.
 */
export interface MiddlewareContext {
  /** Unique request ID for tracing */
  readonly requestContext: RequestContext;
  /** Logger with request context */
  readonly logger: ILogger;
  /** Validated arguments (set after validation middleware) */
  validatedArgs?: unknown;
}

/**
 * Middleware function signature.
 * Each middleware receives the context and a next function to call.
 */
export type Middleware = (
  args: unknown,
  ctx: MiddlewareContext,
  next: (args: unknown, ctx: MiddlewareContext) => Promise<ToolResult>
) => Promise<ToolResult>;

/**
 * Configuration for the middleware chain.
 */
export interface MiddlewareChainConfig {
  /** Tool name for logging and policy evaluation */
  toolName: string;
  /** Zod schema for input validation (optional) */
  schema?: ZodSchema;
  /** Policy firewall instance (optional) */
  policyFirewall?: IPolicyFirewall | undefined;
  /** Execution mode for policy evaluation */
  executionMode?: ExecutionMode | undefined;
  /** Allowed paths for file operations */
  allowedPaths?: readonly string[] | undefined;
  /** Rate limiter configuration (optional) */
  rateLimiter?: RateLimiterConfig | RateLimiter | undefined;
  /** Timeout configuration (optional) */
  timeout?: TimeoutGuardConfig | undefined;
  /** Logger instance (optional) */
  logger?: ILogger | undefined;
  /** Skip specific middleware steps */
  skip?: MiddlewareSkipConfig | undefined;
}

/**
 * Configuration for skipping middleware steps.
 */
export interface MiddlewareSkipConfig {
  validation?: boolean | undefined;
  policy?: boolean | undefined;
  rateLimit?: boolean | undefined;
  timeout?: boolean | undefined;
  audit?: boolean | undefined;
}

/**
 * Tool handler function signature.
 */
export type ToolHandler = (args: unknown) => Promise<ToolResult>;

/**
 * Context-aware handler that receives middleware context.
 */
export type ContextAwareToolHandler = (
  args: unknown,
  ctx: MiddlewareContext
) => Promise<ToolResult>;

/**
 * Creates an error result with MCP format.
 */
function errorResult(message: string, requestId: string): ToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: `${message} (request: ${requestId})` }],
  };
}

/**
 * Creates validation middleware.
 */
function createValidationMiddleware(schema: ZodSchema): Middleware {
  return async (args, ctx, next) => {
    const result = validateToolInput(schema, args);
    if (!result.ok) {
      ctx.logger.warn('Validation failed', {
        error: result.error.message,
      });
      return errorResult(`Validation error: ${result.error.message}`, ctx.requestContext.requestId);
    }
    ctx.validatedArgs = result.value;
    return next(result.value, ctx);
  };
}

/**
 * Creates policy middleware.
 */
function createPolicyMiddleware(
  firewall: IPolicyFirewall,
  toolName: string,
  mode: ExecutionMode,
  allowedPaths?: readonly string[]
): Middleware {
  return async (args, ctx, next) => {
    const policyCtx = createPolicyContext(toolName, args, {
      mode,
      ...(allowedPaths !== undefined && { allowedPaths }),
    });
    const decision = firewall.evaluate(policyCtx);

    if (!decision.allowed) {
      ctx.logger.warn('Policy denied', {
        reason: decision.reason,
        ruleName: decision.ruleName,
      });
      return errorResult(`Policy denied: ${decision.reason}`, ctx.requestContext.requestId);
    }
    ctx.logger.debug('Policy check passed', { reason: decision.reason });
    return next(args, ctx);
  };
}

/**
 * Creates rate limit middleware.
 */
function createRateLimitMiddleware(limiter: RateLimiter): Middleware {
  return async (args, ctx, next) => {
    const acquired = limiter.tryAcquire();
    if (!acquired) {
      const state = limiter.getState();
      ctx.logger.warn('Rate limit exceeded', {
        nextTokenMs: state.nextTokenMs,
      });
      return errorResult(
        `Rate limit exceeded. Try again in ${String(state.nextTokenMs)}ms`,
        ctx.requestContext.requestId
      );
    }
    return next(args, ctx);
  };
}

/**
 * Creates timeout middleware.
 */
function createTimeoutMiddleware(guard: TimeoutGuard, toolName: string): Middleware {
  return async (args, ctx, next) => {
    const result = await guard.execute(() => next(args, ctx), { operationName: toolName });

    if (!result.ok) {
      ctx.logger.error('Operation timed out', undefined, {
        code: result.error.code,
        timeoutMs: result.error.timeoutMs,
      });
      return errorResult(result.error.message, ctx.requestContext.requestId);
    }

    if (result.value.nearTimeout) {
      ctx.logger.warn('Operation completed near timeout threshold', {
        durationMs: result.value.durationMs,
      });
    }

    return result.value.value;
  };
}

/**
 * Creates audit middleware that logs start/end of request.
 */
function createAuditMiddleware(): Middleware {
  return async (args, ctx, next) => {
    const startTime = Date.now();
    ctx.logger.info('Tool invocation started');

    try {
      const result = await next(args, ctx);
      const durationMs = Date.now() - startTime;

      if (result.isError === true) {
        ctx.logger.warn('Tool execution completed with error', { durationMs });
      } else {
        ctx.logger.info('Tool execution completed', { durationMs });
      }
      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const message = error instanceof Error ? error.message : 'Unknown error';
      ctx.logger.error('Tool execution failed', error instanceof Error ? error : undefined, {
        durationMs,
      });
      return errorResult(`Internal error: ${message}`, ctx.requestContext.requestId);
    }
  };
}

/**
 * Composes multiple middleware functions into a single chain.
 */
function composeMiddleware(middlewares: Middleware[]): Middleware {
  return (args, ctx, finalHandler) => {
    const dispatch = (index: number, currentArgs: unknown): Promise<ToolResult> => {
      if (index >= middlewares.length) {
        return finalHandler(currentArgs, ctx);
      }
      const middleware = middlewares[index];
      if (middleware === undefined) {
        return finalHandler(currentArgs, ctx);
      }
      return middleware(currentArgs, ctx, (nextArgs) => dispatch(index + 1, nextArgs));
    };
    return dispatch(0, args);
  };
}

/** Helper: adds audit middleware if not skipped */
function addAuditMiddleware(middlewares: Middleware[], skip: MiddlewareSkipConfig): void {
  if (skip.audit !== true) {
    middlewares.push(createAuditMiddleware());
  }
}

/** Helper: adds rate limit middleware if configured */
function addRateLimitMiddleware(
  middlewares: Middleware[],
  config: MiddlewareChainConfig,
  skip: MiddlewareSkipConfig
): void {
  if (skip.rateLimit !== true && config.rateLimiter !== undefined) {
    const limiter =
      config.rateLimiter instanceof RateLimiter
        ? config.rateLimiter
        : new RateLimiter(config.rateLimiter);
    middlewares.push(createRateLimitMiddleware(limiter));
  }
}

/** Helper: adds validation middleware if schema provided */
function addValidationMiddleware(
  middlewares: Middleware[],
  config: MiddlewareChainConfig,
  skip: MiddlewareSkipConfig
): void {
  if (skip.validation !== true && config.schema !== undefined) {
    middlewares.push(createValidationMiddleware(config.schema));
  }
}

/** Helper: adds policy middleware if configured */
function addPolicyMiddleware(
  middlewares: Middleware[],
  config: MiddlewareChainConfig,
  skip: MiddlewareSkipConfig
): void {
  if (skip.policy !== true && config.policyFirewall !== undefined) {
    const mode = config.executionMode ?? 'read-only';
    middlewares.push(
      createPolicyMiddleware(config.policyFirewall, config.toolName, mode, config.allowedPaths)
    );
  }
}

/** Helper: adds timeout middleware if configured */
function addTimeoutMiddleware(
  middlewares: Middleware[],
  config: MiddlewareChainConfig,
  skip: MiddlewareSkipConfig
): void {
  if (skip.timeout !== true && config.timeout !== undefined) {
    const guard = new TimeoutGuard(config.timeout);
    middlewares.push(createTimeoutMiddleware(guard, config.toolName));
  }
}

/** Helper: builds the middleware stack */
function buildMiddlewareStack(config: MiddlewareChainConfig): Middleware[] {
  const skip = config.skip ?? {};
  const middlewares: Middleware[] = [];

  addAuditMiddleware(middlewares, skip);
  addRateLimitMiddleware(middlewares, config, skip);
  addValidationMiddleware(middlewares, config, skip);
  addPolicyMiddleware(middlewares, config, skip);
  addTimeoutMiddleware(middlewares, config, skip);

  return middlewares;
}

/**
 * Creates a middleware chain with the standard execution order.
 *
 * Order: audit → rate-limit → validation → policy → timeout → handler
 *
 * Audit wraps everything to capture timing. Rate limit is checked early
 * to reject requests before expensive validation. Timeout wraps the
 * actual handler execution.
 *
 * @param config - Chain configuration
 * @returns A function that wraps handlers with the middleware chain
 */
export function createMiddlewareChain(
  config: MiddlewareChainConfig
): (handler: ContextAwareToolHandler) => ToolHandler {
  const logger = config.logger ?? createLogger({ tool: config.toolName });
  const middlewares = buildMiddlewareStack(config);
  const composed = composeMiddleware(middlewares);

  return (handler: ContextAwareToolHandler): ToolHandler => {
    return async (args: unknown): Promise<ToolResult> => {
      const requestContext = createRequestContext({ toolName: config.toolName });
      const requestLogger = logger.child(contextForLogging(requestContext));
      const ctx: MiddlewareContext = { requestContext, logger: requestLogger };
      return composed(args, ctx, (finalArgs, finalCtx) => handler(finalArgs, finalCtx));
    };
  };
}

/**
 * Convenience function to wrap a handler with default middleware.
 *
 * @param toolName - Name of the tool
 * @param handler - The tool handler
 * @param options - Optional middleware configuration
 * @returns Wrapped handler with middleware
 */
export function withMiddleware(
  toolName: string,
  handler: ContextAwareToolHandler | ToolHandler,
  options?: Partial<Omit<MiddlewareChainConfig, 'toolName'>>
): ToolHandler {
  // Note: Policy firewall is NOT added by default - must be explicitly configured
  // This follows the principle of minimal defaults with explicit opt-in for security
  const config: MiddlewareChainConfig = {
    toolName,
    ...options,
  };

  const chain = createMiddlewareChain(config);

  // Wrap handler to support both signatures
  const wrappedHandler: ContextAwareToolHandler = (args, ctx) => {
    // Check if handler expects context (2 params)
    if (handler.length >= 2) {
      return (handler as ContextAwareToolHandler)(args, ctx);
    }
    return (handler as ToolHandler)(args);
  };

  return chain(wrappedHandler);
}

/**
 * Creates a middleware chain factory with shared configuration.
 *
 * @param sharedConfig - Configuration shared across all tools
 * @returns Factory function for creating wrapped handlers
 */
export function createMiddlewareFactory(
  sharedConfig: Omit<MiddlewareChainConfig, 'toolName' | 'schema'>
): (
  toolName: string,
  handler: ContextAwareToolHandler | ToolHandler,
  schema?: ZodSchema
) => ToolHandler {
  return (toolName, handler, schema) => {
    const options = schema !== undefined ? { ...sharedConfig, schema } : sharedConfig;
    return withMiddleware(toolName, handler, options);
  };
}
