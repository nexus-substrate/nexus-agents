/**
 * nexus-agents/cli-adapters - Routing Memory Types
 *
 * Interface contract for memory↔routing integration.
 * Enables MobiMem Evolution (#149) and Preference-Trained Routing (#148).
 *
 * Moved from core/types/routing-memory.ts to fix circular dependency (#286).
 * This module belongs in cli-adapters since it's fundamentally about routing.
 *
 * @module cli-adapters/routing-memory-types
 * (Source: Issue #238, Consensus Vote APPROVED 75%)
 * (Source: docs/proposals/interface-contract-238.md)
 */

import type { Result } from '../core/result.js';
import type { CliName } from './types-core.js';
import type { BudgetConstraint } from './types-routing.js';

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error type for routing memory operations.
 * Self-contained to avoid cross-module dependencies.
 */
export type RoutingMemoryErrorCode =
  | 'STORAGE_FAILED'
  | 'RETRIEVAL_FAILED'
  | 'EXPORT_FAILED'
  | 'IMPORT_FAILED'
  | 'INVALID_DATA';

export class RoutingMemoryError extends Error {
  public readonly code: RoutingMemoryErrorCode;

  constructor(
    message: string,
    code: RoutingMemoryErrorCode = 'STORAGE_FAILED',
    public override readonly cause?: unknown
  ) {
    super(message);
    this.name = 'RoutingMemoryError';
    this.code = code;
  }
}

// ============================================================================
// Preference Storage Types (#148 - Preference-Trained Routing)
// ============================================================================

/**
 * Summary of task profile for storage (avoids circular deps with TaskProfile).
 */
export interface TaskProfileSummary {
  /** Estimated reasoning complexity (0-1) */
  readonly reasoningComplexity: number;
  /** Context tokens required */
  readonly contextRequired: number;
  /** Whether code generation is primary task */
  readonly codeGeneration: boolean;
  /** Task type classification */
  readonly taskType: 'reasoning' | 'knowledge' | 'code' | 'mixed';
}

/**
 * Record of a routing decision.
 */
export interface RoutingDecisionRecord {
  /** Unique decision ID */
  readonly id: string;
  /** When the decision was made */
  readonly timestamp: Date;
  /** Associated task ID */
  readonly taskId: string;
  /** Task type classification */
  readonly taskType: string;
  /** Summary of task profile */
  readonly taskProfile: TaskProfileSummary;
  /** CLI selected for execution */
  readonly selectedCli: CliName;
  /** Confidence score (0-1) */
  readonly confidence: number;
  /** Alternative CLIs considered */
  readonly alternatives: readonly CliName[];
  /** Reasoning for selection */
  readonly reason: string;
  /** Budget constraint applied (if any) */
  readonly budgetConstraint?: BudgetConstraint;
}

/**
 * Record of a task outcome.
 */
export interface TaskOutcomeRecord {
  /** Associated decision ID */
  readonly decisionId: string;
  /** Whether task succeeded */
  readonly success: boolean;
  /** Quality score (0-1) */
  readonly qualityScore: number;
  /** Execution duration in milliseconds */
  readonly durationMs: number;
  /** Token usage */
  readonly tokenUsage: number;
  /** Number of retries */
  readonly retryCount: number;
  /** Error category (if failed) */
  readonly errorCategory?: string;
}

/**
 * Explicit preference signal from human or AI feedback.
 */
export interface PreferenceSignal {
  /** Source of the preference */
  readonly source: 'human' | 'ai' | 'implicit';
  /** Preferred CLI for this task type */
  readonly preferred: CliName;
  /** Rejected CLI (if comparative preference) */
  readonly rejected?: CliName;
  /** Optional reasoning */
  readonly reason?: string;
  /** Confidence in the preference (0-1) */
  readonly confidence: number;
}

/**
 * Combined preference record for training.
 */
export interface PreferenceRecord {
  /** The routing decision */
  readonly decision: RoutingDecisionRecord;
  /** The task outcome */
  readonly outcome: TaskOutcomeRecord;
  /** Explicit preference (if provided) */
  readonly preference?: PreferenceSignal;
  /** Computed reward signal */
  readonly computedReward: number;
}

/**
 * Filter for preference queries.
 */
export interface PreferenceFilter {
  /** Filter by task type */
  readonly taskType?: string;
  /** Filter by CLI name */
  readonly cliName?: CliName;
  /** Records after this date */
  readonly since?: Date;
  /** Records before this date */
  readonly until?: Date;
  /** Minimum quality score */
  readonly minQuality?: number;
  /** Filter by preference source */
  readonly preferenceSource?: 'human' | 'ai' | 'implicit';
}

// ============================================================================
// Experience Memory Types (#149 - MobiMem Evolution)
// ============================================================================

/**
 * Step within an experience record.
 */
export interface ExperienceStep {
  /** Step index */
  readonly index: number;
  /** Action taken */
  readonly action: string;
  /** Observation/result */
  readonly observation: string;
  /** Duration in milliseconds */
  readonly durationMs: number;
}

/**
 * Experience record for MobiMem Evolution.
 */
export interface ExperienceRecord {
  /** Unique experience ID */
  readonly id: string;
  /** When the experience occurred */
  readonly timestamp: Date;
  /** Task type */
  readonly taskType: string;
  /** Description of the task */
  readonly taskDescription: string;
  /** Steps taken during execution */
  readonly steps: readonly ExperienceStep[];
  /** Whether the task succeeded */
  readonly success: boolean;
  /** Key learnings from this experience */
  readonly learnings: string;
}

// ============================================================================
// Action Memory Types (#149 - MobiMem Evolution)
// ============================================================================

/**
 * Action record for caching successful patterns.
 */
export interface ActionRecord {
  /** Unique action ID */
  readonly id: string;
  /** Task type this action applies to */
  readonly taskType: string;
  /** Pattern description */
  readonly pattern: string;
  /** Number of times this action was used */
  readonly usageCount: number;
  /** Success rate (0-1) */
  readonly successRate: number;
  /** Average duration in milliseconds */
  readonly avgDurationMs: number;
  /** Last time this action was used */
  readonly lastUsed: Date;
}

// ============================================================================
// Export/Import Types
// ============================================================================

/**
 * Export format for routing memory.
 * Version field enables future schema migrations.
 */
export interface RoutingMemoryExport {
  /** Schema version */
  readonly version: '1.0';
  /** When the export was created */
  readonly exportedAt: Date;
  /** Preference records */
  readonly preferences: readonly PreferenceRecord[];
  /** Experience records */
  readonly experiences: readonly ExperienceRecord[];
  /** Action records */
  readonly actions: readonly ActionRecord[];
}

/**
 * Statistics for routing memory.
 */
export interface RoutingMemoryStats {
  /** Total preference records */
  readonly preferenceCount: number;
  /** Total experience records */
  readonly experienceCount: number;
  /** Total action records */
  readonly actionCount: number;
  /** Oldest record timestamp */
  readonly oldestRecord: Date | null;
  /** Newest record timestamp */
  readonly newestRecord: Date | null;
  /** Estimated storage size in bytes */
  readonly totalStorageBytes: number;
}

// ============================================================================
// Main Interface
// ============================================================================

/**
 * Memory interface for routing-related data.
 * Bridges memory backend and routing systems.
 *
 * This interface enables:
 * - #148 Preference-Trained Routing: Store preferences and outcomes
 * - #149 MobiMem Evolution: Store experiences and action patterns
 *
 * @example
 * ```typescript
 * const routingMemory = createRoutingMemory(memoryBackend);
 *
 * // Store a routing decision and outcome
 * await routingMemory.storePreference(decision, outcome, preference);
 *
 * // Get preferences for training
 * const prefs = await routingMemory.getPreferences({ taskType: 'code' }, 100);
 *
 * // Store experience for MobiMem
 * await routingMemory.storeExperience(experience);
 * ```
 */
export interface IRoutingMemory {
  // ===========================================================================
  // Preference Storage (#148 - Preference-Trained Routing)
  // ===========================================================================

  /**
   * Store a routing decision with its outcome for preference learning.
   * @param decision - The routing decision made
   * @param outcome - The task outcome (success, quality, duration)
   * @param preference - Optional explicit preference signal
   */
  storePreference(
    decision: RoutingDecisionRecord,
    outcome: TaskOutcomeRecord,
    preference?: PreferenceSignal
  ): Promise<Result<void, RoutingMemoryError>>;

  /**
   * Retrieve preference data for training.
   * @param filter - Filter criteria for preferences
   * @param limit - Maximum records to return
   */
  getPreferences(
    filter: PreferenceFilter,
    limit: number
  ): Promise<Result<PreferenceRecord[], RoutingMemoryError>>;

  // ===========================================================================
  // Experience Memory (#149 - MobiMem Evolution)
  // ===========================================================================

  /**
   * Store an experience record for evolution.
   * @param experience - The experience to store
   */
  storeExperience(experience: ExperienceRecord): Promise<Result<void, RoutingMemoryError>>;

  /**
   * Retrieve relevant experiences for a task.
   * @param query - Semantic query for experience retrieval
   * @param limit - Maximum experiences to return
   */
  getExperiences(
    query: string,
    limit: number
  ): Promise<Result<ExperienceRecord[], RoutingMemoryError>>;

  // ===========================================================================
  // Action Memory (#149 - MobiMem Evolution)
  // ===========================================================================

  /**
   * Store a successful action pattern.
   * @param action - The action pattern to cache
   */
  storeAction(action: ActionRecord): Promise<Result<void, RoutingMemoryError>>;

  /**
   * Retrieve cached actions for a task type.
   * @param taskType - Type of task
   * @param limit - Maximum actions to return
   */
  getActions(taskType: string, limit: number): Promise<Result<ActionRecord[], RoutingMemoryError>>;

  // ===========================================================================
  // Export/Import
  // ===========================================================================

  /**
   * Export all routing memory for training or backup.
   */
  export(): Promise<Result<RoutingMemoryExport, RoutingMemoryError>>;

  /**
   * Import routing memory from export.
   * @param data - The exported data to import
   */
  import(data: RoutingMemoryExport): Promise<Result<void, RoutingMemoryError>>;

  // ===========================================================================
  // Statistics
  // ===========================================================================

  /**
   * Get memory statistics.
   */
  getStats(): Promise<Result<RoutingMemoryStats, RoutingMemoryError>>;
}
