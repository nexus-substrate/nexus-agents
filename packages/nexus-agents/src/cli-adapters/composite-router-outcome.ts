/**
 * CompositeRouter outcome recording functions.
 * @module cli-adapters/composite-router-outcome
 */
import {
  getErrorMessage,
  type ILogger,
  createLogger,
  createSharedTaskAnalyzer,
  taskAnalysisResultToTaskProfile,
  getTimeProvider,
} from '../core/index.js';
import type { CliName, CliTask, RoutingArmId } from './types.js';
import { routingArmDisplaySlot } from './types.js';
import type { LinUCBBandit } from './linucb-bandit.js';
import type { PreferenceRouter } from './preference-router.js';
import type { IZeroRouter } from './zero-router.js';
import {
  cliTaskToTask,
  buildDifficultyOutcome,
  budgetUtilizationForTask,
  taskProfileToBanditContext,
} from './composite-router-helpers.js';
import type { BudgetRouter } from './budget-router.js';
import type { CompositeRouterConfig } from './composite-router-types.js';
import { getOutcomeStore } from '../orchestration/outcomes/outcome-store.js';
import { clamp01 } from '../utils/math-utils.js';

/** Module-level singleton — SharedTaskAnalyzer is stateless. */
const sharedAnalyzer = createSharedTaskAnalyzer();

/** Last routed task info for difficulty outcome recording. */
export interface LastRoutedTaskInfo {
  task: CliTask;
  selectedCli: RoutingArmId;
  difficulty: number;
}

/** Dependencies required for outcome recording. */
export interface OutcomeDependencies {
  logger: ILogger;
  cliNames: RoutingArmId[];
  linucbBandit: LinUCBBandit | undefined;
  preferenceRouter: PreferenceRouter | undefined;
  zeroRouter: IZeroRouter | undefined;
  lastRoutedTask: LastRoutedTaskInfo | undefined;
  /**
   * Present so the outcome path can reproduce the budget feature the routing
   * path scored with. Undefined when budget routing is off, which puts both
   * paths on the same neutral default (#4910).
   */
  budgetRouter?: BudgetRouter | undefined;
  budgetConstraints?: CompositeRouterConfig['budgetConstraints'];
}

/** Records a bandit outcome for the given routing arm (CLI slot or api:* arm). */
export function recordBanditOutcome(
  cliName: RoutingArmId,
  task: CliTask,
  reward: number,
  deps: OutcomeDependencies
): void {
  if (deps.linucbBandit === undefined) return;
  const armIndex = deps.cliNames.indexOf(cliName);
  if (armIndex === -1) {
    deps.logger.warn('Unknown CLI for outcome recording', { cliName });
    return;
  }
  const internalTask = cliTaskToTask(task);
  const analysis = sharedAnalyzer.analyze(internalTask);
  // Recomputed rather than defaulted: `selectArm` scored this task with the
  // real utilization, and LinUCB is only consistent if `update` sees the same
  // feature vector (#4910).
  const budgetUtilization = budgetUtilizationForTask(
    task,
    deps.budgetRouter,
    deps.budgetConstraints
  );
  // Built through the SAME converter chain the select path uses
  // (`composite-router-stages.ts:666`). LinUCB is only consistent if `update`
  // sees the vector `selectArm` scored, and the two converters disagree on
  // three of six columns: `taskProfileToBanditContext` quantizes complexity to
  // 0.1 steps, adds the legacy +500 token offset, and emits `isReasoningTask`
  // as 0/1 where the analysis-based one emits 0/0.5/1 (#4953).
  const context = taskProfileToBanditContext(
    taskAnalysisResultToTaskProfile(analysis),
    budgetUtilization
  );
  deps.linucbBandit.update(armIndex, context, reward);
  deps.logger.debug('Recorded outcome', { cliName, reward });
}

/** Records a preference signal for the preference router. */
export function recordPreferenceSignal(
  query: string,
  strongModelPreferred: boolean,
  quality: { strong?: number; weak?: number } | undefined,
  deps: OutcomeDependencies
): void {
  if (deps.preferenceRouter === undefined) {
    deps.logger.warn('Preference routing not enabled, cannot record preference');
    return;
  }
  deps.preferenceRouter.recordPreference(
    query,
    strongModelPreferred,
    quality?.strong,
    quality?.weak
  );
  deps.logger.debug('Recorded preference', { strongModelPreferred });
}

/** Gets difficulty info for a task, using cached value if available. */
export function getDifficultyInfo(
  task: CliTask,
  deps: OutcomeDependencies
): { difficulty: number; selectedCli: RoutingArmId } {
  if (deps.lastRoutedTask?.task.content === task.content) {
    return {
      difficulty: deps.lastRoutedTask.difficulty,
      selectedCli: deps.lastRoutedTask.selectedCli,
    };
  }
  if (deps.zeroRouter === undefined) {
    return { difficulty: 0.5, selectedCli: 'claude' };
  }
  const estimate = deps.zeroRouter.estimateDifficulty(task);
  return { difficulty: estimate.aggregateScore, selectedCli: 'claude' };
}

/** Records a difficulty outcome for ZeroRouter calibration. */
export function recordZeroRouterOutcome(
  task: CliTask,
  success: boolean,
  qualityScore: number | undefined,
  deps: OutcomeDependencies
): void {
  if (deps.zeroRouter === undefined) {
    deps.logger.debug('ZeroRouter not enabled, skipping difficulty outcome');
    return;
  }
  const { difficulty, selectedCli } = getDifficultyInfo(task, deps);
  const outcome = buildDifficultyOutcome(
    task.content,
    difficulty,
    // Difficulty calibration is slot-level; collapse an api:* arm to its
    // display slot here (the bandit retains the distinct arm). (#3422)
    routingArmDisplaySlot(selectedCli),
    success,
    qualityScore
  );
  deps.zeroRouter.calibrate(outcome);
  deps.logger.debug('Recorded difficulty outcome', {
    difficulty: difficulty.toFixed(3),
    success,
    qualityScore,
  });
}

/** Checks if preference router has minimum data for routing. */
export function hasMinimumPreferenceData(deps: OutcomeDependencies): boolean {
  if (deps.preferenceRouter === undefined) return false;
  return deps.preferenceRouter.hasMinimumData();
}

// ============================================================================
// Quality-Enriched Rewards (Issue #929)
// ============================================================================

/** Number of recent outcomes to consider for quality calculation. */
const QUALITY_HISTORY_LIMIT = 20;

/** Maximum latency (ms) for normalization in reward calculation. */
const MAX_LATENCY_MS = 30_000;

/**
 * TTL for the per-CLI success-rate cache (#3261). `computeQualityReward` runs
 * on every `executeTask`, and `OutcomeStore.query({cli})` is an O(N) scan over
 * the (now persistent, growing) store. The success rate is a smoothed historical
 * signal, so a short TTL trades negligible freshness for avoiding the per-task
 * scan. New outcomes are reflected within one TTL window.
 */
const QUALITY_RATE_CACHE_TTL_MS = 15_000;

interface CachedRate {
  readonly rate: number;
  readonly computedAt: number;
}

const qualityRateCache = new Map<CliName, CachedRate>();

/**
 * Per-CLI success rate over the recent window, cached with a short TTL to avoid
 * the O(N) OutcomeStore scan on every task. Returns undefined when there is no
 * history (caller leaves the base reward unadjusted). (#3261)
 */
function getCachedCliSuccessRate(cli: CliName): number | undefined {
  const now = getTimeProvider().now();
  const cached = qualityRateCache.get(cli);
  if (cached !== undefined && now - cached.computedAt < QUALITY_RATE_CACHE_TTL_MS) {
    return cached.rate;
  }
  const recent = getOutcomeStore().query({ cli, limit: QUALITY_HISTORY_LIMIT });
  if (recent.length === 0) return undefined;
  const rate = recent.filter((o) => o.success).length / recent.length;
  qualityRateCache.set(cli, { rate, computedAt: now });
  return rate;
}

/** Clears the per-CLI success-rate cache. For tests (#3261). */
export function resetQualityRewardCache(): void {
  qualityRateCache.clear();
}

/**
 * Computes a quality-enriched reward using OutcomeStore history.
 *
 * Instead of binary 1/0 rewards, produces continuous rewards (0.1-0.8)
 * that incorporate historical success rate and latency. This enables
 * LinUCB to learn more nuanced model preferences. The per-CLI success rate
 * is cached with a short TTL (#3261) so this stays O(1) on the hot path.
 *
 * @param cli - CLI that executed the task
 * @param success - Whether the task succeeded
 * @param durationMs - Task execution duration in ms
 * @returns Reward value in [0, 1] range
 */
export function computeQualityReward(cli: CliName, success: boolean, durationMs: number): number {
  if (!success) return 0.1;

  let reward = 0.5;

  try {
    const rate = getCachedCliSuccessRate(cli);
    if (rate !== undefined) {
      reward += rate * 0.3;
    }
  } catch (error: unknown) {
    createLogger({ component: 'composite-router' }).warn(
      'Failed to query outcome store for quality reward',
      {
        error: getErrorMessage(error),
        cli,
      }
    );
  }

  const latencyPenalty = Math.min(0.2, (durationMs / MAX_LATENCY_MS) * 0.2);
  reward -= latencyPenalty;

  return clamp01(reward);
}
