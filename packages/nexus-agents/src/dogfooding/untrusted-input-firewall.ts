/**
 * nexus-agents/dogfooding - Untrusted-input firewall (shared instance)
 *
 * The one `HostileInputFirewall` the live untrusted-input paths route through
 * (#4992): `issue-triage` and `pr-reviewer`. Before this module both called
 * `classifyTrust()` directly, which meant no trust classification on any live
 * path reached the security audit trail, and the maintainer allowlist the
 * classifier reads from `config` was never supplied — `isAllowlisted: false`
 * was recorded on every result without ever being measured.
 *
 * Division of labour, ratified by the #4992 panel:
 *
 * - The firewall is INPUT-shaped: it sanitizes, classifies, evaluates the
 *   Rule of Two against the caller's access posture, and records the trust
 *   event. Under the default `NEXUS_FIREWALL_POLICY=off` it is signal-only.
 * - The callers keep their own `evaluatePolicy` (Rule of Two per action) and
 *   measure reputation themselves with metadata the firewall cannot see
 *   (account age, comment history). They pass that measurement per call, and
 *   the firewall runs the ONE reputation gate both sides act on — so its
 *   Rule-of-Two check, `wouldRefuse` count and trust audit event use the same
 *   enforced tier the caller's policy gate uses.
 * - Facts that vary per call — the caller's access posture and, when a source
 *   for one exists, the repository's maintainer allowlist — are passed per
 *   call via `FirewallProcessOptions`, never held on the shared instance. No
 *   allowlist source exists today (no config field, no env var), so the
 *   callers pass none and `isAllowlisted` stays absent on their results.
 *
 * @module dogfooding/untrusted-input-firewall
 */

import type { Result } from '../core/index.js';
import { ok, err, createLogger } from '../core/index.js';
import type { IAuditLogger } from '../audit/audit-types.js';
import { HostileInputFirewall } from '../security/firewall/firewall-pipeline.js';
import type { FirewallResult } from '../security/firewall/firewall-pipeline.js';
import type { FirewallProcessOptions } from '../security/firewall/firewall-types.js';
import { createGitHubAdapter } from '../security/firewall/github-adapter.js';
import type { GitHubInput } from '../security/firewall/github-adapter.js';

const logger = createLogger({ component: 'UntrustedInputFirewall' });

let singleton: HostileInputFirewall | undefined;
/** The process's durable audit logger, when the bootstrap has one (#4992 review). */
let configuredAuditLogger: IAuditLogger | undefined;

/**
 * Supplies the process-wide durable audit logger to the shared firewall.
 *
 * The MCP server creates exactly one `AuditLogger` at startup
 * (`initializeAuditLogger`, gated on `security.audit.enabled`) and threads it
 * by DI; there is no global accessor. `initV2PipelineSubsystems` calls this
 * with that logger so trust events on the live paths reach the hash-chained
 * log instead of an in-memory buffer the next call clears. Without it — the
 * CLI review path, or audit disabled — the firewall reports `auditSink: 'none'`
 * and claims no emission.
 *
 * Replaces the cached instance so the sink cannot be missed by an instance
 * built before bootstrap reached this point.
 */
export function configureUntrustedInputFirewall(deps: { auditLogger?: IAuditLogger }): void {
  configuredAuditLogger = deps.auditLogger;
  singleton = undefined;
}

/**
 * The process-wide firewall, constructed on first use.
 *
 * `contentDowngrade: false` is what keeps the default mode pass-through: the
 * firewall's own classifier is content-aware (injection-bearing content from a
 * Tier-2 author classifies as Tier 4), while the production paths classify by
 * role and route content signals through reputation gating, which has its own
 * rollout knob (`NEXUS_REPUTATION_GATING`). The injection flags are still
 * measured and recorded by the sanitization stage; only the tier downgrade is
 * withheld so the recorded `trustTier` is unchanged under `off`.
 *
 * The reputation stage stays off: the callers assess reputation themselves
 * with metadata the firewall never sees. `policyMode` is resolved from
 * `NEXUS_FIREWALL_POLICY` once, at construction.
 */
export function getUntrustedInputFirewall(): HostileInputFirewall {
  singleton ??= new HostileInputFirewall({
    adapter: createGitHubAdapter(),
    contentDowngrade: false,
    ...(configuredAuditLogger !== undefined ? { auditLogger: configuredAuditLogger } : {}),
  });
  return singleton;
}

// @export-no-consumer-yet — see #4992. Test-only seam: drops or replaces the
// cached instance so a test can re-read the env or observe the audit trail.
export function _setUntrustedInputFirewallForTests(
  firewall: HostileInputFirewall | undefined
): void {
  singleton = firewall;
}

/**
 * Runs one untrusted GitHub payload through the shared firewall.
 *
 * Maps the firewall's typed error into the `Result<_, Error>` shape the
 * callers already return, failing closed on every code: an unparseable payload
 * (`EXTRACTION_FAILED`) is as much a reason not to proceed as a policy
 * refusal (`POLICY_REFUSED`, only reachable under `enforce`). Under `audit` a
 * would-be refusal is logged and the result is returned unchanged — that log
 * line is the telemetry an operator sizes the flip to `enforce` on.
 */
export function runUntrustedInputFirewall(
  input: GitHubInput,
  options: FirewallProcessOptions
): Result<FirewallResult, Error> {
  const result = getUntrustedInputFirewall().process(input, options);
  if (!result.ok) {
    const { code, stage, message } = result.error;
    logger.warn('Untrusted-input firewall rejected the input', {
      user: input.username,
      sourceType: input.type,
      code,
      stage,
    });
    return err(new Error(`Untrusted-input firewall ${code} at stage ${stage}: ${message}`));
  }
  if (result.value.wouldRefuse) {
    logger.warn('Untrusted-input firewall would refuse under enforce (audit mode)', {
      user: input.username,
      sourceType: input.type,
      trustTier: result.value.effectiveTrustTier,
      rule: result.value.ruleOfTwoViolation?.rule,
    });
  }
  return ok(result.value);
}
