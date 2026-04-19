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

import type { AccessDecision, TaskAccessPolicy } from './types.js';

/**
 * Checks a proposed tool call against a task's access policy.
 *
 * In skeleton state the policy is always a bypass (allow-all) so this
 * function always returns `allow`. Once the deriver produces real policies,
 * this enforcer will match `toolName` against `allowedTools` and return
 * `deny` (in enforce mode) or `log-and-allow` (in audit mode) when a call
 * falls outside the derived scope.
 */
export function checkAccess(toolName: string, policy: TaskAccessPolicy): AccessDecision {
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
