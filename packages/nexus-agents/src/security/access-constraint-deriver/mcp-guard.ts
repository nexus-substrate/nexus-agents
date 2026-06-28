/**
 * Access Constraint Deriver — MCP tool dispatch guard (#1977 final wiring).
 *
 * Per-call helper and middleware factory that plugs the access-constraint
 * enforcer into the MCP tool dispatch path. Runs AFTER policy derivation
 * (deriver.ts owns that) and BEFORE the tool handler executes.
 *
 * Behavior matrix:
 * - mode=off → no-op, allows every call (this is the default; runtime
 *   behavior is unchanged from pre-#1977)
 * - mode=audit → checks against the policy; on violation, logs a warning
 *   and still forwards to the handler
 * - mode=enforce → checks against the policy; on violation, returns an
 *   MCP-format isError result without invoking the handler
 *
 * The enforcer's hardcoded denylist (denylist.ts) runs FIRST regardless
 * of mode. Even `off` mode denies destructive tools and secret paths.
 *
 * @module security/access-constraint-deriver/mcp-guard
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { checkAccess } from './enforcer.js';
import type { AccessDecision, TaskAccessPolicy } from './types.js';
import { emitClawGuardViolation, type AuditTrail } from '../audit-trail.js';

/** AsyncLocalStorage holding the active task's access policy. */
const accessPolicyStorage = new AsyncLocalStorage<TaskAccessPolicy>();

/**
 * AsyncLocalStorage holding the active durable {@link AuditTrail} (#4097).
 * Established by orchestrators (orchestrate / execute_expert) alongside
 * `withAccessPolicy` ONLY when the server threaded an `auditLogger`. When
 * absent, {@link recordAuditModeViolation} is a no-op, so the no-logger path
 * stays byte-identical.
 */
const auditTrailStorage = new AsyncLocalStorage<AuditTrail>();

/** Max persisted warning length (#4097) — caps unbounded decision text. */
const MAX_WARNING_LEN = 500;

/**
 * Run `fn` with `trail` available to any nested MCP tool dispatch, so the
 * access-policy middleware can persist AUDIT-mode violations to the durable
 * sink. Mirrors {@link withAccessPolicy}.
 */
export function withAuditTrail<T>(trail: AuditTrail, fn: () => Promise<T>): Promise<T> {
  return auditTrailStorage.run(trail, fn);
}

/**
 * Returns the active durable audit trail, or undefined when no wrapping
 * `withAuditTrail` is in scope (the pure-CLI / no-logger path). Mirrors
 * {@link getActivePolicy}.
 */
export function getActiveAuditTrail(): AuditTrail | undefined {
  return auditTrailStorage.getStore();
}

/**
 * Best-effort persist of a ClawGuard AUDIT-mode violation (#4097). Reads the
 * active trail from ALS; no-ops when none is established. NEVER throws — a sink
 * failure must never break the log-and-allow path that ALLOWS the call.
 */
export function recordAuditModeViolation(input: {
  readonly toolName: string;
  readonly warning: string;
  readonly policySource: string;
  readonly mode: string;
  readonly requestId: string;
}): void {
  const trail = getActiveAuditTrail();
  if (trail === undefined) return;
  try {
    emitClawGuardViolation(trail, {
      toolName: input.toolName,
      warning: input.warning.slice(0, MAX_WARNING_LEN),
      policySource: input.policySource,
      mode: input.mode,
      requestId: input.requestId,
    });
  } catch {
    /* never break log-and-allow (#4097) */
  }
}

/**
 * Run `fn` with `policy` available to any nested MCP tool dispatch.
 *
 * Orchestrators (orchestrate, execute_expert, etc.) derive a policy at
 * task start and wrap downstream work in this helper. Tool handlers that
 * use `guardMcpToolCall` will read the policy from ALS.
 */
export function withAccessPolicy<T>(policy: TaskAccessPolicy, fn: () => Promise<T>): Promise<T> {
  return accessPolicyStorage.run(policy, fn);
}

/**
 * Returns the active access policy, or undefined if no wrapping `withAccessPolicy`
 * is in scope. When undefined, `guardMcpToolCall` treats the request as
 * mode=off (permissive) since no task context has been established.
 */
export function getActivePolicy(): TaskAccessPolicy | undefined {
  return accessPolicyStorage.getStore();
}

/**
 * Input-hints a tool handler can surface so the guard can reason about
 * file-path arguments. Tools with a `path` arg should pass it; tools
 * without can omit.
 */
export interface GuardArgs {
  readonly path?: string;
}

/**
 * Check a proposed MCP tool call against the active access policy.
 *
 * Pure function — does not mutate the policy or the storage. Returns an
 * AccessDecision the caller interprets:
 *
 * - `allow`: invoke the handler
 * - `deny`: do not invoke; return a RefuseAction / isError result upstream
 * - `log-and-allow`: log a warning, then invoke the handler (audit mode)
 *
 * When no policy is in ALS (no wrapping `withAccessPolicy`), this returns
 * `allow` — the guard is opt-in at the orchestrator layer.
 */
export function guardMcpToolCall(toolName: string, args?: GuardArgs): AccessDecision {
  const policy = getActivePolicy();
  if (policy === undefined) return { decision: 'allow' };
  return checkAccess(toolName, policy, args);
}

/**
 * Shape of the logger the middleware uses. Minimal to avoid coupling.
 */
interface MiddlewareLogger {
  warn: (message: string, context?: Record<string, unknown>) => void;
  info: (message: string, context?: Record<string, unknown>) => void;
}

/**
 * Formats a deny decision as an MCP-compliant isError ToolResult shape.
 * The MCP server's middleware chain recognizes `{ isError, content }` and
 * surfaces it as a tool error to the caller.
 */
export function denyToToolResult(
  decision: Extract<AccessDecision, { decision: 'deny' }>,
  requestId: string
): { isError: true; content: Array<{ type: 'text'; text: string }> } {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: `access denied: ${decision.reason} (rule: ${decision.matchedRule}, request: ${requestId})`,
      },
    ],
  };
}

/**
 * Create an access-policy middleware that plugs into the MCP middleware
 * chain. Reads the active policy from ALS. When no policy is active OR
 * the policy is in `off` mode, this middleware is a no-op pass-through.
 */
export function createAccessPolicyMiddleware(config: {
  readonly toolName: string;
  readonly logger: MiddlewareLogger;
}): (
  args: unknown,
  ctx: { readonly requestContext: { readonly requestId: string } },
  next: (args: unknown, ctx: unknown) => Promise<unknown>
) => Promise<unknown> {
  return async (args, ctx, next) => {
    const policy = getActivePolicy();
    if (policy === undefined || policy.mode === 'off') {
      return next(args, ctx);
    }

    const guardArgs = toGuardArgs(args);
    const decision = checkAccess(config.toolName, policy, guardArgs);

    if (decision.decision === 'allow') {
      return next(args, ctx);
    }
    if (decision.decision === 'log-and-allow') {
      config.logger.warn('access-policy: audit violation', {
        tool: config.toolName,
        warning: decision.warning,
        policySource: policy.source,
        requestId: ctx.requestContext.requestId,
      });
      recordAuditModeViolation({
        toolName: config.toolName,
        warning: decision.warning,
        policySource: policy.source,
        mode: policy.mode,
        requestId: ctx.requestContext.requestId,
      });
      return next(args, ctx);
    }
    // decision.decision === 'deny'
    config.logger.info('access-policy: tool call denied', {
      tool: config.toolName,
      reason: decision.reason,
      matchedRule: decision.matchedRule,
      policySource: policy.source,
      mode: policy.mode,
      requestId: ctx.requestContext.requestId,
    });
    return denyToToolResult(decision, ctx.requestContext.requestId);
  };
}

/** Extract path from a typed tool-arg record, if present and a string. */
function toGuardArgs(args: unknown): GuardArgs | undefined {
  if (typeof args !== 'object' || args === null) return undefined;
  const path = (args as Record<string, unknown>)['path'];
  return typeof path === 'string' && path.length > 0 ? { path } : undefined;
}
