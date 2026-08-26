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

/** Opt-in for real denials. Absent, a wired firewall is downgraded to `warn`. */
export const POLICY_ENFORCE_ENV = 'NEXUS_MCP_POLICY_ENFORCE';

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
 * Puts a firewall into the mode this rollout should start in, returning it.
 *
 * `getPolicyValues` defaults `policyMode` to `'enforce'`, and that default has
 * been harmless only because nothing consumed the firewall. Honouring it the
 * moment the wiring lands would turn rules that have never evaluated a single
 * real call into denials, for every operator, in one release — the staged
 * treatment `NEXUS_ACCESS_POLICY_MODE` and `NEXUS_AUTO_REMEDIATE` both got
 * exists precisely for this. `warn` still evaluates every rule and logs every
 * would-be denial, which is the evidence an enforce decision needs.
 */
export function stagePolicyFirewallForRollout(
  firewall: IPolicyFirewall,
  logger: ILogger
): IPolicyFirewall {
  if (process.env[POLICY_ENFORCE_ENV] === '1') {
    logger.info('MCP policy firewall enforcing', {
      mode: firewall.getMode(),
      ruleCount: firewall.getRules().length,
    });
    return firewall;
  }
  const configuredMode = firewall.getMode();
  if (configuredMode !== 'warn') {
    firewall.setMode('warn');
  }
  logger.info('MCP policy firewall wired in warn mode — denials are logged, not applied', {
    configuredMode,
    ruleCount: firewall.getRules().length,
    enforceWith: `${POLICY_ENFORCE_ENV}=1`,
  });
  return firewall;
}
