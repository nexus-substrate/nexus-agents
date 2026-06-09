/**
 * Auto-remediation entry point (#3540 phase 3 / #3671).
 *
 * One cycle: collect the improvement_review signals → assemble deps → run the
 * env-gated {@link runAutoRemediation}. This is the surface a CLI command / MCP
 * tool / scheduled job calls. AUDIT-BY-DEFAULT since #3769: with
 * `NEXUS_AUTO_REMEDIATE` unset it runs `audit` — producing the vote/plan SOAK
 * data with zero writes — so periodic local runs accumulate readiness evidence.
 * Explicit `off` short-circuits before collecting signals. `enforce` is opt-in
 * and structurally unavailable until repo/repoRoot + a passing readiness verdict
 * are wired (#3769 Step 2).
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
    const soakDeps = withSoakAudit(deps, collector);
    try {
      return await runAutoRemediation(signals, soakDeps, { mode });
    } finally {
      collector.flush();
    }
  }

  return runAutoRemediation(signals, deps, { mode });
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

/** Resolve deps via the injected set, or assemble the real ones. */
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
