/* eslint-disable max-lines */
/**
 * CompositeRouter — chains the full routing pipeline.
 *
 * Stage order (executed by `composite-router-stages.ts:runPipeline`):
 *   1. Budget — eliminate CLIs that exceed session token/cost budget
 *   2. Scoring (sequential, dependency-ordered) — ConfidenceCascade / CapabilityMatch / KnnRouting /
 *      DistilledRule / ResourceStrategy / ZeroRouter / Preference
 *   3. QualityConstraint — constraint-first filter; can short-circuit (#1686)
 *   4. CategoryOverride — `CATEGORY_CHAIN_OVERRIDES` per task category; can
 *      short-circuit for sensitive categories whose override chain is
 *      exhausted (#2414, #2417)
 *   5. TOPSIS — multi-criteria ranking; quality profiles adjusted by stage-2
 *      scores and penalized by performance-floor data (#1354, #1401)
 *   6. LinUCB — bandit selection from TOPSIS ranking
 *   7. PerfFloorOverride — reject LinUCB pick if CLI is below 50% success at
 *      ≥20 samples; promote TOPSIS top-ranked alternative (#1790)
 *   8. Latency — record per-CLI latency for the recommended-mapping feedback loop
 *
 * The pre-2026 docstring claimed 5 stages (Budget → ZeroRouter → Preference →
 * TOPSIS → LinUCB), pre-dating #755 / #1350 / #1686 / #1790 / #2414. A
 * maintainer debugging "why was my model rejected?" reading that line would
 * never have found the constraint/override stages that actually short-circuit.
 * Updated in #2947.
 *
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
import type {
  ICliAdapter,
  CliName,
  RoutingArmId,
  CliTask,
  CliResponse,
  CliError,
} from './types.js';
import { routingArmDisplaySlot } from './types.js';
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
  KnnRoutingStage,
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
import { getPipelineEventBus } from '../pipeline/event-bus.js';
import { generateSyntheticPriors, runWarmUp } from '../cli/warm-up.js';
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
import { getDefaultAvailableModelsCache } from '../config/available-models-cache.js';
import {
  isDynamicModelsEnabled,
  registerDefaultModelSources,
} from '../config/register-model-sources.js';
import { resolveModelForTier, isRouteModelSelectionEnabled } from './resolve-model-for-tier.js';
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

/** Quality score assigned to failed routing decisions for memory recording. */
const FAILURE_QUALITY_SCORE = 0.3;

/** Default token count estimate when task.maxTokens is not specified. */
const DEFAULT_TOKEN_ESTIMATE = 1000;

/** Composite router interface for dependency injection. */
export interface ICompositeRouter {
  route(task: CliTask): Promise<Result<CompositeRoutingDecision, CompositeRoutingError>>;
  executeTask(task: CliTask): Promise<Result<CliResponse, CliError | CompositeRoutingError>>;
  /** Record a bandit outcome for a distinct routing arm (CLI slot or api:* arm) (#3422). */
  recordOutcome(cliName: RoutingArmId, task: CliTask, reward: number): void;
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
  /** Get capacity status for all registered routing arms (Issue #807, #3422) */
  getCapacityDashboard(): Promise<Map<RoutingArmId, import('./types.js').CapacityStatus>>;
}

/** CompositeRouter implementation. */
export class CompositeRouter implements ICompositeRouter {
  private readonly config: CompositeRouterConfig;
  private readonly logger: ILogger;
  private readonly adapters: Map<RoutingArmId, ICliAdapter>;
  private budgetRouter?: BudgetRouter;
  private zeroRouter?: ZeroRouter;
  private preferenceRouter?: PreferenceRouter;
  private topsisRouter?: TopsisRouter;
  private linucbBandit?: LinUCBBandit;
  private latencyTracker?: LatencyTracker;
  private routingMemory?: RoutingMemory;
  /**
   * Most recently consulted unified memory context (Phase 3 of #2792).
   * Set on every {@link route} call so tests + telemetry can inspect what
   * the router saw at decision time. Typed as `unknown` here to avoid
   * pulling the typed surface into this module's circular-dep zone — the
   * field is for observability; callers that need typed reads should call
   * `getContextForTask` directly.
   */
  private lastUnifiedContext?: unknown;
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
  /** KNN routing stage instance (arXiv:2505.12601) */
  private knnRoutingStage?: KnnRoutingStage;
  /** Strategy distiller instance (Issue #999) */
  private strategyDistiller?: StrategyDistiller;
  private readonly cliNames: RoutingArmId[];
  /**
   * (#2540 PR 7) Optional harness-driven availability gate. When set,
   * `executeRouting` filters the candidate CLI list to only those with
   * ≥1 routable model per the cache. See `getCandidateCliNames`.
   */
  private readonly availableModelsCache?: import('../config/available-models-cache.js').AvailableModelsCache;

  // Statistics tracking
  private totalDecisions = 0;
  private decisionsPerCli: Record<CliName, number> = {
    claude: 0,
    gemini: 0,
    codex: 0,
    opencode: 0,
  };
  private totalDecisionTimeMs = 0;
  private budgetRejections = 0;

  // Track last routing for difficulty outcome recording
  private lastRoutedTask?: LastRoutedTaskInfo;

  // Track last traceId for metrics correlation (Issue #559)
  private lastTraceId?: string;

  constructor(
    adapters: Map<RoutingArmId, ICliAdapter>,
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
      availableModelsCache,
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
    // (#2540 PR 7) Wire optional availability cache.
    if (availableModelsCache !== undefined) {
      this.availableModelsCache = availableModelsCache;
      this.logger.debug('AvailableModelsCache wired to CompositeRouter');
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
    adapters: Map<RoutingArmId, ICliAdapter>,
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
      // Arms include distinct api:* arms (#3422). Persisted outcomes/priors are
      // slot-attributed, so api:* arms start cold and gain no warm-start credit
      // by design — do NOT collapse the arm names here, that would destroy the
      // CLI-vs-API distinct learning this migration exists to enable.
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
    if (this.config.enableKnnRouting && this.routingMemory !== undefined) {
      this.knnRoutingStage = new KnnRoutingStage(this.routingMemory);
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

  /** Emit routing.decision event to pipeline event bus (#1687). */
  private emitRoutingDecision(decision: CompositeRoutingDecision, taskDescription: string): void {
    getPipelineEventBus().emit({
      type: 'routing.decision',
      timestamp: getTimeProvider().now(),
      taskId: taskDescription.slice(0, 100),
      // Trace attribution is slot-level; collapse the api:* arm (#3422) so this
      // sink matches every other telemetry sink (the bandit keeps the arm).
      selectedModel: routingArmDisplaySlot(decision.cliName),
      reasoning: decision.reason,
      decisionPath: decision.stagesExecuted,
    });
  }

  /** Warm-start LinUCB bandit from persisted outcomes (Issue #1015).
   * Uses a 30-day lookback window so stale outcomes don't override
   * routing changes like primaryCli specialization (#1667). */
  private warmStartBandit(): void {
    if (this.linucbBandit === undefined) return;
    try {
      let replayed = 0;
      if (isPersistenceEnabled()) {
        // Use 30-day lookback — stale all-time data was overriding
        // specialization matrix changes (e.g., architecture claude→gemini) (#1667)
        const WARM_START_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
        const since = new Date(getTimeProvider().now() - WARM_START_LOOKBACK_MS).toISOString();
        const outcomes = getOutcomeStore().query({
          since,
          excludeQualitySignals: ['e2e-eval'],
        });
        if (outcomes.length > 0) {
          replayed = this.linucbBandit.warmStart(outcomes);
          this.logger.info('LinUCB warm-started from recent outcomes', {
            outcomesAvailable: outcomes.length,
            outcomesReplayed: replayed,
            lookbackDays: 30,
          });
        }
      }
      // Always seed specialization priors — not just cold-start (#1667).
      // This ensures primaryCli preferences from TASK_SPECIALIZATION_MATRIX
      // always influence LinUCB, even when warm-start data disagrees.
      const priors = generateSyntheticPriors();
      this.linucbBandit.seedPriors(priors, replayed === 0 ? 3 : 1);
      if (replayed === 0) {
        const result = runWarmUp(this.logger);
        if (!result.skipped) {
          // Mirror the 30-day path's filter (#2824 bullet) — pre-fix this
          // cold-start fallback queried with no filter, replaying any
          // e2e-eval synthetic outcomes that survived from prior test
          // runs into LinUCB. The 30-day branch above carefully excludes
          // them; the fallback didn't.
          const outcomes = getOutcomeStore().query({ excludeQualitySignals: ['e2e-eval'] });
          this.linucbBandit.warmStart(outcomes);
        }
        this.logger.info('LinUCB cold-start seeded from specialization matrix', {
          syntheticOutcomes: result.seeded,
        });
      }
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
    // Phase 3 of #2792 — read accumulated memory before routing decides.
    // Fire-and-forget for now: the call exercises the read path so beliefs,
    // similar memories, recent learnings, and prior outcomes all get loaded
    // and logged. Subsequent phases plumb the context into the routing
    // stages as a quality signal.
    void this.consultUnifiedContext(task);

    const result = await this.executeRouting(task, getTimeProvider().now());
    // Emit routing.decision to pipeline event bus for trace persistence (#1687)
    if (result.ok) {
      this.emitRoutingDecision(result.value, task.content);
    }
    return result;
  }

  /**
   * Read the unified memory context for this task. Best-effort, never
   * throws. Sets `this.lastUnifiedContext` so external observers (tests,
   * telemetry) can inspect what the router consulted at decision time.
   */
  private async consultUnifiedContext(task: CliTask): Promise<void> {
    try {
      const { getContextForTask, inferTaskCategory } =
        await import('../context/context-retriever.js');
      const ctx = await getContextForTask({
        task: task.content,
        category: inferTaskCategory(task.content),
        logger: this.logger,
      });
      this.lastUnifiedContext = ctx;
      this.logger.debug('CompositeRouter: unified memory context', {
        beliefs: ctx.beliefs.length,
        similarMemories: ctx.similarMemories.length,
        recentLearnings: ctx.recentLearnings.length,
        experiencePatterns: ctx.experiencePatterns.length,
        outcomesTotal: ctx.outcomes?.totalTasks ?? 0,
      });
    } catch (error: unknown) {
      // #3699: the #3180-adopted best-effort failure policy — routing continues
      // (lastUnifiedContext stays unset), but the failure is an observable WARN
      // rather than a swallowed debug line: a router consulting memory blind is
      // a condition operators should see. No event-listener channel at this
      // site, so the structured warn IS the observable.
      this.logger.warn('CompositeRouter: context retrieval failed; routing without context', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
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
    // The bandit learns the DISTINCT arm; everything slot-level (quality
    // reward, latency, routing memory, metrics) collapses to the display
    // slot so CLI and API telemetry stay attributed to the vendor (#3422).
    const arm = decision.cliName;
    const slot = routingArmDisplaySlot(arm);

    // Record bandit outcome with quality-enriched reward (Issue #929)
    const reward = computeQualityReward(slot, success, durationMs);
    this.recordOutcome(arm, task, reward);

    // Record difficulty outcome for ZeroRouter learning
    this.recordDifficultyOutcome(task, success);

    // Record latency for latency-based routing (Issue #361)
    if (this.latencyTracker !== undefined) {
      this.latencyTracker.record(slot, durationMs, success);
    }

    // Record performance in routing memory for learned routing (Issue #463)
    if (this.routingMemory !== undefined) {
      const taskType = this.inferTaskType(task);
      const performance: ModelPerformance = {
        avgQuality: success ? decision.confidence : FAILURE_QUALITY_SCORE,
        successRate: success ? 1.0 : 0.0,
        avgLatencyMs: durationMs,
        avgTokens: task.maxTokens ?? DEFAULT_TOKEN_ESTIMATE,
        observations: 1,
      };
      this.routingMemory.storePreference(slot, taskType, performance);
    }

    // Record outcome to metrics collector (Issue #559)
    if (this.lastTraceId !== undefined) {
      recordOutcomeToMetrics(
        {
          traceId: this.lastTraceId,
          cliName: slot,
          success,
          reward,
          qualityScore: success ? decision.confidence : FAILURE_QUALITY_SCORE,
          latencyMs: durationMs,
        },
        { metricsCollector: this.metricsCollector, logger: this.logger }
      );
    }

    this.logger.debug('Auto-recorded feedback', {
      cli: arm,
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

  private async executeRouting(
    task: CliTask,
    startTime: number
  ): Promise<Result<CompositeRoutingDecision, CompositeRoutingError>> {
    const stagesExecuted: string[] = [];
    try {
      const taskProfile = analyzeTaskProfile(task, stagesExecuted);
      const deps = this.getStageDependencies();
      const candidateCliNames = await this.getCandidateCliNames();
      const pipelineResult = await runPipeline(
        task,
        taskProfile,
        stagesExecuted,
        candidateCliNames,
        deps
      );
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
    } catch (error: unknown) {
      return this.handleRoutingError(error, stagesExecuted);
    }
  }

  /**
   * (#2540 PR 7) Returns the candidate routing-arm set for the routing pipeline
   * (`RoutingArmId[]` = CLI slots plus any `api:*` arms, #3422), filtered by
   * harness-driven availability when the cache is wired. (Name retained for
   * history; the set is routing arms, not only CLIs.)
   *
   * Filtering rules:
   *   - No cache configured → return all registered arms (prior behaviour).
   *   - Cache configured → query getAll(); an arm is excluded only if the
   *     cache reports zero models for it. If the cache returns an empty union
   *     (cold start, all sources failing), fall back to all registered arms
   *     so the router never wedges on a transient cache miss.
   *   - Errors in the cache do not block routing — log and fall through.
   */
  private async getCandidateCliNames(): Promise<RoutingArmId[]> {
    if (this.availableModelsCache === undefined) return this.cliNames;
    try {
      const all = await this.availableModelsCache.getAll();
      if (all.length === 0) {
        // The cache is wired but reports zero models — cold start, or all
        // sources unavailable. Fall back to all CLIs so routing never wedges,
        // but log at INFO so operators who rely on the cache can see the gate
        // is currently a no-op (#3188).
        this.logger.info(
          'AvailableModelsCache returned no models; falling back to all CLIs (cold start or all sources unavailable)',
          { candidateCount: this.cliNames.length }
        );
        return this.cliNames;
      }
      const sourcesWithModels = new Set(all.map((m) => m.source));
      // Availability is tracked per CLI source/slot; an api:* arm is gated on
      // its display slot's source (#3422).
      const filtered = this.cliNames.filter((name) =>
        sourcesWithModels.has(routingArmDisplaySlot(name))
      );
      // Guard against fully empty filter — never let the gate wedge routing.
      if (filtered.length === 0) {
        this.logger.info(
          'AvailableModelsCache filtered out all CLIs; falling back to all (possible stale/misconfigured cache)',
          { cacheSources: [...sourcesWithModels], candidateCount: this.cliNames.length }
        );
        return this.cliNames;
      }
      return filtered;
    } catch (e: unknown) {
      this.logger.warn('AvailableModelsCache query failed; falling back to all CLIs', {
        error: e instanceof Error ? e.message : String(e),
      });
      return this.cliNames;
    }
  }

  /** (#2540 PR 7) Public accessor for the wired cache (or undefined). */
  getAvailableModelsCache():
    | import('../config/available-models-cache.js').AvailableModelsCache
    | undefined {
    return this.availableModelsCache;
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
      // arXiv:2505.12601 KNN routing
      knnRoutingStage: this.knnRoutingStage,
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

    // #3394: pick a concrete model from the difficulty tier (opt-in, default
    // OFF). Registry-only + synchronous — no probe on the hot path. Consumers
    // fall back to getDefaultModelForCli when absent.
    // Concrete model resolution is registry/slot-level; collapse an api:* arm
    // to its display slot for the lookup (#3422).
    const model =
      isRouteModelSelectionEnabled() && params.difficultyTier !== undefined
        ? resolveModelForTier(routingArmDisplaySlot(params.selectedCli), params.difficultyTier)
        : undefined;

    return ok({
      adapter: selectedAdapter,
      cliName: params.selectedCli,
      ...(model !== undefined ? { model } : {}),
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

  private updateStats(selectedCli: RoutingArmId, decisionTimeMs: number): void {
    this.totalDecisions++;
    // decisionsPerCli stays slot-keyed; an api:* arm increments its display
    // slot's counter so no api:* key ever enters the record (#3422).
    this.decisionsPerCli[routingArmDisplaySlot(selectedCli)]++;
    this.totalDecisionTimeMs += decisionTimeMs;
  }

  /**
   * Record a routing decision to the orchestration observer (Issue #587).
   */
  private recordToOrchestrationObserver(decision: CompositeRoutingDecision, task: CliTask): void {
    if (this.orchestrationObserver === undefined) {
      return;
    }

    // Convert CompositeRoutingDecision to RoutingDecision for observer.
    // The observer is slot-level; collapse the distinct arm + alternatives to
    // their display slots (#3422).
    const routingDecision: RoutingDecision = {
      timestamp: new Date().toISOString(),
      taskId: `task-${getRandomProvider().uuid()}`,
      taskDescription:
        task.content.length > 100 ? task.content.substring(0, 100) + '...' : task.content,
      selectedCli: routingArmDisplaySlot(decision.cliName),
      confidence: decision.confidence,
      reason: decision.reason,
      alternatives: decision.alternatives.map(routingArmDisplaySlot),
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

  recordOutcome(cliName: RoutingArmId, task: CliTask, reward: number): void {
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
   * Get capacity status for all registered routing arms — CLI slots plus any
   * `api:*` arms (Issue #807, #3422). Matches the `ITaskRouter` interface doc;
   * the return key is `RoutingArmId` (`CliName | ApiArmId`), not just CLIs.
   */
  async getCapacityDashboard(): Promise<Map<RoutingArmId, import('./types.js').CapacityStatus>> {
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
  adapters: Map<RoutingArmId, ICliAdapter>,
  config?: Partial<CompositeRouterConfigWithPreference>,
  logger?: ILogger
): ICompositeRouter {
  // #3404: when dynamic discovery is enabled (opt-in via NEXUS_DYNAMIC_MODELS,
  // default OFF) and the caller didn't supply a cache, attach the global
  // AvailableModelsCache with live sources registered, so the existing CLI
  // pre-filter (getCandidateCliNames) finally has real data. Fail-open by
  // construction: sources return [] on error and an empty cache leaves
  // getCandidateCliNames returning all CLIs.
  let resolved = config;
  if (isDynamicModelsEnabled() && config?.availableModelsCache === undefined) {
    const cache = getDefaultAvailableModelsCache();
    registerDefaultModelSources(cache, adapters);
    resolved = { ...config, availableModelsCache: cache };
  }
  return new CompositeRouter(adapters, resolved, logger);
}
