/**
 * nexus-agents/cli-adapters - Capability-Based Task Router
 *
 * Intelligent task router that selects optimal CLI based on task requirements
 * and available capacity.
 *
 * (Source: Issue #78 - Capability-based task router)
 * (Source: cli-project_plan.md v2.1.0, Capability Matching Matrix)
 */

import { z } from 'zod';
import type { Result } from '../core/result.js';
import { ok, err } from '../core/result.js';
import { NexusError, ErrorCode } from '../core/errors.js';
import type { ILogger } from '../core/logger.js';
import { logger as defaultLogger } from '../core/logger.js';
import type { Task } from '../core/types/agent.js';
import type { ICliAdapter, CliName, CapacityStatus } from './types.js';
import { analyzeTask, summarizeProfile, type TaskProfile } from './task-analyzer.js';
import {
  scoreTaskType,
  scoreReasoning,
  scoreCodeGeneration,
  scoreContextWindow,
  scoreCostEfficiency,
  scoreSpeed,
} from './router-scoring.js';

/**
 * Routing error for when no suitable adapter is available.
 */
export class RoutingError extends NexusError {
  constructor(
    message: string,
    options?: Partial<
      Omit<{ code: ErrorCode; cause?: Error; context?: Record<string, unknown> }, 'code'>
    >
  ) {
    super(message, { code: ErrorCode.MODEL_UNAVAILABLE, ...options });
    this.name = 'RoutingError';
  }
}

/**
 * Routing decision with explanation.
 */
export interface RoutingDecision {
  /** Selected adapter */
  readonly adapter: ICliAdapter;
  /** Confidence score (0-1) */
  readonly confidence: number;
  /** Reasoning for selection */
  readonly reason: string;
  /** Alternative adapters in fallback order */
  readonly alternatives: readonly ICliAdapter[];
  /** Time taken to make decision in ms */
  readonly decisionTimeMs: number;
}

/**
 * Router configuration options.
 */
export interface RouterConfig {
  /** Logger instance */
  readonly logger?: ILogger;
  /** Minimum capacity threshold (0-1) */
  readonly minCapacityThreshold?: number;
  /** Whether to prefer cost-efficient adapters */
  readonly preferCostEfficient?: boolean;
  /** Maximum routing decision time in ms */
  readonly maxDecisionTimeMs?: number;
}

/**
 * Configuration schema for validation.
 */
export const RouterConfigSchema = z.object({
  minCapacityThreshold: z.number().min(0).max(1).default(0.1),
  preferCostEfficient: z.boolean().default(false),
  maxDecisionTimeMs: z.number().min(1).max(1000).default(100),
});

/**
 * Task router interface.
 */
export interface ITaskRouter {
  /**
   * Routes a task to the optimal CLI adapter.
   */
  route(task: Task): Promise<Result<ICliAdapter, RoutingError>>;

  /**
   * Routes a task and returns full decision details.
   */
  routeWithDetails(task: Task): Promise<Result<RoutingDecision, RoutingError>>;
}

/**
 * Capability-based task router implementation.
 */
export class TaskRouter implements ITaskRouter {
  private readonly adapters: Map<CliName, ICliAdapter>;
  private readonly logger: ILogger;
  private readonly minCapacityThreshold: number;
  private readonly preferCostEfficient: boolean;

  constructor(adapters: Map<CliName, ICliAdapter>, config?: RouterConfig) {
    this.adapters = adapters;
    this.logger = config?.logger ?? defaultLogger;

    const validatedConfig = RouterConfigSchema.parse({
      minCapacityThreshold: config?.minCapacityThreshold,
      preferCostEfficient: config?.preferCostEfficient,
      maxDecisionTimeMs: config?.maxDecisionTimeMs,
    });

    this.minCapacityThreshold = validatedConfig.minCapacityThreshold;
    this.preferCostEfficient = validatedConfig.preferCostEfficient;
  }

  async route(task: Task): Promise<Result<ICliAdapter, RoutingError>> {
    const decision = await this.routeWithDetails(task);
    if (!decision.ok) return decision;
    return ok(decision.value.adapter);
  }

  async routeWithDetails(task: Task): Promise<Result<RoutingDecision, RoutingError>> {
    const startTime = Date.now();
    const profile = analyzeTask(task);
    this.logger.debug('Task analyzed', { profile: summarizeProfile(profile), taskId: task.id });

    const capacities = await this.getAdapterCapacities();
    const available = this.filterByCapacity(profile, capacities);

    if (available.length === 0) {
      return err(
        new RoutingError('No adapters available with sufficient capacity', {
          context: { profile, capacities: Object.fromEntries(capacities) },
        })
      );
    }

    const ranked = this.rankAdapters(available, profile);
    if (ranked.length === 0) {
      return err(
        new RoutingError('No suitable adapters found for task requirements', {
          context: { profile, available: available.map((a) => a.name) },
        })
      );
    }

    const best = ranked[0];
    const alternatives = ranked.slice(1);
    const decisionTimeMs = Date.now() - startTime;

    if (best === undefined) {
      return err(
        new RoutingError('No suitable adapters found for task requirements', {
          context: { profile, available: available.map((a) => a.name) },
        })
      );
    }

    const decision: RoutingDecision = {
      adapter: best.adapter,
      confidence: best.score,
      reason: best.reason,
      alternatives: alternatives.map((a) => a.adapter),
      decisionTimeMs,
    };

    this.logger.info('Task routed', {
      taskId: task.id,
      selected: best.adapter.name,
      confidence: best.score.toFixed(2),
      decisionTimeMs,
      alternatives: alternatives.map((a) => a.adapter.name),
    });

    return ok(decision);
  }

  private async getAdapterCapacities(): Promise<Map<CliName, CapacityStatus>> {
    const capacities = new Map<CliName, CapacityStatus>();
    const promises: Promise<void>[] = [];

    for (const [name, adapter] of this.adapters) {
      promises.push(
        adapter
          .getCapacity()
          .then((capacity) => {
            capacities.set(name, capacity);
          })
          .catch((error: unknown) => {
            this.logger.warn('Failed to get capacity', { adapter: name, error });
            capacities.set(name, this.createExhaustedCapacity());
          })
      );
    }

    await Promise.all(promises);
    return capacities;
  }

  private createExhaustedCapacity(): CapacityStatus {
    return {
      remainingTokens: 0,
      remainingRequests: 0,
      resetTime: new Date(),
      utilizationPercent: 100,
      exhausted: true,
    };
  }

  private filterByCapacity(
    profile: TaskProfile,
    capacities: Map<CliName, CapacityStatus>
  ): ICliAdapter[] {
    const available: ICliAdapter[] = [];

    for (const [name, adapter] of this.adapters) {
      const capacity = capacities.get(name);
      if (capacity === undefined || capacity.exhausted) continue;

      if (adapter.capabilities.contextWindow < profile.contextRequired) {
        this.logger.debug('Adapter filtered: insufficient context window', {
          adapter: name,
          required: profile.contextRequired,
          available: adapter.capabilities.contextWindow,
        });
        continue;
      }

      const utilizationThreshold = 1 - this.minCapacityThreshold;
      if (capacity.utilizationPercent / 100 > utilizationThreshold) {
        this.logger.debug('Adapter filtered: capacity below threshold', {
          adapter: name,
          utilization: capacity.utilizationPercent,
          threshold: utilizationThreshold * 100,
        });
        continue;
      }

      available.push(adapter);
    }

    return available;
  }

  private rankAdapters(
    adapters: ICliAdapter[],
    profile: TaskProfile
  ): Array<{ adapter: ICliAdapter; score: number; reason: string }> {
    const scored = adapters.map((adapter) => {
      const { score, reason } = this.calculateScore(adapter, profile);
      return { adapter, score, reason };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  private calculateScore(
    adapter: ICliAdapter,
    profile: TaskProfile
  ): { score: number; reason: string } {
    const capabilities = adapter.capabilities;
    const reasons: string[] = [];
    let score = 0.5;

    score += scoreTaskType(profile, adapter.name, reasons);
    score += scoreReasoning(profile, capabilities, reasons);
    score += scoreCodeGeneration(profile, capabilities, reasons);
    score += scoreContextWindow(profile, capabilities, reasons);
    score += scoreCostEfficiency(profile, capabilities, reasons, this.preferCostEfficient);
    score += scoreSpeed(profile, capabilities, reasons);

    const normalizedScore = Math.min(1, Math.max(0, score));
    const reason = reasons.length > 0 ? reasons.join('; ') : 'Default selection';
    return { score: normalizedScore, reason };
  }
}

/**
 * Creates a task router with the provided adapters.
 */
export function createTaskRouter(
  adapters: Map<CliName, ICliAdapter>,
  config?: RouterConfig
): ITaskRouter {
  return new TaskRouter(adapters, config);
}
