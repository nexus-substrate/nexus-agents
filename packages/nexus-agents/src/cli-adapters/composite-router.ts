/**
 * CompositeRouter: Chains Budget → TOPSIS → LinUCB for intelligent model selection.
 * @module cli-adapters/composite-router
 * (Source: Issue #166, Epic #164, arXiv:2509.07571)
 */

import type { Result } from '../core/index.js';
import { ok, err, createLogger } from '../core/index.js';
import type { ILogger } from '../core/index.js';
import type { ICliAdapter, CliName, CliTask } from './types.js';
import { BudgetRouter } from './budget-router.js';
import { TopsisRouter } from './topsis-router.js';
import { LinUCBBandit } from './linucb-bandit.js';
import { PreferenceRouter } from './preference-router.js';
import type { PreferenceRouterConfig } from './preference-router-types.js';
import { analyzeTask, type TaskProfile } from './task-analyzer.js';
import {
  CompositeRouterConfigSchema,
  CompositeRoutingError,
  type CompositeRouterConfig,
  type CompositeRouterConfigWithPreference,
  type CompositeRoutingDecision,
  type CompositeRouterStats,
  type PipelineResult,
  type BuildDecisionParams,
} from './composite-router-types.js';
import {
  taskProfileToBanditContext,
  filterByPreferenceTier,
  cliTaskToTask,
  applyBudgetFilter,
  applyTopsisRanking,
  defaultPreferenceStageResult,
  buildDecisionFields,
  type PreferenceStageResult,
} from './composite-router-helpers.js';

// Re-export types for consumers
export {
  CompositeRouterConfigSchema,
  DEFAULT_COMPOSITE_CONFIG,
  CompositeRoutingError,
  type CompositeRouterConfig,
  type CompositeRouterConfigWithPreference,
  type CompositeRoutingDecision,
  type CompositeRouterStats,
} from './composite-router-types.js';

/** Composite router interface for dependency injection. */
export interface ICompositeRouter {
  route(task: CliTask): Promise<Result<CompositeRoutingDecision, CompositeRoutingError>>;
  recordOutcome(cliName: CliName, task: CliTask, reward: number): void;
  recordPreference(
    query: string,
    strongPreferred: boolean,
    quality?: { strong?: number; weak?: number }
  ): void;
  getStats(): CompositeRouterStats;
  hasMinimumPreferenceData(): boolean;
}

/** CompositeRouter implementation. */
export class CompositeRouter implements ICompositeRouter {
  private readonly config: CompositeRouterConfig;
  private readonly preferenceRouterConfig?: Partial<PreferenceRouterConfig>;
  private readonly logger: ILogger;
  private readonly adapters: Map<CliName, ICliAdapter>;
  private budgetRouter?: BudgetRouter;
  private preferenceRouter?: PreferenceRouter;
  private topsisRouter?: TopsisRouter;
  private linucbBandit?: LinUCBBandit;
  private readonly cliNames: CliName[];

  // Statistics tracking
  private totalDecisions = 0;
  private decisionsPerCli: Record<CliName, number> = { claude: 0, gemini: 0, codex: 0 };
  private totalDecisionTimeMs = 0;
  private budgetRejections = 0;

  constructor(
    adapters: Map<CliName, ICliAdapter>,
    config?: Partial<CompositeRouterConfigWithPreference>,
    logger?: ILogger
  ) {
    const { preferenceRouterConfig, ...baseConfig } = config ?? {};
    this.config = CompositeRouterConfigSchema.parse(baseConfig);
    // Only assign if defined (exactOptionalPropertyTypes compliance)
    if (preferenceRouterConfig !== undefined) {
      this.preferenceRouterConfig = preferenceRouterConfig;
    }
    this.logger = logger ?? createLogger({ component: 'CompositeRouter' });
    this.adapters = adapters;
    this.cliNames = Array.from(adapters.keys());

    // Initialize enabled routers
    if (this.config.enableBudgetFilter && adapters.size > 0) {
      this.budgetRouter = new BudgetRouter(adapters);
    }
    if (this.config.enablePreferenceRouting) {
      this.preferenceRouter = new PreferenceRouter(preferenceRouterConfig);
    }
    if (this.config.enableTopsisRanking) {
      this.topsisRouter = new TopsisRouter();
    }
    if (this.config.enableLinUCBSelection && this.cliNames.length > 0) {
      this.linucbBandit = new LinUCBBandit(this.cliNames, { alpha: this.config.linucbAlpha });
    }

    this.logger.info('CompositeRouter initialized', {
      adapterCount: adapters.size,
      enableBudget: this.config.enableBudgetFilter,
      enablePreference: this.config.enablePreferenceRouting,
      enableTopsis: this.config.enableTopsisRanking,
      enableLinUCB: this.config.enableLinUCBSelection,
    });
  }

  async route(task: CliTask): Promise<Result<CompositeRoutingDecision, CompositeRoutingError>> {
    return Promise.resolve().then(() => this.executeRouting(task, Date.now()));
  }

  private executeRouting(
    task: CliTask,
    startTime: number
  ): Result<CompositeRoutingDecision, CompositeRoutingError> {
    const stagesExecuted: string[] = [];
    try {
      const taskProfile = this.analyzeTaskProfile(task, stagesExecuted);
      const pipelineResult = this.runPipeline(task, taskProfile, stagesExecuted);
      if (!pipelineResult.ok) return pipelineResult;

      return this.buildRoutingDecision({
        ...pipelineResult.value,
        taskProfile,
        stagesExecuted,
        startTime,
      });
    } catch (error) {
      return this.handleRoutingError(error, stagesExecuted);
    }
  }

  private analyzeTaskProfile(task: CliTask, stagesExecuted: string[]): TaskProfile {
    const internalTask = cliTaskToTask(task);
    const taskProfile = analyzeTask(internalTask);
    stagesExecuted.push('task-analysis');
    return taskProfile;
  }

  private runPipeline(
    task: CliTask,
    taskProfile: TaskProfile,
    stagesExecuted: string[]
  ): Result<PipelineResult, CompositeRoutingError> {
    let candidates: CliName[] = [...this.cliNames];
    if (candidates.length === 0) {
      return err(new CompositeRoutingError('No CLI adapters available', 'initialization'));
    }

    // Step 1: Budget filtering
    let withinBudget: boolean | undefined;
    if (this.config.enableBudgetFilter && this.budgetRouter !== undefined) {
      const budgetResult = applyBudgetFilter(task, candidates, this.budgetRouter, this.config);
      candidates = budgetResult.eligible;
      withinBudget = budgetResult.withinBudget;
      stagesExecuted.push('budget-filter');
      if (candidates.length === 0) {
        this.budgetRejections++;
        return err(new CompositeRoutingError('No CLIs within budget', 'budget-filter'));
      }
    }

    // Step 2: Preference routing (optional, filters candidates based on learned preferences)
    const { preferenceScore, preferenceTier, preferredCandidates } = this.runPreferenceStage(
      task,
      candidates,
      stagesExecuted
    );
    candidates = preferredCandidates;

    // Step 3: TOPSIS ranking
    const { ranking: topsisRanking, score: topsisScore } = this.runTopsisStage(
      taskProfile,
      candidates,
      stagesExecuted
    );

    // Step 4: LinUCB selection
    const { selectedCli, ucbScore } = this.runLinUCBStage(
      taskProfile,
      topsisRanking,
      stagesExecuted
    );
    if (selectedCli === undefined) {
      return err(new CompositeRoutingError('No candidates available', 'selection'));
    }

    return ok({
      candidates,
      withinBudget,
      preferenceScore,
      preferenceTier,
      topsisRanking,
      topsisScore,
      selectedCli,
      ucbScore,
    });
  }

  private runTopsisStage(
    taskProfile: TaskProfile,
    candidates: CliName[],
    stagesExecuted: string[]
  ): { ranking: CliName[]; score: number | undefined } {
    if (!this.config.enableTopsisRanking || this.topsisRouter === undefined) {
      return { ranking: candidates, score: undefined };
    }
    const result = applyTopsisRanking(taskProfile, candidates, this.topsisRouter);
    stagesExecuted.push('topsis-ranking');
    return { ranking: result.ranking, score: result.topScore };
  }

  private runLinUCBStage(
    taskProfile: TaskProfile,
    topsisRanking: CliName[],
    stagesExecuted: string[]
  ): { selectedCli: CliName | undefined; ucbScore: number | undefined } {
    if (!this.config.enableLinUCBSelection || this.linucbBandit === undefined) {
      return { selectedCli: topsisRanking[0], ucbScore: undefined };
    }
    const banditContext = taskProfileToBanditContext(taskProfile);
    const selection = this.linucbBandit.select(banditContext);
    stagesExecuted.push('linucb-selection');
    return { selectedCli: selection.armName as CliName, ucbScore: selection.ucbScore };
  }

  private runPreferenceStage(
    task: CliTask,
    candidates: CliName[],
    stagesExecuted: string[]
  ): PreferenceStageResult {
    if (!this.config.enablePreferenceRouting || this.preferenceRouter === undefined) {
      return defaultPreferenceStageResult(candidates);
    }
    if (!this.preferenceRouter.hasMinimumData()) {
      this.logger.debug('Preference routing skipped: insufficient data');
      return defaultPreferenceStageResult(candidates);
    }

    const decision = this.preferenceRouter.route(task.content);
    stagesExecuted.push('preference-routing');
    const preferredCandidates = filterByPreferenceTier(candidates, decision.selectedTier);

    this.logger.debug('Preference routing applied', {
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

  private buildRoutingDecision(
    params: BuildDecisionParams & PipelineResult
  ): Result<CompositeRoutingDecision, CompositeRoutingError> {
    const selectedAdapter = this.adapters.get(params.selectedCli);
    if (selectedAdapter === undefined) {
      return err(
        new CompositeRoutingError('Adapter not found: ' + params.selectedCli, 'selection')
      );
    }

    const decisionTimeMs = Date.now() - params.startTime;
    this.updateStats(params.selectedCli, decisionTimeMs);
    const { confidence, reason, alternatives } = buildDecisionFields({ ...params, decisionTimeMs });

    return ok({
      adapter: selectedAdapter,
      cliName: params.selectedCli,
      confidence,
      reason,
      stagesExecuted: params.stagesExecuted,
      decisionTimeMs,
      withinBudget: params.withinBudget,
      preferenceScore: params.preferenceScore,
      preferenceTier: params.preferenceTier,
      topsisScore: params.topsisScore,
      ucbScore: params.ucbScore,
      alternatives,
      taskProfile: params.taskProfile,
    });
  }

  private updateStats(selectedCli: CliName, decisionTimeMs: number): void {
    this.totalDecisions++;
    this.decisionsPerCli[selectedCli]++;
    this.totalDecisionTimeMs += decisionTimeMs;
  }

  private handleRoutingError(
    error: unknown,
    stagesExecuted: string[]
  ): Result<CompositeRoutingDecision, CompositeRoutingError> {
    const stage = stagesExecuted[stagesExecuted.length - 1] ?? 'unknown';
    const msg = 'Routing failed: ' + (error instanceof Error ? error.message : String(error));
    return err(new CompositeRoutingError(msg, stage, error instanceof Error ? error : undefined));
  }

  recordOutcome(cliName: CliName, task: CliTask, reward: number): void {
    if (this.linucbBandit === undefined) return;
    const armIndex = this.cliNames.indexOf(cliName);
    if (armIndex === -1) {
      this.logger.warn('Unknown CLI for outcome recording', { cliName });
      return;
    }
    const internalTask = cliTaskToTask(task);
    const taskProfile = analyzeTask(internalTask);
    const context = taskProfileToBanditContext(taskProfile);
    this.linucbBandit.update(armIndex, context, reward);
    this.logger.debug('Recorded outcome', { cliName, reward });
  }

  recordPreference(
    query: string,
    strongModelPreferred: boolean,
    quality?: { strong?: number; weak?: number }
  ): void {
    if (this.preferenceRouter === undefined) {
      this.logger.warn('Preference routing not enabled, cannot record preference');
      return;
    }
    this.preferenceRouter.recordPreference(
      query,
      strongModelPreferred,
      quality?.strong,
      quality?.weak
    );
    this.logger.debug('Recorded preference', { strongModelPreferred });
  }

  hasMinimumPreferenceData(): boolean {
    if (this.preferenceRouter === undefined) return false;
    return this.preferenceRouter.hasMinimumData();
  }

  getStats(): CompositeRouterStats {
    const preferenceStats = this.buildPreferenceStats();
    const baseStats = {
      totalDecisions: this.totalDecisions,
      decisionsPerCli: { ...this.decisionsPerCli },
      avgDecisionTimeMs:
        this.totalDecisions > 0 ? this.totalDecisionTimeMs / this.totalDecisions : 0,
      budgetRejectionRate:
        this.totalDecisions > 0 ? this.budgetRejections / this.totalDecisions : 0,
      banditStats: this.linucbBandit?.getStats() ?? [],
    };

    // Conditionally add preferenceStats only if preference routing is enabled
    if (preferenceStats !== undefined) {
      return { ...baseStats, preferenceStats };
    }
    return baseStats;
  }

  private buildPreferenceStats(): CompositeRouterStats['preferenceStats'] {
    if (!this.config.enablePreferenceRouting || this.preferenceRouter === undefined) {
      return undefined;
    }

    const stats = this.preferenceRouter.getStats();
    return {
      enabled: true,
      hasSufficientData: this.preferenceRouter.hasMinimumData(),
      dataPointCount: stats.totalDataPoints,
      strongModelPreferenceRate: stats.strongModelPreferenceRate,
    };
  }
}

/**
 * Creates a CompositeRouter instance.
 */
export function createCompositeRouter(
  adapters: Map<CliName, ICliAdapter>,
  config?: Partial<CompositeRouterConfig>,
  logger?: ILogger
): ICompositeRouter {
  return new CompositeRouter(adapters, config, logger);
}
