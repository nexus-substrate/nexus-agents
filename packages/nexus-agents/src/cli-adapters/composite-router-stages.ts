/* eslint max-lines: ["error", { "max": 600, "skipBlankLines": true, "skipComments": true }] */
/**
 * CompositeRouter pipeline stage execution functions.
 *
 * Holds the `runPipeline` orchestrator, the hard filters that precede scoring
 * (budget, capacity), the quality-constraint / category-override gating and
 * `buildPipelineResult`. The stateless `run*Stage` scoring runners it
 * sequences live in `composite-router-scoring-stages.ts` (#6148).
 * @module cli-adapters/composite-router-stages
 */
import type { Result } from '../core/index.js';
import { ok, err, createLogger } from '../core/index.js';

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
import { restrictedAccessMode } from './access-mode.js';
import { CompositeRoutingError, type PipelineResult } from './composite-router-types.js';
import { CAPACITY_EXHAUSTED } from './routing/stages/index.js';
import {
  cliTaskToTask,
  applyBudgetFilter,
  type PreferenceStageResult,
  type ZeroRouterStageResult,
  type PerformanceFloorEntry,
} from './composite-router-helpers.js';
import { getWeatherBonusScores, type WeatherBonusRead } from './weather-bonus-stage.js';
import { CATEGORY_CHAIN_OVERRIDES, isCategoryFailClosed } from './fallback-chains.js';
import { detectTaskCategory } from '../config/task-specialization.js';
import { getOutcomeStore } from '../orchestration/outcomes/outcome-store.js';
import {
  armsToSlots,
  DEFAULT_COMPLEXITY,
  runConfidenceCascadeStage,
  runCapabilityMatchStage,
  runQualityConstraintStage,
  runResourceStrategyStage,
  runDistilledRuleStage,
  runKnnRoutingStage,
  runZeroRouterStage,
  runTopsisStage,
  runLinUCBStage,
  runPreferenceStage,
  runLatencyStage,
  runRoutingMemoryStage,
  type StageDependencies,
  type ConfidenceCascadeStageResult,
  type CapabilityMatchStageResult,
  type QualityConstraintStageResult,
  type ResourceStrategyStageResult,
  type DistilledRuleStageResult,
  type KnnRoutingStageResult,
  type LatencyStageResult,
  type RoutingMemoryStageResult,
} from './composite-router-scoring-stages.js';

/** Module-level singleton — SharedTaskAnalyzer is stateless, no need to re-instantiate per call. */
const sharedAnalyzer = createSharedTaskAnalyzer();

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

/**
 * A performance-floor read, and whether it actually happened (#5329).
 *
 * `measured: false` means the outcome-store read FAILED — distinct from a
 * successful read over a category with no history, which also yields an empty
 * map. The distinction is load-bearing: an empty map disables the floor penalty
 * entirely (`composite-router-helpers.ts` gates on `performanceData.size > 0`)
 * and makes `applyLinUCBFloorOverride` a no-op, so a chronically failing CLI
 * keeps its full quality score and keeps winning — on the strength of a
 * measurement that never occurred.
 */
interface PerformanceFloorRead {
  readonly data: Map<CliName, PerformanceFloorEntry>;
  readonly measured: boolean;
}

/** Builds per-CLI performance data for the given task category from the outcome store.
 * Returns an empty map if the category is unknown or the store is empty. (#1401) */
function getPerformanceDataForCategory(taskContent: string): PerformanceFloorRead {
  try {
    const match = detectTaskCategory(taskContent);
    // An unknown category is a genuine "no applicable history", not a failure —
    // the read happened and found nothing to compare against.
    if (match === null) return { data: new Map(), measured: true };
    const summary = getOutcomeStore().summarize({ category: match.category });
    const result = new Map<CliName, PerformanceFloorEntry>();
    for (const [cli, stats] of summary.byCli) {
      result.set(cli as CliName, {
        successRate: stats.successRate,
        sampleCount: stats.count,
      });
    }
    return { data: result, measured: true };
  } catch (error: unknown) {
    // Closes #2952 (low): pre-fix the bare `catch {}` silently disabled
    // the performance-floor penalty on OutcomeStore read failures (DB
    // lock, schema mismatch). Log at debug — the empty Map fallback is
    // the right behavior (no data → no penalty) but operators benefit
    // from a trail when something stops working.
    // #2952 replaced a bare `catch {}` with this log. #5329 is the next step:
    // logging is not recording. `warn` rather than `debug` because a scoring
    // input being unavailable is operator-visible, and the caller now writes it
    // into `stagesExecuted` so the routing decision itself says the floor was
    // not applied for want of data.
    logger.warn('Performance-floor outcome-store read failed; floor not applied', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { data: new Map(), measured: false };
  }
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
): { scores: Map<CliName, number>; weatherMeasured: boolean } {
  const weather = getWeatherBonusForTask(taskContent);
  // Tune adjustments are slot-keyed; collapse arms to display slots (#3422).
  const scores = mergeScoreMaps(
    scoring.cascadeResult.scores,
    scoring.capResult.scores,
    scoring.knnResult.scores,
    scoring.distilledResult.scores,
    scoring.resourceResult.scores,
    weather.scores,
    getTuneAdjustmentScores(armsToSlots([...candidates]))
  );
  return { scores, weatherMeasured: weather.measured };
}

/**
 * Env flag (#3147): when enabled, the self-tuning loop's bounded routing
 * demotions are applied as a scoring penalty here. Default ON (#3323).
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
function getWeatherBonusForTask(taskContent: string): WeatherBonusRead {
  try {
    const match = detectTaskCategory(taskContent);
    // An unknown category means there is no bonus to look up, not that a
    // lookup failed.
    if (match === null) return { scores: new Map(), measured: true };
    return getWeatherBonusScores(match.category);
  } catch (error: unknown) {
    // This catch only ever saw `detectTaskCategory` throwing: the real
    // outcome-store read is inside `getWeatherBonusScores`, which swallowed its
    // own failure one level down (#5329). Both now report `measured`.
    logger.warn('Weather bonus category detection failed; bonus not applied', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { scores: new Map(), measured: false };
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
  const perfRead = getPerformanceDataForCategory(task.content);

  // #5329: the decision record is the disclosure channel. Without these
  // markers `stagesExecuted` is byte-identical whether a scoring input was
  // empty or unreadable, so a routing decision made without the performance
  // floor is indistinguishable from one where the floor found nothing to
  // penalize. `decisionPath` carries this onto the RoutingDecision.
  if (!perfRead.measured) stagesExecuted.push('perf-floor-unmeasured');
  if (!stageScores.weatherMeasured) stagesExecuted.push('weather-unmeasured');

  const topsisOpts: Parameters<typeof runTopsisStage>[4] = {
    performanceData: perfRead.data,
  };
  if (stageScores.scores.size > 0) topsisOpts.stageScores = stageScores.scores;
  const topsisResult = runTopsisStage(taskProfile, candidates, stagesExecuted, deps, topsisOpts);

  const linucbResult = runLinUCBStage(
    taskProfile,
    topsisResult.ranking,
    stagesExecuted,
    deps,
    budgetResult.value.budgetUtilization
  );
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
  const selectedCli = selectWithMemoryInfluence(
    effectiveSelection,
    scoring.memoryResult,
    deps,
    memoryPickBound(task, candidates)
  );

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
  topsisResult: {
    ranking: RoutingArmId[];
    score: number | undefined;
    scoresByArm?: ReadonlyMap<RoutingArmId, number>;
  };
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
    topsisScoresByArm: p.topsisResult.scoresByArm,
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

/**
 * The arms a routing-memory pick must stay within, or `undefined` for no
 * bound (#6768). A task in a restricted mode (read-only analysis, or
 * workspace-edit since #6792) may only take a pick that is still a
 * candidate: the candidates were filtered to arms that enforce the mode.
 */
function memoryPickBound(
  task: CliTask,
  candidates: readonly RoutingArmId[]
): readonly RoutingArmId[] | undefined {
  return restrictedAccessMode(task) !== undefined ? candidates : undefined;
}

/**
 * Select CLI with optional memory influence. (Issue #489)
 *
 * `allowed`, when set, bounds the memory pick (#6768): routing memory
 * recommends a display slot, which can name an arm outside the candidates.
 * A pick outside `allowed` falls back to the LinUCB/TOPSIS selection, which
 * is always a candidate. Undefined leaves the pick unbounded, as before.
 */
function selectWithMemoryInfluence(
  linucbSelection: RoutingArmId,
  memoryResult: RoutingMemoryStageResult,
  deps: StageDependencies,
  allowed?: readonly RoutingArmId[]
): RoutingArmId {
  // If routing memory has a high-confidence recommendation, use it.
  // Threshold must exceed the default memoryConfidence (0.8) to prevent
  // routing memory from always overriding LinUCB learning. (#1171)
  if (memoryResult.recommendation !== undefined && memoryResult.memoryConfidence !== undefined) {
    const confidenceThreshold = 0.85;
    if (
      memoryResult.memoryConfidence >= confidenceThreshold &&
      allowed !== undefined &&
      !allowed.includes(memoryResult.recommendation)
    ) {
      deps.logger.debug('Routing memory pick is outside the allowed arms; using LinUCB pick', {
        memoryChoice: memoryResult.recommendation,
        linucbChoice: linucbSelection,
      });
      return linucbSelection;
    }
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
