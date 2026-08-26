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
 * There is deliberately **no opt-in to enforce yet**. The default rule set
 * includes `denyMutationsWithoutModeRule`, `isMutationTool` treats an unknown
 * tool as a mutation (`policy-rules.ts:63`), `READ_ONLY_TOOLS` lists six names
 * of which two are nexus tools, and nothing passes `executionMode` into
 * `createSecureHandler` — so `mode` is always `'read-only'`. Enforcing today
 * would deny roughly 45 of the 47 registered tools and leave the operator no
 * remedy but to switch the control back off. An escape hatch that bricks the
 * server is worse than none, so the enforce path stays closed until the tools
 * are classified (see the enforce-default issue).
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
