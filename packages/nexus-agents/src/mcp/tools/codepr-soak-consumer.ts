/**
 * AUDIT-mode dry-run code-PR SOAK consumer (#3670, Stage 2.5).
 *
 * Wires {@link planCodePrRun} (the Stage-2 dry-run orchestrator) as a real
 * consumer of the Stage-1 guards, driven from auto-remediation's AUDIT mode. For
 * a remediation plan that WOULD touch code files, it:
 *
 *  1. derives a PROPOSED change set from the plan's step `targetPath` hints (the
 *     only path facts the typed plan carries) — inert marker content, never
 *     model output, never the real edit;
 *  2. runs {@link planCodePrRun} in DRY-RUN (it already performs NO push / NO
 *     PR-open / NO live write — it composes the guards inside a throwaway
 *     worktree and atomically discards it);
 *  3. records ONE durable soak data point: green on a clean plan, denied on a
 *     guard denial or error.
 *
 * The recorded streak is read back by {@link readCodePrGuardsGreenSoak} as the
 * `consecutiveGreenDryRuns` evidence {@link evaluateCodePrEnableReadiness}
 * consumes — so AUDIT mode now ACCUMULATES the guards-green-soak the enable
 * double-gate requires, with zero blast radius.
 *
 * BEST-EFFORT: {@link runCodePrSoak} NEVER throws — any failure is logged WARN and
 * swallowed so the auto-remediation cycle proceeds unaffected. It runs ONLY when
 * the cycle is in AUDIT mode (the caller gates that); it does NOT run in off/enforce.
 *
 * @module mcp/tools/codepr-soak-consumer
 */

import { createHash } from 'node:crypto';

import { createLogger, getErrorMessage, type ILogger } from '../../core/index.js';
import type { IAuditLogger, AuditEventInput } from '../../audit/audit-types.js';
import type { RemediationPlan } from './improvement-remediation-capability.js';
import {
  planCodePrRun,
  type CodePrRunOptions,
  type ProposedChange,
} from './codepr-orchestrator.js';
import {
  getCodePrSoakSink,
  greenCodePrSoakRecord,
  deniedCodePrSoakRecord,
  type CodePrSoakSink,
} from './codepr-soak-store.js';

/**
 * Action kinds that imply a FILE change (and therefore a code-PR the push path
 * would eventually open). `investigate` and `adjust-routing` are config/analysis
 * actions that do not author a tracked file, so a plan made only of those is NOT
 * a code-touching remediation and is skipped (no soak data point).
 */
const CODE_TOUCHING_KINDS: ReadonlySet<RemediationPlan['steps'][number]['kind']> = new Set([
  'add-test',
  'refactor',
  'update-docs',
  'fix-bug',
]);

/**
 * Whether a plan WOULD touch code files: at least one step whose action kind
 * authors a file ({@link CODE_TOUCHING_KINDS}). A plan made only of `investigate`
 * / `adjust-routing` steps does NOT author a tracked file, so it is not a
 * code-touching remediation and is skipped (no soak data point).
 */
export function planTouchesCode(plan: RemediationPlan): boolean {
  return plan.steps.some((s) => CODE_TOUCHING_KINDS.has(s.kind));
}

/**
 * A SAFE, deterministic placeholder path for a code-touching step that carries no
 * `targetPath` hint (the deterministic plan builder produces such steps). Keyed by
 * the signal hash so it is stable across runs and lands under `src/` (a
 * non-sensitive location the guards permit) — enough for the orchestrator to
 * realize a diff and run the guards over it. NEVER an operator-supplied or
 * model-derived path.
 */
function placeholderPathFor(plan: RemediationPlan, kind: string): string {
  const h = createHash('sha256').update(`${plan.signalKey}:${kind}`).digest('hex').slice(0, 12);
  return `src/__codepr_soak__/${kind}-${h}.ts`;
}

/**
 * Derive the PROPOSED dry-run change set from a plan's code-touching steps. Each
 * code-touching step contributes one proposed change with inert, value-free marker
 * content (NEVER model output / the real edit). A step's `targetPath` hint is used
 * when present (so the guards run over the realistic path the change would touch);
 * otherwise a safe deterministic placeholder path is synthesized. Distinct paths
 * only. Returns an empty array when the plan touches no code.
 */
export function deriveProposedChanges(plan: RemediationPlan): ProposedChange[] {
  const seen = new Set<string>();
  const changes: ProposedChange[] = [];
  for (const step of plan.steps) {
    if (!CODE_TOUCHING_KINDS.has(step.kind)) continue;
    const path =
      step.targetPath !== undefined && step.targetPath !== ''
        ? step.targetPath
        : placeholderPathFor(plan, step.kind);
    if (seen.has(path)) continue;
    seen.add(path);
    // Inert marker content — the dry-run only needs a realized diff to guard over.
    changes.push({
      relPath: path,
      newContent: `// codepr soak dry-run placeholder for ${plan.signalKey} (${step.kind})\n`,
    });
  }
  return changes;
}

/**
 * A minimal {@link IAuditLogger} that forwards the orchestrator's autonomous-event
 * records to the structured {@link ILogger} (debug). The dry-run orchestrator only
 * ever calls `log()`; the rest are no-ops. This keeps the soak step zero-config
 * (no hash-chain storage wiring) while still observing the would_open_pr/abort
 * events — and a real {@link IAuditLogger} can be injected when one is available.
 */
function loggerBackedAuditLogger(logger: ILogger): IAuditLogger {
  return {
    log: (input: AuditEventInput): void => {
      logger.debug('codepr soak dry-run audit event', {
        action: input.action,
        outcome: input.outcome,
      });
    },
    logToolInvocation: (): void => {},
    logPolicyDecision: (): void => {},
    logSecurityEvent: (): void => {},
    logRateLimitViolation: (): void => {},
    logTierTransition: (): void => {},
    flush: (): Promise<void> => Promise.resolve(),
    close: (): Promise<void> => Promise.resolve(),
  };
}

/** Stable, non-secret runId for a soak dry-run, correlating the audit + soak record. */
function soakRunId(plan: RemediationPlan): string {
  return `codepr-soak-${createHash('sha256').update(plan.signalKey).digest('hex').slice(0, 16)}`;
}

/** Hash of the source signal — pins what triggered the dry-run without storing it. */
function sourceSignalHash(plan: RemediationPlan): string {
  return createHash('sha256').update(plan.signalKey).digest('hex');
}

/** Injectable seams for {@link runCodePrSoak} (real defaults; fakes in tests). */
export interface CodePrSoakInject {
  readonly sink?: CodePrSoakSink;
  readonly auditLogger?: IAuditLogger;
  readonly logger?: ILogger;
  /** Orchestrator options forwarded to {@link planCodePrRun} (repoRoot, fault injector). */
  readonly orchestratorOptions?: CodePrRunOptions;
  /** Test seam: override the dry-run plan invocation. Defaults to {@link planCodePrRun}. */
  readonly planRun?: typeof planCodePrRun;
}

/**
 * Run ONE dry-run code-PR soak for a code-touching remediation plan and record
 * the data point. BEST-EFFORT and THROW-FREE: any failure (orchestrator,
 * persistence, audit) is logged WARN and swallowed — the auto-remediation cycle
 * must never break because the soak step failed.
 *
 * - Plan touches no code → no-op (returns without recording).
 * - Dry-run plan is green (no guard denial) → records a green data point
 *   (extends the consecutive guards-green streak).
 * - Dry-run plan is denied/errors → records a denied data point (resets the
 *   consecutive streak to 0, per the readiness gate's CONSECUTIVE semantics).
 *
 * NO push, NO PR-open, NO live write — {@link planCodePrRun} is dry-run only.
 */
export function runCodePrSoak(plan: RemediationPlan, inject: CodePrSoakInject = {}): void {
  const logger = inject.logger ?? createLogger({ tool: 'codepr-soak' });
  try {
    soakOnce(plan, inject, logger);
  } catch (err: unknown) {
    // Best-effort: a soak failure must NEVER break the auto-remediation cycle.
    logger.warn('codepr soak step failed (swallowed; cycle proceeds)', {
      signalKey: plan.signalKey,
      error: getErrorMessage(err),
    });
  }
}

/** The soak core: derive changes, dry-run the plan, record the verdict. May throw (caller wraps). */
function soakOnce(plan: RemediationPlan, inject: CodePrSoakInject, logger: ILogger): void {
  if (!planTouchesCode(plan)) return;
  const changes = deriveProposedChanges(plan);
  if (changes.length === 0) return; // defensive: planTouchesCode true ⇒ non-empty.

  const runId = soakRunId(plan);
  const planRun = inject.planRun ?? planCodePrRun;
  const result = planRun(
    { runId, sourceSignalHash: sourceSignalHash(plan), changes },
    inject.auditLogger ?? loggerBackedAuditLogger(logger),
    inject.orchestratorOptions ?? {}
  );

  const sink = inject.sink ?? getCodePrSoakSink();
  if (result.ok) {
    sink.record(
      greenCodePrSoakRecord({ runId, signalKey: plan.signalKey, filesTouched: result.plan.filesTouched })
    );
    logger.debug('codepr soak: green dry-run recorded', {
      signalKey: plan.signalKey,
      filesTouched: result.plan.filesTouched,
    });
  } else {
    sink.record(
      deniedCodePrSoakRecord({ runId, signalKey: plan.signalKey, denialReason: result.reason })
    );
    logger.debug('codepr soak: denied dry-run recorded (streak reset)', {
      signalKey: plan.signalKey,
      reason: result.reason,
    });
  }
}
