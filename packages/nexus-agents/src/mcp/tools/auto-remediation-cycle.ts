/**
 * Auto-remediation entry point (#3540 phase 3 / #3671).
 *
 * One cycle: collect the improvement_review signals → assemble deps → run the
 * env-gated {@link runAutoRemediation}. This is the surface a CLI command / MCP
 * tool / scheduled job calls. AUDIT-BY-DEFAULT since #3769: with
 * `NEXUS_AUTO_REMEDIATE` unset it runs `audit` — producing the vote/plan SOAK
 * data with zero writes — so periodic local runs accumulate readiness evidence.
 * Explicit `off` short-circuits before collecting signals. `enforce` is opt-in
 * and structurally unavailable: this entry point deliberately withholds `repoRoot`
 * from {@link buildAutoRemediationDeps} (see {@link resolveCycleDeps}), so the
 * Option B `implement` adapter — wired and landed (#3669) — stays a fail-closed
 * rejecting stub here. Threading repoRoot (gated on a passing readiness verdict +
 * the #3770 operator-provenance re-audit) is #3769 Step 2.
 *
 * @module mcp/tools/auto-remediation-cycle
 */

import { createLogger, type ILogger } from '../../core/index.js';
import type { ImprovementSignal } from './improvement-review.js';
import { runImprovementReview, ImprovementReviewInputSchema } from './improvement-review.js';
import { buildAutoRemediationDeps } from './auto-remediation-deps.js';
import { classifySignalPriority } from './remediation-priority.js';
import {
  createRemediationSoakCollector,
  type RemediationSoakCollector,
  type SoakSignalMeta,
  type IRecordingRemediationSoakSink,
} from './improvement-remediation-shadow.js';
import { runCodePrSoak, type CodePrSoakInject } from './codepr-soak-consumer.js';
import type { RemediationPlan } from './improvement-remediation-capability.js';
import {
  runAutoRemediation,
  resolveAutoRemediateMode,
  AUTO_REMEDIATE_ENV,
  type AutoRemediationResult,
  type AutoRemediateMode,
  type AutoRemediationDeps,
} from './improvement-remediation-enforce.js';

/** Cycle configuration. */
export interface AutoRemediationCycleConfig {
  /** Override the env-derived mode (tests / explicit runs). */
  readonly mode?: AutoRemediateMode;
  /** Repo slug for the lease / PRs (enforce). */
  readonly repo?: string;
  /** Commit SHA for the lease ref (enforce). */
  readonly sha?: string;
  /** Lookback window (days) for signal collection. */
  readonly lookbackDays?: number;
  readonly logger?: ILogger;
}

/** Injectable collaborators (real defaults; fakes in tests). */
export interface AutoRemediationCycleInject {
  readonly collectSignals?: () => Promise<readonly ImprovementSignal[]>;
  readonly deps?: AutoRemediationDeps;
  /** Inject an isolated durable soak sink (tests honor a temp NEXUS_DATA_DIR). */
  readonly soakSink?: IRecordingRemediationSoakSink;
  /**
   * AUDIT-mode dry-run code-PR soak seams (#3670 Stage 2.5). When provided,
   * forwarded to {@link runCodePrSoak}; tests inject an isolated sink / a fake
   * planRun. Ignored outside audit mode (the soak only runs in audit).
   */
  readonly codePrSoak?: CodePrSoakInject;
  /** Test seam: override the per-plan soak runner. Defaults to {@link runCodePrSoak}. */
  readonly runCodePrSoak?: (plan: RemediationPlan, inject?: CodePrSoakInject) => void;
}

function offResult(): AutoRemediationResult {
  return { mode: 'off', considered: 0, skipped: [], plans: [], remediated: [] };
}

/**
 * Run one auto-remediation cycle. Resolves the mode from {@link AUTO_REMEDIATE_ENV}
 * (or config), and — unless `off` — collects improvement_review signals and runs
 * them through {@link runAutoRemediation}.
 */
export async function runAutoRemediationCycle(
  config: AutoRemediationCycleConfig = {},
  inject: AutoRemediationCycleInject = {}
): Promise<AutoRemediationResult> {
  const logger = config.logger ?? createLogger({ tool: 'auto-remediation' });
  const mode = config.mode ?? resolveAutoRemediateMode(process.env[AUTO_REMEDIATE_ENV]);
  if (mode === 'off') {
    logger.debug('auto-remediation off (NEXUS_AUTO_REMEDIATE unset/off) — no-op');
    return offResult();
  }

  const signals = await collectCycleSignals(inject, config, logger);
  const deps = resolveCycleDeps(inject, config, logger);
  logger.info(`auto-remediation cycle: ${mode} over ${String(signals.length)} signals`);

  // AUDIT mode: capture durable soak evidence (#3762). Wrap the deps' audit
  // callback so every per-step event ALSO feeds the soak collector, then flush
  // the per-signal verdicts to the durable JSONL sink at the end of the run.
  if (mode === 'audit') {
    const collector = buildSoakCollector(signals, inject);
    const soakDeps = withCodePrSoak(withSoakAudit(deps, collector), inject);
    try {
      return await runAutoRemediation(signals, soakDeps, { mode });
    } finally {
      collector.flush();
    }
  }

  return runAutoRemediation(signals, deps, { mode });
}

/**
 * Return a deps clone whose `onPlanProduced` runs the AUDIT-mode dry-run code-PR
 * guards-green soak (#3670 Stage 2.5) over each produced plan. The soak runner is
 * THROW-FREE (best-effort), and `onPlanProduced` is itself wrapped by the
 * orchestrator — a soak failure can never break the remediation cycle. Only wired
 * on the AUDIT branch (this function is not called for off/enforce), and DRY-RUN
 * only: no push, no PR-open, no live write.
 */
function withCodePrSoak(
  deps: AutoRemediationDeps,
  inject: AutoRemediationCycleInject
): AutoRemediationDeps {
  const runSoak = inject.runCodePrSoak ?? runCodePrSoak;
  return {
    ...deps,
    onPlanProduced: (_signal, plan): void => {
      runSoak(plan, inject.codePrSoak);
    },
  };
}

/** Build a soak collector with per-signal metadata derived from the cycle's signals. */
function buildSoakCollector(
  signals: readonly ImprovementSignal[],
  inject: AutoRemediationCycleInject
): RemediationSoakCollector {
  const meta = new Map<string, SoakSignalMeta>();
  for (const s of signals) {
    meta.set(s.signalKey, {
      category: s.category,
      priority: classifySignalPriority(s),
      severity: s.severity,
    });
  }
  const metaFor = (key: string): SoakSignalMeta | undefined => meta.get(key);
  return inject.soakSink !== undefined
    ? createRemediationSoakCollector(metaFor, inject.soakSink)
    : createRemediationSoakCollector(metaFor);
}

/** Return a deps clone whose `audit` ALSO feeds the soak collector. */
function withSoakAudit(
  deps: AutoRemediationDeps,
  collector: RemediationSoakCollector
): AutoRemediationDeps {
  return {
    ...deps,
    audit: (event): void => {
      deps.audit(event);
      collector.observe(event);
    },
  };
}

/** Collect signals via the injected source, or the real improvement_review aggregator. */
async function collectCycleSignals(
  inject: AutoRemediationCycleInject,
  config: AutoRemediationCycleConfig,
  logger: ILogger
): Promise<readonly ImprovementSignal[]> {
  if (inject.collectSignals) return inject.collectSignals();
  const input = ImprovementReviewInputSchema.parse(
    config.lookbackDays !== undefined ? { lookbackDays: config.lookbackDays } : {}
  );
  return (await runImprovementReview(input, { logger })).signals;
}

/**
 * Resolve deps via the injected set, or assemble the real ones.
 *
 * Deliberate fail-closed sequencing: we pass `repo`/`sha` (for the lease) but NOT
 * `repoRoot`/`baseBranch`, so {@link buildAutoRemediationDeps} leaves `implement`
 * as the rejecting stub and enforce cannot engage from the cycle — even though the
 * Option B adapter (#3669) is wired. Threading repoRoot is #3769 Step 2, gated on a
 * passing readiness verdict and the #3770 requirement that repoRoot reach the
 * worktree/lease ONLY from operator-supplied config (never signal/telemetry-derived).
 */
function resolveCycleDeps(
  inject: AutoRemediationCycleInject,
  config: AutoRemediationCycleConfig,
  logger: ILogger
): AutoRemediationDeps {
  if (inject.deps) return inject.deps;
  return buildAutoRemediationDeps({
    ...(config.repo !== undefined ? { repo: config.repo } : {}),
    ...(config.sha !== undefined ? { sha: config.sha } : {}),
    logger,
  });
}
