/**
 * Access Constraint Deriver — MCP middleware-chain adapter (#1977 activation).
 *
 * The only `Middleware`-shaped entry point into the ClawGuard enforcer. It is
 * mounted into the standard stack (`mcp/middleware/middleware-chain.ts`), so
 * every tool wrapped via `withMiddleware` passes through it.
 *
 * KNOWN GAP — the policy is not in scope here (#5022). The enforcer reads its
 * `TaskAccessPolicy` from `AsyncLocalStorage`, and the only two production
 * callers of `withAccessPolicy` wrap in-process orchestrator/expert execution
 * (`mcp/tools/orchestrate.ts`, `mcp/tools/execute-expert.ts`). An inbound MCP
 * request handled by the SDK transport is a SIBLING async context, never a
 * descendant of one of those `run()` calls, so `getActivePolicy()` returns
 * undefined and this adapter is a pass-through for every real dispatch.
 *
 * That is a boundary question, not a bug to patch here: either the policy is
 * established at inbound dispatch, or the enforcer belongs at the agent
 * tool-call seam where its per-objective policy actually has scope. #5022
 * holds the decision; `access-policy-reachability.test.ts` pins the current
 * behaviour so it cannot change without that decision being made.
 *
 * @module security/access-constraint-deriver/chain-adapter
 */

import { checkAccess } from './enforcer.js';
import { denyToToolResult, getActivePolicy, recordAuditModeViolation } from './mcp-guard.js';
import type { GuardArgs } from './mcp-guard.js';
// Type-only import: no runtime cycle with mcp/middleware/middleware-chain.ts.
import type { Middleware } from '../../mcp/middleware/middleware-chain.js';

function toGuardArgs(args: unknown): GuardArgs | undefined {
  if (typeof args !== 'object' || args === null) return undefined;
  const path = (args as Record<string, unknown>)['path'];
  return typeof path === 'string' && path.length > 0 ? { path } : undefined;
}

/**
 * Builds a middleware-chain-compatible access-policy middleware for
 * `toolName`. Reads the active `TaskAccessPolicy` from `AsyncLocalStorage`
 * (populated by `withAccessPolicy`). When no policy is active OR the
 * policy is in `off` mode, the middleware is a no-op pass-through — see the
 * module note on why that is every inbound dispatch today.
 */
export function createAccessPolicyChainMiddleware(toolName: string): Middleware {
  return async (args, ctx, next) => {
    const policy = getActivePolicy();
    if (policy === undefined || policy.mode === 'off') {
      return next(args, ctx);
    }

    const decision = checkAccess(toolName, policy, toGuardArgs(args));

    if (decision.decision === 'allow') {
      return next(args, ctx);
    }
    if (decision.decision === 'unmeasured') {
      // NOT a violation: the allowlist arm never ran, so there is nothing to
      // record against the #2077 denominator. Logged so the inertness is
      // visible, and deliberately NOT sent to recordAuditModeViolation (#5022).
      ctx.logger.debug('access-policy: allowlist unmeasured', {
        tool: toolName,
        reason: decision.reason,
        policySource: policy.source,
        mode: policy.mode,
        requestId: ctx.requestContext.requestId,
      });
      return next(args, ctx);
    }
    if (decision.decision === 'log-and-allow') {
      ctx.logger.warn('access-policy: audit violation', {
        tool: toolName,
        warning: decision.warning,
        policySource: policy.source,
        requestId: ctx.requestContext.requestId,
      });
      recordAuditModeViolation({
        toolName,
        warning: decision.warning,
        policySource: policy.source,
        mode: policy.mode,
        requestId: ctx.requestContext.requestId,
      });
      return next(args, ctx);
    }
    // .warn, not .info: a denial must not be logged BELOW an audit-mode
    // observation, which uses .warn above (#5022).
    ctx.logger.warn('access-policy: tool call denied', {
      tool: toolName,
      reason: decision.reason,
      matchedRule: decision.matchedRule,
      policySource: policy.source,
      mode: policy.mode,
      requestId: ctx.requestContext.requestId,
    });
    return denyToToolResult(decision, ctx.requestContext.requestId);
  };
}
