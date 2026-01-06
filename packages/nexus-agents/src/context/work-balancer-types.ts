/**
 * nexus-agents/context - Work Balancer Types
 *
 * Type definitions for work balancing functionality.
 *
 * (Source: GitHub Issue #85)
 * (Source: cli-project_plan.md v2.1.0, Phase 4)
 */

import type { Result } from '../core/index.js';
import { NexusError, ErrorCode } from '../core/index.js';
import type { ICliAdapter, CapabilityProfile } from '../cli-adapters/types.js';

// ============================================================================
// Task Profile Types
// ============================================================================

/**
 * Task profile for capability matching.
 * Derived from task description and requirements.
 */
export interface TaskProfile {
  /** Estimated tokens required for the task */
  readonly estimatedTokens: number;
  /** Task complexity level (0-10) */
  readonly complexity: number;
  /** Required reasoning depth (0-10) */
  readonly reasoningRequired: number;
  /** Code generation requirement (0-10) */
  readonly codeGenerationRequired: number;
  /** Speed priority (0-10, higher = more urgent) */
  readonly speedPriority: number;
  /** Cost sensitivity (0-10, higher = more cost-sensitive) */
  readonly costSensitivity: number;
  /** Minimum context window needed */
  readonly minContextWindow: number;
}

/**
 * Capacity information for an adapter.
 */
export interface CapacityInfo {
  /** Remaining tokens available */
  readonly remainingTokens: number;
  /** Remaining requests available */
  readonly remainingRequests: number;
  /** Current utilization percentage (0-100) */
  readonly utilizationPercent: number;
  /** Whether capacity is exhausted */
  readonly exhausted: boolean;
  /** When the rate limit resets */
  readonly resetTime: Date;
}

/**
 * Queued task waiting for capacity.
 */
export interface QueuedTask {
  /** Unique task identifier */
  readonly id: string;
  /** Task profile */
  readonly profile: TaskProfile;
  /** Original task description */
  readonly description: string;
  /** Preferred adapter (if any) */
  readonly preferredAdapter?: string;
  /** Time when task was queued */
  readonly queuedAt: Date;
  /** Priority (higher = more important) */
  readonly priority: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Balancer options for configuring scoring weights.
 */
export interface BalancerOptions {
  /** Weight for capability score (default: 0.6) */
  readonly capabilityWeight: number;
  /** Weight for capacity score (default: 0.4) */
  readonly capacityWeight: number;
  /** Minimum capacity threshold to consider adapter (default: 0.1) */
  readonly minCapacityThreshold: number;
  /** Maximum queue size (default: 100) */
  readonly maxQueueSize: number;
  /** Enable debug logging */
  readonly debug: boolean;
}

/**
 * Default balancer options.
 */
export const DEFAULT_BALANCER_OPTIONS: BalancerOptions = {
  capabilityWeight: 0.6,
  capacityWeight: 0.4,
  minCapacityThreshold: 0.1,
  maxQueueSize: 100,
  debug: false,
};

// ============================================================================
// Result Types
// ============================================================================

/**
 * Scoring breakdown for debugging and transparency.
 */
export interface ScoreBreakdown {
  /** Adapter name */
  readonly adapter: string;
  /** Raw capability score (0-10) */
  readonly capabilityScore: number;
  /** Raw capacity score (0-10) */
  readonly capacityScore: number;
  /** Weighted final score */
  readonly finalScore: number;
  /** Reason if adapter was excluded */
  readonly excludedReason?: string;
}

/**
 * Balance result with selected adapter and scoring details.
 */
export interface BalanceResult {
  /** Selected adapter */
  readonly adapter: ICliAdapter;
  /** Score breakdown for all adapters */
  readonly scores: readonly ScoreBreakdown[];
  /** Whether task was queued instead */
  readonly queued: boolean;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Balancing error codes.
 */
export type BalancingErrorCode =
  | 'NO_ADAPTERS'
  | 'ALL_EXHAUSTED'
  | 'QUEUE_FULL'
  | 'INVALID_PROFILE'
  | 'CAPACITY_FETCH_FAILED';

/**
 * Error class for balancing failures.
 */
export class BalancingError extends NexusError {
  readonly balancingCode: BalancingErrorCode;

  constructor(
    message: string,
    balancingCode: BalancingErrorCode,
    options?: { cause?: Error; context?: Record<string, unknown> }
  ) {
    super(message, { code: ErrorCode.AGENT_ERROR, ...options });
    this.name = 'BalancingError';
    this.balancingCode = balancingCode;
  }
}

// ============================================================================
// Interface
// ============================================================================

/**
 * Work balancer interface.
 */
export interface IWorkBalancer {
  /**
   * Balances a task across available adapters.
   */
  balance(
    task: TaskProfile,
    adapters: readonly ICliAdapter[],
    capacities: Map<string, CapacityInfo>
  ): Result<BalanceResult, BalancingError>;

  /**
   * Calculates the total score for an adapter given a task.
   */
  getScore(adapter: ICliAdapter, task: TaskProfile, capacity: CapacityInfo): number;

  /**
   * Calculates capability score based on task requirements.
   */
  getCapabilityScore(capabilities: CapabilityProfile, task: TaskProfile): number;

  /**
   * Calculates capacity score based on available tokens.
   */
  getCapacityScore(capacity: CapacityInfo, task: TaskProfile): number;

  /**
   * Queues a task when all adapters are at capacity.
   */
  queueTask(
    task: TaskProfile,
    description: string,
    priority?: number
  ): Result<QueuedTask, BalancingError>;

  /**
   * Gets the next queued task that can be executed.
   */
  getNextQueuedTask(adapter: ICliAdapter, capacity: CapacityInfo): QueuedTask | undefined;

  /**
   * Removes a task from the queue.
   */
  removeFromQueue(taskId: string): boolean;

  /**
   * Gets current queue status.
   */
  getQueueStatus(): {
    readonly size: number;
    readonly maxSize: number;
    readonly oldestTask?: Date;
  };
}
