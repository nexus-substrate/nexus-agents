/**
 * nexus-agents/mcp - Centralized Middleware Chain
 *
 * Provides a composable middleware chain for MCP tools with guaranteed
 * execution order: metrics → audit → rate-limit → validation → policy →
 * timeout → handler. There is NO auth stage in this chain: authentication
 * lives in `auth-handler.ts` and is wired separately.
 *
 * `policy` (PolicyFirewall) is the only authorization stage this chain can
 * mount, and the production wrapper (`wrapToolWithTimeout`) does not mount
 * even that — authorization for a registered tool runs inside
 * `createSecureHandler` against the process PolicyFirewall. The ClawGuard
 * access-policy stage that used to sit after `policy` was deleted in #5107
 * (#5022 decision, epic #5105): it read its policy from an AsyncLocalStorage
 * store no inbound request ever populated, and the deriver that filled that
 * store went in #5108. The chain reports the stages it built at debug level so
 * that composition is observable rather than inferred;
 * `single-authorization-mechanism.test.ts` pins it.
 *
 * @module mcp/middleware/middleware-chain
 * (Source: Issue #189 - Centralized MCP middleware chain)
 */

import type { z } from 'zod';
import type { ILogger } from '../../core/index.js';
import { createLogger, getTimeProvider } from '../../core/index.js';
import { validateToolInput } from './validation.js';
import { RateLimiter, type RateLimiterConfig } from './rate-limiter.js';
import { type IPolicyFirewall, type ExecutionMode, createPolicyContext } from './policy.js';
import { TimeoutGuard, type TimeoutGuardConfig } from './timeout-guard.js';
import { getGlobalExecutionMode } from './policy-registry.js';
import { MCP_TIMEOUTS } from '../../config/timeouts.js';
import {
  createRequestContext,
  contextForLogging,
  runWithRequestContext,
  type RequestContext,
} from './request-context.js';
import { createMetricsMiddleware } from './tool-metrics.js';
import { abortSignalStorage } from '../mcp-notifier.js';
import { toolStructuredError } from '../tools/tool-result.js';
import type { ErrorCategory } from '../error-envelope.js';

/**
 * MCP tool result type.
 *
 * This interface is structurally compatible with the MCP SDK's CallToolResult.
 * The content array accepts text content for simplicity, while remaining
 * compatible with the SDK's broader ContentBlock type at runtime.
 */
export interface ToolResult {
  /** Content blocks returned by the tool (text content) */
  content: Array<{ type: 'text'; text: string }>;
  /** Whether this represents an error result */
  isError?: boolean;
  /** Structured output for SDK outputSchema validation (Issue #1117) */
  structuredContent?: Record<string, unknown>;
  /** Out-of-band metadata — carries the #2649 error envelope on errors. */
  _meta?: Record<string, unknown>;
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
  schema?: z.ZodType;
  /** Policy firewall instance (optional) */
  policyFirewall?: IPolicyFirewall | undefined;
  /** Execution mode for policy evaluation (default: the registry's process-wide mode, #6431) */
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
 * Creates an error result with the structured error envelope (#2649).
 * Each middleware passes the category that matches its failure mode.
 */
function errorResult(category: ErrorCategory, message: string, requestId: string): ToolResult {
  return toolStructuredError({
    errorCategory: category,
    message: `${message} (request: ${requestId})`,
  });
}

/**
 * Creates validation middleware.
 */
function createValidationMiddleware(schema: z.ZodType): Middleware {
  return async (args, ctx, next) => {
    const result = validateToolInput(schema, args);
    if (!result.ok) {
      ctx.logger.warn('Validation failed', {
        error: result.error.message,
      });
      return errorResult(
        'validation',
        `Validation error: ${result.error.message}`,
        ctx.requestContext.requestId
      );
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
      return errorResult(
        'permission',
        `Policy denied: ${decision.reason}`,
        ctx.requestContext.requestId
      );
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
        'transient',
        `Rate limit exceeded. Try again in ${String(state.nextTokenMs)}ms`,
        ctx.requestContext.requestId
      );
    }
    return next(args, ctx);
  };
}

/**
 * Creates timeout middleware.
 * Reads AbortSignal from AsyncLocalStorage for client cancellation support.
 */
function createTimeoutMiddleware(guard: TimeoutGuard, toolName: string): Middleware {
  return async (args, ctx, next) => {
    const signal = abortSignalStorage.getStore();
    const result = await guard.execute(() => next(args, ctx), {
      operationName: toolName,
      ...(signal !== undefined ? { signal } : {}),
    });

    if (!result.ok) {
      ctx.logger.error('Operation timed out', undefined, {
        code: result.error.code,
        timeoutMs: result.error.timeoutMs,
      });
      // #3726 discoverability: append the per-tool hint (e.g. "retry in async
      // job-mode") so a sync long-running tool that hits its ceiling tells the
      // caller how to escape it. Absent hint → message unchanged.
      const hint = MCP_TIMEOUTS.perToolTimeoutHint[toolName];
      const message = hint !== undefined ? `${result.error.message} ${hint}` : result.error.message;
      // Timeout — transient, a retry with more headroom may succeed.
      return errorResult('transient', message, ctx.requestContext.requestId);
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
    const startTime = getTimeProvider().now();
    ctx.logger.info('Tool invocation started');

    try {
      const result = await next(args, ctx);
      const durationMs = getTimeProvider().now() - startTime;

      if (result.isError === true) {
        ctx.logger.warn('Tool execution completed with error', { durationMs });
      } else {
        ctx.logger.info('Tool execution completed', { durationMs });
      }
      return result;
    } catch (error) {
      const durationMs = getTimeProvider().now() - startTime;
      const message = error instanceof Error ? error.message : 'Unknown error';
      ctx.logger.error('Tool execution failed', error instanceof Error ? error : undefined, {
        durationMs,
      });
      return errorResult('internal', `Internal error: ${message}`, ctx.requestContext.requestId);
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

/**
 * A stage the chain mounts, named so the built stack can be reported.
 *
 * `policy` is the one authorization stage. Adding a name here that gates a
 * call is a #5022-class decision (which boundary authorizes, and with what),
 * not a refactor — `single-authorization-mechanism.test.ts` pins the list.
 */
type MiddlewareStageName = 'metrics' | 'audit' | 'rateLimit' | 'validation' | 'policy' | 'timeout';

interface MiddlewareStage {
  readonly name: MiddlewareStageName;
  readonly middleware: Middleware;
}

/** Helper: adds audit middleware if not skipped */
function addAuditMiddleware(stages: MiddlewareStage[], skip: MiddlewareSkipConfig): void {
  if (skip.audit !== true) {
    stages.push({ name: 'audit', middleware: createAuditMiddleware() });
  }
}

/** Helper: adds rate limit middleware if configured */
function addRateLimitMiddleware(
  stages: MiddlewareStage[],
  config: MiddlewareChainConfig,
  skip: MiddlewareSkipConfig
): void {
  if (skip.rateLimit !== true && config.rateLimiter !== undefined) {
    const limiter =
      config.rateLimiter instanceof RateLimiter
        ? config.rateLimiter
        : new RateLimiter(config.rateLimiter);
    stages.push({ name: 'rateLimit', middleware: createRateLimitMiddleware(limiter) });
  }
}

/** Helper: adds validation middleware if schema provided */
function addValidationMiddleware(
  stages: MiddlewareStage[],
  config: MiddlewareChainConfig,
  skip: MiddlewareSkipConfig
): void {
  if (skip.validation !== true && config.schema !== undefined) {
    stages.push({ name: 'validation', middleware: createValidationMiddleware(config.schema) });
  }
}

/** Helper: adds policy middleware if configured */
function addPolicyMiddleware(
  stages: MiddlewareStage[],
  config: MiddlewareChainConfig,
  skip: MiddlewareSkipConfig
): void {
  if (skip.policy !== true && config.policyFirewall !== undefined) {
    const mode = config.executionMode ?? getGlobalExecutionMode();
    stages.push({
      name: 'policy',
      middleware: createPolicyMiddleware(
        config.policyFirewall,
        config.toolName,
        mode,
        config.allowedPaths
      ),
    });
  }
}

/** Helper: adds timeout middleware if configured */
function addTimeoutMiddleware(
  stages: MiddlewareStage[],
  config: MiddlewareChainConfig,
  skip: MiddlewareSkipConfig
): void {
  if (skip.timeout !== true && config.timeout !== undefined) {
    const guard = new TimeoutGuard(config.timeout);
    stages.push({ name: 'timeout', middleware: createTimeoutMiddleware(guard, config.toolName) });
  }
}

/** Helper: builds the middleware stack, in execution order */
function buildMiddlewareStack(config: MiddlewareChainConfig): MiddlewareStage[] {
  const skip = config.skip ?? {};
  const stages: MiddlewareStage[] = [];

  stages.push({ name: 'metrics', middleware: createMetricsMiddleware() }); // Tool usage analytics (#1022)
  addAuditMiddleware(stages, skip);
  addRateLimitMiddleware(stages, config, skip);
  addValidationMiddleware(stages, config, skip);
  addPolicyMiddleware(stages, config, skip);
  addTimeoutMiddleware(stages, config, skip);

  return stages;
}

/**
 * Creates a middleware chain with the standard execution order.
 *
 * Order: metrics → audit → rate-limit → validation → policy → timeout → handler
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
  const stages = buildMiddlewareStack(config);
  // The built composition, from the array that is actually composed. This is
  // the record a test (or an operator at debug level) reads to know what sits
  // on the dispatch boundary for a tool — a stage cannot be mounted without
  // appearing here (#5107).
  logger.debug('Middleware chain built', {
    toolName: config.toolName,
    stages: stages.map((stage) => stage.name),
  });
  const composed = composeMiddleware(stages.map((stage) => stage.middleware));

  return (handler: ContextAwareToolHandler): ToolHandler => {
    return async (args: unknown): Promise<ToolResult> => {
      const requestContext = createRequestContext({ toolName: config.toolName });
      const requestLogger = logger.child(contextForLogging(requestContext));
      const ctx: MiddlewareContext = { requestContext, logger: requestLogger };
      // Publish the context ambiently so inner layers adopt it instead of
      // minting a second one (#4981). Argument threading cannot reach them:
      // createSecureHandler returns a 1-arity function, so the dispatch in
      // `withMiddleware` below drops ctx, and some tools put a 1-arity
      // prerequisite wrapper between the two layers as well.
      return runWithRequestContext(requestContext, () =>
        composed(args, ctx, (finalArgs, finalCtx) => handler(finalArgs, finalCtx))
      );
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
      return handler(args, ctx);
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
  schema?: z.ZodType
) => ToolHandler {
  return (toolName, handler, schema) => {
    const options = schema !== undefined ? { ...sharedConfig, schema } : sharedConfig;
    return withMiddleware(toolName, handler, options);
  };
}
