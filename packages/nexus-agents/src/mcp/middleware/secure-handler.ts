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
import { createLogger, getTimeProvider } from '../../core/index.js';
import {
  createRequestContext,
  contextForLogging,
  type RequestContext,
  type CallerInfo,
} from './request-context.js';
import { type IPolicyFirewall, type ExecutionMode, createPolicyContext } from './policy.js';
import type { RateLimiter } from './rate-limiter.js';
import type { IAuditLogger } from '../../audit/audit-types.js';
import { actorFromContext, resultToOutcome } from '../../audit/secure-handler-audit.js';
import { sanitizeToolInput, logSanitizationResult } from './tool-input-sanitizer.js';
import type { ToolResult } from '../tools/tool-result.js';

export type { ToolResult };

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
  /** Audit logger for structured audit trail (Issue #740 Phase 2) */
  auditLogger?: IAuditLogger;
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
 * Maximum input size for tool arguments (10MB).
 * Prevents memory exhaustion from oversized payloads.
 * (Source: Issue #740 - MCP security hardening)
 */
const MAX_INPUT_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Patterns that indicate leaked secrets in tool output.
 * Each pattern is tested against tool response text.
 */
const SECRET_PATTERNS: readonly RegExp[] = [
  // API keys with common prefixes
  /\b(sk-[a-zA-Z0-9]{20,})\b/,
  /\b(pk-[a-zA-Z0-9]{20,})\b/,
  // AWS-style keys
  /\b(AKIA[A-Z0-9]{16})\b/,
  // Bearer tokens in output
  /Bearer\s+[a-zA-Z0-9_\-.~+/]+=*/,
  // Generic long hex secrets (40+ chars)
  /\b[0-9a-f]{40,}\b/i,
  // password= or token= in output
  /(?:password|token|secret|apikey|api_key)\s*[=:]\s*\S{8,}/i,
];

/** Redact detected secrets from tool output text. */
function sanitizeOutput(text: string, logger: ILogger): string {
  let sanitized = text;
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(sanitized)) {
      logger.warn('Potential secret detected in tool output, redacting', {
        pattern: pattern.source.slice(0, 30),
      });
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }
  }
  return sanitized;
}

/** Sanitize all text content in a tool result (Issue #740). */
function sanitizeToolResult(result: ToolResult, logger: ILogger): void {
  for (const item of result.content) {
    item.text = sanitizeOutput(item.text, logger);
  }
}

/** Validates input size and returns error if too large. */
function checkInputSize(args: unknown, logger: ILogger, requestId: string): ToolResult | null {
  if (args === undefined) return null;
  const inputSize = JSON.stringify(args).length;
  if (inputSize > MAX_INPUT_SIZE_BYTES) {
    logger.warn('Input size exceeds limit', { inputSize, limit: MAX_INPUT_SIZE_BYTES });
    return internalError('Input too large', requestId);
  }
  return null;
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
  const startTime = getTimeProvider().now();
  const result =
    handler.length >= 2
      ? await (handler as ContextAwareHandler)(args, ctx)
      : await (handler as ToolHandler)(args);

  const durationMs = getTimeProvider().now() - startTime;
  if (result.isError === true) {
    logger.warn('Tool execution completed with error', { durationMs });
  } else {
    logger.info('Tool execution completed', { durationMs });
  }
  return result;
}

/** Emits an audit event for a completed tool invocation. */
function emitToolAudit(
  auditLogger: IAuditLogger,
  toolName: string,
  ctx: RequestContext,
  result: ToolResult,
  durationMs: number
): void {
  const actor = actorFromContext(ctx);
  const outcome = resultToOutcome(result.isError, false);
  auditLogger.logToolInvocation({
    toolName,
    outcome,
    actor,
    requestId: ctx.requestId,
    durationMs,
  });
}

/** Emits an audit event for a policy denial. */
function emitPolicyAudit(
  auditLogger: IAuditLogger,
  toolName: string,
  ctx: RequestContext,
  reason: string
): void {
  const actor = actorFromContext(ctx);
  auditLogger.logPolicyDecision({
    policyName: 'default',
    decision: 'deny',
    reason,
    toolName,
    actor,
    requestId: ctx.requestId,
  });
}

/** Emits an audit event for a rate limit violation. */
function emitRateLimitAudit(
  auditLogger: IAuditLogger,
  toolName: string,
  ctx: RequestContext
): void {
  const actor = actorFromContext(ctx);
  auditLogger.logRateLimitViolation({
    toolName,
    actor,
    currentRate: 0,
    limitRate: 0,
    requestId: ctx.requestId,
  });
}

/** Pre-execution checks: input size, input sanitization, rate limit, policy. */
function runPreChecks(
  config: SecureHandlerConfig,
  args: unknown,
  mode: ExecutionMode,
  requestContext: RequestContext,
  logger: ILogger
): { error: ToolResult | null; sanitizedArgs: unknown } {
  const sizeResult = checkInputSize(args, logger, requestContext.requestId);
  if (sizeResult) return { error: sizeResult, sanitizedArgs: args };

  // Sanitize tool input: strip XML injection tags, detect injection patterns (Issue #828)
  const sanitizeResult = sanitizeToolInput(args);
  logSanitizationResult(sanitizeResult, logger, config.toolName);
  const sanitizedArgs = sanitizeResult.wasModified ? sanitizeResult.sanitized : args;

  if (config.rateLimiter) {
    const rlResult = checkRateLimit(config.rateLimiter, logger);
    if (rlResult) {
      if (config.auditLogger)
        emitRateLimitAudit(config.auditLogger, config.toolName, requestContext);
      return { error: rlResult, sanitizedArgs };
    }
  }

  if (config.policyFirewall) {
    const pResult = checkPolicy({
      firewall: config.policyFirewall,
      toolName: config.toolName,
      args: sanitizedArgs,
      mode,
      allowedPaths: config.allowedPaths,
      logger,
      requestId: requestContext.requestId,
    });
    if (pResult) {
      if (config.auditLogger)
        emitPolicyAudit(config.auditLogger, config.toolName, requestContext, 'policy denied');
      return { error: pResult, sanitizedArgs };
    }
  }

  return { error: null, sanitizedArgs };
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

    const { error: preCheckError, sanitizedArgs } = runPreChecks(
      config,
      args,
      mode,
      requestContext,
      requestLogger
    );
    if (preCheckError) return preCheckError;

    const execStartTime = getTimeProvider().now();
    try {
      const result = await executeHandler(
        handler,
        sanitizedArgs,
        { requestContext, logger: requestLogger },
        requestLogger
      );
      sanitizeToolResult(result, requestLogger);
      if (config.auditLogger) {
        emitToolAudit(
          config.auditLogger,
          config.toolName,
          requestContext,
          result,
          getTimeProvider().now() - execStartTime
        );
      }
      return result;
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
