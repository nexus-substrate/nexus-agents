/**
 * nexus-agents/learning - Outcome Feedback Collector
 *
 * Collects routing decisions and outcomes to enable closed-loop learning.
 * Feeds results back to LinUCB and PreferenceRouter for adaptation.
 *
 * @module learning/outcome-feedback
 * (Source: Issue #160, Alignment Roadmap Phase 2)
 */

import { createLogger } from '../core/logger.js';
import type {
  FeedbackCollectorConfig,
  RoutingDecision,
  TaskOutcome,
  ComputedReward,
  FeedbackLoopStats,
  IOutcomeFeedback,
  OutcomeProcessedCallback,
} from './outcome-feedback-types.js';
import {
  DEFAULT_FEEDBACK_COLLECTOR_CONFIG,
  FeedbackCollectorConfigSchema,
} from './outcome-feedback-types.js';
import type { TraceId } from '../observability/swarm-observer-types.js';
import type { LinUCBBandit } from '../cli-adapters/linucb-bandit.js';
import type { PreferenceRouter } from '../cli-adapters/preference-router.js';
import {
  countOutcomesByClass,
  countDecisionsByRouter,
  calculateAverageQuality,
  generateRewardExplanation,
} from './outcome-feedback-helpers.js';

// Re-export factory functions for backward compatibility
export { createRoutingDecision, createTaskOutcome } from './outcome-feedback-helpers.js';

const logger = createLogger({ component: 'OutcomeFeedback' });

/**
 * Outcome feedback collector implementation.
 */
export class OutcomeFeedbackCollector implements IOutcomeFeedback {
  private readonly config: FeedbackCollectorConfig;
  private readonly pendingDecisions: Map<TraceId, RoutingDecision> = new Map();
  private readonly outcomes: TaskOutcome[] = [];
  private readonly decisionHistory: RoutingDecision[] = [];
  private readonly callbacks: Set<OutcomeProcessedCallback> = new Set();

  // Optional router references for direct feedback
  private linucbBandit?: LinUCBBandit;
  private preferenceRouter?: PreferenceRouter;

  constructor(config?: Partial<FeedbackCollectorConfig>) {
    this.config = FeedbackCollectorConfigSchema.parse({
      ...DEFAULT_FEEDBACK_COLLECTOR_CONFIG,
      ...config,
    });

    logger.info('OutcomeFeedbackCollector initialized', {
      maxPendingDecisions: this.config.maxPendingDecisions,
      enableAutoReward: this.config.enableAutoReward,
    });
  }

  /**
   * Register LinUCB bandit for direct feedback.
   */
  registerLinUCBBandit(bandit: LinUCBBandit): void {
    this.linucbBandit = bandit;
    logger.debug('LinUCB bandit registered for feedback');
  }

  /**
   * Register PreferenceRouter for direct feedback.
   */
  registerPreferenceRouter(router: PreferenceRouter): void {
    this.preferenceRouter = router;
    logger.debug('PreferenceRouter registered for feedback');
  }

  /**
   * Subscribe to outcome processed events.
   */
  onOutcomeProcessed(callback: OutcomeProcessedCallback): () => void {
    this.callbacks.add(callback);
    return (): void => {
      this.callbacks.delete(callback);
    };
  }

  recordRoutingDecision(decision: RoutingDecision): void {
    // Enforce limit on pending decisions
    if (this.pendingDecisions.size >= this.config.maxPendingDecisions) {
      this.clearExpiredDecisions();

      // If still at limit, remove oldest
      if (this.pendingDecisions.size >= this.config.maxPendingDecisions) {
        const oldest = this.findOldestPendingDecision();
        if (oldest !== undefined) {
          this.pendingDecisions.delete(oldest);
        }
      }
    }

    this.pendingDecisions.set(decision.traceId, decision);
    this.decisionHistory.push(decision);

    logger.debug('Routing decision recorded', {
      id: decision.id,
      traceId: decision.traceId,
      routerType: decision.routerType,
      selectedModel: decision.selectedModel,
    });
  }

  recordOutcome(outcome: TaskOutcome): void {
    this.outcomes.push(outcome);

    // Find and remove matching pending decision
    const decision = this.findDecisionByRoutingId(outcome.routingDecisionId);

    if (decision !== undefined) {
      this.pendingDecisions.delete(decision.traceId);
      const reward = this.computeReward(outcome);
      this.feedbackToRouters(decision, outcome, reward);
      this.notifyCallbacks(decision, outcome, reward);
    }

    logger.debug('Outcome recorded', {
      routingDecisionId: outcome.routingDecisionId,
      outcomeClass: outcome.outcomeClass,
      qualityScore: outcome.qualityScore,
    });
  }

  processOutcome(traceId: TraceId, partialOutcome: Omit<TaskOutcome, 'routingDecisionId'>): void {
    const decision = this.pendingDecisions.get(traceId);

    if (decision === undefined) {
      logger.warn('No pending decision found for trace', { traceId });
      return;
    }

    const outcome: TaskOutcome = {
      ...partialOutcome,
      routingDecisionId: decision.id,
    };

    this.recordOutcome(outcome);
  }

  computeReward(outcome: TaskOutcome): ComputedReward {
    const signals = outcome.qualitySignals;

    // Base reward from success/failure
    let baseReward = outcome.success ? 1.0 : 0.0;
    if (outcome.outcomeClass === 'partial') {
      baseReward = signals.completionRatio;
    }

    // Quality bonus from quality score
    const qualityBonus = outcome.qualityScore * this.config.qualityWeight;

    // Speed bonus (faster than target = bonus)
    const speedRatio = Math.min(1, this.config.targetDurationMs / outcome.durationMs);
    const speedBonus = speedRatio * this.config.speedWeight;

    // Efficiency bonus (fewer tokens than target = bonus)
    const efficiencyRatio = Math.min(1, this.config.targetTokenUsage / outcome.tokenUsage);
    const efficiencyBonus = efficiencyRatio * this.config.efficiencyWeight;

    // Retry penalty
    const retryPenalty = signals.retryCount * this.config.retryPenalty;

    // Compute final reward (clamped to 0-1)
    const rawReward = baseReward + qualityBonus + speedBonus + efficiencyBonus - retryPenalty;
    const reward = Math.max(0, Math.min(1, rawReward));

    return {
      reward,
      components: {
        baseReward,
        qualityBonus,
        speedBonus,
        efficiencyBonus,
        retryPenalty,
      },
      explanation: generateRewardExplanation(outcome, reward),
    };
  }

  getStats(): FeedbackLoopStats {
    const outcomesByClass = countOutcomesByClass(this.outcomes);
    const decisionsByRouter = countDecisionsByRouter(this.decisionHistory);
    const avgQuality = calculateAverageQuality(this.outcomes);
    const avgReward = this.calculateAverageReward();

    return {
      totalDecisions: this.decisionHistory.length,
      totalOutcomes: this.outcomes.length,
      pendingOutcomes: this.pendingDecisions.size,
      outcomesByClass,
      avgQualityScore: avgQuality,
      avgReward,
      decisionsByRouter,
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  getPendingDecisions(): readonly RoutingDecision[] {
    return [...this.pendingDecisions.values()];
  }

  clearExpiredDecisions(): number {
    const now = Date.now();
    const cutoff = now - this.config.pendingTimeoutMs;
    let cleared = 0;

    for (const [traceId, decision] of this.pendingDecisions.entries()) {
      const decisionTime = new Date(decision.timestamp).getTime();
      if (decisionTime < cutoff) {
        this.pendingDecisions.delete(traceId);
        cleared++;

        logger.debug('Expired pending decision cleared', {
          id: decision.id,
          traceId,
          age: now - decisionTime,
        });
      }
    }

    return cleared;
  }

  reset(): void {
    this.pendingDecisions.clear();
    this.outcomes.length = 0;
    this.decisionHistory.length = 0;
    logger.info('OutcomeFeedbackCollector reset');
  }

  private feedbackToRouters(
    decision: RoutingDecision,
    outcome: TaskOutcome,
    reward: ComputedReward
  ): void {
    if (!this.config.enableAutoReward) return;

    this.feedbackToLinUCB(decision, reward);
    this.feedbackToPreferenceRouter(decision, outcome);
  }

  private feedbackToLinUCB(decision: RoutingDecision, reward: ComputedReward): void {
    if (decision.routerType !== 'linucb' || this.linucbBandit === undefined) return;
    if (decision.armIndex === undefined || decision.banditContext === undefined) return;

    this.linucbBandit.update(decision.armIndex, decision.banditContext, reward.reward);

    logger.debug('LinUCB bandit updated', {
      armIndex: decision.armIndex,
      reward: reward.reward,
    });
  }

  private feedbackToPreferenceRouter(decision: RoutingDecision, outcome: TaskOutcome): void {
    if (decision.routerType !== 'preference' || this.preferenceRouter === undefined) return;

    const strongModelPreferred = decision.selectedTier === 'strong' && outcome.success;

    this.preferenceRouter.recordPreference(
      decision.query,
      strongModelPreferred,
      decision.selectedTier === 'strong' ? outcome.qualityScore : undefined,
      decision.selectedTier === 'weak' ? outcome.qualityScore : undefined
    );

    logger.debug('PreferenceRouter updated', {
      strongModelPreferred,
      qualityScore: outcome.qualityScore,
    });
  }

  private notifyCallbacks(
    decision: RoutingDecision,
    outcome: TaskOutcome,
    reward: ComputedReward
  ): void {
    for (const callback of this.callbacks) {
      try {
        callback(decision, outcome, reward);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error('Callback error', error);
      }
    }
  }

  private findDecisionByRoutingId(routingDecisionId: string): RoutingDecision | undefined {
    return this.decisionHistory.find((d) => d.id === routingDecisionId);
  }

  private findOldestPendingDecision(): TraceId | undefined {
    let oldest: { traceId: TraceId; time: number } | undefined;

    for (const [traceId, decision] of this.pendingDecisions.entries()) {
      const time = new Date(decision.timestamp).getTime();
      if (oldest === undefined || time < oldest.time) {
        oldest = { traceId, time };
      }
    }

    return oldest?.traceId;
  }

  private calculateAverageReward(): number {
    if (this.outcomes.length === 0) return 0;

    let sum = 0;
    for (const outcome of this.outcomes) {
      sum += this.computeReward(outcome).reward;
    }
    return sum / this.outcomes.length;
  }
}

/**
 * Create an OutcomeFeedbackCollector instance.
 */
export function createOutcomeFeedbackCollector(
  config?: Partial<FeedbackCollectorConfig>
): OutcomeFeedbackCollector {
  return new OutcomeFeedbackCollector(config);
}
