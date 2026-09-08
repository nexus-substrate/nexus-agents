/**
 * nexus-agents/cli-adapters - Router Type Definitions
 *
 * Types, interfaces, and error class for task routing.
 * Extracted from router.ts to persist after TaskRouter class removal.
 *
 * @module cli-adapters/router-types
 * (Source: Issue #816 - Remove deprecated routers)
 */

import { z } from 'zod';
import type { Result } from '../core/result.js';
import { NexusError, ErrorCode } from '../core/errors.js';
import type { ILogger } from '../core/logger.js';
import type { Task } from '../core/types/agent.js';
import type { ICliAdapter } from './types.js';

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
  /** Whether to prefer cost-efficient adapters */
  readonly preferCostEfficient?: boolean;
  /**
   * @deprecated Declared but NEVER ENFORCED — nothing on the routing path
   * compares anything to it, and `composite-router.ts` measures
   * `decisionTimeMs` only to record it (#5918). Setting it does not bound
   * routing. `capacity-stage.ts` had to build its own `probeTimeoutMs` race
   * because of this. Scheduled for removal in the next major (#5963); the
   * default is 50 here and in every other declaration since #5918.
   */
  readonly maxDecisionTimeMs?: number;
}

/**
 * Configuration schema for validation.
 */
export const RouterConfigSchema = z.object({
  preferCostEfficient: z.boolean().default(false),
  /**
   * @deprecated Declared but NEVER ENFORCED — nothing on the routing path
   * compares anything to it, and `composite-router.ts` measures
   * `decisionTimeMs` only to record it (#5918). Setting it does not bound
   * routing. `capacity-stage.ts` had to build its own `probeTimeoutMs` race
   * because of this. Scheduled for removal in the next major (#5963); the
   * default is 50 here and in every other declaration since #5918.
   */
  maxDecisionTimeMs: z.number().min(1).max(1000).default(50),
});

/**
 * Task router interface for dependency injection.
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
