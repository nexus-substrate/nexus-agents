/**
 * Access Constraint Deriver — Policy enforcement (#1977, #2279).
 *
 * Pure function that checks a proposed tool call against a derived policy
 * and returns an AccessDecision. Enforcement depends on the policy's mode:
 * - `off` and `audit` never block
 * - `confirm_risky` (#2279) blocks violations on risky tools (write/exec/
 *   network) and log-and-allows violations on read-only tools
 * - `enforce` blocks every violation regardless of risk classification
 *
 * @module security/access-constraint-deriver/enforcer
 */

import { isPathDenied, isToolDenied } from './denylist.js';
import { isRiskyTool } from './tool-risk.js';
import type { AccessDecision, TaskAccessPolicy } from './types.js';

/**
 * Checks a proposed tool call against the unbypassable denylist AND the
 * task's derived access policy.
 *
 * Order of operations (the denylist is FIRST, and wins over the policy):
 * 1. If the tool is on the hardcoded deny-tool list → deny regardless of what
 *    the policy says. Note "regardless of the policy", NOT "in every mode":
 *    the sole production caller returns before `checkAccess` when the mode is
 *    `off`, so no code path reaches this line in that mode (#5022).
 * 2. If a file-path argument is provided and matches an unbypassable path
 *    pattern (e.g. `~/.ssh/**`, `/etc/shadow`) → deny regardless.
 * 3. Otherwise, fall back to the per-task policy. An empty `allowedTools`
 *    yields `unmeasured` — the allowlist arm did not run — rather than a
 *    blanket deny (#5022).
 *
 * The denylist check runs before the policy check so a malicious LLM-derived
 * policy cannot grant access to secrets/credentials by listing the tool in
 * `allowedTools`. Both denylist checks are reachable only from here, so they
 * protect exactly the callers that reach `checkAccess` — see the module note
 * in `chain-adapter.ts` on which boundary that currently is.
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

  // 3a. An EMPTY allowlist is the absence of a measurement, not a decision to
  //     deny everything (#5022). No production producer of `allowedTools` ever
  //     emits a tool name: the LLM deriver is asked for tool_categories /
  //     file_scope / network_scope and pins `allowedTools: []`
  //     (llm-deriver.ts), the keyword fallback hardcodes `[]`
  //     (fallback-regex.ts), and both derivation-failure paths choose between
  //     `[]` and `'*'`. So `[].includes(name)` is false for every call, and
  //     without this branch the verdict below is a constant function of
  //     (mode, isRiskyTool(name)) — independent of the objective, the LLM
  //     output and the trust tier.
  //
  //     Reporting that constant as a deny would be wrong twice over: it would
  //     block every guarded call the moment the check became reachable, and it
  //     would record a violation for a check that never actually ran. Say
  //     `unmeasured` instead, and let the caller allow the call while
  //     recording that the allowlist arm did not evaluate.
  if (policy.allowedTools.length === 0) {
    return {
      decision: 'unmeasured',
      reason: `allowlist arm did not run for tool "${toolName}": the derived policy (source "${policy.source}", mode "${policy.mode}") carries an empty allowedTools, and no producer emits tool names (#5022)`,
    };
  }

  if (policy.allowedTools.includes(toolName)) return { decision: 'allow' };

  return decideOnViolation(toolName, policy.mode);
}

/**
 * Mode-specific behavior when a tool is not in the per-task allowlist.
 * Extracted so checkAccess stays under the complexity-10 cap.
 */
function decideOnViolation(toolName: string, mode: TaskAccessPolicy['mode']): AccessDecision {
  if (mode === 'audit') {
    return {
      decision: 'log-and-allow',
      warning: `tool "${toolName}" not in derived policy (audit mode)`,
    };
  }
  // confirm_risky: split by tool risk classification (#2279). Read-only
  // violations are log-and-allow (audit-like); risky violations are denied
  // with a structured reason that surfaces "would-have-required-approval"
  // semantics. Operators add the tool to the allowlist after review, or
  // graduate to `enforce` once the violation rate is acceptable.
  if (mode === 'confirm_risky') {
    if (!isRiskyTool(toolName)) {
      return {
        decision: 'log-and-allow',
        warning: `tool "${toolName}" not in derived policy (confirm_risky mode, read-only — would have required human approval, allowed because read-only)`,
      };
    }
    return {
      decision: 'deny',
      reason: `tool "${toolName}" not in derived policy (confirm_risky mode, risky — would have required human approval; denied for now, add to allowedTools or run in audit mode to allow)`,
      matchedRule: 'allowedTools:confirm_risky',
    };
  }
  return {
    decision: 'deny',
    reason: `tool "${toolName}" not in derived policy`,
    matchedRule: 'allowedTools',
  };
}
