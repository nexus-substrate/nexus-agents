/**
 * Access Constraint Deriver — MCP tool dispatch guard (#1977 final wiring).
 *
 * Owns the two AsyncLocalStorage channels the guard reads from — the derived
 * `TaskAccessPolicy` and the `AuditTrail` — plus the deny-result formatter.
 * The enforcement middleware itself lives in `chain-adapter.ts`; this module
 * previously carried a second, parallel copy of it (`createAccessPolicyMiddleware`)
 * and a per-call helper (`guardMcpToolCall`), both of which had no production
 * caller and were removed in #5022.
 *
 * Behaviour matrix (as evaluated by `checkAccess`, reached via chain-adapter):
 * - mode=off → no-op pass-through, allows every call
 * - mode=audit (the DEFAULT since v2.50, see config.ts) → checks against the
 *   policy; on violation, logs a warning and still forwards to the handler
 * - mode=confirm_risky → denies violations on risky tools, log-and-allows on
 *   read-only ones
 * - mode=enforce → denies every violation
 *
 * SCOPE (#5022): the denylist in `denylist.ts` runs first WITHIN `checkAccess`,
 * but `checkAccess` is only reached when a policy is in ALS. It is not in scope
 * at inbound MCP dispatch, and `off` returns before the check regardless — so
 * the denylist does NOT currently protect `~/.ssh/**`, `~/.aws/**` or
 * `/etc/shadow` at that boundary in any mode. An earlier version of this header
 * claimed it did.
 *
 * @module security/access-constraint-deriver/mcp-guard
 */

import { AsyncLocalStorage } from 'node:async_hooks';
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
 * task start and wrap downstream work in this helper.
 *
 * NOTE (#5022): only work dispatched INSIDE `fn` sees the policy. An inbound
 * MCP tool call is a sibling async context, so the middleware mounted on
 * registered tools does not observe policies established here.
 */
export function withAccessPolicy<T>(policy: TaskAccessPolicy, fn: () => Promise<T>): Promise<T> {
  return accessPolicyStorage.run(policy, fn);
}

/**
 * Returns the active access policy, or undefined if no wrapping `withAccessPolicy`
 * is in scope. `undefined` is the value observed at every inbound MCP dispatch
 * today (#5022), and its consumer treats it as permissive pass-through.
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
