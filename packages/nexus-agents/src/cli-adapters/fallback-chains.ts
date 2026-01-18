/**
 * nexus-agents/cli-adapters - Fallback Chain Registry
 *
 * Configurable fallback chains per task type with metrics tracking.
 * Provides ordered CLI preferences based on task classification.
 *
 * @module cli-adapters/fallback-chains
 * (Source: Issue #362 - Task-type-aware fallback chains)
 */

import { z } from 'zod';
import type { CliName } from './types-core.js';
import type { FallbackTaskType } from './task-classifier.js';

/**
 * Fallback chain: ordered list of CLIs to try for a task type.
 */
export type FallbackChain = readonly CliName[];

/**
 * Registry mapping task types to fallback chains.
 */
export type FallbackChainRegistry = Readonly<Record<FallbackTaskType, FallbackChain>>;

/**
 * Metrics for tracking fallback chain success rates.
 */
export interface FallbackChainMetrics {
  /** Total attempts for this task type */
  readonly totalAttempts: number;
  /** Successes by position in chain (0-indexed) */
  readonly successByPosition: readonly number[];
  /** Failures (exhausted all positions) */
  readonly exhaustedCount: number;
  /** Average position of successful attempt (lower is better) */
  readonly avgSuccessPosition: number;
}

/**
 * Metrics for all task types.
 */
export type FallbackMetricsRegistry = Readonly<Record<FallbackTaskType, FallbackChainMetrics>>;

/**
 * Outcome of a fallback chain execution.
 */
export interface FallbackOutcome {
  /** Task type that was classified */
  readonly taskType: FallbackTaskType;
  /** Position in chain that succeeded (0-indexed), or -1 if exhausted */
  readonly successPosition: number;
  /** CLI that succeeded, or undefined if exhausted */
  readonly successfulCli?: CliName | undefined;
  /** Whether the chain was exhausted without success */
  readonly exhausted: boolean;
}

/**
 * Zod schema for fallback chain validation.
 */
export const FallbackChainSchema = z
  .array(z.enum(['claude', 'gemini', 'codex']))
  .min(1)
  .readonly();

/**
 * Zod schema for fallback chain registry.
 */
export const FallbackChainRegistrySchema = z.object({
  code: FallbackChainSchema,
  research: FallbackChainSchema,
  documentation: FallbackChainSchema,
  analysis: FallbackChainSchema,
  general: FallbackChainSchema,
});

/**
 * Default fallback chains optimized for each task type.
 *
 * - code: Claude excels at code, Codex is specialized, Gemini as backup
 * - research: Claude for reasoning, Gemini for large context research
 * - documentation: Claude for writing, Gemini for large docs
 * - analysis: Claude for deep analysis, Gemini for breadth
 * - general: Balanced fallback order
 */
export const DEFAULT_FALLBACK_CHAINS: FallbackChainRegistry = {
  code: ['claude', 'codex', 'gemini'],
  research: ['claude', 'gemini', 'codex'],
  documentation: ['claude', 'gemini', 'codex'],
  analysis: ['claude', 'gemini', 'codex'],
  general: ['claude', 'gemini', 'codex'],
} as const;

/**
 * Creates initial empty metrics for a task type.
 */
function createEmptyMetrics(): FallbackChainMetrics {
  return {
    totalAttempts: 0,
    successByPosition: [0, 0, 0],
    avgSuccessPosition: 0,
    exhaustedCount: 0,
  };
}

/**
 * Creates initial metrics registry with empty metrics for all types.
 */
function createEmptyMetricsRegistry(): Record<FallbackTaskType, FallbackChainMetrics> {
  return {
    code: createEmptyMetrics(),
    research: createEmptyMetrics(),
    documentation: createEmptyMetrics(),
    analysis: createEmptyMetrics(),
    general: createEmptyMetrics(),
  };
}

/**
 * Gets the fallback chain for a task type.
 *
 * @param taskType - Task type to get chain for
 * @param registry - Optional custom registry (uses default if not provided)
 * @returns Ordered list of CLIs to try
 *
 * @example
 * ```typescript
 * const chain = getFallbackChain('code');
 * // chain === ['claude', 'codex', 'gemini']
 * ```
 */
export function getFallbackChain(
  taskType: FallbackTaskType,
  registry: FallbackChainRegistry = DEFAULT_FALLBACK_CHAINS
): FallbackChain {
  return registry[taskType];
}

/**
 * Filters a fallback chain to only include available CLIs.
 *
 * @param chain - Original fallback chain
 * @param availableClis - Set of currently available CLI names
 * @returns Filtered chain with only available CLIs
 *
 * @example
 * ```typescript
 * const filtered = filterAvailableClis(['claude', 'codex', 'gemini'], new Set(['claude', 'gemini']));
 * // filtered === ['claude', 'gemini']
 * ```
 */
export function filterAvailableClis(
  chain: FallbackChain,
  availableClis: ReadonlySet<CliName>
): CliName[] {
  return chain.filter((cli) => availableClis.has(cli));
}

/**
 * Gets the next CLI to try in a fallback chain.
 *
 * @param chain - Fallback chain
 * @param currentPosition - Current position (0-indexed)
 * @returns Next CLI to try, or undefined if chain is exhausted
 */
export function getNextCli(chain: FallbackChain, currentPosition: number): CliName | undefined {
  const nextPosition = currentPosition + 1;
  return chain[nextPosition];
}

/**
 * Checks if a fallback chain is exhausted at the given position.
 *
 * @param chain - Fallback chain
 * @param currentPosition - Current position (0-indexed)
 * @returns True if no more CLIs to try
 */
export function isChainExhausted(chain: FallbackChain, currentPosition: number): boolean {
  return currentPosition >= chain.length - 1;
}

/**
 * Fallback chain manager with metrics tracking.
 */
export class FallbackChainManager {
  private readonly registry: FallbackChainRegistry;
  private readonly metrics: Record<FallbackTaskType, FallbackChainMetrics>;

  constructor(registry: FallbackChainRegistry = DEFAULT_FALLBACK_CHAINS) {
    this.registry = registry;
    this.metrics = createEmptyMetricsRegistry();
  }

  /**
   * Gets the fallback chain for a task type.
   */
  getChain(taskType: FallbackTaskType): FallbackChain {
    return getFallbackChain(taskType, this.registry);
  }

  /**
   * Gets the chain filtered by available CLIs.
   */
  getAvailableChain(taskType: FallbackTaskType, availableClis: ReadonlySet<CliName>): CliName[] {
    const chain = this.getChain(taskType);
    return filterAvailableClis(chain, availableClis);
  }

  /**
   * Records an outcome and updates metrics.
   *
   * @param outcome - The outcome to record
   */
  recordOutcome(outcome: FallbackOutcome): void {
    const currentMetrics = this.metrics[outcome.taskType];
    const newSuccessByPosition = [...currentMetrics.successByPosition];

    // Update success counts
    if (!outcome.exhausted && outcome.successPosition >= 0) {
      const position = outcome.successPosition;
      if (position < newSuccessByPosition.length) {
        const currentCount = newSuccessByPosition[position] ?? 0;
        newSuccessByPosition[position] = currentCount + 1;
      } else {
        // Extend array if needed
        while (newSuccessByPosition.length <= position) {
          newSuccessByPosition.push(0);
        }
        newSuccessByPosition[position] = 1;
      }
    }

    // Calculate new average success position
    const totalSuccesses = newSuccessByPosition.reduce((sum, count) => sum + count, 0);
    const weightedSum = newSuccessByPosition.reduce((sum, count, pos) => sum + count * pos, 0);
    const avgSuccessPosition = totalSuccesses > 0 ? weightedSum / totalSuccesses : 0;

    // Update metrics
    this.metrics[outcome.taskType] = {
      totalAttempts: currentMetrics.totalAttempts + 1,
      successByPosition: newSuccessByPosition,
      exhaustedCount: currentMetrics.exhaustedCount + (outcome.exhausted ? 1 : 0),
      avgSuccessPosition,
    };
  }

  /**
   * Gets metrics for a specific task type.
   */
  getMetrics(taskType: FallbackTaskType): FallbackChainMetrics {
    return this.metrics[taskType];
  }

  /**
   * Gets metrics for all task types.
   */
  getAllMetrics(): FallbackMetricsRegistry {
    return { ...this.metrics };
  }

  /**
   * Gets the success rate at each position for a task type.
   *
   * @param taskType - Task type to get rates for
   * @returns Array of success rates (0-1) by position
   */
  getSuccessRatesByPosition(taskType: FallbackTaskType): readonly number[] {
    const metrics = this.metrics[taskType];
    if (metrics.totalAttempts === 0) {
      return [];
    }
    return metrics.successByPosition.map((count) => count / metrics.totalAttempts);
  }

  /**
   * Gets overall success rate for a task type.
   */
  getOverallSuccessRate(taskType: FallbackTaskType): number {
    const metrics = this.metrics[taskType];
    if (metrics.totalAttempts === 0) {
      return 0;
    }
    const totalSuccesses = metrics.successByPosition.reduce((sum, count) => sum + count, 0);
    return totalSuccesses / metrics.totalAttempts;
  }

  /**
   * Resets metrics for all task types.
   */
  resetMetrics(): void {
    const types: FallbackTaskType[] = ['code', 'research', 'documentation', 'analysis', 'general'];
    for (const type of types) {
      this.metrics[type] = createEmptyMetrics();
    }
  }
}

/**
 * Creates a new FallbackChainManager instance.
 *
 * @param registry - Optional custom fallback chain registry
 * @returns New FallbackChainManager instance
 */
export function createFallbackChainManager(registry?: FallbackChainRegistry): FallbackChainManager {
  return new FallbackChainManager(registry);
}

/**
 * Creates a custom fallback chain registry by merging with defaults.
 *
 * @param overrides - Partial registry with overrides
 * @returns Complete registry with defaults for unspecified types
 */
export function createFallbackChainRegistry(
  overrides: Partial<FallbackChainRegistry>
): FallbackChainRegistry {
  return {
    ...DEFAULT_FALLBACK_CHAINS,
    ...overrides,
  };
}
