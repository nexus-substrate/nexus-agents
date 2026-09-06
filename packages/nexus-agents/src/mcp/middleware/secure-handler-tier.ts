/**
 * Security-tier refusal: the error returned to the caller, and the audit record
 * that says an injection attempt was refused.
 *
 * Split out of `secure-handler.ts` alongside `secure-handler-rate-limit.ts`,
 * and for the same reason: the refusal and the record of it belong together, so
 * the record cannot be written from a second, later read of the evidence.
 *
 * ## Why the record exists at all
 *
 * The tier branch used to return before both the rate limiter and
 * `executeAndAudit`, so a refused prompt-injection attempt against a
 * `user-facing` / `external` tool produced ZERO audit-chain events while an
 * ordinary successful call produced one. The hostile traffic was the only
 * traffic invisible to the chain — a reviewer reading the audit log saw a quiet
 * period, not an attack. `logSecurityEvent` had been declared and implemented
 * since #193 with no production caller; this is it.
 *
 * ## Why the rate limiter still runs AFTER this check
 *
 * The obvious follow-on — meter the refusal so probing is not free — is wrong
 * here. `rateLimiterFactory.getForTool(name)` hands every caller of a tool the
 * SAME token bucket, so charging refused input would let one sender empty a
 * tool's bucket with malformed arguments and deny it to everyone else. Refusal
 * is cheap (regex over already-parsed arguments, no model call), so the traffic
 * it admits is bounded anyway. The record above is the control; the limiter is
 * not.
 */
import type { ILogger } from '../../core/index.js';
import type { IAuditLogger } from '../../audit/audit-types.js';
import { actorFromContext } from '../../audit/secure-handler-audit.js';
import type { RequestContext } from './request-context.js';
import type { SanitizeToolInputResult } from './tool-input-sanitizer.js';
import { toolStructuredError, type ToolResult } from '../tools/tool-result.js';

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
 * A refusal, together with what triggered it.
 *
 * `eventType` and `patterns` travel with the error rather than being recomputed
 * at the audit call, so the durable record names the same evidence the caller
 * was refused on.
 */
export interface SecurityTierRefusal {
  readonly error: ToolResult;
  /** Audit `eventType`; also the `violationType` on the chained record. */
  readonly eventType: 'sanitization_incomplete' | 'injection_pattern_blocked';
  /** Detected pattern names; empty for an incomplete-sanitization refusal. */
  readonly patterns: readonly string[];
  readonly tier: SecurityTier;
}

/** Reject inputs with detected injection patterns for elevated security tiers. */
export function checkSecurityTier(
  tier: SecurityTier,
  sanitizeResult: SanitizeToolInputResult,
  logger: ILogger
): SecurityTierRefusal | null {
  // A value the sanitizer could not reduce to a fixed point is refused at EVERY
  // tier, standard included, because the argument still carries whatever the
  // stripper could not remove. `detectedPatterns` cannot catch it — the pattern
  // detectors match phrases, not tags, so a deeply nested `<system>` returned
  // clean-looking metadata with an empty pattern list. Refusing here is fail-
  // closed and rare: it takes six levels of hand-nested tags to reach.
  if (sanitizeResult.sanitizationIncomplete) {
    logger.warn('Input rejected: sanitizer did not reach a fixed point', { tier });
    return {
      error: toolStructuredError({
        errorCategory: 'permission',
        message:
          'Input validation failed: the input could not be fully sanitized within the pass budget, ' +
          'so it still contains markup the sanitizer removes. Simplify the input and retry.',
      }),
      eventType: 'sanitization_incomplete',
      patterns: [],
      tier,
    };
  }
  if (tier === 'standard' || sanitizeResult.detectedPatterns.length === 0) {
    return null;
  }
  logger.warn('Input rejected by security tier validation', {
    tier,
    patterns: sanitizeResult.detectedPatterns,
  });
  return {
    // Security-tier rejection of suspected injection patterns — an
    // access-control denial, categorized `permission` (#2649).
    error: toolStructuredError({
      errorCategory: 'permission',
      message:
        `Input validation failed: detected patterns [${sanitizeResult.detectedPatterns.join(', ')}]. ` +
        'Remove prompt injection patterns and retry.',
    }),
    eventType: 'injection_pattern_blocked',
    patterns: sanitizeResult.detectedPatterns,
    tier,
  };
}

/** Emits an audit event for a security-tier refusal. */
export function emitSecurityTierAudit(
  auditLogger: IAuditLogger,
  toolName: string,
  ctx: RequestContext,
  refusal: SecurityTierRefusal
): void {
  auditLogger.logSecurityEvent({
    eventType: refusal.eventType,
    // `critical` is this enum's security-violation level ('info' / 'warning' /
    // 'critical'); a refused injection attempt is not routine noise, and the
    // level is what a downstream consumer filters on.
    severity: 'critical',
    actor: actorFromContext(ctx),
    description:
      refusal.eventType === 'sanitization_incomplete'
        ? `Tool '${toolName}' refused input the sanitizer could not reduce to a fixed point.`
        : `Tool '${toolName}' refused input carrying injection patterns [${refusal.patterns.join(', ')}].`,
    requestId: ctx.requestId,
    metadata: { toolName, tier: refusal.tier, patterns: [...refusal.patterns] },
  });
}
