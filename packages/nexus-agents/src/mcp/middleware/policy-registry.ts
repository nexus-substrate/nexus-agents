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
import { DEFAULT_EXECUTION_MODE } from '../../config/schemas-security.js';
import { parseBoolValue } from '../../config/defaults-env.js';
import type { ExecutionMode, IPolicyFirewall } from './policy-types.js';

let globalPolicyFirewall: IPolicyFirewall | undefined;
let globalExecutionMode: ExecutionMode = DEFAULT_EXECUTION_MODE;

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

/**
 * The execution mode every secure handler evaluates policy under when its own
 * config carries none (#6431, #6294).
 *
 * The operator's `security.policy.defaultMode` used to travel from config to a
 * startup log line and stop: `createSecureHandler`, the middleware chain and
 * the tool wrapper each resolved a literal `'read-only'`, so an enforcing
 * firewall would have denied every mutation tool regardless of the setting.
 * The registration now sets the mode here — the same seam #4888 chose for the
 * firewall, for the same reason: a handler cannot forget to read it.
 */
export function getGlobalExecutionMode(): ExecutionMode {
  return globalExecutionMode;
}

/** Sets the process-wide execution mode. Called once during tool registration. */
export function setGlobalExecutionMode(mode: ExecutionMode): void {
  globalExecutionMode = mode;
}

/**
 * Clears the wired firewall and restores the default execution mode. Tests
 * only — the server wires once at startup.
 */
export function resetGlobalPolicyFirewall(): void {
  globalPolicyFirewall = undefined;
  globalExecutionMode = DEFAULT_EXECUTION_MODE;
}

/** The mode the firewall will run in, and what decided it. */
interface PolicyRolloutMode {
  readonly mode: 'enforce' | 'warn';
  readonly reason: 'NEXUS_MCP_POLICY_ENFORCE' | 'rollout default';
}

/**
 * Resolves the EFFECTIVE firewall mode from the environment (#6431). One
 * resolver for the startup security line and for the staging call, so the
 * two cannot disagree about what is in effect.
 *
 * `security.policy.policyMode` is deliberately not an input: it defaults to
 * `enforce` and had never been applied to a real call, so honouring it would
 * turn the default on for every operator at once. Whether it should be is
 * #4988's decision; until then the env var is the only switch, and a config
 * `warn` does not override an explicit opt-in.
 */
export function resolvePolicyRolloutMode(env: NodeJS.ProcessEnv = process.env): PolicyRolloutMode {
  return parseBoolValue(env['NEXUS_MCP_POLICY_ENFORCE'], false)
    ? { mode: 'enforce', reason: 'NEXUS_MCP_POLICY_ENFORCE' }
    : { mode: 'warn', reason: 'rollout default' };
}

/**
 * `enforce (NEXUS_MCP_POLICY_ENFORCE)` / `warn (rollout default)` — the mode
 * in effect and why, as one field a reader cannot mistake for the config value.
 */
export function formatPolicyRolloutMode(rollout: PolicyRolloutMode): string {
  return `${rollout.mode} (${rollout.reason})`;
}

/**
 * Stages a wired firewall into the mode the rollout allows, returning it.
 *
 * `getPolicyValues` defaults `policyMode` to `'enforce'`, and that default has
 * been harmless only because nothing consumed the firewall. Honouring it the
 * moment the wiring lands would turn rules that have never evaluated a single
 * real call into denials, for every operator, in one release. So the default
 * is `warn`: every rule is evaluated and every would-be denial is logged, none
 * is applied — the evidence #4988 needs.
 *
 * `NEXUS_MCP_POLICY_ENFORCE=1` (#6431) is the per-operator opt-in #4987
 * described. It runs the firewall in `enforce` regardless of the configured
 * `policyMode`, so an operator can enforce today and the soak has an enforce
 * cohort. Two things made that safe to wire: every registered tool is
 * classified from its manifest `readOnlyHint` (#5114), and the default
 * execution mode is `read-write` with the registry carrying it to every
 * handler (#6431, #6294) — so enforcing denies path-rule violations and
 * unclassified tools, not every mutation tool on the manifest.
 *
 * The log line names the EFFECTIVE mode and the reason. It no longer reports
 * the configured value: `configuredMode: 'enforce'` beside a firewall just set
 * to warn claimed an enforcement that did not happen.
 */
export function stagePolicyFirewallForRollout(
  firewall: IPolicyFirewall,
  logger: ILogger,
  env: NodeJS.ProcessEnv = process.env
): IPolicyFirewall {
  const rollout = resolvePolicyRolloutMode(env);
  if (firewall.getMode() !== rollout.mode) {
    firewall.setMode(rollout.mode);
  }
  const denialsApplied = rollout.mode === 'enforce';
  logger.info(
    denialsApplied
      ? 'MCP policy firewall wired in enforce mode — denials are applied'
      : 'MCP policy firewall wired in warn mode — denials are logged, not applied',
    {
      policyMode: formatPolicyRolloutMode(rollout),
      denialsApplied,
      ruleCount: firewall.getRules().length,
    }
  );
  return firewall;
}
