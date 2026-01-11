/**
 * nexus-agents/audit - SecureHandler Audit Integration
 *
 * Integration helper to add audit logging to SecureHandler middleware.
 *
 * (Source: Issue #193 - Phase 3 structured audit logging)
 *
 * @module audit/secure-handler-audit
 */

import type { IAuditLogger, AuditActor, AuditOutcome } from './audit-types.js';
import type { RequestContext } from '../mcp/middleware/request-context.js';

/**
 * Configuration for audit-enabled secure handler.
 */
export interface AuditHandlerConfig {
  /** Audit logger instance */
  auditLogger: IAuditLogger;
  /** Default actor for requests without caller info */
  defaultActor?: AuditActor | undefined;
}

/**
 * Creates an AuditActor from RequestContext.
 */
export function actorFromContext(ctx: RequestContext, fallback?: AuditActor): AuditActor {
  const caller = ctx.caller;
  const clientId = caller.clientId;
  if (clientId !== undefined && clientId.length > 0) {
    return {
      type: clientId.includes('api') ? 'external' : clientId.includes('cli') ? 'agent' : 'user',
      id: clientId,
      name: caller.userAgent,
    };
  }
  return fallback ?? { type: 'system', id: 'unknown', name: 'Unknown Caller' };
}

/**
 * Maps tool result to audit outcome.
 */
export function resultToOutcome(
  isError: boolean | undefined,
  isPolicyDenied: boolean
): AuditOutcome {
  if (isPolicyDenied) return 'denied';
  if (isError === true) return 'failure';
  return 'success';
}

/** Options for logging tool invocation audit */
export interface LogToolInvocationOpts {
  auditLogger: IAuditLogger;
  toolName: string;
  outcome: AuditOutcome;
  actor: AuditActor;
  requestId: string;
  durationMs?: number | undefined;
  errorMessage?: string | undefined;
}

/**
 * Logs tool invocation to audit logger.
 */
export function logToolInvocationAudit(opts: LogToolInvocationOpts): void {
  opts.auditLogger.logToolInvocation({
    toolName: opts.toolName,
    outcome: opts.outcome,
    actor: opts.actor,
    requestId: opts.requestId,
    durationMs: opts.durationMs,
    errorMessage: opts.errorMessage,
  });
}

/** Options for logging policy audit */
export interface LogPolicyAuditOpts {
  auditLogger: IAuditLogger;
  policyName: string;
  decision: 'allow' | 'deny';
  reason: string;
  toolName: string;
  actor: AuditActor;
  requestId: string;
}

/**
 * Logs policy decision to audit logger.
 */
export function logPolicyAudit(opts: LogPolicyAuditOpts): void {
  opts.auditLogger.logPolicyDecision({
    policyName: opts.policyName,
    decision: opts.decision,
    reason: opts.reason,
    toolName: opts.toolName,
    actor: opts.actor,
    requestId: opts.requestId,
  });
}

/** Options for logging rate limit audit */
export interface LogRateLimitAuditOpts {
  auditLogger: IAuditLogger;
  toolName: string;
  actor: AuditActor;
  currentRate: number;
  limitRate: number;
  requestId: string;
}

/**
 * Logs rate limit violation to audit logger.
 */
export function logRateLimitAudit(opts: LogRateLimitAuditOpts): void {
  opts.auditLogger.logRateLimitViolation({
    toolName: opts.toolName,
    actor: opts.actor,
    currentRate: opts.currentRate,
    limitRate: opts.limitRate,
    requestId: opts.requestId,
  });
}
