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
 * Division of labour, ratified by the #4992 panel and completed by #5383:
 *
 * - The firewall is the ONE composition: it sanitizes, classifies, runs the
 *   reputation gate, evaluates policy against the caller's access posture, and
 *   records every decision on the audit trail. Under the default
 *   `NEXUS_FIREWALL_POLICY=off` it REFUSES nothing — but it still evaluates.
 * - It is entered twice per live input, because the callers only know their
 *   actions after they know the tier. `runUntrustedInputFirewall` is the
 *   INPUT-shaped entry (no action; the Rule of Two measured, the six
 *   action-scoped checks named `unmeasured`, `policy.scope: 'context'`), and
 *   `evaluateActionThroughFirewall` is the ACTION-shaped entry, called once per
 *   action the caller intends to take, which runs the full `evaluatePolicy` set
 *   (#5380) and hands back the decision from `FirewallResult.policy`. Neither
 *   caller calls `evaluatePolicy` itself any more (#5383): the #4992 panel let
 *   them keep it only because the firewall had no action-shaped entry then.
 * - The callers still measure reputation themselves, with metadata the
 *   firewall cannot see (account age, comment history), and pass that
 *   measurement per call; the firewall runs the ONE reputation gate, so the
 *   trust event, the policy checks and the `wouldRefuse` count all use the one
 *   enforced tier. The callers cross-check that the action-shaped run enforced
 *   the tier the input-shaped run did, and fail closed if not.
 * - Facts that vary per call — the caller's access posture, the action, the
 *   repository label set and, when a source for one exists, the maintainer
 *   allowlist — are passed per call via `FirewallProcessOptions`, never held on
 *   the shared instance. No allowlist source exists today (no config field, no
 *   env var), so the callers pass none and `isAllowlisted` stays absent.
 *
 * @module dogfooding/untrusted-input-firewall
 */

import type { Result } from '../core/index.js';
import { ok, err, createLogger } from '../core/index.js';
import type { IAuditLogger } from '../audit/audit-types.js';
import { HostileInputFirewall } from '../security/firewall/firewall-pipeline.js';
import type { FirewallResult } from '../security/firewall/firewall-pipeline.js';
import type { FirewallError, FirewallProcessOptions } from '../security/firewall/firewall-types.js';
import type { FirewallPolicyMode } from '../security/firewall/firewall-policy-mode.js';
import { createGitHubAdapter } from '../security/firewall/github-adapter.js';
import type { GitHubInput } from '../security/firewall/github-adapter.js';
import type { AgentAction } from '../security/action-schema.js';
import type { Violation } from '../security/policy-gate.js';
import type { TrustTier } from '../security/trust-types.js';

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
  const result = processAndLog(input, options);
  if (!result.ok) return err(asError(result.error));
  return ok(result.value);
}

/**
 * The firewall's verdict on ONE action a live caller intends to take (#5383),
 * read from `FirewallResult.policy` — the same `evaluatePolicy` decision the
 * callers used to compute beside the firewall, now computed inside it and
 * recorded on the audit trail as a `policy_gate` event.
 *
 * Two shapes, because the mode changes who refuses, never what was decided:
 *
 * - `refused: false` — under `off` and `audit` the firewall returns the
 *   decision and the CALLER enforces it, exactly as it did with the direct
 *   call: `allowed` is `evaluatePolicy`'s own verdict, whatever the mode.
 *   `wouldRefuse` is `audit`'s telemetry.
 * - `refused: true` — under `enforce` the firewall refused the action itself
 *   (`POLICY_REFUSED`). `violations` is the blocking list it refused on, so the
 *   caller's record can still name the rules; `requiresApproval` is absent
 *   because the decision never reached the caller.
 *
 * Either way `allowed` is what the caller acts on, so a per-action decision
 * cannot silently weaken when the mode is `off`.
 */
export type FirewallActionDecision =
  | {
      readonly refused: false;
      readonly allowed: boolean;
      readonly requiresApproval: boolean;
      readonly violations: readonly Violation[];
      /** The tier this run enforced — equal to the caller's `enforcedTier`, or the call failed. */
      readonly effectiveTrustTier: TrustTier;
      readonly policyMode: FirewallPolicyMode;
      readonly wouldRefuse: boolean;
    }
  | {
      readonly refused: true;
      readonly allowed: false;
      readonly violations: readonly Violation[];
      readonly policyMode: 'enforce';
    };

/**
 * Runs one action through the shared firewall and returns its policy verdict.
 *
 * `enforcedTier` is the tier the caller's classification run enforced (the
 * reputation gate's, #3122) and stamped on the action's citations. The
 * firewall recomputes that gate here from the same measurement; a run that
 * enforces a DIFFERENT tier fails the call, because a record that disagrees
 * with what was enforced is worse than none (#5719).
 *
 * Fails closed — an `Error`, not a verdict — wherever no verdict exists: that
 * tier disagreement, a non-policy firewall error (an unparseable payload), and
 * a run whose `policy` is absent or `scope: 'context'`, which means the policy
 * stage did not evaluate this action. None of these is "denied"; recording
 * `allowed: false` for them would put a measurement where none was taken.
 */
export function evaluateActionThroughFirewall(
  input: GitHubInput,
  options: FirewallProcessOptions & {
    readonly action: AgentAction;
    readonly enforcedTier: TrustTier;
  }
): Result<FirewallActionDecision, Error> {
  const { enforcedTier, ...processOptions } = options;
  const result = processAndLog(input, processOptions);
  if (!result.ok) {
    const { code, stage, violations } = result.error;
    if (code !== 'POLICY_REFUSED' || stage !== 'policy') return err(asError(result.error));
    // A refusal that names no rule cannot be recorded as a policy decision.
    if (violations === undefined || violations.length === 0) return err(asError(result.error));
    return ok({ refused: true, allowed: false, violations, policyMode: 'enforce' });
  }
  const { policy, policyMode, wouldRefuse, effectiveTrustTier } = result.value;
  if (policy?.scope !== 'action') {
    const why = policy === undefined ? 'the policy stage is disabled' : `scope was ${policy.scope}`;
    return err(
      new Error(
        `Untrusted-input firewall did not evaluate policy for action ${options.action.type} (${why})`
      )
    );
  }
  if (effectiveTrustTier !== enforcedTier) {
    return err(
      new Error(
        `Untrusted-input firewall enforced tier ${effectiveTrustTier} for action ` +
          `${options.action.type} but tier ${enforcedTier} for the classification`
      )
    );
  }
  return ok({
    refused: false,
    allowed: policy.allowed,
    requiresApproval: policy.requiresApproval,
    violations: policy.violations,
    effectiveTrustTier,
    policyMode,
    wouldRefuse,
  });
}

/** One `process()` call site for both entries, so the log lines cannot drift. */
function processAndLog(
  input: GitHubInput,
  options: FirewallProcessOptions
): Result<FirewallResult, FirewallError> {
  const result = getUntrustedInputFirewall().process(input, options);
  if (!result.ok) {
    logger.warn('Untrusted-input firewall rejected the input', {
      user: input.username,
      sourceType: input.type,
      ...(options.action !== undefined ? { actionType: options.action.type } : {}),
      code: result.error.code,
      stage: result.error.stage,
    });
    return result;
  }
  if (result.value.wouldRefuse) {
    // Names every blocking rule and the checks that could NOT run (#5380), so
    // the telemetry sizes the flip to `enforce` on what was measured.
    const policy = result.value.policy;
    logger.warn('Untrusted-input firewall would refuse under enforce (audit mode)', {
      user: input.username,
      sourceType: input.type,
      ...(options.action !== undefined ? { actionType: options.action.type } : {}),
      trustTier: result.value.effectiveTrustTier,
      scope: policy?.scope,
      rules: policy?.violations.filter((v) => v.severity === 'block').map((v) => v.rule),
      unmeasured: policy?.unmeasured,
    });
  }
  return result;
}

function asError({ code, stage, message }: FirewallError): Error {
  return new Error(`Untrusted-input firewall ${code} at stage ${stage}: ${message}`);
}

/**
 * The one mapping from a caller's issue or PR metadata to the firewall's
 * input (#5383), so the classification run and every per-action run of one
 * caller are fed the same payload by construction.
 */
export function firewallInputFor(
  type: GitHubInput['type'],
  source: {
    readonly author: string;
    readonly authorAssociation: string;
    readonly title: string;
    readonly body: string;
  }
): GitHubInput {
  return {
    type,
    username: source.author,
    authorAssociation: source.authorAssociation,
    title: source.title,
    body: source.body,
  };
}
