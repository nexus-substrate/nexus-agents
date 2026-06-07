/**
 * Hardened, OFF-BY-DEFAULT auto-invoke enforcement path (#3540 inc.2h / #3618).
 *
 * The capstone of the capability loop: it turns improvement_review signals into
 * actual dev-pipeline remediations — but only when the owner explicitly opts in,
 * and only behind every safety primitive built in #3612–#3617 + #3643. Ratified
 * 7/7 (re-vote) after #3643 closed the IMPLEMENT-phase Rule-of-Two hole.
 *
 * This module is PURE CONTROL FLOW over injected, side-effecting {@link AutoRemediationDeps}
 * (lease, research, implement, audit). The real adapters (git ref lease, the
 * #3643-guarded dev-pipeline, GitHub PR creation, audit chain) are wired at the
 * MCP/CLI layer and only ever run when `mode === 'enforce'`. Tests drive the
 * orchestrator with fakes, so the safety-critical control flow is fully covered
 * without any real writes.
 *
 * Three modes (exact-match `NEXUS_AUTO_REMEDIATE`, default off):
 *  - `off`     — no-op. The default; nothing runs.
 *  - `audit`   — admission + RESEARCH + plan production, then STOP before IMPLEMENT.
 *                Zero writes, no lease, no PR. Builds readiness evidence safely.
 *  - `enforce` — full path: lease → readiness → admission → phase machine →
 *                PR-only (never auto-merge) → outcome feedback.
 *
 * Flipping `enforce` on is the OWNER'S decision; this module never enables itself.
 *
 * @module mcp/tools/improvement-remediation-enforce
 */

// @export-no-consumer-yet — see #3648
// This ships the ratified, fully-tested orchestrator (pure control flow). The
// real side-effecting AutoRemediationDeps adapters (git-ref lease, the
// #3643-guarded dev-pipeline `implement` + GitHub PR, research diagnosis,
// audit-chain) + the entry point that calls runAutoRemediation are the wiring
// increment #3648. Enforce stays owner-gated regardless.

import type { ILogger } from '../../core/index.js';
import type { ImprovementSignal } from './improvement-review.js';
import { isSecuritySignal } from './improvement-remediation-shadow.js';
import { RemediationGuard, getRemediationGuard } from './improvement-remediation-guard.js';
import {
  evaluateEnforceReadiness,
  DEFAULT_ENFORCE_READINESS_CONFIG,
  type EnforceReadinessConfig,
  type EnforceReadinessEvidence,
} from './improvement-enforce-readiness.js';
import {
  CapabilityLedger,
  parseRemediationPlan,
  type RemediationPlan,
} from './improvement-remediation-capability.js';

/** The three enforcement modes. */
export type AutoRemediateMode = 'off' | 'audit' | 'enforce';

/** Env var that gates the whole path. Exact-match; anything unrecognized = off. */
export const AUTO_REMEDIATE_ENV = 'NEXUS_AUTO_REMEDIATE';

/** Stable lease key for the single-flight cross-process lock. */
export const AUTO_REMEDIATE_LEASE_KEY = 'auto-remediation';

/** Resolve the mode from a raw env value. Fail-safe: unknown/unset → off. */
export function resolveAutoRemediateMode(raw: string | undefined): AutoRemediateMode {
  if (raw === 'enforce') return 'enforce';
  if (raw === 'audit') return 'audit';
  return 'off';
}

/** A held lease; call {@link release} when the run finishes. */
export interface AcquiredLease {
  release(): Promise<void>;
}

/** One audited step of a remediation run. */
export interface AutoRemediationAuditEvent {
  readonly step: string;
  readonly signalKey?: string;
  readonly detail: string;
}

/** A completed remediation (enforce mode). */
export interface RemediationPrResult {
  readonly branch: string;
  readonly prUrl: string;
}

/**
 * Injected side-effecting collaborators. Real implementations live at the
 * MCP/CLI wiring layer; tests supply fakes. The orchestrator never imports git,
 * GitHub, or the dev-pipeline directly — keeping this control flow pure + tested.
 */
export interface AutoRemediationDeps {
  /**
   * Acquire the single-flight lease by ATOMIC create-if-not-exists (e.g. create a
   * sentinel git ref that fails if it already exists). Returns null if already
   * held — this is the real cross-process guard against double-runs (#3618
   * condition 1). MUST NOT be a check-then-act read.
   */
  acquireLease(key: string): Promise<AcquiredLease | null>;
  /** Evidence for the one pre-loop readiness gate (enforce only). */
  readinessEvidence(): Promise<EnforceReadinessEvidence>;
  /**
   * RESEARCH phase: produce a raw remediation plan for `signal`. Untrusted reads
   * happen here with `ledger` in the RESEARCH phase (untrusted+secrets, no write).
   * Returned value is validated by {@link parseRemediationPlan} at the boundary.
   */
  research(signal: ImprovementSignal, ledger: CapabilityLedger): Promise<unknown>;
  /**
   * IMPLEMENT phase: run the dev-pipeline plan-only (researchOverride +
   * untrustedInputGuard from `ledger`, #3643) and open a PR-only branch. Never
   * auto-merges. `ledger` is in the IMPLEMENT phase (write+secrets, no untrusted).
   */
  implement(plan: RemediationPlan, ledger: CapabilityLedger): Promise<RemediationPrResult>;
  /** Record the remediation outcome seed for later Goodhart-resistant assessment (#3616). */
  recordOutcome?(plan: RemediationPlan, pr: RemediationPrResult): void;
  /** Per-step audit emission. */
  audit(event: AutoRemediationAuditEvent): void;
  readonly logger?: ILogger;
}

/** Tuning for a run. */
export interface AutoRemediationConfig {
  /** Override the env-derived mode (tests). */
  readonly mode?: AutoRemediateMode;
  /** Max remediations attempted per run (default 5, mirrors MAX_ISSUES_PER_RUN). */
  readonly maxPerRun?: number;
  /** Runaway guard (default: process singleton). */
  readonly guard?: RemediationGuard;
  /** Readiness criteria (default: conservative). */
  readonly readinessConfig?: EnforceReadinessConfig;
  /** Clock for guard timing (tests). */
  readonly now?: number;
}

/** Result of a run. */
export interface AutoRemediationResult {
  readonly mode: AutoRemediateMode;
  readonly considered: number;
  /** Signals skipped during admission, with reasons. */
  readonly skipped: ReadonlyArray<{ signalKey: string; reason: string }>;
  /** Plans produced (both audit + enforce) — proof of RESEARCH without IMPLEMENT in audit. */
  readonly plans: ReadonlyArray<{ signalKey: string }>;
  /** PRs opened (enforce only; always empty in audit/off). */
  readonly remediated: ReadonlyArray<{ signalKey: string } & RemediationPrResult>;
  /** Run-level abort reason (disabled / not-ready / lease-held), if any. */
  readonly aborted?: string;
}

const MAX_PER_RUN_DEFAULT = 5;

/**
 * Run the auto-remediation path over `signals`. OFF-BY-DEFAULT and fail-closed at
 * every gate. Never enables itself; `mode` comes from {@link AUTO_REMEDIATE_ENV}
 * unless overridden in config.
 */
export async function runAutoRemediation(
  signals: readonly ImprovementSignal[],
  deps: AutoRemediationDeps,
  config: AutoRemediationConfig = {}
): Promise<AutoRemediationResult> {
  const mode = config.mode ?? resolveAutoRemediateMode(process.env[AUTO_REMEDIATE_ENV]);
  const base = { mode, considered: signals.length, skipped: [], plans: [], remediated: [] };
  if (mode === 'off') return base;

  deps.logger?.info(`auto-remediation starting in '${mode}' mode`, { signals: signals.length });
  deps.audit({ step: 'start', detail: `mode=${mode}, ${String(signals.length)} signals` });

  // Enforce-only run-level gates: readiness (once, pre-loop) then the atomic lease.
  let lease: AcquiredLease | null = null;
  if (mode === 'enforce') {
    const gate = await checkEnforceGates(deps, config);
    if (gate.abort !== undefined) {
      deps.audit({ step: 'abort', detail: gate.abort });
      return { ...base, aborted: gate.abort };
    }
    lease = gate.lease;
  }

  try {
    return await admitAndExecute(signals, deps, config, mode);
  } finally {
    if (lease !== null) await lease.release();
  }
}

/** Enforce run-level gates: single readiness check, then atomic lease acquisition. */
async function checkEnforceGates(
  deps: AutoRemediationDeps,
  config: AutoRemediationConfig
): Promise<{ abort?: string; lease: AcquiredLease | null }> {
  const evidence = await deps.readinessEvidence();
  const readiness = evaluateEnforceReadiness(
    evidence,
    config.readinessConfig ?? DEFAULT_ENFORCE_READINESS_CONFIG
  );
  if (!readiness.ready) {
    return { abort: `not ready to enforce: ${readiness.blockers.join(', ')}`, lease: null };
  }
  const lease = await deps.acquireLease(AUTO_REMEDIATE_LEASE_KEY);
  if (lease === null) {
    return { abort: 'another auto-remediation run holds the lease', lease: null };
  }
  return { lease };
}

/** Per-signal admission + phase-machine execution, bounded by maxPerRun. */
async function admitAndExecute(
  signals: readonly ImprovementSignal[],
  deps: AutoRemediationDeps,
  config: AutoRemediationConfig,
  mode: AutoRemediateMode
): Promise<AutoRemediationResult> {
  const guard = config.guard ?? getRemediationGuard();
  const now = config.now ?? 0;
  const maxPerRun = config.maxPerRun ?? MAX_PER_RUN_DEFAULT;
  const skipped: Array<{ signalKey: string; reason: string }> = [];
  const plans: Array<{ signalKey: string }> = [];
  const remediated: Array<{ signalKey: string } & RemediationPrResult> = [];

  for (const signal of signals) {
    if (plans.length >= maxPerRun) {
      skipped.push({
        signalKey: signal.signalKey,
        reason: `rate cap ${String(maxPerRun)} reached`,
      });
      continue;
    }
    const admit = admitSignal(signal, guard, now);
    if (admit !== null) {
      skipped.push({ signalKey: signal.signalKey, reason: admit });
      deps.audit({ step: 'skip', signalKey: signal.signalKey, detail: admit });
      continue;
    }
    const outcome = await executeOne(signal, deps, mode, guard, now);
    if (outcome.error !== undefined) {
      skipped.push({ signalKey: signal.signalKey, reason: outcome.error });
      continue;
    }
    plans.push({ signalKey: signal.signalKey });
    if (outcome.pr !== undefined) remediated.push({ signalKey: signal.signalKey, ...outcome.pr });
  }

  return { mode, considered: signals.length, skipped, plans, remediated };
}

/** Fail-closed admission: security → human-gate; runaway guard. Returns a skip reason or null. */
function admitSignal(
  signal: ImprovementSignal,
  guard: RemediationGuard,
  now: number
): string | null {
  if (isSecuritySignal(signal)) return 'security-related — human-gated (never auto-remediated)';
  const decision = guard.canRemediate(signal.signalKey, now);
  if (!decision.allowed) return `runaway guard: ${decision.detail}`;
  return null;
}

/**
 * Execute the phase machine for one admitted signal. RESEARCH always runs;
 * IMPLEMENT runs only in enforce mode (audit stops after the plan — zero writes).
 */
async function executeOne(
  signal: ImprovementSignal,
  deps: AutoRemediationDeps,
  mode: AutoRemediateMode,
  guard: RemediationGuard,
  now: number
): Promise<{ pr?: RemediationPrResult; error?: string }> {
  const ledger = new CapabilityLedger();
  ledger.enterPhase('research');
  let plan: RemediationPlan;
  try {
    plan = parseRemediationPlan(await deps.research(signal, ledger));
  } catch (err: unknown) {
    const reason = `research/plan failed: ${err instanceof Error ? err.message : String(err)}`;
    deps.audit({ step: 'research-failed', signalKey: signal.signalKey, detail: reason });
    return { error: reason };
  }
  deps.audit({
    step: 'plan',
    signalKey: signal.signalKey,
    detail: `${String(plan.steps.length)} steps`,
  });

  if (mode === 'audit') return {}; // stop before IMPLEMENT — no writes.

  // enforce: physically move to the write phase (untrusted-input now denied by the
  // ledger; the dev-pipeline's untrustedInputGuard fail-closes any fresh read, #3643).
  ledger.enterPhase('implement');
  const pr = await deps.implement(plan, ledger);
  guard.recordAttempt(signal.signalKey, now);
  deps.recordOutcome?.(plan, pr);
  deps.audit({ step: 'pr-opened', signalKey: signal.signalKey, detail: pr.prUrl });
  return { pr };
}
