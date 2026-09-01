/**
 * Policy-verdict audit emission (#4991, sampling added under #5228 review).
 *
 * Split out of `secure-handler.ts` to keep that file under its line cap, and
 * because these two functions are one concern: turning a policy verdict into a
 * durable chain record, and deciding which near-misses are written.
 *
 * @module mcp/middleware/policy-audit-emit
 */

import type { IAuditLogger, PolicyAuditDecision } from '../../audit/audit-types.js';
import type { RequestContext } from './request-context.js';
import { actorFromContext } from '../../audit/secure-handler-audit.js';
import { sampleWouldDeny, describeOccurrence } from './would-deny-sampler.js';

/** The subset of the handler config this needs. */
export interface PolicyAuditTarget {
  readonly toolName: string;
  readonly auditLogger?: IAuditLogger | undefined;
}

/**
 * Write the audit record for a policy verdict, sampling warn-mode near-misses.
 *
 * The asymmetry is the point (#5228 review). A real `deny` is ALWAYS recorded:
 * it halts the call, so it is already self-limiting, and dropping one would
 * lose the record of an action that was actually blocked. A `would_deny` allows
 * the call to proceed, so an agent looping against the same rule emits one
 * record per iteration — the unbounded-growth case the review dissent named.
 *
 * Near-misses are therefore sampled at occurrences 1, 2, 4, 8 … per
 * `{tool, rule}` pair, and every record written names its own ordinal. The
 * first is always recorded, so nothing becomes invisible; growth is
 * logarithmic; and because the ordinal rides on the record rather than on a
 * later flush, a loop that stops mid-sequence still leaves "fired at least N
 * times" readable in the chain.
 */
export function recordPolicyVerdict(
  config: PolicyAuditTarget,
  requestContext: RequestContext,
  verdict: PolicyAuditDecision,
  ruleName: string | undefined
): void {
  const auditLogger = config.auditLogger;
  if (!auditLogger) return;

  if (verdict !== 'would_deny') {
    emitPolicyAudit(auditLogger, config.toolName, requestContext, verdict, 'policy denied');
    return;
  }

  const sample = sampleWouldDeny(config.toolName, ruleName);
  if (!sample.emit) return;

  emitPolicyAudit(
    auditLogger,
    config.toolName,
    requestContext,
    verdict,
    `policy would have denied (warn mode)${describeOccurrence(sample.occurrence)}`
  );
}

function emitPolicyAudit(
  auditLogger: IAuditLogger,
  toolName: string,
  ctx: RequestContext,
  decision: PolicyAuditDecision,
  reason: string
): void {
  const actor = actorFromContext(ctx);
  auditLogger.logPolicyDecision({
    policyName: 'default',
    decision,
    reason,
    toolName,
    actor,
    requestId: ctx.requestId,
  });
}
