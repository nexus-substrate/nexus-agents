/**
 * Auto-remediation entry point (#3540 phase 3 / #3671).
 *
 * One cycle: collect the improvement_review signals → assemble deps → run the
 * env-gated {@link runAutoRemediation}. This is the surface a CLI command / MCP
 * tool / scheduled job calls. OFF-BY-DEFAULT: with `NEXUS_AUTO_REMEDIATE` unset
 * it short-circuits before even collecting signals. In `audit` it produces the
 * vote/plan SOAK data with zero writes (the deps' implement is fail-closed until
 * #3669); `enforce` is structurally unavailable until the Option B adapter +
 * real readiness evidence are wired.
 *
 * @module mcp/tools/auto-remediation-cycle
 */

// @export-no-consumer-yet — see #3671
// Invoked by the CLI/MCP/scheduled surface; the thin registration follows.

import { createLogger, type ILogger } from '../../core/index.js';
import type { ImprovementSignal } from './improvement-review.js';
import { runImprovementReview, ImprovementReviewInputSchema } from './improvement-review.js';
import { buildAutoRemediationDeps } from './auto-remediation-deps.js';
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
  return runAutoRemediation(signals, deps, { mode });
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
