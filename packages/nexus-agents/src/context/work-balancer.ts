/**
 * nexus-agents/context - Work Balancer
 *
 * Automatic work balancing that assigns tasks based on capability matching
 * AND available capacity using a weighted scoring algorithm.
 *
 * (Source: GitHub Issue #85)
 * (Source: cli-project_plan.md v2.1.0, Phase 4)
 */

import type { Result } from '../core/index.js';
import { ok, err, createLogger, getTimeProvider } from '../core/index.js';
import { clamp, clampScore } from '../utils/math-utils.js';
import type { ICliAdapter, CapacityStatus, CapabilityProfile } from '../cli-adapters/types.js';
import {
  type TaskProfile,
  type CapacityInfo,
  type QueuedTask,
  type BalancerOptions,
  type ScoreBreakdown,
  type BalanceResult,
  type IWorkBalancer,
  BalancingError,
  DEFAULT_BALANCER_OPTIONS,
} from './work-balancer-types.js';

// Re-export types for convenience
export type {
  TaskProfile,
  CapacityInfo,
  QueuedTask,
  BalancerOptions,
  ScoreBreakdown,
  BalanceResult,
  IWorkBalancer,
  BalancingErrorCode,
} from './work-balancer-types.js';
export { BalancingError } from './work-balancer-types.js';

const logger = createLogger({ module: 'work-balancer' });

/**
 * Creates default task profile from a description using heuristics.
 */
export function createTaskProfile(
  description: string,
  overrides?: Partial<TaskProfile>
): TaskProfile {
  const wordCount = description.split(/\s+/).length;
  const hasCodeKeywords = /\b(code|implement|function|class|api|test|refactor)\b/i.test(
    description
  );
  const hasReasoningKeywords = /\b(analyze|design|architect|plan|review|debug)\b/i.test(
    description
  );
  const isUrgent = /\b(urgent|asap|immediately|critical)\b/i.test(description);
  const isCostSensitive = /\b(cheap|cost|budget|efficient)\b/i.test(description);

  const estimatedInputTokens = Math.ceil(wordCount * 1.3);
  const estimatedOutputTokens = Math.max(500, estimatedInputTokens * 2);
  const estimatedTokens = estimatedInputTokens + estimatedOutputTokens;
  const baseComplexity = Math.min(10, Math.ceil(wordCount / 50));

  return {
    estimatedTokens,
    complexity: Math.min(10, baseComplexity + (hasReasoningKeywords ? 2 : 0)),
    reasoningRequired: hasReasoningKeywords ? 8 : 5,
    codeGenerationRequired: hasCodeKeywords ? 8 : 3,
    speedPriority: isUrgent ? 9 : 5,
    costSensitivity: isCostSensitive ? 8 : 5,
    minContextWindow: estimatedTokens * 2,
    ...overrides,
  };
}

/**
 * Converts CapacityStatus (from adapter) to CapacityInfo (for balancer).
 */
export function capacityStatusToInfo(status: CapacityStatus): CapacityInfo {
  return {
    remainingTokens: status.remainingTokens,
    remainingRequests: status.remainingRequests,
    utilizationPercent: status.utilizationPercent,
    exhausted: status.exhausted,
    resetTime: status.resetTime,
  };
}

/**
 * Work balancer implementation.
 */
export class WorkBalancer implements IWorkBalancer {
  private readonly options: BalancerOptions;
  private readonly queue: QueuedTask[] = [];
  private taskIdCounter = 0;

  constructor(options?: Partial<BalancerOptions>) {
    this.options = { ...DEFAULT_BALANCER_OPTIONS, ...options };
    this.validateOptions();
  }

  private validateOptions(): void {
    const { capabilityWeight, capacityWeight } = this.options;
    if (Math.abs(capabilityWeight + capacityWeight - 1.0) > 0.001) {
      logger.warn('Weights do not sum to 1.0, normalizing', { capabilityWeight, capacityWeight });
    }
  }

  balance(
    task: TaskProfile,
    adapters: readonly ICliAdapter[],
    capacities: Map<string, CapacityInfo>
  ): Result<BalanceResult, BalancingError> {
    const validationError = this.validateBalanceInputs(task, adapters);
    if (validationError) return err(validationError);

    const { scores, bestAdapter } = this.scoreAdapters(task, adapters, capacities);
    this.logDebugScores(task, scores);

    if (!bestAdapter) {
      return err(
        new BalancingError('All adapters are at capacity or excluded', 'ALL_EXHAUSTED', {
          context: {
            adapterCount: adapters.length,
            scores: scores.map((s) => ({ adapter: s.adapter, reason: s.excludedReason })),
          },
        })
      );
    }

    return ok({ adapter: bestAdapter, scores, queued: false });
  }

  private validateBalanceInputs(
    task: TaskProfile,
    adapters: readonly ICliAdapter[]
  ): BalancingError | null {
    if (adapters.length === 0) {
      return new BalancingError('No adapters available for balancing', 'NO_ADAPTERS', {
        context: { taskEstimatedTokens: task.estimatedTokens },
      });
    }
    if (task.estimatedTokens <= 0) {
      return new BalancingError(
        'Invalid task profile: estimatedTokens must be positive',
        'INVALID_PROFILE',
        {
          context: { estimatedTokens: task.estimatedTokens },
        }
      );
    }
    return null;
  }

  private scoreAdapters(
    task: TaskProfile,
    adapters: readonly ICliAdapter[],
    capacities: Map<string, CapacityInfo>
  ): { scores: ScoreBreakdown[]; bestAdapter: ICliAdapter | null; bestScore: number } {
    const scores: ScoreBreakdown[] = [];
    let bestAdapter: ICliAdapter | null = null;
    let bestScore = -1;

    for (const adapter of adapters) {
      const score = this.scoreAdapter(adapter, task, capacities.get(adapter.name));
      scores.push(score);
      // Only consider adapters that aren't excluded
      if (score.excludedReason === undefined && score.finalScore > bestScore) {
        bestScore = score.finalScore;
        bestAdapter = adapter;
      }
    }

    return { scores, bestAdapter, bestScore };
  }

  private scoreAdapter(
    adapter: ICliAdapter,
    task: TaskProfile,
    capacity: CapacityInfo | undefined
  ): ScoreBreakdown {
    if (!capacity) {
      return {
        adapter: adapter.name,
        capabilityScore: 0,
        capacityScore: 0,
        finalScore: 0,
        excludedReason: 'No capacity information available',
      };
    }

    const capacityRatio = this.calculateCapacityRatio(capacity, task);
    if (capacityRatio < this.options.minCapacityThreshold) {
      const pct = (n: number): string => (n * 100).toFixed(1);
      return {
        adapter: adapter.name,
        capabilityScore: this.getCapabilityScore(adapter.capabilities, task),
        capacityScore: 0,
        finalScore: 0,
        excludedReason: `Capacity below threshold (${pct(capacityRatio)}% < ${pct(this.options.minCapacityThreshold)}%)`,
      };
    }

    if (adapter.capabilities.contextWindow < task.minContextWindow) {
      return {
        adapter: adapter.name,
        capabilityScore: this.getCapabilityScore(adapter.capabilities, task),
        capacityScore: this.getCapacityScore(capacity, task),
        finalScore: 0,
        excludedReason: `Context window too small (${String(adapter.capabilities.contextWindow)} < ${String(task.minContextWindow)})`,
      };
    }

    const capabilityScore = this.getCapabilityScore(adapter.capabilities, task);
    const capacityScore = this.getCapacityScore(capacity, task);
    return {
      adapter: adapter.name,
      capabilityScore,
      capacityScore,
      finalScore: this.calculateFinalScore(capabilityScore, capacityScore),
    };
  }

  private logDebugScores(task: TaskProfile, scores: ScoreBreakdown[]): void {
    if (this.options.debug) {
      logger.debug('Balance scores calculated', {
        taskTokens: task.estimatedTokens,
        scores: scores.map((s) => ({
          adapter: s.adapter,
          final: s.finalScore.toFixed(2),
          excluded: s.excludedReason,
        })),
      });
    }
  }

  getScore(adapter: ICliAdapter, task: TaskProfile, capacity: CapacityInfo): number {
    return this.calculateFinalScore(
      this.getCapabilityScore(adapter.capabilities, task),
      this.getCapacityScore(capacity, task)
    );
  }

  getCapabilityScore(capabilities: CapabilityProfile, task: TaskProfile): number {
    const reasoningMatch = this.calculateMatchScore(capabilities.reasoning, task.reasoningRequired);
    const codeGenMatch = this.calculateMatchScore(
      capabilities.codeGeneration,
      task.codeGenerationRequired
    );
    const speedMatch = this.calculateMatchScore(capabilities.speed, task.speedPriority);
    const costMatch =
      task.costSensitivity > 5 ? capabilities.cost : 10 - Math.abs(capabilities.cost - 5);
    const contextScore = capabilities.contextWindow >= task.minContextWindow ? 10 : 0;

    const weights = this.calculateCapabilityWeights(task);
    const weightedScore =
      reasoningMatch * weights.reasoning +
      codeGenMatch * weights.codeGeneration +
      speedMatch * weights.speed +
      costMatch * weights.cost +
      contextScore * weights.context;
    const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);

    return clampScore(weightedScore / totalWeight);
  }

  getCapacityScore(capacity: CapacityInfo, task: TaskProfile): number {
    if (capacity.exhausted) return 0;
    const tokenRatio = capacity.remainingTokens / task.estimatedTokens;
    if (tokenRatio >= 2) return 10;
    if (tokenRatio >= 1) return 5 + (tokenRatio - 1) * 5;
    return Math.max(0, tokenRatio * 5);
  }

  queueTask(
    task: TaskProfile,
    description: string,
    priority = 5
  ): Result<QueuedTask, BalancingError> {
    if (this.queue.length >= this.options.maxQueueSize) {
      return err(
        new BalancingError(
          `Queue is full (max ${String(this.options.maxQueueSize)} tasks)`,
          'QUEUE_FULL',
          {
            context: { currentSize: this.queue.length, maxSize: this.options.maxQueueSize },
          }
        )
      );
    }

    const queuedTask: QueuedTask = {
      id: `task-${String(++this.taskIdCounter)}`,
      profile: task,
      description,
      queuedAt: new Date(getTimeProvider().now()),
      priority: clamp(priority, 1, 10),
    };

    const insertIndex = this.queue.findIndex((t) => t.priority < queuedTask.priority);
    if (insertIndex === -1) this.queue.push(queuedTask);
    else this.queue.splice(insertIndex, 0, queuedTask);

    logger.info('Task queued', {
      taskId: queuedTask.id,
      priority: queuedTask.priority,
      queueSize: this.queue.length,
    });
    return ok(queuedTask);
  }

  getNextQueuedTask(adapter: ICliAdapter, capacity: CapacityInfo): QueuedTask | undefined {
    for (const task of this.queue) {
      if (
        task.profile.estimatedTokens <= capacity.remainingTokens &&
        adapter.capabilities.contextWindow >= task.profile.minContextWindow &&
        (task.preferredAdapter === undefined || task.preferredAdapter === adapter.name)
      ) {
        return task;
      }
    }
    return undefined;
  }

  removeFromQueue(taskId: string): boolean {
    const index = this.queue.findIndex((t) => t.id === taskId);
    if (index === -1) return false;
    this.queue.splice(index, 1);
    logger.debug('Task removed from queue', { taskId, queueSize: this.queue.length });
    return true;
  }

  getQueueStatus(): {
    readonly size: number;
    readonly maxSize: number;
    readonly oldestTask?: Date;
  } {
    const oldestTask =
      this.queue.length > 0 ? this.queue[this.queue.length - 1]?.queuedAt : undefined;
    if (oldestTask !== undefined) {
      return { size: this.queue.length, maxSize: this.options.maxQueueSize, oldestTask };
    }
    return { size: this.queue.length, maxSize: this.options.maxQueueSize };
  }

  private calculateFinalScore(capabilityScore: number, capacityScore: number): number {
    const { capabilityWeight, capacityWeight } = this.options;
    const totalWeight = capabilityWeight + capacityWeight;
    return (
      capabilityScore * (capabilityWeight / totalWeight) +
      capacityScore * (capacityWeight / totalWeight)
    );
  }

  private calculateMatchScore(capability: number, requirement: number): number {
    if (capability >= requirement)
      return Math.min(10, requirement + (capability - requirement) * 0.5);
    return Math.max(0, requirement - (requirement - capability) * 1.5);
  }

  private calculateCapabilityWeights(task: TaskProfile): {
    reasoning: number;
    codeGeneration: number;
    speed: number;
    cost: number;
    context: number;
  } {
    return {
      reasoning: 1 + (task.reasoningRequired > 5 ? 1 : 0),
      codeGeneration: 1 + (task.codeGenerationRequired > 5 ? 1 : 0),
      speed: 1 + (task.speedPriority > 7 ? 1 : 0),
      cost: 1 + (task.costSensitivity > 5 ? 1 : 0),
      context: 0.5,
    };
  }

  private calculateCapacityRatio(capacity: CapacityInfo, task: TaskProfile): number {
    if (capacity.exhausted || capacity.remainingTokens <= 0) return 0;
    return capacity.remainingTokens / task.estimatedTokens;
  }
}

/**
 * Creates a work balancer with default options.
 */
export function createWorkBalancer(options?: Partial<BalancerOptions>): IWorkBalancer {
  return new WorkBalancer(options);
}
