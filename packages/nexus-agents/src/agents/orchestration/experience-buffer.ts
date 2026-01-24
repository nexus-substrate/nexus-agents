/**
 * Experience Buffer for RL Policy Learning
 *
 * Stores policy trajectories (state, action, reward, logProb) for batch training.
 * Implements memory management with configurable capacity and FIFO eviction.
 *
 * @module agents/orchestration/experience-buffer
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
interface SerializedEpisode {
  readonly id: string;
  readonly sessionId: string;
  readonly steps: readonly PolicyTrajectoryStep[];
  readonly totalReward: number;
  readonly timestamp: string;
}

/**
 * JSON-serializable buffer representation.
 */
interface SerializedBuffer {
  readonly version: string;
  readonly config: Required<ExperienceBufferConfig>;
  readonly episodes: readonly SerializedEpisode[];
  readonly totalStepsCount: number;
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

// =============================================================================
// Experience Buffer Implementation
// =============================================================================

/**
 * Experience buffer for storing and sampling RL trajectories.
 *
 * Implements:
 * - FIFO eviction when at capacity
 * - Random or priority-based sampling
 * - Episode boundary tracking
 * - JSON serialization for persistence
 */
export class ExperienceBuffer {
  private readonly config: Required<ExperienceBufferConfig>;
  private episodes: Episode[] = [];
  private totalStepsCount = 0;

  /**
   * Creates a new experience buffer.
   * @param config - Buffer configuration
   */
  constructor(config: ExperienceBufferConfig = {}) {
    this.config = { ...DEFAULT_EXPERIENCE_BUFFER_CONFIG, ...config };
  }

  /**
   * Adds a completed episode to the buffer.
   * Evicts oldest episodes if capacity is exceeded.
   *
   * @param sessionId - Session ID from the orchestrator
   * @param steps - Policy trajectory steps from the episode
   * @returns The generated episode ID
   */
  addEpisode(sessionId: string, steps: PolicyTrajectoryStep[]): string {
    if (steps.length === 0) {
      throw new Error('Cannot add empty episode');
    }

    const totalReward = this.computeTotalReward(steps);
    const episode: Episode = {
      id: crypto.randomUUID(),
      sessionId,
      steps: [...steps],
      totalReward,
      timestamp: new Date(),
    };

    this.episodes.push(episode);
    this.totalStepsCount += steps.length;

    this.enforceCapacity();

    return episode.id;
  }

  /**
   * Samples a batch of steps for training.
   *
   * @param batchSize - Number of steps to sample
   * @returns Sampled batch with steps, episode IDs, and weights
   */
  sampleBatch(batchSize: number): SampledBatch {
    if (batchSize <= 0) {
      return { steps: [], episodeIds: [], weights: [] };
    }

    if (this.totalStepsCount === 0) {
      return { steps: [], episodeIds: [], weights: [] };
    }

    const effectiveBatchSize = Math.min(batchSize, this.totalStepsCount);

    if (this.config.prioritySampling) {
      return this.sampleWithPriority(effectiveBatchSize);
    }

    return this.sampleUniformly(effectiveBatchSize);
  }

  /**
   * Retrieves an episode by ID.
   *
   * @param episodeId - The episode ID to look up
   * @returns The episode if found, undefined otherwise
   */
  getEpisode(episodeId: string): Episode | undefined {
    return this.episodes.find((ep) => ep.id === episodeId);
  }

  /**
   * Retrieves the most recent episodes.
   *
   * @param count - Number of episodes to retrieve
   * @returns Array of recent episodes (newest first)
   */
  getRecentEpisodes(count: number): Episode[] {
    if (count <= 0) {
      return [];
    }

    const startIdx = Math.max(0, this.episodes.length - count);
    return this.episodes.slice(startIdx).reverse();
  }

  /**
   * Returns the total number of steps across all episodes.
   */
  getTotalSteps(): number {
    return this.totalStepsCount;
  }

  /**
   * Returns the number of episodes in the buffer.
   */
  getEpisodeCount(): number {
    return this.episodes.length;
  }

  /**
   * Returns buffer statistics.
   */
  getStats(): BufferStats {
    const episodeCount = this.episodes.length;
    const totalSteps = this.totalStepsCount;

    if (episodeCount === 0) {
      return {
        episodeCount: 0,
        totalSteps: 0,
        avgEpisodeLength: 0,
        avgTotalReward: 0,
        utilization: 0,
      };
    }

    const totalRewardSum = this.episodes.reduce((sum, ep) => sum + ep.totalReward, 0);

    return {
      episodeCount,
      totalSteps,
      avgEpisodeLength: totalSteps / episodeCount,
      avgTotalReward: totalRewardSum / episodeCount,
      utilization: totalSteps / this.config.maxCapacity,
    };
  }

  /**
   * Clears all episodes from the buffer.
   */
  clear(): void {
    this.episodes = [];
    this.totalStepsCount = 0;
  }

  /**
   * Serializes the buffer to JSON.
   */
  toJSON(): SerializedBuffer {
    return {
      version: '1.0.0',
      config: this.config,
      episodes: this.episodes.map((ep) => ({
        id: ep.id,
        sessionId: ep.sessionId,
        steps: ep.steps,
        totalReward: ep.totalReward,
        timestamp: ep.timestamp.toISOString(),
      })),
      totalStepsCount: this.totalStepsCount,
    };
  }

  /**
   * Creates a buffer from serialized JSON.
   *
   * @param json - Serialized buffer data
   * @returns New ExperienceBuffer instance
   */
  static fromJSON(json: SerializedBuffer): ExperienceBuffer {
    const buffer = new ExperienceBuffer(json.config);

    buffer.episodes = json.episodes.map((ep) => ({
      id: ep.id,
      sessionId: ep.sessionId,
      steps: ep.steps,
      totalReward: ep.totalReward,
      timestamp: new Date(ep.timestamp),
    }));

    buffer.totalStepsCount = json.totalStepsCount;

    return buffer;
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  /**
   * Computes total reward for an episode.
   */
  private computeTotalReward(steps: readonly PolicyTrajectoryStep[]): number {
    return steps.reduce((sum, step) => sum + step.reward, 0);
  }

  /**
   * Enforces capacity limit by removing oldest episodes.
   */
  private enforceCapacity(): void {
    while (this.totalStepsCount > this.config.maxCapacity && this.episodes.length > 0) {
      const oldest = this.episodes.shift();
      if (oldest) {
        this.totalStepsCount -= oldest.steps.length;
      }
    }
  }

  /**
   * Samples steps uniformly at random using reservoir sampling (Algorithm R).
   * Optimized for O(k) memory where k = batchSize, instead of O(n) for full array copy.
   * @see Issue #402 - Performance optimization
   */
  private sampleUniformly(batchSize: number): SampledBatch {
    // Use reservoir sampling to avoid full array materialization
    const reservoir: Array<{ step: PolicyTrajectoryStep; episodeId: string }> = [];
    let count = 0;

    for (const episode of this.episodes) {
      for (const step of episode.steps) {
        count++;
        if (reservoir.length < batchSize) {
          // Fill reservoir until we have enough samples
          reservoir.push({ step, episodeId: episode.id });
        } else {
          // Algorithm R: replace with probability k/n
          const j = Math.floor(Math.random() * count);
          if (j < batchSize) {
            reservoir[j] = { step, episodeId: episode.id };
          }
        }
      }
    }

    return {
      steps: reservoir.map((s) => s.step),
      episodeIds: reservoir.map((s) => s.episodeId),
      weights: reservoir.map(() => 1.0),
    };
  }

  /**
   * Samples steps with priority based on absolute TD error (approximated by reward magnitude).
   * Note: This method still uses full array flattening. For very large buffers,
   * consider using weighted reservoir sampling (Efraimidis & Spirakis algorithm).
   * @see Issue #402 - Future optimization opportunity
   */
  private sampleWithPriority(batchSize: number): SampledBatch {
    const allStepsWithEpisode = this.flattenStepsWithEpisodeIds();

    // Compute priorities (using absolute reward as proxy for TD error)
    const priorities = allStepsWithEpisode.map((s) =>
      Math.pow(Math.abs(s.step.reward) + 0.01, this.config.priorityExponent)
    );

    const totalPriority = priorities.reduce((sum, p) => sum + p, 0);
    const probabilities = priorities.map((p) => p / totalPriority);

    // Sample with replacement according to probabilities
    const sampled: Array<{ step: PolicyTrajectoryStep; episodeId: string; prob: number }> = [];

    for (let i = 0; i < batchSize; i++) {
      const idx = this.weightedRandomIndex(probabilities);
      const item = allStepsWithEpisode[idx];
      if (item) {
        sampled.push({ step: item.step, episodeId: item.episodeId, prob: probabilities[idx] ?? 1 });
      }
    }

    // Compute importance sampling weights
    const maxWeight = 1.0 / (this.totalStepsCount * Math.min(...sampled.map((s) => s.prob)));
    const weights = sampled.map((s) => {
      const weight = 1.0 / (this.totalStepsCount * s.prob);
      return weight / maxWeight; // Normalize to [0, 1]
    });

    return {
      steps: sampled.map((s) => s.step),
      episodeIds: sampled.map((s) => s.episodeId),
      weights,
    };
  }

  /**
   * Flattens all steps with their episode IDs.
   */
  private flattenStepsWithEpisodeIds(): Array<{ step: PolicyTrajectoryStep; episodeId: string }> {
    const result: Array<{ step: PolicyTrajectoryStep; episodeId: string }> = [];

    for (const episode of this.episodes) {
      for (const step of episode.steps) {
        result.push({ step, episodeId: episode.id });
      }
    }

    return result;
  }

  /**
   * Returns a random index weighted by probabilities.
   */
  private weightedRandomIndex(probabilities: number[]): number {
    const r = Math.random();
    let cumulative = 0;

    for (let i = 0; i < probabilities.length; i++) {
      cumulative += probabilities[i] ?? 0;
      if (r < cumulative) {
        return i;
      }
    }

    return probabilities.length - 1;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Creates a new ExperienceBuffer instance.
 *
 * @param config - Buffer configuration
 * @returns New ExperienceBuffer
 */
export function createExperienceBuffer(config?: ExperienceBufferConfig): ExperienceBuffer {
  return new ExperienceBuffer(config);
}
