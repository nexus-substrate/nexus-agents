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
 *   `validateActionCorroboration` is the third entry (#6309): the per-action
 *   corroboration check, run by the firewall's `corroboration` stage — which
 *   this instance enables — rather than composed beside it by the callers.
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
import {
  HostileInputFirewall,
  type FirewallActionPolicyResult,
  type FirewallResult,
} from '../security/firewall/firewall-pipeline.js';
import type { FirewallError, FirewallProcessOptions } from '../security/firewall/firewall-types.js';
import type { FirewallPolicyMode } from '../security/firewall/firewall-policy-mode.js';
import { createGitHubAdapter } from '../security/firewall/github-adapter.js';
import type { GitHubInput } from '../security/firewall/github-adapter.js';
import type { AgentAction, SourceCitation } from '../security/action-schema.js';
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
 * with metadata the firewall never sees. The corroboration stage is ON
 * (#6309, panel option R): it defaults to off because the firewall is a
 * published API, but the live paths validate corroboration per action and
 * that check runs here, through `validateActionCorroboration`, not beside the
 * firewall. `policyMode` is resolved from `NEXUS_FIREWALL_POLICY` once, at
 * construction.
 */
export function getUntrustedInputFirewall(): HostileInputFirewall {
  singleton ??= new HostileInputFirewall({
    adapter: createGitHubAdapter(),
    contentDowngrade: false,
    stages: { corroboration: true },
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
 * Target input for per-action policy evaluation (#6310).
 *
 * Either:
 * - A classified {@link FirewallResult} (or object carrying its `evaluateAction` handle
 *   and `effectiveTrustTier`), which evaluates the action directly without re-emitting
 *   input-level audit events.
 * - A raw {@link GitHubInput}, which runs the full pipeline as a legacy fallback.
 */
export type FirewallActionInput =
  GitHubInput | Pick<FirewallResult, 'effectiveTrustTier' | 'evaluateAction'>;

type ActionHandleInput = Pick<FirewallResult, 'effectiveTrustTier' | 'evaluateAction'>;

function isActionHandleInput(input: FirewallActionInput): input is ActionHandleInput {
  return 'evaluateAction' in input && typeof input.evaluateAction === 'function';
}

function logAuditRefusal(
  actionType: string,
  result: Extract<FirewallActionPolicyResult, { evaluated: true }>
): void {
  const { policy, effectiveTrustTier } = result;
  logger.warn('Untrusted-input firewall would refuse under enforce (audit mode)', {
    actionType,
    trustTier: effectiveTrustTier,
    scope: policy.scope,
    rules: policy.violations.filter((v) => v.severity === 'block').map((v) => v.rule),
    unmeasured: policy.unmeasured,
  });
}

function evaluateActionViaHandle(
  input: ActionHandleInput,
  options: FirewallProcessOptions & {
    readonly action: AgentAction;
    readonly enforcedTier: TrustTier;
  }
): Result<FirewallActionDecision, Error> {
  const actionResult = input.evaluateAction(options.action, {
    context: options.context,
    existingLabels: options.existingLabels,
  });
  if (!actionResult.ok) {
    const { code, stage, violations } = actionResult.error;
    if (code !== 'POLICY_REFUSED' || stage !== 'policy') return err(asError(actionResult.error));
    if (violations === undefined || violations.length === 0)
      return err(asError(actionResult.error));
    return ok({ refused: true, allowed: false, violations, policyMode: 'enforce' });
  }
  if (!actionResult.value.evaluated) {
    return err(
      new Error(
        `Untrusted-input firewall did not evaluate policy for action ${options.action.type} (the policy stage is disabled)`
      )
    );
  }
  const { policy, policyMode, wouldRefuse, effectiveTrustTier } = actionResult.value;
  if (effectiveTrustTier !== options.enforcedTier) {
    return err(
      new Error(
        `Untrusted-input firewall enforced tier ${effectiveTrustTier} for action ` +
          `${options.action.type} but tier ${options.enforcedTier} for the classification`
      )
    );
  }
  if (wouldRefuse) {
    logAuditRefusal(options.action.type, actionResult.value);
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

function evaluateActionViaProcess(
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

/**
 * Runs one action through the shared firewall and returns its policy verdict.
 *
 * `enforcedTier` is the tier the caller's classification run enforced (the
 * reputation gate's, #3122) and stamped on the action's citations. When a raw
 * `GitHubInput` is passed, the firewall recomputes that gate here from the same
 * measurement; a run that enforces a DIFFERENT tier fails the call, because a
 * record that disagrees with what was enforced is worse than none (#5719).
 *
 * When a classified `FirewallResult` is passed (#6310), it reuses the action
 * handle directly, avoiding re-extraction, re-sanitization, and re-classification,
 * and emitting only the `policy_gate` audit event.
 *
 * Fails closed — an `Error`, not a verdict — wherever no verdict exists: that
 * tier disagreement, a non-policy firewall error (an unparseable payload), and
 * a run whose `policy` is absent or `scope: 'context'`, which means the policy
 * stage did not evaluate this action. None of these is "denied"; recording
 * `allowed: false` for them would put a measurement where none was taken.
 */
export function evaluateActionThroughFirewall(
  input: FirewallActionInput,
  options: FirewallProcessOptions & {
    readonly action: AgentAction;
    readonly enforcedTier: TrustTier;
  }
): Result<FirewallActionDecision, Error> {
  if (isActionHandleInput(input)) {
    return evaluateActionViaHandle(input, options);
  }
  return evaluateActionViaProcess(input, options);
}

/**
 * The firewall's corroboration verdict on ONE action (#6309), read from
 * `HostileInputFirewall.validateAction` — the same `validateCorroboration`
 * result the callers used to compute beside the firewall, now computed by its
 * corroboration stage under the one `NEXUS_FIREWALL_POLICY` mode.
 *
 * The same two shapes as {@link FirewallActionDecision}, for the same reason:
 *
 * - `refused: false` — under `off` and `audit` the firewall returns the
 *   validator's verdict and the CALLER records it (`corroborated`,
 *   `INSUFFICIENT_CORROBORATION`), exactly as it did with the direct call.
 *   `wouldRefuse` is `audit`'s telemetry; `missing` names the unmet
 *   requirements it would refuse on, so a soak can measure the refusal rate.
 * - `refused: true` — under `enforce` the firewall refused the action itself
 *   (`POLICY_REFUSED` at stage `corroboration`). `missing` is what it refused
 *   on, so the caller's record can still name it.
 */
export type FirewallCorroborationDecision =
  | {
      readonly refused: false;
      readonly satisfied: boolean;
      readonly missing: readonly string[];
      readonly corroboratingSources: readonly SourceCitation[];
      readonly clearedOnlyByUnverifiedSources: boolean;
      readonly policyMode: FirewallPolicyMode;
      readonly wouldRefuse: boolean;
    }
  | {
      readonly refused: true;
      readonly satisfied: false;
      readonly stage: 'corroboration';
      readonly missing: readonly string[];
      readonly policyMode: 'enforce';
    };

/**
 * Runs one action through the shared firewall's corroboration stage.
 *
 * Fails closed — an `Error`, not a verdict — where no verdict exists. The
 * named empty case is `evaluated: false`: the stage did not run, so neither
 * `corroborated: true` nor `corroborated: false` is an honest record of it;
 * `satisfied` is never read off it. The shared instance enables the stage, so
 * on the live paths this is reachable only through a replaced instance, and it
 * fails the same way an unevaluated policy stage does. A refusal that names
 * nothing missing is likewise an error, not a corroboration decision.
 */
export function validateActionCorroboration(
  action: AgentAction
): Result<FirewallCorroborationDecision, Error> {
  const result = getUntrustedInputFirewall().validateAction(action);
  if (!result.ok) {
    const { code, stage, missing } = result.error;
    if (code !== 'POLICY_REFUSED' || stage !== 'corroboration') return err(asError(result.error));
    if (missing === undefined || missing.length === 0) return err(asError(result.error));
    logger.warn('Untrusted-input firewall refused an uncorroborated action (enforce mode)', {
      actionType: action.type,
      stage,
      missing,
    });
    return ok({ refused: true, satisfied: false, stage, missing, policyMode: 'enforce' });
  }
  const validation = result.value;
  if (!validation.evaluated) {
    return err(
      new Error(
        `Untrusted-input firewall did not evaluate corroboration for action ${action.type} ` +
          `(${validation.reason})`
      )
    );
  }
  if (validation.wouldRefuse) {
    logger.warn('Untrusted-input firewall would refuse under enforce (audit mode)', {
      actionType: action.type,
      stage: 'corroboration',
      missing: validation.missing,
    });
  }
  return ok({
    refused: false,
    satisfied: validation.satisfied,
    missing: validation.missing,
    corroboratingSources: validation.corroboratingSources,
    clearedOnlyByUnverifiedSources: validation.clearedOnlyByUnverifiedSources,
    policyMode: validation.policyMode,
    wouldRefuse: validation.wouldRefuse,
  });
}

/** One `process()` call site for both input entries, so the log lines cannot drift. */
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
