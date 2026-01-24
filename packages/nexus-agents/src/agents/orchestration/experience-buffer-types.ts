/**
 * Experience Buffer Types and Schemas
 *
 * Type definitions, interfaces, and Zod schemas for the experience buffer.
 *
 * @module agents/orchestration/experience-buffer-types
 * (Source: Issue #379, Issue #154)
 */

import { z } from 'zod';
import type { PolicyTrajectoryStep } from './policy-types.js';

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Configuration for the experience buffer.
 */
export interface ExperienceBufferConfig {
  /** Maximum trajectories to store (default: 10000) */
  readonly maxCapacity?: number;
  /** Priority sampling enabled (default: false) */
  readonly prioritySampling?: boolean;
  /** Priority exponent for prioritized sampling (default: 0.6) */
  readonly priorityExponent?: number;
}

/** Default experience buffer configuration. */
export const DEFAULT_EXPERIENCE_BUFFER_CONFIG: Required<ExperienceBufferConfig> = {
  maxCapacity: 10000,
  prioritySampling: false,
  priorityExponent: 0.6,
};

// =============================================================================
// Episode Types
// =============================================================================

/**
 * A complete episode of interaction.
 */
export interface Episode {
  /** Unique episode ID */
  readonly id: string;
  /** Session ID from orchestrator */
  readonly sessionId: string;
  /** Steps in this episode */
  readonly steps: readonly PolicyTrajectoryStep[];
  /** Total reward for episode */
  readonly totalReward: number;
  /** Episode timestamp */
  readonly timestamp: Date;
}

/**
 * A batch of sampled steps for training.
 */
export interface SampledBatch {
  /** Sampled steps */
  readonly steps: PolicyTrajectoryStep[];
  /** Episode IDs for the steps */
  readonly episodeIds: string[];
  /** Importance weights (for prioritized sampling) */
  readonly weights: number[];
}

/**
 * Statistics about the buffer state.
 */
export interface BufferStats {
  /** Total number of episodes */
  readonly episodeCount: number;
  /** Total number of steps across all episodes */
  readonly totalSteps: number;
  /** Average episode length */
  readonly avgEpisodeLength: number;
  /** Average total reward */
  readonly avgTotalReward: number;
  /** Buffer utilization (steps / capacity) */
  readonly utilization: number;
}

// =============================================================================
// Serialization Types
// =============================================================================

/**
 * JSON-serializable episode representation.
 */
export interface SerializedEpisode {
  readonly id: string;
  readonly sessionId: string;
  readonly steps: readonly PolicyTrajectoryStep[];
  readonly totalReward: number;
  readonly timestamp: string;
}

/**
 * JSON-serializable buffer representation.
 */
export interface SerializedBuffer {
  readonly version: string;
  readonly config: Required<ExperienceBufferConfig>;
  readonly episodes: readonly SerializedEpisode[];
  readonly totalStepsCount: number;
}

// =============================================================================
// Internal Types
// =============================================================================

/**
 * A step with its associated episode ID for sampling operations.
 */
export interface StepWithEpisodeId {
  readonly step: PolicyTrajectoryStep;
  readonly episodeId: string;
}

/**
 * A sampled step with probability information for importance weighting.
 */
export interface SampledStepWithProb {
  readonly step: PolicyTrajectoryStep;
  readonly episodeId: string;
  readonly prob: number;
}

// =============================================================================
// Zod Schemas
// =============================================================================

/** Schema for ExperienceBufferConfig. */
export const ExperienceBufferConfigSchema = z.object({
  maxCapacity: z.number().int().positive().max(1000000).optional(),
  prioritySampling: z.boolean().optional(),
  priorityExponent: z.number().min(0).max(1).optional(),
});
