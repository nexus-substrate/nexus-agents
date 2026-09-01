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
  getCurrentRequestContext,
} from './request-context.js';
import { type IPolicyFirewall, type ExecutionMode, createPolicyContext } from './policy.js';
import type { RateLimiter } from './rate-limiter.js';
import type { IAuditLogger, PolicyAuditDecision } from '../../audit/audit-types.js';
import { actorFromContext, resultToOutcome } from '../../audit/secure-handler-audit.js';
import {
  sanitizeToolInput,
  logSanitizationResult,
  type SanitizeToolInputResult,
} from './tool-input-sanitizer.js';
import { toolStructuredError, type ToolResult } from '../tools/tool-result.js';
import { getGlobalPolicyFirewall } from './policy-registry.js';
import { recordPolicyVerdict } from './policy-audit-emit.js';

export type { ToolResult };

/**
 * Tool handler function signature.
 */
export type ToolHandler = (args: unknown) => Promise<ToolResult>;

/**
 * Security tier for MCP tools. Controls input validation strictness.
 *
 * - 'standard': Default. XML injection tag stripping only (existing behavior).
 * - 'user-facing': Accepts user task descriptions. Rejects known injection patterns.
 * - 'external': Processes external URLs/content. Strictest validation.
 *
 * @see Issue #1586 — Tiered security validation
 */
export type SecurityTier = 'standard' | 'user-facing' | 'external';

/**
 * Configuration for the secure handler wrapper.
 */
export interface SecureHandlerConfig {
  /** Tool name for logging and policy evaluation */
  toolName: string;
  /** Security tier controlling input validation strictness (default: 'standard') */
  securityTier?: SecurityTier;
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
 * Creates a rate limit error response. Rate limits are transient — the
 * structured envelope marks it retryable (#2649).
 */
function rateLimitError(nextTokenMs: number): ToolResult {
  return toolStructuredError({
    errorCategory: 'transient',
    message: `Rate limit exceeded. Try again in ${String(nextTokenMs)}ms.`,
  });
}

/**
 * Creates a policy denial error response — an access-control denial,
 * categorized `permission` (#2649).
 */
function policyDeniedError(reason: string, requestId: string): ToolResult {
  return toolStructuredError({
    errorCategory: 'permission',
    message: `Policy denied: ${reason} (request: ${requestId})`,
  });
}

/**
 * Creates an internal error response (#2649).
 */
function internalError(message: string, requestId: string): ToolResult {
  return toolStructuredError({
    errorCategory: 'internal',
    message: `Internal error: ${message} (request: ${requestId})`,
  });
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
// #3109: every pattern is GLOBAL so `replace` redacts ALL matches, not just
// the first — two secrets of the same shape (e.g. a rotated old+new key) must
// both be redacted before the result reaches the MCP caller.
const SECRET_PATTERNS: readonly RegExp[] = [
  // API keys with common prefixes
  /\b(sk-[a-zA-Z0-9]{20,})\b/g,
  /\b(pk-[a-zA-Z0-9]{20,})\b/g,
  // AWS-style keys
  /\b(AKIA[A-Z0-9]{16})\b/g,
  // Bearer tokens in output
  /Bearer\s+[a-zA-Z0-9_\-.~+/]+=*/g,
  // Generic long hex secrets (40+ chars)
  /\b[0-9a-f]{40,}\b/gi,
  // password= or token= in output
  /(?:password|token|secret|apikey|api_key)\s*[=:]\s*\S{8,}/gi,
];

/** Redact detected secrets from tool output text. */
function sanitizeOutput(text: string, logger: ILogger): string {
  let sanitized = text;
  for (const pattern of SECRET_PATTERNS) {
    // #3109: replace unconditionally — do NOT guard with pattern.test(), which
    // advances a global regex's lastIndex and makes replace() skip earlier
    // matches. `String.replace` with a global regex redacts every occurrence
    // and resets lastIndex to 0 on completion, so the shared pattern stays
    // safe across calls. Detect a redaction via a before/after compare.
    const before = sanitized;
    sanitized = sanitized.replace(pattern, '[REDACTED]');
    if (sanitized !== before) {
      logger.warn('Potential secret detected in tool output, redacting', {
        pattern: pattern.source.slice(0, 30),
      });
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
 * What the policy evaluation produced: the denial result to return (if any),
 * and the verdict to record on the chain.
 *
 * The verdict is returned separately because it is NOT derivable from the
 * result (#4991). In warn mode a rule fires and the firewall allows anyway, so
 * `result` is null exactly as it is for an ordinary allow — the two are
 * indistinguishable downstream unless the decision travels with it.
 */
interface PolicyCheckOutcome {
  readonly result: ToolResult | null;
  /** `null` when no rule fired — an ordinary allow, which is not recorded. */
  readonly verdict: PolicyAuditDecision | null;
  /**
   * The rule that fired, when one did. Carried out so the near-miss sampler can
   * key on `{tool, rule}` — sampling on the tool alone would let one noisy rule
   * suppress a different rule's first occurrence on the same tool.
   */
  readonly ruleName?: string | undefined;
}

/**
 * Evaluates policy firewall and returns error if denied.
 */
function checkPolicy(opts: PolicyCheckOptions): PolicyCheckOutcome {
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
    return {
      result: policyDeniedError(decision.reason, opts.requestId),
      verdict: 'deny',
      ruleName: decision.ruleName,
    };
  }

  // Warn mode: the evaluator sets `overriddenByWarnMode` when a rule denied and
  // the mode allowed anyway. Read that flag and nothing else — not the '[WARN
  // MODE]' reason prefix (display copy, breaks on a reword), and not the
  // presence of `ruleName` on an allowed decision. The latter was the first
  // implementation and a panel rejected it: naming the rule that PERMITTED an
  // action is ordinary practice, so that inference would start reporting
  // authorized calls as near-misses the day an allow rule sets `ruleName`.
  if (decision.overriddenByWarnMode === true) {
    opts.logger.debug('Policy would have denied (warn mode)', {
      reason: decision.reason,
      ruleName: decision.ruleName,
    });
    return { result: null, verdict: 'would_deny', ruleName: decision.ruleName };
  }

  opts.logger.debug('Policy check passed', { reason: decision.reason });
  return { result: null, verdict: null };
}

/**
 * Evaluates the policy firewall for this call, or returns `null` when none is
 * configured.
 *
 * #4888: the firewall falls back to the process-wide registry. Nothing ever
 * supplied `config.policyFirewall`, so before that fallback this check was
 * unreachable for every registered tool.
 */
function runPolicyCheck(
  config: SecureHandlerConfig,
  sanitizedArgs: unknown,
  mode: ExecutionMode,
  logger: ILogger,
  requestContext: RequestContext
): ToolResult | null {
  const firewall = config.policyFirewall ?? getGlobalPolicyFirewall();
  if (!firewall) return null;

  const { result, verdict, ruleName } = checkPolicy({
    firewall,
    toolName: config.toolName,
    args: sanitizedArgs,
    mode,
    allowedPaths: config.allowedPaths,
    logger,
    requestId: requestContext.requestId,
  });

  // Emitted for a real denial AND for a warn-mode near-miss (#4991). An
  // ordinary allow (verdict null) is not recorded: emitting every permitted
  // call would bury the soak signal it exists to surface.
  if (verdict !== null && config.auditLogger) {
    recordPolicyVerdict(config, requestContext, verdict, ruleName);
  }
  return result;
}

/**
 * Executes handler and logs result.
 */
async function executeHandler(
  handler: ToolHandler | ContextAwareHandler,
  args: unknown,
  ctx: HandlerContext,
  logger: ILogger,
  logLifecycle: boolean
): Promise<ToolResult> {
  const startTime = getTimeProvider().now();
  const result =
    handler.length >= 2 ? await handler(args, ctx) : await (handler as ToolHandler)(args);

  // Suppressed when the middleware chain already brackets this call: its own
  // audit middleware logs a completion spanning the whole stack, where this
  // one times only the handler body (#4981).
  if (!logLifecycle) return result;

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

/**
 * Emits an audit event when a tool handler throws (or returns a rejected
 * Promise) — closes the audit-trail gap where unexpected exceptions left
 * no auditor record (security-review fallout from #2191).
 */
function emitToolAuditException(
  auditLogger: IAuditLogger,
  toolName: string,
  ctx: RequestContext,
  durationMs: number
): void {
  const actor = actorFromContext(ctx);
  auditLogger.logToolInvocation({
    toolName,
    outcome: 'error',
    actor,
    requestId: ctx.requestId,
    durationMs,
  });
}

/** Emits an audit event for a policy denial. */
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

/** Reject inputs with detected injection patterns for elevated security tiers. */
function checkSecurityTier(
  config: SecureHandlerConfig,
  sanitizeResult: SanitizeToolInputResult,
  logger: ILogger
): ToolResult | null {
  const tier = config.securityTier ?? 'standard';
  if (tier === 'standard' || sanitizeResult.detectedPatterns.length === 0) {
    return null;
  }
  logger.warn('Input rejected by security tier validation', {
    tier,
    patterns: sanitizeResult.detectedPatterns,
  });
  // Security-tier rejection of suspected injection patterns — an
  // access-control denial, categorized `permission` (#2649).
  return toolStructuredError({
    errorCategory: 'permission',
    message:
      `Input validation failed: detected patterns [${sanitizeResult.detectedPatterns.join(', ')}]. ` +
      'Remove prompt injection patterns and retry.',
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

  // Tiered validation: reject (not strip) for user-facing/external tools (Issue #1586)
  const tierError = checkSecurityTier(config, sanitizeResult, logger);
  if (tierError !== null) return { error: tierError, sanitizedArgs };

  if (config.rateLimiter) {
    const rlResult = checkRateLimit(config.rateLimiter, logger);
    if (rlResult) {
      if (config.auditLogger)
        emitRateLimitAudit(config.auditLogger, config.toolName, requestContext);
      return { error: rlResult, sanitizedArgs };
    }
  }

  const pResult = runPolicyCheck(config, sanitizedArgs, mode, logger, requestContext);
  if (pResult) return { error: pResult, sanitizedArgs };

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
    // Adopt the middleware chain's context when this handler is nested inside
    // it, so one call carries one id and one start/complete pair (#4981).
    //
    // Gated on the tool NAME matching: an in-process nested tool call would
    // otherwise inherit its parent's identity, and two different tools would
    // share one request id. Gated on presence at all because every direct
    // caller of createSecureHandler — the tests — has no outer context, and
    // must keep minting and logging its own.
    const ambient = getCurrentRequestContext();
    const inherited = ambient?.toolName === config.toolName ? ambient : undefined;
    // Join the outer request's IDENTITY, but keep deriving this handler's own
    // caller and trust tier. The chain mints its context from { toolName }
    // alone, so adopting that object wholesale would discard a configured
    // `callerInfo` — downgrading trustTier and the audit actor to "unknown"
    // on the very path this change is meant to make auditable.
    const requestContext =
      inherited === undefined
        ? createRequestContext(ctxOpts)
        : createRequestContext({ ...ctxOpts, inheritRequestId: inherited.requestId });
    const requestLogger = logger.child(contextForLogging(requestContext));
    if (inherited === undefined) {
      requestLogger.info('Tool invocation started');
    }

    const { error: preCheckError, sanitizedArgs } = runPreChecks(
      config,
      args,
      mode,
      requestContext,
      requestLogger
    );
    if (preCheckError) return preCheckError;

    return executeAndAudit(handler, sanitizedArgs, config, {
      requestContext,
      requestLogger,
      logLifecycle: inherited === undefined,
    });
  };
}

/**
 * Executes the wrapped handler with audit emission on both the success and
 * exception paths. Extracted from `createSecureHandler` to keep that
 * function within the 50-line budget.
 */
/** The per-call state `executeAndAudit` needs, bundled to stay under the param cap. */
interface Invocation {
  readonly requestContext: RequestContext;
  readonly requestLogger: ILogger;
  /** False when the middleware chain already brackets this call (#4981). */
  readonly logLifecycle: boolean;
}

async function executeAndAudit(
  handler: ToolHandler | ContextAwareHandler,
  sanitizedArgs: unknown,
  config: SecureHandlerConfig,
  invocation: Invocation
): Promise<ToolResult> {
  const { requestContext, requestLogger } = invocation;
  const execStartTime = getTimeProvider().now();
  try {
    const result = await executeHandler(
      handler,
      sanitizedArgs,
      { requestContext, logger: requestLogger },
      requestLogger,
      invocation.logLifecycle
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
    const rawMessage = error instanceof Error ? error.message : 'Unknown error';
    requestLogger.error('Tool execution failed', error instanceof Error ? error : undefined);
    if (config.auditLogger) {
      emitToolAuditException(
        config.auditLogger,
        config.toolName,
        requestContext,
        getTimeProvider().now() - execStartTime
      );
    }
    // Closes a secret-leak path: adapter SDKs commonly echo offending
    // credentials in their error messages (e.g. Anthropic's
    // AuthenticationError carries `sk-ant-api03-…` substrings; fetch
    // wrappers can echo Authorization headers). The success branch above
    // runs sanitizeToolResult; the exception path must too.
    const sanitized = sanitizeOutput(rawMessage, requestLogger);
    return internalError(sanitized, requestContext.requestId);
  }
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
