/**
 * Access Constraint Deriver — Policy enforcement (#1977).
 *
 * Pure function that checks a proposed tool call against a derived policy
 * and returns an AccessDecision. Enforcement depends on the policy's mode:
 * `off` and `audit` never block (audit would log to telemetry — wiring TBD);
 * `enforce` blocks violations.
 *
 * @module security/access-constraint-deriver/enforcer
 */

import { isPathDenied, isToolDenied } from './denylist.js';
import type { AccessDecision, TaskAccessPolicy } from './types.js';

/**
 * Checks a proposed tool call against the unbypassable denylist AND the
 * task's derived access policy.
 *
 * Order of operations (important — the denylist is FIRST and unbypassable):
 * 1. If the tool is on the hardcoded deny-tool list → deny regardless
 *    of policy. This is unbypassable even in `off` mode.
 * 2. If a file-path argument is provided and matches an unbypassable path
 *    pattern (e.g. `~/.ssh/**`, `/etc/shadow`) → deny regardless.
 * 3. Otherwise, fall back to the per-task policy (bypass in skeleton).
 *
 * The denylist check runs before the policy check so a malicious LLM-derived
 * policy cannot grant access to secrets/credentials by listing the tool in
 * `allowedTools`.
 */
export function checkAccess(
  toolName: string,
  policy: TaskAccessPolicy,
  args?: { readonly path?: string }
): AccessDecision {
  // 1. Unbypassable tool denylist — applies in all modes.
  if (isToolDenied(toolName)) {
    return {
      decision: 'deny',
      reason: `tool "${toolName}" is on the unbypassable deny-tool list`,
      matchedRule: 'unbypassable:tool',
    };
  }

  // 2. Unbypassable path denylist — applies when a path argument is given.
  if (typeof args?.path === 'string' && args.path.length > 0 && isPathDenied(args.path)) {
    return {
      decision: 'deny',
      reason: `path "${args.path}" is on the unbypassable deny-path list`,
      matchedRule: 'unbypassable:path',
    };
  }

  // 3. Per-task policy check.
  if (policy.allowedTools === '*') return { decision: 'allow' };

  if (policy.allowedTools.includes(toolName)) return { decision: 'allow' };

  if (policy.mode === 'audit') {
    return {
      decision: 'log-and-allow',
      warning: `tool "${toolName}" not in derived policy (audit mode)`,
    };
  }

  return {
    decision: 'deny',
    reason: `tool "${toolName}" not in derived policy`,
    matchedRule: 'allowedTools',
  };
}
