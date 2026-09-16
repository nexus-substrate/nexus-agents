/**
 * The policy check every secure handler runs, as ONE function (#6431 review).
 *
 * Extracted from `secure-handler.ts` so that a handler which dispatches another
 * tool's engine on the caller's behalf — `run { execute: true }` runs the
 * selected strategy's engine directly, never through that tool's secure
 * handler — evaluates the same firewall, under the same mode, and returns the
 * same denial envelope and audit record the target tool's own handler would.
 * Before this, `run_dev_pipeline` was denied under the read-only lock while
 * `run { execute: true, forceStrategy: 'dev-pipeline' }` ran the same engine.
 *
 * @module mcp/middleware/policy-check
 */

import type { ILogger } from '../../core/index.js';
import type { IAuditLogger, PolicyAuditDecision } from '../../audit/audit-types.js';
import type { RequestContext } from './request-context.js';
import { type IPolicyFirewall, type ExecutionMode, createPolicyContext } from './policy.js';
import { getGlobalPolicyFirewall, getGlobalExecutionMode } from './policy-registry.js';
import { recordPolicyVerdict } from './policy-audit-emit.js';
import { toolStructuredError, type ToolResult } from '../tools/tool-result.js';

const registrationAuditLoggers = new WeakMap<ILogger, IAuditLogger>();

/** Sets or clears the audit logger used while secure handlers are registered. */
export function setSecureHandlerAuditLogger(logger: ILogger, auditLogger?: IAuditLogger): void {
  if (auditLogger === undefined) registrationAuditLoggers.delete(logger);
  else registrationAuditLoggers.set(logger, auditLogger);
}

/** The audit logger registered for this registration logger, if any. */
export function getRegisteredAuditLogger(logger: ILogger): IAuditLogger | undefined {
  return registrationAuditLoggers.get(logger);
}

/**
 * Creates a policy denial error response — an access-control denial,
 * categorized `permission` (#2649).
 */
function policyDeniedError(reason: string, requestId: string): ToolResult {
  return toolStructuredError({
    errorCategory: 'permission',
    message: `Policy denied: ${reason} (request: ${requestId})`,
  });
}

/** Options for policy check */
interface PolicyCheckOptions {
  firewall: IPolicyFirewall;
  toolName: string;
  args: unknown;
  mode: ExecutionMode;
  allowedPaths?: readonly string[] | undefined;
  logger: ILogger;
  requestId: string;
}

/**
 * What the policy evaluation produced: the denial result to return (if any),
 * and the verdict to record on the chain.
 *
 * The verdict is returned separately because it is NOT derivable from the
 * result (#4991). In warn mode a rule fires and the firewall allows anyway, so
 * `result` is null exactly as it is for an ordinary allow — the two are
 * indistinguishable downstream unless the decision travels with it.
 */
interface PolicyCheckOutcome {
  readonly result: ToolResult | null;
  /** `null` when no rule fired — an ordinary allow, which is not recorded. */
  readonly verdict: PolicyAuditDecision | null;
  /**
   * The rule that fired, when one did. Carried out so the near-miss sampler can
   * key on `{tool, rule}` — sampling on the tool alone would let one noisy rule
   * suppress a different rule's first occurrence on the same tool.
   */
  readonly ruleName?: string | undefined;
}

/**
 * Evaluates policy firewall and returns error if denied.
 */
function checkPolicy(opts: PolicyCheckOptions): PolicyCheckOutcome {
  const ctxOpts = {
    mode: opts.mode,
    ...(opts.allowedPaths && { allowedPaths: opts.allowedPaths }),
  };
  const decision = opts.firewall.evaluate(createPolicyContext(opts.toolName, opts.args, ctxOpts));

  if (!decision.allowed) {
    opts.logger.warn('Policy denied tool execution', {
      reason: decision.reason,
      ruleName: decision.ruleName,
    });
    return {
      result: policyDeniedError(decision.reason, opts.requestId),
      verdict: 'deny',
      ruleName: decision.ruleName,
    };
  }

  // Warn mode: the evaluator sets `overriddenByWarnMode` when a rule denied and
  // the mode allowed anyway. Read that flag and nothing else — not the '[WARN
  // MODE]' reason prefix (display copy, breaks on a reword), and not the
  // presence of `ruleName` on an allowed decision. The latter was the first
  // implementation and a panel rejected it: naming the rule that PERMITTED an
  // action is ordinary practice, so that inference would start reporting
  // authorized calls as near-misses the day an allow rule sets `ruleName`.
  if (decision.overriddenByWarnMode === true) {
    opts.logger.debug('Policy would have denied (warn mode)', {
      reason: decision.reason,
      ruleName: decision.ruleName,
    });
    return { result: null, verdict: 'would_deny', ruleName: decision.ruleName };
  }

  opts.logger.debug('Policy check passed', { reason: decision.reason });
  return { result: null, verdict: null };
}

/** The subset of a secure-handler config the policy check reads. */
export interface PolicyCheckTarget {
  readonly toolName: string;
  readonly policyFirewall?: IPolicyFirewall | undefined;
  readonly allowedPaths?: readonly string[] | undefined;
  readonly auditLogger?: IAuditLogger | undefined;
}

/**
 * Evaluates the policy firewall for this call, or returns `null` when none is
 * configured.
 *
 * #4888: the firewall falls back to the process-wide registry. Nothing ever
 * supplied `config.policyFirewall`, so before that fallback this check was
 * unreachable for every registered tool.
 */
export function runPolicyCheck(
  config: PolicyCheckTarget,
  sanitizedArgs: unknown,
  mode: ExecutionMode,
  logger: ILogger,
  requestContext: RequestContext
): { error: ToolResult | null; nearMiss: boolean } {
  const firewall = config.policyFirewall ?? getGlobalPolicyFirewall();
  if (!firewall) return { error: null, nearMiss: false };

  const { result, verdict, ruleName } = checkPolicy({
    firewall,
    toolName: config.toolName,
    args: sanitizedArgs,
    mode,
    allowedPaths: config.allowedPaths,
    logger,
    requestId: requestContext.requestId,
  });

  // Emitted for a real denial AND for a warn-mode near-miss (#4991). An
  // ordinary allow (verdict null) is not recorded: emitting every permitted
  // call would bury the soak signal it exists to surface.
  if (verdict !== null && config.auditLogger) {
    recordPolicyVerdict(config, requestContext, verdict, ruleName);
  }
  // #5228 review: the near-miss travels on regardless of whether the policy
  // record above was sampled out. A `would_deny` lets the call EXECUTE, so its
  // invocation record must not be indistinguishable from one where no rule
  // fired — otherwise sampling, which exists to bound growth, would restore the
  // silent-allow inference this change is meant to break.
  return { error: result, nearMiss: verdict === 'would_deny' };
}

/** A tool a handler dispatches on the caller's behalf. */
export interface DispatchedToolPolicyOptions {
  /** The tool whose engine is about to run (e.g. `run_dev_pipeline`). */
  readonly toolName: string;
  readonly args: unknown;
  /** The dispatching tool's REGISTRATION logger — the audit logger is keyed on it. */
  readonly logger: ILogger;
  readonly requestContext: RequestContext;
}

/**
 * Evaluates the wired firewall for a tool a handler dispatches directly
 * (#6431 review). Same firewall, same registry mode, same denial envelope and
 * the same audit record the target tool's own secure handler produces; `null`
 * means allowed (or no firewall wired, exactly as for the target tool).
 */
export function checkPolicyForDispatchedTool(opts: DispatchedToolPolicyOptions): ToolResult | null {
  const auditLogger = getRegisteredAuditLogger(opts.logger);
  const target: PolicyCheckTarget = {
    toolName: opts.toolName,
    ...(auditLogger !== undefined && { auditLogger }),
  };
  return runPolicyCheck(
    target,
    opts.args,
    getGlobalExecutionMode(),
    opts.logger,
    opts.requestContext
  ).error;
}
