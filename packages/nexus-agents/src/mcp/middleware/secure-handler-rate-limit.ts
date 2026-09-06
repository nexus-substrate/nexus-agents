/**
 * Rate-limit denial: the error returned to the caller, and the audit record
 * that says what limit was hit.
 *
 * Split out of `secure-handler.ts` when #5577 pushed that file past its
 * 400-line cap. The two belong together: the audit record's numbers are only
 * honest if they come from the same limiter read that produced the denial.
 */
import type { ILogger } from '../../core/index.js';
import type { RateLimiter, RateLimiterState } from './rate-limiter.js';
import type { IAuditLogger } from '../../audit/audit-types.js';
import { actorFromContext } from '../../audit/secure-handler-audit.js';
import type { RequestContext } from './request-context.js';
import { toolStructuredError, type ToolResult } from '../tools/tool-result.js';

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
 * The denial, together with the limiter state that produced it.
 *
 * The state travels with the result rather than being re-read at the audit
 * call: `getState()` refills first, so a second read can report a bucket that
 * has recovered a token since the denial, and the audit record would then
 * describe a limiter that would have allowed the call (#5577).
 */
export interface RateLimitDenial {
  readonly error: ToolResult;
  readonly state: RateLimiterState;
}

/** Acquires a token; on refusal returns the denial and the state behind it. */
export function checkRateLimit(rateLimiter: RateLimiter, logger: ILogger): RateLimitDenial | null {
  const acquired = rateLimiter.tryAcquire();
  if (!acquired) {
    const state = rateLimiter.getState();
    logger.warn('Rate limit exceeded');
    return { error: rateLimitError(state.nextTokenMs), state };
  }
  return null;
}

/** Emits an audit event for a rate limit violation. */
export function emitRateLimitAudit(
  auditLogger: IAuditLogger,
  toolName: string,
  ctx: RequestContext,
  state: RateLimiterState
): void {
  const actor = actorFromContext(ctx);
  auditLogger.logRateLimitViolation({
    toolName,
    actor,
    // The bucket is empty at denial time, so the tokens spent out of it are
    // `capacity - tokens`. Both numbers are measured from the limiter that
    // denied this call; they were hard-coded to 0/0 before #5577, which made
    // every durable record read "Rate limit exceeded: 0/0 requests".
    currentRate: Math.round(state.capacity - state.tokens),
    limitRate: state.capacity,
    requestId: ctx.requestId,
  });
}
