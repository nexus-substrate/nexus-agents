/**
 * Access Constraint Deriver — MCP middleware-chain adapter (#1977 activation).
 *
 * Bridges `createAccessPolicyMiddleware` (which returns a generic
 * `Promise<unknown>`-shaped middleware) to the strongly-typed `Middleware`
 * contract used by `mcp/middleware/middleware-chain.ts`.
 *
 * Mounted into the standard middleware stack so every tool call passes
 * through the ClawGuard enforcer. When no orchestrator has wrapped the
 * call with `withAccessPolicy(...)`, this adapter is a no-op pass-through
 * — runtime behavior is unchanged for callers that don't set up a policy.
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
 * policy is in `off` mode, the middleware is a no-op pass-through.
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
    ctx.logger.info('access-policy: tool call denied', {
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
