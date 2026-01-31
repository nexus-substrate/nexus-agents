/**
 * CompositeRouter outcome recording functions.
 * @module cli-adapters/composite-router-outcome
 */
import type { ILogger } from '../core/index.js';
import type { CliName, CliTask } from './types.js';
import type { LinUCBBandit } from './linucb-bandit.js';
import type { PreferenceRouter } from './preference-router.js';
import type { IZeroRouter } from './zero-router.js';
import { analyzeTask } from './task-analyzer.js';
import {
  cliTaskToTask,
  taskProfileToBanditContext,
  buildDifficultyOutcome,
} from './composite-router-helpers.js';

/** Last routed task info for difficulty outcome recording. */
export interface LastRoutedTaskInfo {
  task: CliTask;
  selectedCli: CliName;
  difficulty: number;
}

/** Dependencies required for outcome recording. */
export interface OutcomeDependencies {
  logger: ILogger;
  cliNames: CliName[];
  linucbBandit: LinUCBBandit | undefined;
  preferenceRouter: PreferenceRouter | undefined;
  zeroRouter: IZeroRouter | undefined;
  lastRoutedTask: LastRoutedTaskInfo | undefined;
}

/** Records a bandit outcome for the given CLI. */
export function recordBanditOutcome(
  cliName: CliName,
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
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- Issue #574: migrate to SharedTaskAnalyzer
  const taskProfile = analyzeTask(internalTask);
  const context = taskProfileToBanditContext(taskProfile);
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
): { difficulty: number; selectedCli: CliName } {
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
    selectedCli,
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
