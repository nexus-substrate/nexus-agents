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
import type { TaskCategory } from '../config/task-specialization-types.js';

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
  .array(z.enum(['claude', 'gemini', 'codex', 'opencode']))
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
 * Default fallback chains derived from the task specialization matrix.
 * Each chain orders CLIs by: primary → secondary → others.
 *
 * - code: Codex primary (92.4% code_gen), Claude secondary
 * - research: Gemini primary (86.8% research), Claude secondary
 * - documentation: Gemini primary (71.4% docs), Claude secondary
 * - analysis: Claude primary (architecture/security/planning), Codex secondary
 * - general: Balanced fallback order
 */
export const DEFAULT_FALLBACK_CHAINS: FallbackChainRegistry = {
  // code_generation/code_review/testing: codex primary, claude secondary
  code: ['codex', 'claude', 'gemini', 'opencode'],
  // research/exploration: gemini primary, claude secondary
  research: ['gemini', 'claude', 'codex', 'opencode'],
  // documentation: gemini primary, claude secondary
  documentation: ['gemini', 'claude', 'codex', 'opencode'],
  // architecture/security/planning: claude primary, gemini secondary
  // Weather data: gemini arch 66.7% (n=24) > codex 33.3% (n=3)
  analysis: ['claude', 'gemini', 'codex', 'opencode'],
  // general: balanced order
  general: ['claude', 'gemini', 'codex', 'opencode'],
} as const;

/**
 * Per-category fallback chain overrides.
 *
 * Categories in the same FallbackTaskType bucket may need different CLI ordering.
 * Entries here override the bucket-level chain from DEFAULT_FALLBACK_CHAINS.
 *
 * Weather data 2026-03-09:
 * - architecture: gemini 69.6% (n=23) > claude 40.9% (n=235) → gemini first
 * - planning: claude 92.2% → keep claude first (bucket default)
 * - security_review: codex 60% (n=5) > gemini 53.8% (n=13) > claude 54.2% (n=382) → codex first
 * - exploration: gemini 100% (n=307) > claude 83.9% (n=380) → gemini first, codex secondary (#1526)
 * - devops: claude 80% (n=5), gemini 100% (n=1) → keep claude first, gemini secondary (#1526)
 * - research: gemini 86.8% (n=38) > claude 84.1% (n=44) > codex 15% (n=20) → gemini first, codex last (#1536)
 * - documentation: gemini 71.4% (n=35) > claude 64.7% (n=17) > codex 33.3% (n=6) → gemini first, codex last (#1536)
 * - code_review: claude 91% (n=200) > codex 89.2% (n=93) > gemini 37.5% (n=8) → claude first (#1401)
 */
export const CATEGORY_CHAIN_OVERRIDES: Partial<Record<TaskCategory, FallbackChain>> = {
  architecture: ['gemini', 'claude', 'codex', 'opencode'],
  security_review: ['codex', 'gemini', 'claude', 'opencode'],
  code_review: ['claude', 'codex', 'gemini', 'opencode'],
  exploration: ['gemini', 'codex', 'claude', 'opencode'],
  devops: ['claude', 'gemini', 'codex', 'opencode'],
  // codex has 15% research success (n=20) — push to last position (#1536)
  research: ['gemini', 'claude', 'opencode', 'codex'],
  // codex has 33.3% docs success (n=6) — push to last position (#1536)
  documentation: ['gemini', 'claude', 'opencode', 'codex'],
} as const;

/**
 * Categories whose `CATEGORY_CHAIN_OVERRIDES` entry is **policy-bearing**, not
 * just a performance preference.
 *
 * For these categories, when every CLI in the override chain is unavailable
 * (e.g. all rate-limited, all in circuit-open state), `applyCategoryOverride`
 * fails the route with a `CompositeRoutingError` instead of silently falling
 * back to the original candidate set. The fallback would otherwise route the
 * task to a CLI the operator has explicitly excluded for trust / quality-floor
 * reasons. (#2417)
 *
 * Empty by default — operators promote categories case by case via PR review.
 * This is an intentional governance choice: deciding which categories qualify
 * as "sensitive" is a policy call that the autonomous loop does not make. The
 * Round 9 architect/security panel called out exactly this scoping boundary
 * when #2417 was filed.
 *
 * To promote a category: add it to this set and document the rationale in the
 * commit message + PR description (e.g. "security_review involves trust-tier-3
 * input that must not flow through claude until #1525 success rate recovers").
 */
export const SENSITIVE_CATEGORIES: ReadonlySet<TaskCategory> = new Set();

/**
 * `true` when this category's CATEGORY_CHAIN_OVERRIDES entry is fail-closed
 * — i.e. an empty filtered candidate set must abort routing rather than fall
 * back. See `SENSITIVE_CATEGORIES` for the policy framing.
 */
export function isCategoryFailClosed(category: TaskCategory): boolean {
  return SENSITIVE_CATEGORIES.has(category);
}

/**
 * Gets the fallback chain for a specific TaskCategory.
 * Returns a category-specific override if available, otherwise falls through
 * to the bucket-level chain via CATEGORY_TO_FALLBACK mapping.
 */
export function getFallbackChainForCategory(
  category: TaskCategory,
  bucketType: FallbackTaskType,
  registry: FallbackChainRegistry = DEFAULT_FALLBACK_CHAINS
): FallbackChain {
  const override = CATEGORY_CHAIN_OVERRIDES[category];
  if (override !== undefined) return override;
  return registry[bucketType];
}

/**
 * Creates initial empty metrics for a task type.
 */
function createEmptyMetrics(): FallbackChainMetrics {
  return {
    totalAttempts: 0,
    successByPosition: [0, 0, 0, 0],
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
