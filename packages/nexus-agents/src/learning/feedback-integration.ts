/**
 * nexus-agents/learning - Feedback Integration
 *
 * Connects OutcomeFeedbackCollector to workflow execution and CLI routing.
 * Enables closed-loop learning for routing decisions.
 *
 * @module learning/feedback-integration
 * (Source: Issue #167, Epic #164)
 */

import { randomUUID } from 'node:crypto';
import { createLogger, getTimeProvider } from '../core/index.js';
import type { ILogger } from '../core/logger.js';
import type { StepResult } from '../core/types/workflow.js';
import type { CliName } from '../cli-adapters/types.js';
import type {
  CompositeRoutingDecision,
  ICompositeRouter,
} from '../cli-adapters/composite-router.js';
import type { TraceId } from '../observability/swarm-observer-types.js';
import type {
  IOutcomeFeedback,
  RoutingDecision,
  TaskOutcome,
  ComputedReward,
  FeedbackLoopStats,
  OutcomeProcessedCallback,
  RouterType,
  OutcomeClass,
} from './outcome-feedback-types.js';
import { OutcomeFeedbackCollector, createRoutingDecision } from './outcome-feedback.js';
import type {
  RecordOutcomeParams,
  FeedbackIntegrationConfig,
  IFeedbackIntegration,
} from './feedback-integration-types.js';
import {
  DEFAULT_DECISION_TTL_MS,
  DEFAULT_FEEDBACK_INTEGRATION_CONFIG,
} from './feedback-integration-types.js';
import type {
  IOutcomeStorage,
  StoredRoutingDecision,
  StoredTaskOutcome,
  StoredReward,
} from './outcome-storage-types.js';

// Re-export types for backward compatibility
export type {
  RecordOutcomeParams,
  FeedbackIntegrationConfig,
  IFeedbackIntegration,
} from './feedback-integration-types.js';
export {
  DEFAULT_DECISION_TTL_MS,
  DEFAULT_FEEDBACK_INTEGRATION_CONFIG,
} from './feedback-integration-types.js';

/** Minimum interval between eviction runs: 60 seconds */
const EVICTION_THROTTLE_MS = 60000;

/**
 * Determines the decisive routing technique from a CompositeRoutingDecision.
 * Analyzes which routing stage was most influential in the final decision.
 * (Source: Issue #464 - Improve routing technique analytics)
 *
 * @param decision - The routing decision with stage execution info
 * @returns The RouterType that was decisive in the routing decision
 */
function getDecisiveRouterType(decision: CompositeRoutingDecision): RouterType {
  const stages = decision.stagesExecuted;

  // LinUCB bandit selection is most decisive when it contributes a UCB score
  if (stages.includes('linucb-selection') && decision.ucbScore !== undefined) {
    return 'linucb';
  }

  // Preference routing when it provided a score
  if (stages.includes('preference-routing') && decision.preferenceScore !== undefined) {
    return 'preference';
  }

  // ZeroRouter cascade-style routing based on difficulty
  if (stages.includes('zero-router') && decision.difficultyTier !== undefined) {
    return 'cascade';
  }

  // TOPSIS ranking when it provided a score
  if (stages.includes('topsis-ranking') && decision.topsisScore !== undefined) {
    return 'topsis';
  }

  // Default fallback
  return 'topsis';
}

/**
 * Feedback integration implementation.
 * Bridges OutcomeFeedbackCollector with workflow execution and CLI routing.
 */
/**
 * Entry in the decision map with timestamp for TTL eviction.
 */
interface DecisionEntry {
  readonly cliName: CliName;
  readonly task: string;
  readonly createdAt: number;
}

export class FeedbackIntegration implements IFeedbackIntegration {
  private readonly config: FeedbackIntegrationConfig;
  private readonly logger: ILogger;
  private readonly collector: OutcomeFeedbackCollector;
  private compositeRouter?: ICompositeRouter;
  /** SQLite storage for cross-session persistence (Issue #560) */
  private readonly outcomeStorage?: IOutcomeStorage;

  // Track routing decisions for feedback routing
  private readonly decisionMap: Map<string, DecisionEntry> = new Map();

  // Throttle eviction to once per minute
  private lastEvictionTime = 0;

  // Track evicted entries for stats
  private totalEvictedEntries = 0;

  constructor(config?: Partial<FeedbackIntegrationConfig>, collector?: OutcomeFeedbackCollector) {
    this.config = { ...DEFAULT_FEEDBACK_INTEGRATION_CONFIG, ...config };
    this.logger = this.config.logger ?? createLogger({ component: 'FeedbackIntegration' });
    this.collector = collector ?? new OutcomeFeedbackCollector();

    // Wire SQLite outcome storage if persistence is enabled (Issue #560)
    if (this.config.enablePersistence === true && this.config.outcomeStorage !== undefined) {
      this.outcomeStorage = this.config.outcomeStorage;
      this.logger.info('SQLiteOutcomeStorage wired for persistent feedback', {
        enablePersistence: true,
      });
    }

    this.logger.info('FeedbackIntegration initialized', {
      enableAutoFeedback: this.config.enableAutoFeedback,
      enablePersistence: this.config.enablePersistence ?? false,
    });
  }

  recordRoutingDecision(decision: CompositeRoutingDecision, traceId?: TraceId): string {
    const id = randomUUID();
    const trace = traceId ?? (randomUUID() as TraceId);
    const now = getTimeProvider().now();

    // Evict stale entries (throttled to once per minute)
    this.evictStaleEntriesThrottled(now);

    // Store for later outcome routing with timestamp
    this.decisionMap.set(id, {
      cliName: decision.cliName,
      task: decision.taskProfile.taskType,
      createdAt: now,
    });

    // Create RoutingDecision for collector
    const routingDecision: RoutingDecision = createRoutingDecision({
      traceId: trace,
      routerType: getDecisiveRouterType(decision),
      selectedModel: decision.cliName,
      confidence: decision.confidence,
      query: decision.reason,
      // Optional LinUCB fields
      armIndex: undefined,
      banditContext: undefined,
      selectedTier: undefined,
    });

    // Override the ID to match our tracking
    const decisionWithId = { ...routingDecision, id };
    this.collector.recordRoutingDecision(decisionWithId);

    // Persist to SQLite storage if enabled (Issue #560)
    if (this.outcomeStorage !== undefined) {
      const storedDecision: StoredRoutingDecision = {
        id,
        traceId: trace,
        timestamp: getTimeProvider().nowIso(),
        routerType: getDecisiveRouterType(decision),
        selectedModel: decision.cliName,
        alternativeModels: decision.alternatives,
        confidence: decision.confidence,
        reason: decision.reason,
        taskProfile: decision.taskProfile as unknown as Record<string, unknown>,
      };
      this.outcomeStorage.storeDecision(storedDecision).catch((error: unknown) => {
        this.logger.warn('Failed to persist routing decision to SQLite', { id, error });
      });
    }

    this.logger.debug('Routing decision recorded', {
      id,
      cliName: decision.cliName,
      confidence: decision.confidence,
      stages: decision.stagesExecuted,
      persisted: this.outcomeStorage !== undefined,
    });

    return id;
  }

  recordStepOutcome(
    routingDecisionId: string,
    stepResult: StepResult,
    durationMs: number,
    tokenUsage: number
  ): void {
    const success = stepResult.status === 'success';
    const qualityScore = this.computeStepQualityScore(stepResult);

    this.recordOutcome({
      routingDecisionId,
      success,
      qualityScore,
      durationMs,
      tokenUsage,
    });
  }

  recordOutcome(params: RecordOutcomeParams): void {
    const {
      routingDecisionId,
      success,
      qualityScore,
      durationMs,
      tokenUsage,
      retryCount = 0,
      traceId,
    } = params;
    const outcomeClass = this.determineOutcomeClass(success, qualityScore);
    const completionRatio = success ? 1.0 : qualityScore / this.config.successQualityThreshold;
    const trace = traceId ?? (randomUUID() as TraceId);

    const outcome: TaskOutcome = {
      routingDecisionId,
      timestamp: getTimeProvider().nowIso(),
      success,
      outcomeClass,
      qualityScore,
      durationMs,
      tokenUsage,
      traceId: trace,
      qualitySignals: {
        completionRatio: Math.min(completionRatio, 1.0),
        retryCount,
        coherenceScore: qualityScore,
      },
    };

    this.collector.recordOutcome(outcome);

    // Route feedback to CompositeRouter if enabled
    if (this.config.enableAutoFeedback) {
      this.routeFeedbackToCompositeRouter(routingDecisionId, outcome);
    }

    // Persist to SQLite if enabled (Issue #560)
    this.persistOutcomeToStorage(routingDecisionId, outcome);

    this.logger.debug('Task outcome recorded', {
      routingDecisionId,
      success,
      outcomeClass,
      qualityScore,
      durationMs,
      persisted: this.outcomeStorage !== undefined,
    });
  }

  /** Persists outcome and reward to SQLite storage (Issue #560). */
  private persistOutcomeToStorage(routingDecisionId: string, outcome: TaskOutcome): void {
    if (this.outcomeStorage === undefined) return;

    const storedOutcome: StoredTaskOutcome = {
      routingDecisionId,
      timestamp: outcome.timestamp,
      outcomeClass: outcome.outcomeClass,
      success: outcome.success,
      qualityScore: outcome.qualityScore,
      durationMs: outcome.durationMs,
      tokenUsage: outcome.tokenUsage,
    };
    this.outcomeStorage.storeOutcome(storedOutcome).catch((error: unknown) => {
      this.logger.warn('Failed to persist task outcome to SQLite', { routingDecisionId, error });
    });

    const computedReward = this.collector.computeReward(outcome);
    const storedReward: StoredReward = {
      routingDecisionId,
      timestamp: getTimeProvider().nowIso(),
      reward: computedReward.reward,
      baseReward: computedReward.components.baseReward,
      qualityBonus: computedReward.components.qualityBonus,
      speedBonus: computedReward.components.speedBonus,
      efficiencyBonus: computedReward.components.efficiencyBonus,
      retryPenalty: computedReward.components.retryPenalty,
    };
    this.outcomeStorage.storeReward(storedReward).catch((error: unknown) => {
      this.logger.warn('Failed to persist reward to SQLite', { routingDecisionId, error });
    });
  }

  getStats(): FeedbackLoopStats {
    return this.collector.getStats();
  }

  onOutcomeProcessed(callback: OutcomeProcessedCallback): () => void {
    return this.collector.onOutcomeProcessed(callback);
  }

  registerCompositeRouter(router: ICompositeRouter): void {
    this.compositeRouter = router;
    this.logger.info('CompositeRouter registered for feedback');
  }

  reset(): void {
    this.collector.reset();
    this.decisionMap.clear();
    this.lastEvictionTime = 0;
    this.totalEvictedEntries = 0;
    this.logger.info('FeedbackIntegration reset');
  }

  /**
   * Evicts stale entries from decisionMap that exceed the configured TTL.
   * Called on every recordRoutingDecision (throttled) and on reset.
   */
  evictStaleEntries(): number {
    const now = getTimeProvider().now();
    const ttl = this.config.decisionTtlMs ?? DEFAULT_DECISION_TTL_MS;
    const cutoff = now - ttl;
    let evictedCount = 0;

    for (const [id, entry] of this.decisionMap) {
      if (entry.createdAt < cutoff) {
        this.decisionMap.delete(id);
        evictedCount++;
      }
    }

    if (evictedCount > 0) {
      this.totalEvictedEntries += evictedCount;
      this.logger.debug('Evicted stale decision entries', {
        evictedCount,
        remainingEntries: this.decisionMap.size,
        ttlMs: ttl,
      });
    }

    return evictedCount;
  }

  /**
   * Gets the total number of evicted entries since creation or last reset.
   */
  getEvictedEntryCount(): number {
    return this.totalEvictedEntries;
  }

  /**
   * Gets the current size of the decision map (for testing/monitoring).
   */
  getDecisionMapSize(): number {
    return this.decisionMap.size;
  }

  private evictStaleEntriesThrottled(now: number): void {
    if (now - this.lastEvictionTime >= EVICTION_THROTTLE_MS) {
      this.evictStaleEntries();
      this.lastEvictionTime = now;
    }
  }

  private determineOutcomeClass(success: boolean, qualityScore: number): OutcomeClass {
    if (success && qualityScore >= this.config.successQualityThreshold) {
      return 'success';
    }
    if (qualityScore >= this.config.partialQualityThreshold) {
      return 'partial';
    }
    return 'failure';
  }

  private computeStepQualityScore(stepResult: StepResult): number {
    if (stepResult.status === 'success') {
      // Base score for success
      let score = 0.8;

      // Boost if output is substantive
      if (stepResult.output !== null && stepResult.output !== undefined) {
        const outputLen = JSON.stringify(stepResult.output).length;
        if (outputLen > 100) score += 0.1;
        if (outputLen > 500) score += 0.1;
      }

      return Math.min(score, 1.0);
    }

    if (stepResult.status === 'skipped') {
      return 0.5; // Neutral score for skipped
    }

    // Failed step
    return 0.2;
  }

  private routeFeedbackToCompositeRouter(routingDecisionId: string, outcome: TaskOutcome): void {
    if (this.compositeRouter === undefined) return;

    const decision = this.decisionMap.get(routingDecisionId);
    if (decision === undefined) {
      this.logger.warn('No decision found for feedback routing', { routingDecisionId });
      return;
    }

    // Compute reward and send to CompositeRouter
    const reward = this.collector.computeReward(outcome);
    this.compositeRouter.recordOutcome(decision.cliName, { content: decision.task }, reward.reward);

    this.logger.debug('Feedback routed to CompositeRouter', {
      cliName: decision.cliName,
      reward: reward.reward,
    });

    // Cleanup
    this.decisionMap.delete(routingDecisionId);
  }
}

/**
 * Creates a FeedbackIntegration instance.
 */
export function createFeedbackIntegration(
  config?: Partial<FeedbackIntegrationConfig>,
  collector?: OutcomeFeedbackCollector
): IFeedbackIntegration {
  return new FeedbackIntegration(config, collector);
}

/**
 * Helper to compute reward from outcome.
 */
export function computeOutcomeReward(
  collector: IOutcomeFeedback,
  outcome: TaskOutcome
): ComputedReward {
  return collector.computeReward(outcome);
}
