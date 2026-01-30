/**
 * Experience Buffer for RL Policy Learning
 *
 * Stores policy trajectories (state, action, reward, logProb) for batch training.
 * Implements memory management with configurable capacity and FIFO eviction.
 *
 * @module agents/orchestration/experience-buffer
 * (Source: Issue #379, Issue #154)
 */

import { getTimeProvider } from '../../core/index.js';
import type { PolicyTrajectoryStep } from './policy-types.js';
import type {
  ExperienceBufferConfig,
  Episode,
  SampledBatch,
  BufferStats,
  SerializedBuffer,
} from './experience-buffer-types.js';
import { DEFAULT_EXPERIENCE_BUFFER_CONFIG } from './experience-buffer-types.js';
import { sampleUniformly, sampleWithPriority } from './experience-buffer-sampling.js';

// =============================================================================
// Re-exports for backward compatibility
// =============================================================================

export type {
  ExperienceBufferConfig,
  Episode,
  SampledBatch,
  BufferStats,
} from './experience-buffer-types.js';

export {
  DEFAULT_EXPERIENCE_BUFFER_CONFIG,
  ExperienceBufferConfigSchema,
} from './experience-buffer-types.js';

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
      timestamp: new Date(getTimeProvider().now()),
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
      return sampleWithPriority(
        this.episodes,
        effectiveBatchSize,
        this.config.priorityExponent,
        this.totalStepsCount
      );
    }

    return sampleUniformly(this.episodes, effectiveBatchSize);
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
