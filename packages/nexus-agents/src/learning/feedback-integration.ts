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
import { createLogger } from '../core/logger.js';
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

/**
 * Parameters for recording an outcome.
 */
export interface RecordOutcomeParams {
  /** Routing decision ID */
  readonly routingDecisionId: string;
  /** Whether the task succeeded */
  readonly success: boolean;
  /** Quality score (0-1) */
  readonly qualityScore: number;
  /** Execution duration in milliseconds */
  readonly durationMs: number;
  /** Token usage */
  readonly tokenUsage: number;
  /** Number of retries (default: 0) */
  readonly retryCount?: number | undefined;
  /** Trace ID for correlation */
  readonly traceId?: TraceId | undefined;
}

/**
 * Configuration for feedback integration.
 */
export interface FeedbackIntegrationConfig {
  /** Enable automatic feedback to routers (default: true) */
  readonly enableAutoFeedback: boolean;
  /** Quality score threshold for success (default: 0.7) */
  readonly successQualityThreshold: number;
  /** Quality score threshold for partial success (default: 0.4) */
  readonly partialQualityThreshold: number;
  /** Logger instance */
  readonly logger?: ILogger | undefined;
}

/**
 * Default configuration.
 */
export const DEFAULT_FEEDBACK_INTEGRATION_CONFIG: FeedbackIntegrationConfig = {
  enableAutoFeedback: true,
  successQualityThreshold: 0.7,
  partialQualityThreshold: 0.4,
};

/**
 * Maps CLI name to router type.
 */
function cliNameToRouterType(_cliName: CliName): RouterType {
  // CompositeRouter uses multiple techniques, defaulting to 'topsis'
  return 'topsis';
}

/**
 * Interface for feedback integration.
 */
export interface IFeedbackIntegration {
  /** Record a routing decision from CompositeRouter */
  recordRoutingDecision(decision: CompositeRoutingDecision, traceId?: TraceId): string;

  /** Record a step outcome from workflow execution */
  recordStepOutcome(
    routingDecisionId: string,
    stepResult: StepResult,
    durationMs: number,
    tokenUsage: number
  ): void;

  /** Record a generic task outcome */
  recordOutcome(params: RecordOutcomeParams): void;

  /** Get feedback statistics */
  getStats(): FeedbackLoopStats;

  /** Subscribe to outcome processed events */
  onOutcomeProcessed(callback: OutcomeProcessedCallback): () => void;

  /** Register CompositeRouter for bi-directional feedback */
  registerCompositeRouter(router: ICompositeRouter): void;

  /** Reset all collected data */
  reset(): void;
}

/**
 * Feedback integration implementation.
 * Bridges OutcomeFeedbackCollector with workflow execution and CLI routing.
 */
export class FeedbackIntegration implements IFeedbackIntegration {
  private readonly config: FeedbackIntegrationConfig;
  private readonly logger: ILogger;
  private readonly collector: OutcomeFeedbackCollector;
  private compositeRouter?: ICompositeRouter;

  // Track routing decisions for feedback routing
  private readonly decisionMap: Map<string, { cliName: CliName; task: string }> = new Map();

  constructor(config?: Partial<FeedbackIntegrationConfig>, collector?: OutcomeFeedbackCollector) {
    this.config = { ...DEFAULT_FEEDBACK_INTEGRATION_CONFIG, ...config };
    this.logger = this.config.logger ?? createLogger({ component: 'FeedbackIntegration' });
    this.collector = collector ?? new OutcomeFeedbackCollector();

    this.logger.info('FeedbackIntegration initialized', {
      enableAutoFeedback: this.config.enableAutoFeedback,
    });
  }

  recordRoutingDecision(decision: CompositeRoutingDecision, traceId?: TraceId): string {
    const id = randomUUID();
    const trace = traceId ?? (randomUUID() as TraceId);

    // Store for later outcome routing
    this.decisionMap.set(id, { cliName: decision.cliName, task: decision.taskProfile.taskType });

    // Create RoutingDecision for collector
    const routingDecision: RoutingDecision = createRoutingDecision({
      traceId: trace,
      routerType: cliNameToRouterType(decision.cliName),
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

    this.logger.debug('Routing decision recorded', {
      id,
      cliName: decision.cliName,
      confidence: decision.confidence,
      stages: decision.stagesExecuted,
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
      timestamp: new Date().toISOString(),
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

    this.logger.debug('Task outcome recorded', {
      routingDecisionId,
      success,
      outcomeClass,
      qualityScore,
      durationMs,
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
    this.logger.info('FeedbackIntegration reset');
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
