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
import type { IPolicyFirewall, ExecutionMode } from './policy.js';
import type { RateLimiter } from './rate-limiter.js';
import { checkRateLimit, emitRateLimitAudit } from './secure-handler-rate-limit.js';
import {
  checkSecurityTier,
  emitSecurityTierAudit,
  type SecurityTier,
} from './secure-handler-tier.js';
import type { IAuditLogger, AuditOutcome } from '../../audit/audit-types.js';
import { actorFromContext, resultToOutcome } from '../../audit/secure-handler-audit.js';
import { sanitizeToolInput, logSanitizationResult } from './tool-input-sanitizer.js';
import { sanitizeErrorDetails, sanitizeStringLeaves } from '../../security/output-sanitizer.js';
import { toolStructuredError, type ToolResult } from '../tools/tool-result.js';
import { getGlobalExecutionMode } from './policy-registry.js';
import { runPolicyCheck, getRegisteredAuditLogger } from './policy-check.js';

export type { ToolResult };

/**
 * Tool handler function signature.
 */
export type ToolHandler = (args: unknown) => Promise<ToolResult>;

export type { SecurityTier };

/**
 * Configuration for the secure handler wrapper.
 */
export interface SecureHandlerConfig {
  /** Tool name for logging and policy evaluation */
  toolName: string;
  /** Security tier controlling input validation strictness (default: 'standard') */
  securityTier?: SecurityTier;
  /**
   * Fields whose PRE-sanitization value must be hashed for a persisted record
   * (#5385), keyed by arg name, valued by the canonical hasher for that field.
   *
   * The handler receives only the resulting HASHES, never the raw text. That is
   * the point: `reviewedDiffHash` has to bind bytes the governor gate can
   * recompute from git, but handing a handler the raw args would partly defeat
   * sanitizing before dispatch — a careless handler could put unsanitized
   * untrusted content into a prompt. A 64-hex digest cannot be injected into
   * anything, so the seam is safe by construction rather than by discipline.
   */
  rawHashFields?: Readonly<Record<string, (raw: string) => string>>;
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

// The registration audit-logger map and the policy check moved to
// policy-check.ts (#6431 review) so `run { execute: true }` can evaluate the
// firewall for its selected strategy tool with the SAME check. Re-exported so
// the registration seam's import path is unchanged.
export { setSecureHandlerAuditLogger } from './policy-check.js';

/**
 * Extended handler context passed to the wrapped handler.
 */
/**
 * What the middleware removed from this call's input, disclosed to the handler
 * (#5385).
 *
 * The middleware sanitizes BEFORE dispatch, so a handler receives cleaned args
 * and cannot otherwise know either what its raw input was or what was taken
 * out. That was low-impact while sanitization only stripped conversation-
 * structure XML tags; #5258 added HTML-comment stripping, which fires on any
 * markdown change — including this repo's own governance-regeneration PRs.
 *
 * Counts only, never the removed bytes: handing raw or stripped content back to
 * the handler would partially defeat sanitize-before-dispatch, which is the
 * property this middleware exists to guarantee.
 */
/*
 * Not exported: every consumer reaches it through `HandlerContext.sanitization`
 * or builds an object literal, so exporting the name adds a symbol with no
 * cross-file consumer — which the #3024 gate correctly rejects.
 */
interface SanitizationContext {
  /** Whether sanitization changed the args at all. */
  readonly wasModified: boolean;
  /** HTML comments removed from untrusted fields (#5258). */
  readonly commentsRemoved: number;
  /** How many FIELDS the sanitizer changed at all (#5385). */
  readonly fieldsModified: number;
  /**
   * XML-like conversation-structure tags removed (#5385).
   *
   * Its own counter, not inferred from the two above. `fieldsModified` counts
   * FIELDS, so a comment and a tag in the same field is ONE modified field —
   * arithmetic over the other counters cannot recover the tag, and every
   * consumer then reports a stripped injection attempt as a routine comment
   * strip. An attacker only has to include an HTML comment to get that
   * reassurance, and GitHub's default PR template already supplies one.
   */
  readonly tagsRemoved: number;
  /**
   * Pre-sanitization hashes of the fields named in
   * {@link SecureHandlerConfig.rawHashFields} (#5385).
   *
   * Empty when the tool declared none — which is distinguishable from "declared
   * and the field was absent", because a declared-but-absent field simply has
   * no key here and the handler can tell the two apart by what it asked for.
   */
  readonly rawFieldHashes: Readonly<Record<string, string>>;
  /**
   * UTF-8 byte length (`Buffer.byteLength`) of each field in
   * {@link rawFieldHashes}, measured on the SAME raw value the hash was
   * computed over, before sanitization (#6177). Same key set as the hashes: a
   * declared-but-absent field has no entry in either.
   *
   * Carried because a hash alone cannot say how much it covers. `pr_review`'s
   * hasher truncates at a byte cap, and the handler — holding only the
   * sanitized text — measured coverage over that text, so a raw diff over the
   * cap whose sanitized form was under it was recorded as fully bound. A byte
   * count, like a digest, cannot be injected into anything, so the seam stays
   * sanitize-before-dispatch.
   */
  readonly rawFieldBytes: Readonly<Record<string, number>>;
}

export interface HandlerContext {
  /** Request context for this invocation */
  requestContext: RequestContext;
  /** Logger with request context attached */
  logger: ILogger;
  /**
   * What sanitization removed (#5385).
   *
   * REQUIRED, not optional, deliberately. An optional field invites
   * `ctx.sanitization?.commentsRemoved ?? 0`, which renders "the middleware did
   * not tell me" as "nothing was removed" — a default reported as a
   * measurement, which is the shape this repo treats as a p1 on the governor
   * path. Always present means always truthful.
   */
  readonly sanitization: SanitizationContext;
}

/**
 * Tool handler with context signature.
 */
export type ContextAwareHandler = (args: unknown, ctx: HandlerContext) => Promise<ToolResult>;

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
 * Redact detected secrets from tool output text (#6484).
 * Unifies on canonical sanitizeErrorDetails to cover Anthropic sk-ant-*,
 * OpenAI sk-proj-*, Gemini AIzaSy*, GitHub PATs, and URL/Bearer credentials.
 */
function sanitizeOutput(text: string, logger?: ILogger): string {
  const sanitized = sanitizeErrorDetails(text, undefined, '[REDACTED]');
  if (sanitized !== text && logger !== undefined) {
    logger.warn('Potential secret detected in tool output, redacting');
  }
  return sanitized;
}

/** Recursively sanitize record entries (#6484). */
function sanitizeDeepRecord(
  obj: Record<string, unknown>,
  logger?: ILogger
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    result[key] = sanitizeStringLeaves(val, (text) => sanitizeOutput(text, logger));
  }
  return result;
}

/** Sanitize all text content, structuredContent, and _meta in a tool result (#740, #6484). */
function sanitizeToolResult(result: ToolResult, logger: ILogger): void {
  for (const item of result.content) {
    item.text = sanitizeOutput(item.text, logger);
  }
  if (result.structuredContent !== undefined) {
    result.structuredContent = sanitizeDeepRecord(result.structuredContent, logger);
  }
  if (result._meta !== undefined) {
    result._meta = sanitizeDeepRecord(result._meta, logger);
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

interface ToolAuditEmission {
  readonly auditLogger: IAuditLogger;
  readonly toolName: string;
  readonly ctx: RequestContext;
  readonly outcome: AuditOutcome;
  readonly durationMs: number;
  /** A warn-mode rule fired for this call (#5228 review). */
  readonly nearMiss: boolean;
}

/**
 * Emits an audit event for a tool invocation, however it ended.
 *
 * ONE emitter for both exits, deliberately. The success path and the throw path
 * previously had separate functions differing only in `outcome`, and the
 * near-miss annotation was added to the success one alone — so a warn-mode
 * near-miss whose handler THREW produced an `outcome: 'error'` record with no
 * policy annotation, indistinguishable from a clean call that errored. That is
 * the inference this change exists to break, on the path where an action ran
 * and did not complete cleanly, which is the more review-worthy case.
 *
 * Two exits with one shared obligation is exactly the seam a duplicated emitter
 * lets you wire half of. Merging them makes the annotation structural rather
 * than something each caller has to remember.
 */
function emitToolAudit({
  auditLogger,
  toolName,
  ctx,
  outcome,
  durationMs,
  nearMiss,
}: ToolAuditEmission): void {
  const actor = actorFromContext(ctx);
  auditLogger.logToolInvocation({
    toolName,
    outcome,
    actor,
    requestId: ctx.requestId,
    durationMs,
    // The fact the sampler must never suppress: this call EXECUTED and a rule
    // would have denied it. The policy record carries the detail and may be
    // sampled; this says the action itself was not clean, on every occurrence.
    ...(nearMiss ? { policyDecision: 'would_deny' as const } : {}),
  });
}

/** The raw-field measurements {@link measureRawFields} takes before sanitization. */
type RawFieldMeasurements = Pick<SanitizationContext, 'rawFieldHashes' | 'rawFieldBytes'>;

/**
 * Hash AND measure the declared raw fields before sanitization (#5385, #6177).
 *
 * Only string values are measured; a missing or non-string field contributes no
 * key rather than an empty-string hash, so "absent" cannot be mistaken for
 * "present and empty" — the two have different digests and only one is a
 * measurement. The byte length is taken in the same loop, on the same value,
 * so the two maps describe the same bytes by construction.
 */
function measureRawFields(
  fields: Readonly<Record<string, (raw: string) => string>> | undefined,
  args: unknown
): RawFieldMeasurements {
  if (fields === undefined) return { rawFieldHashes: {}, rawFieldBytes: {} };
  if (typeof args !== 'object' || args === null) return { rawFieldHashes: {}, rawFieldBytes: {} };
  const source = args as Record<string, unknown>;
  const rawFieldHashes: Record<string, string> = {};
  const rawFieldBytes: Record<string, number> = {};
  for (const [field, hash] of Object.entries(fields)) {
    const value = source[field];
    if (typeof value !== 'string') continue;
    rawFieldHashes[field] = hash(value);
    rawFieldBytes[field] = Buffer.byteLength(value, 'utf-8');
  }
  return { rawFieldHashes, rawFieldBytes };
}

/**
 * The context reported on an early-exit path, where sanitization never ran.
 *
 * Reported anyway, so a caller never has to distinguish "not sanitized" from
 * "sanitized, nothing removed". #5385: the raw hashes are computed here too. An
 * early exit means the tool never ran, but a caller that asked for a hash still
 * learns whether the field was present — absence of the key means absent, not
 * "hash of nothing".
 */
function unsanitizedContext(config: SecureHandlerConfig, args: unknown): SanitizationContext {
  return {
    wasModified: false,
    commentsRemoved: 0,
    fieldsModified: 0,
    tagsRemoved: 0,
    ...measureRawFields(config.rawHashFields, args),
  };
}

/** Emits an audit event for a policy denial. */
/** Pre-execution checks: input size, input sanitization, rate limit, policy. */
function runPreChecks(
  config: SecureHandlerConfig,
  args: unknown,
  mode: ExecutionMode,
  requestContext: RequestContext,
  logger: ILogger
): {
  error: ToolResult | null;
  sanitizedArgs: unknown;
  nearMiss: boolean;
  sanitization: SanitizationContext;
} {
  const sizeResult = checkInputSize(args, logger, requestContext.requestId);
  if (sizeResult) {
    return {
      error: sizeResult,
      sanitizedArgs: args,
      nearMiss: false,
      sanitization: unsanitizedContext(config, args),
    };
  }

  // Sanitize tool input: strip XML injection tags, detect injection patterns (Issue #828)
  const sanitizeResult = sanitizeToolInput(args);
  logSanitizationResult(sanitizeResult, logger, config.toolName);
  const sanitizedArgs = sanitizeResult.wasModified ? sanitizeResult.sanitized : args;
  const sanitization: SanitizationContext = {
    wasModified: sanitizeResult.wasModified,
    commentsRemoved: sanitizeResult.commentsRemoved,
    fieldsModified: sanitizeResult.modifiedCount,
    tagsRemoved: sanitizeResult.tagsRemoved,
    // #5385/#6177: hashed and measured from `args`, the RAW input, before
    // sanitization touched it.
    ...measureRawFields(config.rawHashFields, args),
  };

  // Tiered validation: reject (not strip) for user-facing/external tools (Issue #1586)
  const refusal = checkSecurityTier(config.securityTier ?? 'standard', sanitizeResult, logger);
  if (refusal !== null) {
    // Without this the refused call is the ONE kind of traffic that leaves no
    // trace in the audit chain: it returns above both the rate limiter and
    // `executeAndAudit`, so an attack read as a quiet period. See
    // `secure-handler-tier.ts` for why the limiter still runs after this check.
    if (config.auditLogger)
      emitSecurityTierAudit(config.auditLogger, config.toolName, requestContext, refusal);
    return { error: refusal.error, sanitizedArgs, nearMiss: false, sanitization };
  }

  if (config.rateLimiter) {
    const denial = checkRateLimit(config.rateLimiter, logger);
    if (denial) {
      if (config.auditLogger)
        emitRateLimitAudit(config.auditLogger, config.toolName, requestContext, denial.state);
      return { error: denial.error, sanitizedArgs, nearMiss: false, sanitization };
    }
  }

  const policy = runPolicyCheck(config, sanitizedArgs, mode, logger, requestContext);
  if (policy.error)
    return { error: policy.error, sanitizedArgs, nearMiss: policy.nearMiss, sanitization };

  return { error: null, sanitizedArgs, nearMiss: policy.nearMiss, sanitization };
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
  const registeredAuditLogger = config.logger && getRegisteredAuditLogger(config.logger);
  if (config.auditLogger === undefined && registeredAuditLogger !== undefined)
    config = { ...config, auditLogger: registeredAuditLogger };
  const logger = config.logger ?? createLogger({ tool: config.toolName });

  return async (args: unknown): Promise<ToolResult> => {
    // Resolved per call, like the firewall (#6431 review): handlers are created
    // at registration, before the operator's mode reaches the registry, so a
    // mode captured here would be the pre-registration default for the life of
    // the process.
    const mode = config.executionMode ?? getGlobalExecutionMode();
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

    const {
      error: preCheckError,
      sanitizedArgs,
      nearMiss,
      sanitization,
    } = runPreChecks(config, args, mode, requestContext, requestLogger);
    if (preCheckError) return preCheckError;

    return executeAndAudit(handler, sanitizedArgs, config, {
      requestContext,
      requestLogger,
      nearMiss,
      sanitization,
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
  /**
   * A warn-mode policy rule fired for this call (#5228 review).
   *
   * Carried onto the invocation record whether or not the policy record itself
   * was sampled, so an executed near-miss is never indistinguishable from a
   * call no rule touched.
   */
  readonly nearMiss: boolean;
  /** What sanitization removed, forwarded to the handler (#5385). */
  readonly sanitization: SanitizationContext;
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
      { requestContext, logger: requestLogger, sanitization: invocation.sanitization },
      requestLogger,
      invocation.logLifecycle
    );
    sanitizeToolResult(result, requestLogger);
    if (config.auditLogger) {
      emitToolAudit({
        auditLogger: config.auditLogger,
        toolName: config.toolName,
        ctx: requestContext,
        outcome: resultToOutcome(result.isError, false),
        durationMs: getTimeProvider().now() - execStartTime,
        nearMiss: invocation.nearMiss,
      });
    }
    return result;
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : 'Unknown error';
    requestLogger.error('Tool execution failed', error instanceof Error ? error : undefined);
    if (config.auditLogger) {
      emitToolAudit({
        auditLogger: config.auditLogger,
        toolName: config.toolName,
        ctx: requestContext,
        outcome: 'error',
        durationMs: getTimeProvider().now() - execStartTime,
        nearMiss: invocation.nearMiss,
      });
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
