/* eslint-disable max-lines */
/**
 * CompositeRouter pipeline stage execution functions.
 * @module cli-adapters/composite-router-stages
 */
import type { Result } from '../core/index.js';
import { ok, err, createLogger } from '../core/index.js';
import type { ILogger } from '../core/index.js';

const logger = createLogger({ component: 'composite-router-stages' });
import {
  createSharedTaskAnalyzer,
  taskAnalysisResultToTaskProfile,
  type TaskProfile,
  getTuneAdjustmentStore,
} from '../core/index.js';
import { parseBoolEnv } from '../config/defaults-env.js';
import type { CliName, RoutingArmId, CliTask } from './types.js';
import { routingArmDisplaySlot } from './types.js';
import type { BudgetRouter } from './budget-router.js';
import type { TopsisRouter } from './topsis-router.js';
import type { LinUCBBandit } from './linucb-bandit.js';
import type { PreferenceRouter } from './preference-router.js';
import type { ZeroRouter } from './zero-router.js';
import type { LatencyTracker } from './latency-tracker.js';
import type { IRoutingMemory } from '../context/routing-memory.js';
import {
  CompositeRoutingError,
  type CompositeRouterConfigWithPreference,
  type PipelineResult,
} from './composite-router-types.js';
import {
  ConfidenceCascadeStage,
  CapabilityMatchStage,
  QualityConstraintStage,
  ResourceStrategyStage,
  DistilledRuleStage,
  KnnRoutingStage,
  CapacityFilterStage,
  CAPACITY_EXHAUSTED,
} from './routing/stages/index.js';
import { createRoutingContext, getRemainingCandidates } from './routing/router-stage.js';
import {
  cliTaskToTask,
  taskProfileToBanditContext,
  filterByPreferenceTier,
  applyBudgetFilter,
  applyTopsisRanking,
  applyZeroRouterFilter,
  defaultPreferenceStageResult,
  defaultZeroRouterStageResult,
  type PreferenceStageResult,
  type ZeroRouterStageResult,
  type PerformanceFloorEntry,
} from './composite-router-helpers.js';
import { getWeatherBonusScores } from './weather-bonus-stage.js';
import { CATEGORY_CHAIN_OVERRIDES, isCategoryFailClosed } from './fallback-chains.js';
import { detectTaskCategory } from '../config/task-specialization.js';
import { getOutcomeStore } from '../orchestration/outcomes/outcome-store.js';

/** Module-level singleton — SharedTaskAnalyzer is stateless, no need to re-instantiate per call. */
const sharedAnalyzer = createSharedTaskAnalyzer();

/**
 * Collapse a routing-arm candidate set to its unique display CLI slots (#3422).
 * The RoutingContext-based stages (confidence-cascade, capability-match,
 * quality-constraint, etc.) score/filter at slot granularity, so an api:* arm
 * is represented by its vendor slot. De-duplicated to avoid double-scoring when
 * both a CLI slot and its API arm are present.
 */
function armsToSlots(candidates: readonly RoutingArmId[]): CliName[] {
  return [...new Set(candidates.map(routingArmDisplaySlot))];
}

/**
 * Filter an arm candidate set down to those whose display slot survived a
 * slot-level filter (#3422). Preserves the distinct api:* arms.
 */
function keepArmsForSlots(
  candidates: readonly RoutingArmId[],
  survivingSlots: readonly CliName[]
): RoutingArmId[] {
  const slotSet = new Set(survivingSlots);
  return candidates.filter((arm) => slotSet.has(routingArmDisplaySlot(arm)));
}

/** Dependencies required for pipeline stage execution. */
export interface StageDependencies {
  config: CompositeRouterConfigWithPreference;
  logger: ILogger;
  cliNames: RoutingArmId[];
  budgetRouter: BudgetRouter | undefined;
  zeroRouter: ZeroRouter | undefined;
  preferenceRouter: PreferenceRouter | undefined;
  topsisRouter: TopsisRouter | undefined;
  linucbBandit: LinUCBBandit | undefined;
  latencyTracker: LatencyTracker | undefined;
  routingMemory: IRoutingMemory | undefined;
  /** Confidence cascade stage instance (Issue #755) */
  confidenceCascadeStage: ConfidenceCascadeStage | undefined;
  /** Capability match stage instance (Issue #755) */
  capabilityMatchStage: CapabilityMatchStage | undefined;
  /** Quality constraint stage instance (Issue #755) */
  qualityConstraintStage: QualityConstraintStage | undefined;
  /** Resource strategy stage instance (Issue #998) */
  resourceStrategyStage: ResourceStrategyStage | undefined;
  capacityFilterStage: CapacityFilterStage | undefined;
  /** Distilled rule stage instance (Issue #999) */
  distilledRuleStage: DistilledRuleStage | undefined;
  /** KNN routing stage instance (arXiv:2505.12601) */
  knnRoutingStage: KnnRoutingStage | undefined;
}

/** Result from budget stage including rejection tracking. */
export interface BudgetStageResult {
  candidates: RoutingArmId[];
  withinBudget: boolean | undefined;
  rejected: boolean;
}

/** Analyzes task and returns profile, updating stages array. */
export function analyzeTaskProfile(task: CliTask, stagesExecuted: string[]): TaskProfile {
  const internalTask = cliTaskToTask(task);
  const analysis = sharedAnalyzer.analyze(internalTask);
  stagesExecuted.push('task-analysis');
  return taskAnalysisResultToTaskProfile(analysis);
}

/** Runs budget filtering stage. */
export function runBudgetStage(
  task: CliTask,
  candidates: RoutingArmId[],
  stagesExecuted: string[],
  deps: StageDependencies
): Result<
  {
    candidates: RoutingArmId[];
    withinBudget: boolean | undefined;
    /** Projected spend / cost ceiling; undefined when no ceiling is set (#4866). */
    budgetUtilization?: number;
  },
  CompositeRoutingError
> {
  if (!deps.config.enableBudgetFilter || deps.budgetRouter === undefined) {
    return ok({ candidates, withinBudget: undefined });
  }
  const result = applyBudgetFilter(task, candidates, deps.budgetRouter, deps.config);
  stagesExecuted.push('budget-filter');
  if (result.eligible.length === 0) {
    return err(new CompositeRoutingError('No CLIs within budget', 'budget-filter'));
  }
  return ok({
    candidates: result.eligible,
    withinBudget: result.withinBudget,
    ...(result.budgetUtilization === undefined
      ? {}
      : { budgetUtilization: result.budgetUtilization }),
  });
}

/**
 * Runs the capacity filter stage (#4373, criterion 3 of #4351).
 *
 * Excludes candidates whose adapter reports measurably exhausted capacity. An
 * unmeasured reading never excludes — see `assessCapacity`.
 *
 * Mirrors `runBudgetStage`: when every candidate is excluded this returns an
 * error rather than handing an empty set downstream, so the caller fails closed
 * with a named reason instead of routing to an adapter that cannot serve. That
 * is the behaviour #4351 was filed for.
 *
 * Assessment is ARM-granular (#4455). Unlike the scoring stages, this one does
 * NOT collapse candidates onto vendor display slots: quota belongs to the
 * serving route, so `claude` and `api:anthropic` are probed separately even
 * though they share a slot. Collapsing them applied one arm's reading to both,
 * which in an exclusion stage meant an exhausted CLI could remove a healthy
 * `api:*` arm holding an entirely independent quota — and an exhausted api arm
 * went unprobed, the exact #4351 case this stage exists to prevent. Slot
 * granularity is a fair approximation when scoring; here it was the wrong
 * quantity, not an imprecise one.
 */
export async function runCapacityStage(
  task: CliTask,
  candidates: RoutingArmId[],
  stagesExecuted: string[],
  deps: StageDependencies
): Promise<Result<RoutingArmId[], CompositeRoutingError>> {
  if (!deps.config.enableCapacityBalancing || deps.capacityFilterStage === undefined) {
    return ok(candidates);
  }

  stagesExecuted.push('capacity-filter');

  // #4455: filter at ARM granularity, not display-slot. Capacity belongs to the
  // serving route — a CLI subscription's quota and an API key's quota are
  // independent — so collapsing `claude` and `api:anthropic` onto one slot
  // applied one arm's reading to both, in a stage whose action is exclusion.
  //
  // The try/catch is load-bearing, not defensive dressing: a throw here would
  // reject runPipeline and the entire routing call.
  let outcome;
  try {
    outcome = await deps.capacityFilterStage.filterArms(candidates);
  } catch (error) {
    deps.logger.debug('Capacity stage threw - keeping all candidates', {
      error: error instanceof Error ? error.message : String(error),
    });
    return ok(candidates);
  }

  if (outcome.eligible.length === 0) {
    // Name every excluded arm and why. Two voters on the #4373 default-posture
    // panel made this binding: failing closed with a bare code reproduces the
    // #4351 complaint that nexus "did not explain it in the terminal result",
    // and an operator staring at an empty pool needs to know which adapters
    // were dropped without re-running with debug logging.
    const reasons = [...outcome.excluded.entries()]
      .map(([arm, reason]) => `${arm} (${reason})`)
      .join(', ');
    return err(
      new CompositeRoutingError(
        `All routing candidates excluded — ${CAPACITY_EXHAUSTED}. Excluded: ${reasons}`,
        'capacity-filter'
      )
    );
  }
  return ok(outcome.eligible);
}

/** Default complexity when no signal is available. */
const DEFAULT_COMPLEXITY: ConfidenceCascadeStageResult['complexity'] = 'moderate';

/** Extract complexity level from confidence cascade signals. */
function extractComplexityFromSignals(
  signals: readonly string[]
): 'simple' | 'moderate' | 'complex' {
  for (const s of signals) {
    if (s === 'confidence:complexity-simple') return 'simple';
    if (s === 'confidence:complexity-complex') return 'complex';
    if (s === 'confidence:complexity-moderate') return 'moderate';
  }
  return DEFAULT_COMPLEXITY;
}

/** Extract task type from capability match signals. */
function extractTaskTypeFromSignals(signals: readonly string[]): string {
  for (const s of signals) {
    if (s.startsWith('capability:task-')) return s.slice('capability:task-'.length);
  }
  return 'general';
}

/** Extract best CLI from signals with a given prefix. */
function extractBestCliFromSignals(
  signals: readonly string[],
  prefix: string
): CliName | undefined {
  for (const s of signals) {
    if (s.startsWith(prefix)) return s.slice(prefix.length) as CliName;
  }
  return undefined;
}

/** Extract resource tier from signals. */
function extractTierFromSignals(signals: readonly string[]): string {
  for (const s of signals) {
    if (s.startsWith('resource-strategy:tier=')) return s.slice('resource-strategy:tier='.length);
  }
  return 'balanced';
}

/** Count applied rules from distilled-rule signals. */
function countAppliedRulesFromSignals(signals: readonly string[]): number {
  let count = 0;
  for (const s of signals) {
    if (s.startsWith('distilled-rule:applied=')) count++;
  }
  return count;
}

/** Confidence cascade stage result. (Issue #755) */
export interface ConfidenceCascadeStageResult {
  scores: Map<CliName, number>;
  complexity: 'simple' | 'moderate' | 'complex';
  shouldEscalate: boolean;
}

/** Default confidence cascade result. */
const DEFAULT_CASCADE_RESULT: ConfidenceCascadeStageResult = {
  scores: new Map(),
  complexity: DEFAULT_COMPLEXITY,
  shouldEscalate: false,
};

/** Runs confidence cascade stage. (Issue #755, #1350) */
export async function runConfidenceCascadeStage(
  task: CliTask,
  candidates: RoutingArmId[],
  stagesExecuted: string[],
  deps: StageDependencies
): Promise<ConfidenceCascadeStageResult> {
  if (!deps.config.enableConfidenceCascade || deps.confidenceCascadeStage === undefined) {
    return DEFAULT_CASCADE_RESULT;
  }

  const ctx = createRoutingContext(task.content, armsToSlots(candidates));
  const result = await deps.confidenceCascadeStage.route(ctx);
  stagesExecuted.push('confidence-cascade');

  if (!result.ok) {
    deps.logger.debug('Confidence cascade stage failed', { error: result.error.message });
    return DEFAULT_CASCADE_RESULT;
  }

  const { signals, scores } = result.value.context;
  const complexity = extractComplexityFromSignals(signals);
  const shouldEscalate = signals.includes('confidence:should-escalate');

  deps.logger.debug('Confidence cascade completed', {
    complexity,
    shouldEscalate,
    scoreCount: scores.size,
  });

  return { scores: new Map(scores), complexity, shouldEscalate };
}

/** Capability match stage result. (Issue #755) */
export interface CapabilityMatchStageResult {
  scores: Map<CliName, number>;
  taskType: string;
  bestCli: CliName | undefined;
}

/** Default capability match result. */
const DEFAULT_CAPABILITY_RESULT: CapabilityMatchStageResult = {
  scores: new Map(),
  taskType: 'general',
  bestCli: undefined,
};

/** Runs capability match stage. (Issue #755, #1350) */
export async function runCapabilityMatchStage(
  task: CliTask,
  candidates: RoutingArmId[],
  stagesExecuted: string[],
  deps: StageDependencies
): Promise<CapabilityMatchStageResult> {
  if (!deps.config.enableCapabilityMatch || deps.capabilityMatchStage === undefined) {
    return DEFAULT_CAPABILITY_RESULT;
  }

  const ctx = createRoutingContext(task.content, armsToSlots(candidates));
  const result = await deps.capabilityMatchStage.route(ctx);
  stagesExecuted.push('capability-match');

  if (!result.ok) {
    deps.logger.debug('Capability match stage failed', { error: result.error.message });
    return DEFAULT_CAPABILITY_RESULT;
  }

  const { signals, scores } = result.value.context;
  const taskType = extractTaskTypeFromSignals(signals);
  const bestCli = extractBestCliFromSignals(signals, 'capability:best-');

  deps.logger.debug('Capability match completed', {
    taskType,
    bestCli,
    scoreCount: scores.size,
  });

  return { scores: new Map(scores), taskType, bestCli };
}

/** Quality constraint stage result. (Issue #755) */
export interface QualityConstraintStageResult {
  eligible: RoutingArmId[];
  filtered: Map<CliName, string>;
  usedFallback: boolean;
}

/** Runs quality constraint stage. (Issue #755, #1350) */
export async function runQualityConstraintStage(
  candidates: RoutingArmId[],
  stagesExecuted: string[],
  deps: StageDependencies
): Promise<QualityConstraintStageResult> {
  if (!deps.config.enableQualityConstraint || deps.qualityConstraintStage === undefined) {
    return { eligible: candidates, filtered: new Map(), usedFallback: false };
  }

  // Quality constraints are slot-level; collapse to slots for the stage, then
  // keep the arms whose slot survived (#3422).
  const ctx = createRoutingContext('', armsToSlots(candidates));
  const result = await deps.qualityConstraintStage.route(ctx);
  stagesExecuted.push('quality-constraint');

  if (!result.ok) {
    deps.logger.debug('Quality constraint stage failed', { error: result.error.message });
    return { eligible: candidates, filtered: new Map(), usedFallback: false };
  }

  const remaining = getRemainingCandidates(result.value.context);
  const filtered = new Map(result.value.context.filtered);
  const usedFallback = result.value.context.signals.includes('quality:used-fallback');

  deps.logger.debug('Quality constraint completed', {
    eligible: remaining.length,
    filtered: filtered.size,
    usedFallback,
  });

  // If all slots filtered, fall back to original set
  const eligible = remaining.length > 0 ? keepArmsForSlots(candidates, remaining) : candidates;
  return { eligible, filtered, usedFallback: remaining.length === 0 || usedFallback };
}

/** Resource strategy stage result. (Issue #998) */
export interface ResourceStrategyStageResult {
  scores: Map<CliName, number>;
  tier: string;
  resourceLevel: number | undefined;
  /**
   * Whether a tier was actually selected (#4866).
   *
   * `false` means the stage skipped for want of budget data, so `tier` is the
   * `'balanced'` default and NOT a decision. Without this, a genuinely
   * selected balanced tier and a stage that never ran are the same value.
   */
  tierMeasured: boolean;
}

/** Default resource strategy result. */
const DEFAULT_RESOURCE_RESULT: ResourceStrategyStageResult = {
  scores: new Map(),
  tier: 'balanced',
  resourceLevel: undefined,
  tierMeasured: false,
};

/** Runs resource strategy stage. (Issue #998, #1350) */
export async function runResourceStrategyStage(
  task: CliTask,
  candidates: RoutingArmId[],
  stagesExecuted: string[],
  deps: StageDependencies,
  budgetUtilization?: number
): Promise<ResourceStrategyStageResult> {
  if (!deps.config.enableResourceStrategy || deps.resourceStrategyStage === undefined) {
    return DEFAULT_RESOURCE_RESULT;
  }

  // The stage reads its input from context metadata. It used to be given a
  // fresh context with no metadata and no signals, so it skipped with "no
  // budget data" on every production call and no tier was ever selected
  // (#4866). Passed as a typed argument rather than revived as a cross-stage
  // signal channel — the string-prefix channel is what produced #4832/#4834.
  //
  // Undefined stays undefined: with no cost ceiling configured there is no
  // utilization, and substituting a default would activate tier adjustments
  // for users who never asked for budget-aware routing.
  const resourceLevel =
    budgetUtilization === undefined ? undefined : Math.max(0, Math.min(1, 1 - budgetUtilization));
  const ctx = createRoutingContext(
    task.content,
    armsToSlots(candidates),
    resourceLevel === undefined ? undefined : { resourceLevel }
  );
  const result = await deps.resourceStrategyStage.route(ctx);
  stagesExecuted.push('resource-strategy');

  if (!result.ok) {
    deps.logger.debug('Resource strategy stage failed', { error: result.error.message });
    return DEFAULT_RESOURCE_RESULT;
  }

  const { signals, scores } = result.value.context;
  const tier = extractTierFromSignals(signals);
  const tierMeasured = signals.some((sig) => sig.startsWith('resource-strategy:tier='));

  deps.logger.debug('Resource strategy completed', {
    tier,
    tierMeasured,
    resourceLevel,
    scoreCount: scores.size,
  });

  // Only report the level the stage actually ACTED on. Returning the input
  // regardless would claim a level was applied when the stage had skipped —
  // the same "reported but not used" shape this change exists to remove.
  return {
    scores: new Map(scores),
    tier,
    resourceLevel: tierMeasured ? resourceLevel : undefined,
    tierMeasured,
  };
}

/** Distilled rule stage result. (Issue #999) */
export interface DistilledRuleStageResult {
  scores: Map<CliName, number>;
  rulesApplied: number;
}

/** Runs distilled rule stage. (Issue #999, #1350) */
export async function runDistilledRuleStage(
  task: CliTask,
  candidates: RoutingArmId[],
  stagesExecuted: string[],
  deps: StageDependencies,
  taskCategory?: string
): Promise<DistilledRuleStageResult> {
  if (!deps.config.enableStrategyDistillation || deps.distilledRuleStage === undefined) {
    return { scores: new Map(), rulesApplied: 0 };
  }

  // Typed argument rather than a cross-stage signal (#4866 option B). The
  // vocabulary matters: rules carry a `TaskCategory`, and `detectTaskCategory`
  // is the only producer that speaks it — `capability:task-` emits an
  // unrelated four-value set (#4832).
  const ctx = createRoutingContext(
    task.content,
    armsToSlots(candidates),
    taskCategory === undefined ? undefined : { taskCategory }
  );
  const result = await deps.distilledRuleStage.route(ctx);
  stagesExecuted.push('distilled-rule');

  if (!result.ok) {
    deps.logger.debug('Distilled rule stage failed', { error: result.error.message });
    return { scores: new Map(), rulesApplied: 0 };
  }

  const { signals, scores } = result.value.context;
  const rulesApplied = countAppliedRulesFromSignals(signals);

  deps.logger.debug('Distilled rule stage completed', { rulesApplied, scoreCount: scores.size });

  return { scores: new Map(scores), rulesApplied };
}

/** KNN routing stage result. (arXiv:2505.12601) */
export interface KnnRoutingStageResult {
  scores: Map<CliName, number>;
  hasExperience: boolean;
}

/** Runs KNN experience-based routing stage. (arXiv:2505.12601) */
export async function runKnnRoutingStage(
  task: CliTask,
  candidates: RoutingArmId[],
  stagesExecuted: string[],
  deps: StageDependencies
): Promise<KnnRoutingStageResult> {
  if (!deps.config.enableKnnRouting || deps.knnRoutingStage === undefined) {
    return { scores: new Map(), hasExperience: false };
  }

  const ctx = createRoutingContext(task.content, armsToSlots(candidates));
  const result = await deps.knnRoutingStage.route(ctx);
  stagesExecuted.push('knn-routing');

  if (!result.ok) {
    deps.logger.debug('KNN routing stage failed', { error: result.error.message });
    return { scores: new Map(), hasExperience: false };
  }

  const { signals, scores } = result.value.context;
  const hasExperience = signals.includes('knn:experience-matched');

  deps.logger.debug('KNN routing completed', { hasExperience, scoreCount: scores.size });

  return { scores: new Map(scores), hasExperience };
}

/** Runs ZeroRouter difficulty estimation stage. */
export function runZeroRouterStage(
  task: CliTask,
  candidates: RoutingArmId[],
  stagesExecuted: string[],
  deps: StageDependencies
): ZeroRouterStageResult {
  if (!deps.config.enableZeroRouter || deps.zeroRouter === undefined) {
    return defaultZeroRouterStageResult(candidates);
  }

  const result = applyZeroRouterFilter(task, candidates, deps.zeroRouter);
  stagesExecuted.push('zero-router');

  deps.logger.debug('ZeroRouter applied', {
    level: result.difficultyEstimate?.level,
    tier: result.difficultyTier,
    score: result.difficultyEstimate?.aggregateScore.toFixed(3),
    candidatesAfter: result.filteredCandidates.length,
  });

  return result;
}

/** Builds per-CLI performance data for the given task category from the outcome store.
 * Returns empty map if category is unknown or store is empty. (#1401) */
function getPerformanceDataForCategory(taskContent: string): Map<CliName, PerformanceFloorEntry> {
  try {
    const match = detectTaskCategory(taskContent);
    if (match === null) return new Map();
    const summary = getOutcomeStore().summarize({ category: match.category });
    const result = new Map<CliName, PerformanceFloorEntry>();
    for (const [cli, stats] of summary.byCli) {
      result.set(cli as CliName, {
        successRate: stats.successRate,
        sampleCount: stats.count,
      });
    }
    return result;
  } catch (error: unknown) {
    // Closes #2952 (low): pre-fix the bare `catch {}` silently disabled
    // the performance-floor penalty on OutcomeStore read failures (DB
    // lock, schema mismatch). Log at debug — the empty Map fallback is
    // the right behavior (no data → no penalty) but operators benefit
    // from a trail when something stops working.
    logger.debug('Performance-floor outcome-store read failed; skipping penalty', {
      error: error instanceof Error ? error.message : String(error),
    });
    return new Map();
  }
}

/** Runs TOPSIS ranking stage. Uses plan billing criteria when billingMode is 'plan'.
 * When stageScores are provided, adjusts quality profiles before evaluation. (#1354)
 * When performance floor data is available, penalizes underperforming CLIs. (#1401) */
export function runTopsisStage(
  taskProfile: TaskProfile,
  candidates: RoutingArmId[],
  stagesExecuted: string[],
  deps: StageDependencies,
  options?: {
    stageScores?: ReadonlyMap<CliName, number>;
    performanceData?: ReadonlyMap<CliName, PerformanceFloorEntry>;
  }
): { ranking: RoutingArmId[]; score: number | undefined } {
  if (!deps.config.enableTopsisRanking || deps.topsisRouter === undefined) {
    return { ranking: candidates, score: undefined };
  }
  const topsisOptions: Parameters<typeof applyTopsisRanking>[3] = {
    billingMode: deps.config.billingMode,
  };
  if (options?.stageScores !== undefined) topsisOptions.stageScores = options.stageScores;
  if (options?.performanceData !== undefined)
    topsisOptions.performanceData = options.performanceData;
  const result = applyTopsisRanking(taskProfile, candidates, deps.topsisRouter, topsisOptions);
  stagesExecuted.push('topsis-ranking');
  return { ranking: result.ranking, score: result.topScore };
}

/** Runs LinUCB bandit selection stage. */
export function runLinUCBStage(
  taskProfile: TaskProfile,
  topsisRanking: RoutingArmId[],
  stagesExecuted: string[],
  deps: StageDependencies
): { selectedCli: RoutingArmId | undefined; ucbScore: number | undefined } {
  if (!deps.config.enableLinUCBSelection || deps.linucbBandit === undefined) {
    return { selectedCli: topsisRanking[0], ucbScore: undefined };
  }
  const banditContext = taskProfileToBanditContext(taskProfile);
  const selection = deps.linucbBandit.select(banditContext);
  stagesExecuted.push('linucb-selection');
  // armName is the routing arm id — a CLI slot or a distinct api:* arm (#3422).
  const picked = selection.armName as RoutingArmId;
  // #3111: LinUCB.select() ranks over ALL registered arms, ignoring the
  // already-filtered candidate set. Constrain the pick to topsisRanking so a
  // fail-closed category override (e.g. security_review → [codex]) or a
  // quality filter can't be bypassed by a learned preference. recordOutcome
  // keys the reward update on the *routed* cliName, so falling back to the
  // TOPSIS-best candidate updates the arm actually used — no learning desync.
  if (!topsisRanking.includes(picked)) {
    return { selectedCli: topsisRanking[0], ucbScore: selection.ucbScore };
  }
  return { selectedCli: picked, ucbScore: selection.ucbScore };
}

/** Runs preference routing stage. */
export function runPreferenceStage(
  task: CliTask,
  candidates: RoutingArmId[],
  stagesExecuted: string[],
  deps: StageDependencies
): PreferenceStageResult {
  if (!deps.config.enablePreferenceRouting || deps.preferenceRouter === undefined) {
    return defaultPreferenceStageResult(candidates);
  }
  if (!deps.preferenceRouter.hasMinimumData()) {
    deps.logger.debug('Preference routing skipped: insufficient data');
    return defaultPreferenceStageResult(candidates);
  }

  const decision = deps.preferenceRouter.route(task.content);
  stagesExecuted.push('preference-routing');
  const preferredCandidates = filterByPreferenceTier(candidates, decision.selectedTier);

  deps.logger.debug('Preference routing applied', {
    tier: decision.selectedTier,
    probability: decision.prediction.strongModelProbability,
    candidatesAfter: preferredCandidates.length,
  });

  return {
    preferenceScore: decision.prediction.strongModelProbability,
    preferenceTier: decision.selectedTier,
    preferredCandidates: preferredCandidates.length > 0 ? preferredCandidates : candidates,
  };
}

/** Latency scoring stage result. (Issue #361) */
export interface LatencyStageResult {
  latencyScore: number | undefined;
  latencyAdjustedRanking: RoutingArmId[];
}

/** Runs latency scoring stage. (Issue #361) */
export function runLatencyStage(
  candidates: RoutingArmId[],
  stagesExecuted: string[],
  deps: StageDependencies
): LatencyStageResult {
  if (!deps.config.enableLatencyTracking || deps.latencyTracker === undefined) {
    return { latencyScore: undefined, latencyAdjustedRanking: candidates };
  }

  // Latency is tracked per slot; collapse arms and let an api:* arm sort by
  // its display slot's latency score (#3422).
  const scores = deps.latencyTracker.getScores(armsToSlots(candidates));
  stagesExecuted.push('latency-scoring');
  const scoreOf = (arm: RoutingArmId): number =>
    scores.find((s) => s.cli === routingArmDisplaySlot(arm))?.score ?? 0;

  // Sort candidates by latency score (higher is better/faster)
  const sortedCandidates = [...candidates].sort((a, b) => scoreOf(b) - scoreOf(a));

  const topArm = sortedCandidates[0];
  const topScore =
    topArm !== undefined
      ? scores.find((s) => s.cli === routingArmDisplaySlot(topArm))?.score
      : undefined;

  deps.logger.debug('Latency scoring applied', {
    scores: scores.map((s) => ({
      cli: s.cli,
      score: s.score.toFixed(3),
      reliable: s.hasReliableData,
    })),
    topCandidate: sortedCandidates[0],
  });

  return {
    latencyScore: topScore,
    latencyAdjustedRanking: sortedCandidates,
  };
}

/** Routing memory stage result. (Issue #489) */
export interface RoutingMemoryStageResult {
  recommendation: CliName | undefined;
  memoryConfidence: number | undefined;
}

/** Runs routing memory stage to get learned recommendation. (Issue #489) */
export function runRoutingMemoryStage(
  task: CliTask,
  candidates: RoutingArmId[],
  stagesExecuted: string[],
  deps: StageDependencies
): RoutingMemoryStageResult {
  if (!deps.config.enableRoutingMemory || deps.routingMemory === undefined) {
    return { recommendation: undefined, memoryConfidence: undefined };
  }

  const taskType = inferTaskTypeFromContent(task.content);
  // Routing memory is a slot-level secondary learner; its recommendation is a
  // CLI slot, matched against the candidates' display slots (#3422).
  const recommendation = deps.routingMemory.getRecommendation(taskType);
  stagesExecuted.push('routing-memory');

  if (recommendation !== undefined && armsToSlots(candidates).includes(recommendation)) {
    deps.logger.debug('Routing memory recommendation', {
      taskType,
      recommended: recommendation,
      inCandidates: true,
    });
    return { recommendation, memoryConfidence: 0.8 };
  }

  deps.logger.debug('Routing memory: no recommendation or not in candidates', {
    taskType,
    recommended: recommendation,
    candidateCount: candidates.length,
  });
  return { recommendation: undefined, memoryConfidence: undefined };
}

/** Task type keywords mapping for routing memory. */
const TASK_TYPE_KEYWORDS: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  ['coding', ['code', 'implement']],
  ['review', ['review', 'audit']],
  ['testing', ['test', 'spec']],
  ['documentation', ['document', 'explain']],
  ['refactoring', ['refactor']],
  ['debugging', ['debug', 'fix']],
];

/** Infer task type from content for routing memory lookup. */
function inferTaskTypeFromContent(content: string): string {
  const lower = content.toLowerCase();
  for (const [taskType, keywords] of TASK_TYPE_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) return taskType;
  }
  return 'general';
}

/** Merge multiple score maps into a single aggregated map. */
function mergeScoreMaps(
  ...maps: ReadonlyArray<ReadonlyMap<CliName, number>>
): Map<CliName, number> {
  const merged = new Map<CliName, number>();
  for (const m of maps) {
    for (const [cli, score] of m) {
      merged.set(cli, (merged.get(cli) ?? 0) + score);
    }
  }
  return merged;
}

/**
 * The task's category in the vocabulary a {@link DistilledRule} carries.
 *
 * `detectTaskCategory` is the only producer speaking `TASK_CATEGORIES`;
 * `capability:task-` emits an unrelated four-value set (#4832). `undefined`
 * when nothing scores, which leaves rules unscoped as before.
 */
function detectedCategory(task: CliTask): string | undefined {
  return detectTaskCategory(task.content)?.category;
}

/** Runs scoring stages (priorities 10-55) and returns intermediate results. */
async function runScoringStages(
  task: CliTask,
  candidates: RoutingArmId[],
  stagesExecuted: string[],
  deps: StageDependencies,
  budgetUtilization?: number
): Promise<{
  cascadeResult: ConfidenceCascadeStageResult;
  memoryResult: RoutingMemoryStageResult;
  capResult: CapabilityMatchStageResult;
  knnResult: KnnRoutingStageResult;
  zeroResult: ZeroRouterStageResult;
  distilledResult: DistilledRuleStageResult;
  prefResult: PreferenceStageResult;
  resourceResult: ResourceStrategyStageResult;
  candidates: RoutingArmId[];
}> {
  const cascadeResult = await runConfidenceCascadeStage(task, candidates, stagesExecuted, deps);
  const memoryResult = runRoutingMemoryStage(task, candidates, stagesExecuted, deps);
  const capResult = await runCapabilityMatchStage(task, candidates, stagesExecuted, deps);
  const knnResult = await runKnnRoutingStage(task, candidates, stagesExecuted, deps);
  const zeroResult = runZeroRouterStage(task, candidates, stagesExecuted, deps);
  let filtered = zeroResult.filteredCandidates;
  const cat = detectedCategory(task);
  const distilledResult = await runDistilledRuleStage(task, filtered, stagesExecuted, deps, cat);
  const prefResult = runPreferenceStage(task, filtered, stagesExecuted, deps);
  filtered = prefResult.preferredCandidates;
  const resourceResult = await runResourceStrategyStage(
    task,
    filtered,
    stagesExecuted,
    deps,
    budgetUtilization
  );
  return {
    cascadeResult,
    memoryResult,
    capResult,
    knnResult,
    zeroResult,
    distilledResult,
    prefResult,
    resourceResult,
    candidates: filtered,
  };
}

/** Aggregates scores from scoring stages + weather bonuses for TOPSIS. (#1354, #1389) */
function aggregateStageScores(
  scoring: Awaited<ReturnType<typeof runScoringStages>>,
  taskContent: string,
  candidates: readonly RoutingArmId[]
): Map<CliName, number> {
  const weatherScores = getWeatherBonusForTask(taskContent);
  // Tune adjustments are slot-keyed; collapse arms to display slots (#3422).
  return mergeScoreMaps(
    scoring.cascadeResult.scores,
    scoring.capResult.scores,
    scoring.knnResult.scores,
    scoring.distilledResult.scores,
    scoring.resourceResult.scores,
    weatherScores,
    getTuneAdjustmentScores(armsToSlots([...candidates]))
  );
}

/**
 * Env flag (#3147): when enabled, the self-tuning loop's bounded routing
 * demotions are applied as a scoring penalty here. Default off → no-op.
 */
const TUNE_ENFORCE_ENV = 'NEXUS_TUNE_ENFORCE';

/**
 * Translates the bounded TuneAdjustmentStore multiplier into an additive
 * routing penalty consistent with the stage-score scale (distilled
 * penalize=-5, avoid=-10). A max demotion (multiplier 0.5) maps to ≈ -5; the
 * store guarantees the multiplier never drops below its floor, so the penalty
 * is bounded. Gated by `NEXUS_TUNE_ENFORCE` (default ON, #3323) — empty map
 * (no-op) when opted out with `NEXUS_TUNE_ENFORCE=false`.
 */
export function getTuneAdjustmentScores(candidates: readonly CliName[]): Map<CliName, number> {
  const scores = new Map<CliName, number>();
  if (!parseBoolEnv(TUNE_ENFORCE_ENV, true)) return scores;
  const store = getTuneAdjustmentStore();
  for (const cli of candidates) {
    const multiplier = store.effectiveMultiplier(cli);
    if (multiplier < 1.0) {
      scores.set(cli, -(1.0 - multiplier) * 10);
    }
  }
  return scores;
}

/** Best-effort weather bonus lookup for a task. */
function getWeatherBonusForTask(taskContent: string): Map<CliName, number> {
  try {
    const match = detectTaskCategory(taskContent);
    if (match === null) return new Map();
    return getWeatherBonusScores(match.category);
  } catch (error: unknown) {
    // Closes #2952 (low): pre-fix the bare `catch {}` silently disabled
    // the weather bonus on outcome-store read failures. Log at debug —
    // empty Map is the correct fallback (no data → no bonus), but a log
    // trail helps operators see when this silently stops working.
    logger.debug('Weather bonus outcome-store read failed; skipping bonus', {
      error: error instanceof Error ? error.message : String(error),
    });
    return new Map();
  }
}

/** Apply quality constraints and return filtered candidates or error (#1686). */
async function applyQualityConstraints(
  candidates: RoutingArmId[],
  stagesExecuted: string[],
  deps: StageDependencies
): Promise<
  Result<
    { candidates: RoutingArmId[]; qualityResult: QualityConstraintStageResult },
    CompositeRoutingError
  >
> {
  const qualityResult = await runQualityConstraintStage(candidates, stagesExecuted, deps);
  if (qualityResult.eligible.length === 0) {
    return err(
      new CompositeRoutingError('All candidates rejected by quality constraints', 'selection')
    );
  }
  return ok({ candidates: qualityResult.eligible, qualityResult });
}

/**
 * Filter candidates to those allowed by CATEGORY_CHAIN_OVERRIDES (#2414).
 *
 * Without this, CompositeRouter selects the primary CLI purely from learned
 * LinUCB rewards, ignoring per-category routing overrides like
 * security_review→codex (#1525) or architecture→gemini (#1518). The
 * overrides existed in config but only fired on circuit-breaker fallback.
 *
 * Behavior:
 * - If the task category has no override entry, candidates pass through.
 * - If an override exists, candidates are filtered to only those in the
 *   override chain (preserving the override's order). LinUCB still selects
 *   from this filtered set, so adaptive learning continues within the
 *   override-allowed CLIs.
 * - If filtering eliminates every candidate AND the category is in
 *   `SENSITIVE_CATEGORIES`, return Result.err so the caller can fail-closed
 *   instead of silently routing to an excluded CLI (#2417).
 * - Otherwise (the common, performance-preference case), fall back to the
 *   original candidates with a `category-override:no-eligible` stage marker.
 */
function applyCategoryOverride(
  task: CliTask,
  candidates: RoutingArmId[],
  stagesExecuted: string[]
): Result<RoutingArmId[], CompositeRoutingError> {
  const match = detectTaskCategory(task.content);
  if (match === null) return ok(candidates);
  const override = CATEGORY_CHAIN_OVERRIDES[match.category];
  if (override === undefined) return ok(candidates);

  // Override chains are slot-level (#3422). Keep arms whose display slot is in
  // the override chain, preserving the chain's slot order (an api:* arm follows
  // its vendor slot's position).
  const overrideSet = new Set(override);
  const orderIndex = (arm: RoutingArmId): number => override.indexOf(routingArmDisplaySlot(arm));
  const filtered = candidates
    .filter((arm) => overrideSet.has(routingArmDisplaySlot(arm)))
    .sort((a, b) => orderIndex(a) - orderIndex(b));

  if (filtered.length === 0) {
    if (isCategoryFailClosed(match.category)) {
      stagesExecuted.push('category-override:fail-closed');
      logger.warn('Category override fail-closed — every override CLI unavailable', {
        category: match.category,
        override,
        availableCandidates: candidates,
      });
      return err(
        new CompositeRoutingError(
          `category '${match.category}' is fail-closed and every override CLI (${override.join(', ')}) is unavailable; route aborted to prevent silent fallback to excluded CLI`,
          'category-override'
        )
      );
    }
    stagesExecuted.push('category-override:no-eligible');
    return ok(candidates);
  }

  stagesExecuted.push('category-override');
  return ok(filtered);
}

/** Override LinUCB selection if the chosen CLI is below performance floor (#1790). */
function applyLinUCBFloorOverride(
  linucbCli: RoutingArmId,
  topsisRanking: RoutingArmId[],
  opts: {
    perfData?: ReadonlyMap<CliName, PerformanceFloorEntry> | undefined;
    taskType: string;
    stagesExecuted: string[];
  }
): RoutingArmId {
  if (opts.perfData === undefined) return linucbCli;
  // Performance-floor data is slot-keyed; an api:* arm is judged on its
  // display slot's success rate (#3422).
  const cliPerf = opts.perfData.get(routingArmDisplaySlot(linucbCli));
  if (cliPerf === undefined || cliPerf.sampleCount < 20 || cliPerf.successRate >= 0.5) {
    return linucbCli;
  }
  const topsisTop = topsisRanking[0];
  if (topsisTop === undefined || topsisTop === linucbCli) return linucbCli;
  opts.stagesExecuted.push('perf-floor-override');
  return topsisTop;
}

/** Executes full pipeline and returns result. (Made async in Issue #1350) */
// eslint-disable-next-line max-lines-per-function -- routing pipeline is a cohesive sequence
export async function runPipeline(
  task: CliTask,
  taskProfile: TaskProfile,
  stagesExecuted: string[],
  cliNames: RoutingArmId[],
  deps: StageDependencies
): Promise<Result<PipelineResult, CompositeRoutingError>> {
  let candidates: RoutingArmId[] = [...cliNames];
  if (candidates.length === 0) {
    return err(new CompositeRoutingError('No CLI adapters available', 'initialization'));
  }

  const budgetResult = runBudgetStage(task, candidates, stagesExecuted, deps);
  if (!budgetResult.ok) return budgetResult;
  candidates = budgetResult.value.candidates;
  const withinBudget = budgetResult.value.withinBudget;

  // Capacity exclusion runs with the other hard filters, before any scoring —
  // no point scoring an arm that cannot serve the request (#4373).
  const capacityResult = await runCapacityStage(task, candidates, stagesExecuted, deps);
  if (!capacityResult.ok) return capacityResult;
  candidates = capacityResult.value;

  const scoring = await runScoringStages(
    task,
    candidates,
    stagesExecuted,
    deps,
    budgetResult.value.budgetUtilization
  );
  candidates = scoring.candidates;

  // Constraint-first: quality constraints filter BEFORE TOPSIS/LinUCB (#1686)
  const constrained = await applyQualityConstraints(candidates, stagesExecuted, deps);
  if (!constrained.ok) return constrained;
  candidates = constrained.value.candidates;

  // Category override: respect CATEGORY_CHAIN_OVERRIDES before TOPSIS/LinUCB (#2414)
  // Returns err for sensitive categories whose override chain is exhausted (#2417).
  const overrideResult = applyCategoryOverride(task, candidates, stagesExecuted);
  if (!overrideResult.ok) return overrideResult;
  candidates = overrideResult.value;

  const stageScores = aggregateStageScores(scoring, task.content, candidates);
  const topsisOpts: Parameters<typeof runTopsisStage>[4] = {
    performanceData: getPerformanceDataForCategory(task.content),
  };
  if (stageScores.size > 0) topsisOpts.stageScores = stageScores;
  const topsisResult = runTopsisStage(taskProfile, candidates, stagesExecuted, deps, topsisOpts);

  const linucbResult = runLinUCBStage(taskProfile, topsisResult.ranking, stagesExecuted, deps);
  if (linucbResult.selectedCli === undefined) {
    return err(new CompositeRoutingError('No candidates available', 'selection'));
  }

  // Performance floor override: reject LinUCB selection if CLI is below floor (#1790)
  const effectiveSelection = applyLinUCBFloorOverride(
    linucbResult.selectedCli,
    topsisResult.ranking,
    {
      perfData: topsisOpts.performanceData,
      taskType: taskProfile.taskType,
      stagesExecuted,
    }
  );

  const latencyResult = runLatencyStage(candidates, stagesExecuted, deps);
  const selectedCli = selectWithMemoryInfluence(effectiveSelection, scoring.memoryResult, deps);

  return ok(
    buildPipelineResult({
      ...scoring,
      qualityResult: constrained.value.qualityResult,
      topsisResult,
      linucbResult: { ucbScore: linucbResult.ucbScore },
      latencyResult,
      withinBudget,
      selectedCli,
    })
  );
}

/** Intermediate params for pipeline result construction. */
interface PipelineResultParams {
  cascadeResult: ConfidenceCascadeStageResult;
  capResult: CapabilityMatchStageResult;
  knnResult: KnnRoutingStageResult;
  distilledResult: DistilledRuleStageResult;
  resourceResult: ResourceStrategyStageResult;
  qualityResult: QualityConstraintStageResult;
  zeroResult: ZeroRouterStageResult;
  prefResult: PreferenceStageResult;
  topsisResult: { ranking: RoutingArmId[]; score: number | undefined };
  linucbResult: { ucbScore: number | undefined };
  latencyResult: LatencyStageResult;
  memoryResult: RoutingMemoryStageResult;
  withinBudget: boolean | undefined;
  selectedCli: RoutingArmId;
}

/** Assemble PipelineResult from stage outputs, including async stage scores. */
function buildPipelineResult(p: PipelineResultParams): PipelineResult {
  const stageScores = mergeScoreMaps(
    p.cascadeResult.scores,
    p.capResult.scores,
    p.knnResult.scores,
    p.distilledResult.scores,
    p.resourceResult.scores
  );

  return {
    candidates: p.qualityResult.eligible,
    withinBudget: p.withinBudget,
    difficultyEstimate: p.zeroResult.difficultyEstimate,
    difficultyTier: p.zeroResult.difficultyTier,
    preferenceScore: p.prefResult.preferenceScore,
    preferenceTier: p.prefResult.preferenceTier,
    topsisRanking: p.topsisResult.ranking,
    topsisScore: p.topsisResult.score,
    selectedCli: p.selectedCli,
    ucbScore: p.linucbResult.ucbScore,
    latencyScore: p.latencyResult.latencyScore,
    memoryRecommendation: p.memoryResult.recommendation,
    memoryConfidence: p.memoryResult.memoryConfidence,
    ...(stageScores.size > 0 ? { stageScores } : {}),
    ...(p.cascadeResult.complexity !== DEFAULT_COMPLEXITY
      ? { cascadeComplexity: p.cascadeResult.complexity }
      : {}),
    ...(p.capResult.taskType !== 'general' ? { capabilityTaskType: p.capResult.taskType } : {}),
    ...(p.qualityResult.filtered.size > 0 ? { qualityFiltered: p.qualityResult.filtered } : {}),
    // Keyed on whether a tier was SELECTED, not on whether it differs from
    // the default — a measured 'balanced' is a decision and must be recorded
    // as one (#4866).
    ...(p.resourceResult.tierMeasured ? { resourceTier: p.resourceResult.tier } : {}),
    ...(p.distilledResult.rulesApplied > 0
      ? { distilledRulesApplied: p.distilledResult.rulesApplied }
      : {}),
  };
}

/** Select CLI with optional memory influence. (Issue #489) */
function selectWithMemoryInfluence(
  linucbSelection: RoutingArmId,
  memoryResult: RoutingMemoryStageResult,
  deps: StageDependencies
): RoutingArmId {
  // If routing memory has a high-confidence recommendation, use it.
  // Threshold must exceed the default memoryConfidence (0.8) to prevent
  // routing memory from always overriding LinUCB learning. (#1171)
  if (memoryResult.recommendation !== undefined && memoryResult.memoryConfidence !== undefined) {
    const confidenceThreshold = 0.85;
    if (memoryResult.memoryConfidence >= confidenceThreshold) {
      deps.logger.debug('Using routing memory recommendation', {
        memoryChoice: memoryResult.recommendation,
        linucbChoice: linucbSelection,
        confidence: memoryResult.memoryConfidence,
      });
      return memoryResult.recommendation;
    }
  }
  return linucbSelection;
}
