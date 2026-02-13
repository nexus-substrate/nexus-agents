/* eslint-disable max-lines */
/**
 * CompositeRouter: Chains Budget -> ZeroRouter -> Preference -> TOPSIS -> LinUCB.
 * @module cli-adapters/composite-router
 * (Source: Issue #166, Epic #164, Issue #347, arXiv:2509.07571)
 */
import type { Result } from '../core/index.js';
import {
  getErrorMessage,
  ok,
  err,
  createLogger,
  getTimeProvider,
  getRandomProvider,
} from '../core/index.js';

import type { ILogger } from '../core/index.js';
import type { ICliAdapter, CliName, CliTask, CliResponse, CliError } from './types.js';
import type {
  IOrchestrationObserver,
  RoutingDecision,
} from '../agents/observability/orchestration-observer-types.js';
import { BudgetRouter } from './budget-router.js';
import { TopsisRouter } from './topsis-router.js';
import { LinUCBBandit } from './linucb-bandit.js';
import { PreferenceRouter } from './preference-router.js';
import type { PreferenceRouterConfig } from './preference-router-types.js';
import { ZeroRouter, type IZeroRouter } from './zero-router.js';
import type { ZeroRouterConfig } from './zero-router-types.js';
import { LatencyTracker, type ILatencyTracker } from './latency-tracker.js';
import type { LatencyTrackerConfig } from './latency-tracker-types.js';
import {
  RoutingMemory,
  type IRoutingMemory,
  type RoutingMemoryConfig,
  type ModelPerformance,
} from '../context/routing-memory.js';
import {
  ConfidenceCascadeStage,
  CapabilityMatchStage,
  QualityConstraintStage,
  ResourceStrategyStage,
  DistilledRuleStage,
  type ConfidenceCascadeConfig,
  type CapabilityMatchConfig,
  type QualityConstraintConfig,
  type ResourceStrategyConfig,
  type DistilledRuleStageConfig,
} from './routing/stages/index.js';
import {
  StrategyDistiller,
  createPersistentDistillerOrFallback,
} from '../learning/strategy-distiller.js';
import { getOutcomeStore } from '../orchestration/outcomes/outcome-store.js';
import { isPersistenceEnabled } from '../config/learning-persistence.js';
import {
  CompositeRouterConfigSchema,
  CompositeRoutingError,
  type CompositeRouterConfig,
  type CompositeRouterConfigWithPreference,
  type CompositeRoutingDecision,
  type CompositeRouterStats,
  type BuildDecisionParams,
  type PipelineResult,
  type IRoutingMetricsCollector,
} from './composite-router-types.js';
import {
  buildDecisionFields,
  buildPreferenceStats,
  fetchCapacityData,
} from './composite-router-helpers.js';
import {
  analyzeTaskProfile,
  runPipeline,
  type StageDependencies,
} from './composite-router-stages.js';
import {
  recordBanditOutcome,
  recordPreferenceSignal,
  recordZeroRouterOutcome,
  hasMinimumPreferenceData,
  computeQualityReward,
  type LastRoutedTaskInfo,
  type OutcomeDependencies,
} from './composite-router-outcome.js';
import {
  recordDecisionToMetrics,
  recordOutcomeToMetrics,
  generateTraceId,
} from './composite-router-metrics.js';

// Re-export types for consumers
export {
  CompositeRouterConfigSchema,
  DEFAULT_COMPOSITE_CONFIG,
  CompositeRoutingError,
  type CompositeRouterConfig,
  type CompositeRouterConfigWithPreference,
  type CompositeRoutingDecision,
  type CompositeRouterStats,
  type IRoutingMetricsCollector,
} from './composite-router-types.js';

/** Composite router interface for dependency injection. */
export interface ICompositeRouter {
  route(task: CliTask): Promise<Result<CompositeRoutingDecision, CompositeRoutingError>>;
  executeTask(task: CliTask): Promise<Result<CliResponse, CliError | CompositeRoutingError>>;
  recordOutcome(cliName: CliName, task: CliTask, reward: number): void;
  recordPreference(
    query: string,
    strongPreferred: boolean,
    quality?: { strong?: number; weak?: number }
  ): void;
  recordDifficultyOutcome(task: CliTask, success: boolean, qualityScore?: number): void;
  getStats(): CompositeRouterStats;
  hasMinimumPreferenceData(): boolean;
  getZeroRouter(): IZeroRouter | undefined;
  getLatencyTracker(): ILatencyTracker | undefined;
  getRoutingMemory(): IRoutingMemory | undefined;
  /** Get the metrics collector (if configured) (Issue #559) */
  getMetricsCollector(): IRoutingMetricsCollector | undefined;
  /** Get the orchestration observer (if configured) (Issue #587) */
  getOrchestrationObserver(): IOrchestrationObserver | undefined;
  /** Get capacity status for all registered CLIs (Issue #807) */
  getCapacityDashboard(): Promise<Map<CliName, import('./types.js').CapacityStatus>>;
}

/** CompositeRouter implementation. */
export class CompositeRouter implements ICompositeRouter {
  private readonly config: CompositeRouterConfig;
  private readonly logger: ILogger;
  private readonly adapters: Map<CliName, ICliAdapter>;
  private budgetRouter?: BudgetRouter;
  private zeroRouter?: ZeroRouter;
  private preferenceRouter?: PreferenceRouter;
  private topsisRouter?: TopsisRouter;
  private linucbBandit?: LinUCBBandit;
  private latencyTracker?: LatencyTracker;
  private routingMemory?: RoutingMemory;
  /** Metrics collector for routing observability (Issue #559) */
  private metricsCollector?: IRoutingMetricsCollector;
  /** Orchestration observer for routing decision tracking (Issue #587) */
  private orchestrationObserver?: IOrchestrationObserver;
  /** Confidence cascade stage instance (Issue #755) */
  private confidenceCascadeStage?: ConfidenceCascadeStage;
  /** Capability match stage instance (Issue #755) */
  private capabilityMatchStage?: CapabilityMatchStage;
  /** Quality constraint stage instance (Issue #755) */
  private qualityConstraintStage?: QualityConstraintStage;
  /** Resource strategy stage instance (Issue #998) */
  private resourceStrategyStage?: ResourceStrategyStage;
  /** Distilled rule stage instance (Issue #999) */
  private distilledRuleStage?: DistilledRuleStage;
  /** Strategy distiller instance (Issue #999) */
  private strategyDistiller?: StrategyDistiller;
  private readonly cliNames: CliName[];

  // Statistics tracking
  private totalDecisions = 0;
  private decisionsPerCli: Record<CliName, number> = { claude: 0, gemini: 0, codex: 0 };
  private totalDecisionTimeMs = 0;
  private budgetRejections = 0;

  // Track last routing for difficulty outcome recording
  private lastRoutedTask?: LastRoutedTaskInfo;

  // Track last traceId for metrics correlation (Issue #559)
  private lastTraceId?: string;

  constructor(
    adapters: Map<CliName, ICliAdapter>,
    config?: Partial<CompositeRouterConfigWithPreference>,
    logger?: ILogger
  ) {
    const {
      preferenceRouterConfig,
      zeroRouterConfig,
      latencyTrackerConfig,
      routingMemoryConfig,
      confidenceCascadeConfig,
      capabilityMatchConfig,
      qualityConstraintConfig,
      resourceStrategyConfig,
      distilledRuleStageConfig,
      metricsCollector,
      orchestrationObserver,
      ...baseConfig
    } = config ?? {};
    this.config = CompositeRouterConfigSchema.parse(baseConfig);
    this.logger = logger ?? createLogger({ component: 'CompositeRouter' });
    this.adapters = adapters;
    this.cliNames = Array.from(adapters.keys());
    // Only assign metricsCollector if provided (Issue #559)
    if (metricsCollector !== undefined) {
      this.metricsCollector = metricsCollector;
    }
    // Only assign orchestrationObserver if provided (Issue #587)
    if (orchestrationObserver !== undefined) {
      this.orchestrationObserver = orchestrationObserver;
      this.logger.debug('OrchestrationObserver wired to CompositeRouter');
    }
    this.initializeCoreRouters(
      adapters,
      preferenceRouterConfig,
      zeroRouterConfig,
      latencyTrackerConfig
    );
    this.initializeMemoryAndStages(routingMemoryConfig, {
      confidenceCascade: confidenceCascadeConfig,
      capabilityMatch: capabilityMatchConfig,
      qualityConstraint: qualityConstraintConfig,
      resourceStrategy: resourceStrategyConfig,
      distilledRule: distilledRuleStageConfig,
    });
    this.logInitialization(adapters.size);
  }

  private initializeCoreRouters(
    adapters: Map<CliName, ICliAdapter>,
    preferenceConfig?: Partial<PreferenceRouterConfig>,
    zeroConfig?: Partial<ZeroRouterConfig>,
    latencyConfig?: Partial<LatencyTrackerConfig>
  ): void {
    if (this.config.enableBudgetFilter && adapters.size > 0) {
      this.budgetRouter = new BudgetRouter(adapters);
    }
    if (this.config.enableZeroRouter) this.zeroRouter = new ZeroRouter(zeroConfig, this.logger);
    if (this.config.enablePreferenceRouting)
      this.preferenceRouter = new PreferenceRouter(preferenceConfig);
    if (this.config.enableTopsisRanking) this.topsisRouter = new TopsisRouter();
    if (this.config.enableLinUCBSelection && this.cliNames.length > 0) {
      this.linucbBandit = new LinUCBBandit(this.cliNames, { alpha: this.config.linucbAlpha });
      this.warmStartBandit();
    }
    if (this.config.enableLatencyTracking) this.latencyTracker = new LatencyTracker(latencyConfig);
  }

  private initializeMemoryAndStages(
    routingMemoryConfig?: Partial<RoutingMemoryConfig>,
    stageConfigs?: {
      confidenceCascade?: Partial<ConfidenceCascadeConfig> | undefined;
      capabilityMatch?: Partial<CapabilityMatchConfig> | undefined;
      qualityConstraint?: Partial<QualityConstraintConfig> | undefined;
      resourceStrategy?: Partial<ResourceStrategyConfig> | undefined;
      distilledRule?: Partial<DistilledRuleStageConfig> | undefined;
    }
  ): void {
    if (this.config.enableRoutingMemory) {
      this.routingMemory = new RoutingMemory(routingMemoryConfig);
      this.logger.info('RoutingMemory enabled for learned routing', {
        minObservations: this.routingMemory.getStats().totalPreferences,
      });
    }
    this.initializeOptionalStages(stageConfigs);
  }

  private initializeOptionalStages(
    stageConfigs: {
      confidenceCascade?: Partial<ConfidenceCascadeConfig> | undefined;
      capabilityMatch?: Partial<CapabilityMatchConfig> | undefined;
      qualityConstraint?: Partial<QualityConstraintConfig> | undefined;
      resourceStrategy?: Partial<ResourceStrategyConfig> | undefined;
      distilledRule?: Partial<DistilledRuleStageConfig> | undefined;
    } = {}
  ): void {
    if (this.config.enableConfidenceCascade) {
      this.confidenceCascadeStage = new ConfidenceCascadeStage(stageConfigs.confidenceCascade);
    }
    if (this.config.enableCapabilityMatch) {
      this.capabilityMatchStage = new CapabilityMatchStage(stageConfigs.capabilityMatch);
    }
    if (this.config.enableQualityConstraint) {
      this.qualityConstraintStage = new QualityConstraintStage(stageConfigs.qualityConstraint);
    }
    if (this.config.enableResourceStrategy) {
      this.resourceStrategyStage = new ResourceStrategyStage(stageConfigs.resourceStrategy);
    }
    if (this.config.enableStrategyDistillation) {
      this.strategyDistiller = isPersistenceEnabled()
        ? createPersistentDistillerOrFallback(getOutcomeStore(), this.logger)
        : new StrategyDistiller(getOutcomeStore(), this.logger);
      this.distilledRuleStage = new DistilledRuleStage(
        this.strategyDistiller,
        stageConfigs.distilledRule
      );
    }
  }

  /** Warm-start LinUCB bandit from persisted outcomes (Issue #1015). Best-effort. */
  private warmStartBandit(): void {
    if (this.linucbBandit === undefined || !isPersistenceEnabled()) return;
    try {
      const outcomes = getOutcomeStore().query();
      if (outcomes.length === 0) return;
      const replayed = this.linucbBandit.warmStart(outcomes);
      this.logger.info('LinUCB warm-started from persisted outcomes', {
        outcomesAvailable: outcomes.length,
        outcomesReplayed: replayed,
      });
    } catch (error: unknown) {
      this.logger.warn('LinUCB warm-start failed, starting cold', {
        error: getErrorMessage(error),
      });
    }
  }

  private logInitialization(adapterCount: number): void {
    this.logger.info('CompositeRouter initialized', {
      adapterCount,
      enableBudget: this.config.enableBudgetFilter,
      enableZeroRouter: this.config.enableZeroRouter,
      enablePreference: this.config.enablePreferenceRouting,
      enableTopsis: this.config.enableTopsisRanking,
      enableLinUCB: this.config.enableLinUCBSelection,
      enableLatencyTracking: this.config.enableLatencyTracking,
      enableConfidenceCascade: this.config.enableConfidenceCascade,
      enableCapabilityMatch: this.config.enableCapabilityMatch,
      enableQualityConstraint: this.config.enableQualityConstraint,
      enableResourceStrategy: this.config.enableResourceStrategy,
      enableStrategyDistillation: this.config.enableStrategyDistillation,
    });
  }

  async route(task: CliTask): Promise<Result<CompositeRoutingDecision, CompositeRoutingError>> {
    return Promise.resolve().then(() => this.executeRouting(task, getTimeProvider().now()));
  }

  /**
   * Unified method that routes, executes, and auto-records feedback.
   * Use this for most cases; use route() when you need decision details without execution.
   *
   * @param task - Task to execute
   * @returns Result with CLI response or error
   */
  async executeTask(task: CliTask): Promise<Result<CliResponse, CliError | CompositeRoutingError>> {
    const routeResult = await this.route(task);
    if (!routeResult.ok) {
      return err(routeResult.error);
    }

    const decision = routeResult.value;
    const startTime = getTimeProvider().now();

    // Generate traceId for metrics correlation (Issue #559)
    const traceId = generateTraceId();
    this.lastTraceId = traceId;
    recordDecisionToMetrics(decision, traceId, {
      metricsCollector: this.metricsCollector,
      logger: this.logger,
    });

    // Record routing decision to orchestration observer (Issue #587)
    this.recordToOrchestrationObserver(decision, task);

    const executeResult = await decision.adapter.execute(task);

    const durationMs = getTimeProvider().now() - startTime;
    const success = executeResult.ok;

    // Auto-record feedback for learning systems
    this.autoRecordFeedback(decision, task, success, durationMs);

    return executeResult;
  }

  private autoRecordFeedback(
    decision: CompositeRoutingDecision,
    task: CliTask,
    success: boolean,
    durationMs: number
  ): void {
    // Record bandit outcome with quality-enriched reward (Issue #929)
    const reward = computeQualityReward(decision.cliName, success, durationMs);
    this.recordOutcome(decision.cliName, task, reward);

    // Record difficulty outcome for ZeroRouter learning
    this.recordDifficultyOutcome(task, success);

    // Record latency for latency-based routing (Issue #361)
    if (this.latencyTracker !== undefined) {
      this.latencyTracker.record(decision.cliName, durationMs, success);
    }

    // Record performance in routing memory for learned routing (Issue #463)
    if (this.routingMemory !== undefined) {
      const taskType = this.inferTaskType(task);
      const performance: ModelPerformance = {
        avgQuality: success ? decision.confidence : 0.3,
        successRate: success ? 1.0 : 0.0,
        avgLatencyMs: durationMs,
        avgTokens: task.maxTokens ?? 1000,
        observations: 1,
      };
      this.routingMemory.storePreference(decision.cliName, taskType, performance);
    }

    // Record outcome to metrics collector (Issue #559)
    if (this.lastTraceId !== undefined) {
      recordOutcomeToMetrics(
        {
          traceId: this.lastTraceId,
          cliName: decision.cliName,
          success,
          reward,
          qualityScore: success ? decision.confidence : 0.3,
          latencyMs: durationMs,
        },
        { metricsCollector: this.metricsCollector, logger: this.logger }
      );
    }

    this.logger.debug('Auto-recorded feedback', {
      cli: decision.cliName,
      success,
      durationMs,
      reward,
    });
  }

  /** Task type inference keywords. */
  private static readonly TASK_TYPE_KEYWORDS: ReadonlyArray<
    readonly [string, ReadonlyArray<string>]
  > = [
    ['coding', ['code', 'implement']],
    ['review', ['review', 'audit']],
    ['testing', ['test', 'spec']],
    ['documentation', ['document', 'explain']],
    ['refactoring', ['refactor']],
    ['debugging', ['debug', 'fix']],
  ];

  /**
   * Infer task type from task content for routing memory.
   */
  private inferTaskType(task: CliTask): string {
    const content = task.content.toLowerCase();
    for (const [taskType, keywords] of CompositeRouter.TASK_TYPE_KEYWORDS) {
      if (keywords.some((kw) => content.includes(kw))) return taskType;
    }
    return 'general';
  }

  private executeRouting(
    task: CliTask,
    startTime: number
  ): Result<CompositeRoutingDecision, CompositeRoutingError> {
    const stagesExecuted: string[] = [];
    try {
      const taskProfile = analyzeTaskProfile(task, stagesExecuted);
      const deps = this.getStageDependencies();
      const pipelineResult = runPipeline(task, taskProfile, stagesExecuted, this.cliNames, deps);
      if (!pipelineResult.ok) {
        if (pipelineResult.error.stage === 'budget-filter') this.budgetRejections++;
        return pipelineResult;
      }

      this.trackLastRoutedTask(task, pipelineResult.value);

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

  private getStageDependencies(): StageDependencies {
    return {
      config: this.config,
      logger: this.logger,
      cliNames: this.cliNames,
      budgetRouter: this.budgetRouter,
      zeroRouter: this.zeroRouter,
      preferenceRouter: this.preferenceRouter,
      topsisRouter: this.topsisRouter,
      linucbBandit: this.linucbBandit,
      latencyTracker: this.latencyTracker,
      routingMemory: this.routingMemory,
      // Issue #755 replacement stages
      confidenceCascadeStage: this.confidenceCascadeStage,
      capabilityMatchStage: this.capabilityMatchStage,
      qualityConstraintStage: this.qualityConstraintStage,
      // Issue #998 resource strategy
      resourceStrategyStage: this.resourceStrategyStage,
      // Issue #999 distilled rule stage
      distilledRuleStage: this.distilledRuleStage,
    };
  }

  private trackLastRoutedTask(task: CliTask, result: PipelineResult): void {
    if (result.difficultyEstimate !== undefined) {
      this.lastRoutedTask = {
        task,
        selectedCli: result.selectedCli,
        difficulty: result.difficultyEstimate.aggregateScore,
      };
    }
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

    const decisionTimeMs = getTimeProvider().now() - params.startTime;
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
      difficultyEstimate: params.difficultyEstimate,
      difficultyTier: params.difficultyTier,
      preferenceScore: params.preferenceScore,
      preferenceTier: params.preferenceTier,
      topsisScore: params.topsisScore,
      ucbScore: params.ucbScore,
      latencyScore: params.latencyScore,
      alternatives,
      taskProfile: params.taskProfile,
    });
  }

  private updateStats(selectedCli: CliName, decisionTimeMs: number): void {
    this.totalDecisions++;
    this.decisionsPerCli[selectedCli]++;
    this.totalDecisionTimeMs += decisionTimeMs;
  }

  /**
   * Record a routing decision to the orchestration observer (Issue #587).
   */
  private recordToOrchestrationObserver(decision: CompositeRoutingDecision, task: CliTask): void {
    if (this.orchestrationObserver === undefined) {
      return;
    }

    // Convert CompositeRoutingDecision to RoutingDecision for observer
    const routingDecision: RoutingDecision = {
      timestamp: new Date().toISOString(),
      taskId: `task-${getRandomProvider().uuid()}`,
      taskDescription:
        task.content.length > 100 ? task.content.substring(0, 100) + '...' : task.content,
      selectedCli: decision.cliName,
      confidence: decision.confidence,
      reason: decision.reason,
      alternatives: decision.alternatives,
      stagesExecuted: decision.stagesExecuted,
      decisionTimeMs: decision.decisionTimeMs,
      withinBudget: decision.withinBudget,
      topsisScore: decision.topsisScore,
      ucbScore: decision.ucbScore,
    };

    this.orchestrationObserver.recordRoutingDecision(routingDecision);
    this.logger.debug('Recorded routing decision to OrchestrationObserver', {
      cli: decision.cliName,
      confidence: decision.confidence,
    });
  }

  private handleRoutingError(
    error: unknown,
    stagesExecuted: string[]
  ): Result<CompositeRoutingDecision, CompositeRoutingError> {
    const stage = stagesExecuted[stagesExecuted.length - 1] ?? 'unknown';
    const msg = 'Routing failed: ' + getErrorMessage(error);
    return err(new CompositeRoutingError(msg, stage, error instanceof Error ? error : undefined));
  }

  recordOutcome(cliName: CliName, task: CliTask, reward: number): void {
    recordBanditOutcome(cliName, task, reward, this.getOutcomeDependencies());
  }

  recordPreference(
    query: string,
    strongModelPreferred: boolean,
    quality?: { strong?: number; weak?: number }
  ): void {
    recordPreferenceSignal(query, strongModelPreferred, quality, this.getOutcomeDependencies());
  }

  recordDifficultyOutcome(task: CliTask, success: boolean, qualityScore?: number): void {
    recordZeroRouterOutcome(task, success, qualityScore, this.getOutcomeDependencies());
  }

  hasMinimumPreferenceData(): boolean {
    return hasMinimumPreferenceData(this.getOutcomeDependencies());
  }

  private getOutcomeDependencies(): OutcomeDependencies {
    return {
      logger: this.logger,
      cliNames: this.cliNames,
      linucbBandit: this.linucbBandit,
      preferenceRouter: this.preferenceRouter,
      zeroRouter: this.zeroRouter,
      lastRoutedTask: this.lastRoutedTask,
    };
  }

  getZeroRouter(): IZeroRouter | undefined {
    return this.zeroRouter;
  }

  getLatencyTracker(): ILatencyTracker | undefined {
    return this.latencyTracker;
  }

  /**
   * Get the metrics collector (if configured).
   * (Source: Issue #559 - Wire RoutingMetricsCollector to CompositeRouter)
   */
  getMetricsCollector(): IRoutingMetricsCollector | undefined {
    return this.metricsCollector;
  }

  /**
   * Get the orchestration observer (if configured).
   * (Source: Issue #587 - Wire OrchestrationObserver to CompositeRouter)
   */
  getOrchestrationObserver(): IOrchestrationObserver | undefined {
    return this.orchestrationObserver;
  }

  /**
   * Get capacity status for all registered CLIs (Issue #807).
   */
  async getCapacityDashboard(): Promise<Map<CliName, import('./types.js').CapacityStatus>> {
    return fetchCapacityData(this.adapters);
  }

  getStats(): CompositeRouterStats {
    const preferenceStats = buildPreferenceStats(
      this.config.enablePreferenceRouting,
      this.preferenceRouter
    );
    const latencyStats = this.latencyTracker?.getTrackerStats();
    const routingMemoryStats = this.routingMemory?.getStats();
    const baseStats = {
      totalDecisions: this.totalDecisions,
      decisionsPerCli: { ...this.decisionsPerCli },
      avgDecisionTimeMs:
        this.totalDecisions > 0 ? this.totalDecisionTimeMs / this.totalDecisions : 0,
      budgetRejectionRate:
        this.totalDecisions > 0 ? this.budgetRejections / this.totalDecisions : 0,
      banditStats: this.linucbBandit?.getStats() ?? [],
      latencyStats,
      routingMemoryStats,
    };

    if (preferenceStats !== undefined) {
      return { ...baseStats, preferenceStats };
    }
    return baseStats;
  }

  /** Get the routing memory instance (if enabled). */
  getRoutingMemory(): IRoutingMemory | undefined {
    return this.routingMemory;
  }
}

/** Creates a CompositeRouter instance. */
export function createCompositeRouter(
  adapters: Map<CliName, ICliAdapter>,
  config?: Partial<CompositeRouterConfig>,
  logger?: ILogger
): ICompositeRouter {
  return new CompositeRouter(adapters, config, logger);
}
