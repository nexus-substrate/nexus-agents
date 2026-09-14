/**
 * Process-wide registry for the MCP {@link IPolicyFirewall} (#4888).
 *
 * The firewall was constructed at startup and reached exactly one log line: no
 * tool's deps carried it, so `createSecureHandler` never received one and no
 * policy rule was ever evaluated against a real call. Threading it explicitly
 * through every tool's deps was the alternative; the panel chose a registry
 * (record #75, 5/5 approvers) because a new tool cannot forget to read it, and
 * a silent omission is exactly how the gap arose.
 *
 * @module mcp/middleware/policy-registry
 */

import type { ILogger } from '../../core/index.js';
import type { IPolicyFirewall } from './policy-types.js';

let globalPolicyFirewall: IPolicyFirewall | undefined;

/**
 * The firewall every secure handler consults when its own config omits one.
 *
 * `undefined` means no firewall was wired, and secure handlers skip the policy
 * check entirely — the pre-#4888 behaviour.
 */
export function getGlobalPolicyFirewall(): IPolicyFirewall | undefined {
  return globalPolicyFirewall;
}

/** Wires the firewall for the process. Called once during tool registration. */
export function setGlobalPolicyFirewall(firewall: IPolicyFirewall): void {
  globalPolicyFirewall = firewall;
}

/** Clears the wired firewall. Tests only — the server wires once at startup. */
export function resetGlobalPolicyFirewall(): void {
  globalPolicyFirewall = undefined;
}

/**
 * Forces a wired firewall into `warn`, returning it.
 *
 * `getPolicyValues` defaults `policyMode` to `'enforce'`, and that default has
 * been harmless only because nothing consumed the firewall. Honouring it the
 * moment the wiring lands would turn rules that have never evaluated a single
 * real call into denials, for every operator, in one release.
 *
 * There is deliberately **no opt-in to enforce yet**. Until #5114 the default
 * rule set's `isMutationTool` guessed "mutation" for every name outside two
 * hand-kept sets, so enforcing would have denied roughly 45 of the 47
 * registered tools. Every registered tool is now classified from its manifest
 * `readOnlyHint`, so the rule denies only declared mutations — but nothing
 * passes `executionMode` into `createSecureHandler` (#6294), so `mode` is
 * always `'read-only'` and every `readOnlyHint: false` tool (21 of 47 at the
 * time of writing) would still be denied. Whether that is the right enforced
 * default is #4988's decision, not this function's; the enforce path stays
 * closed until it is made.
 *
 * `warn` still evaluates every rule and logs every would-be denial, which is
 * the evidence that classification work needs.
 */
export function stagePolicyFirewallForRollout(
  firewall: IPolicyFirewall,
  logger: ILogger
): IPolicyFirewall {
  const configuredMode = firewall.getMode();
  if (configuredMode !== 'warn') {
    firewall.setMode('warn');
  }
  logger.info('MCP policy firewall wired in warn mode — denials are logged, not applied', {
    configuredMode,
    ruleCount: firewall.getRules().length,
  });
  return firewall;
}
