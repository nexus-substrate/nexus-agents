/**
 * Adaptive Memory Types
 *
 * Type definitions for adaptive memory with priority-based retrieval
 * combining recency decay, importance weighting, and context relevance.
 *
 * @module context/adaptive-memory-types
 * (Source: Issue #143, arXiv:2310.08560)
 */

import { z } from 'zod';
import type { Result } from '../core/result.js';
import type { MemoryEntry, MemoryError, IContextMemoryBackend } from './memory-backend-types.js';

// ============================================================================
// Scoring Configuration
// ============================================================================

/**
 * Weights for combining priority score components.
 * All weights should sum to 1.0 for normalized scoring.
 */
export interface ScoringWeights {
  /** Weight for recency score (0-1) */
  readonly recency: number;
  /** Weight for importance score (0-1) */
  readonly importance: number;
  /** Weight for relevance score (0-1) */
  readonly relevance: number;
}

/** Base Zod schema for ScoringWeights (without sum validation). */
const ScoringWeightsBaseSchema = z.object({
  recency: z.number().min(0).max(1),
  importance: z.number().min(0).max(1),
  relevance: z.number().min(0).max(1),
});

/** Zod schema for ScoringWeights validation (with sum check). */
export const ScoringWeightsSchema = ScoringWeightsBaseSchema.refine(
  (w) => Math.abs(w.recency + w.importance + w.relevance - 1.0) < 0.001,
  { message: 'Weights must sum to 1.0' }
);

/** Partial ScoringWeights schema for overrides. */
export const PartialScoringWeightsSchema = ScoringWeightsBaseSchema.partial();

/**
 * Configuration for importance level weights.
 */
export interface ImportanceWeights {
  /** Score for LOW importance (0-1) */
  readonly low: number;
  /** Score for MEDIUM importance (0-1) */
  readonly medium: number;
  /** Score for HIGH importance (0-1) */
  readonly high: number;
}

/** Zod schema for ImportanceWeights validation. */
export const ImportanceWeightsSchema = z.object({
  low: z.number().min(0).max(1),
  medium: z.number().min(0).max(1),
  high: z.number().min(0).max(1),
});

/**
 * Configuration for recency decay.
 */
export interface DecayConfig {
  /** Half-life in milliseconds (time for score to decay by 50%) */
  readonly halfLifeMs: number;
  /** Minimum recency score (floor, prevents zero scores) */
  readonly minScore: number;
}

/** Zod schema for DecayConfig validation. */
export const DecayConfigSchema = z.object({
  halfLifeMs: z.number().positive(),
  minScore: z.number().min(0).max(1),
});

// ============================================================================
// Priority Score
// ============================================================================

/**
 * Components of a priority score.
 */
export interface PriorityScoreComponents {
  /** Recency score (0-1) based on time since last access */
  readonly recency: number;
  /** Importance score (0-1) based on importance level */
  readonly importance: number;
  /** Relevance score (0-1) based on query similarity */
  readonly relevance: number;
}

/**
 * Complete priority score with components.
 */
export interface PriorityScore {
  /** Final combined score */
  readonly score: number;
  /** Individual score components */
  readonly components: PriorityScoreComponents;
}

/** Zod schema for PriorityScore validation. */
export const PriorityScoreSchema = z.object({
  score: z.number().min(0),
  components: z.object({
    recency: z.number().min(0).max(1),
    importance: z.number().min(0).max(1),
    relevance: z.number().min(0).max(1),
  }),
});

// ============================================================================
// Scored Memory Entry
// ============================================================================

/**
 * A memory entry with its priority score.
 */
export interface ScoredMemoryEntry {
  /** The memory entry */
  readonly entry: MemoryEntry;
  /** The priority score */
  readonly priority: PriorityScore;
}

/** Zod schema for ScoredMemoryEntry validation. */
export const ScoredMemoryEntrySchema = z.object({
  entry: z.object({
    key: z.string(),
    value: z.unknown(),
    metadata: z.object({
      importance: z.enum(['low', 'medium', 'high']),
      tags: z.array(z.string()).optional(),
      ttl: z.number().optional(),
    }),
    createdAt: z.date(),
    accessedAt: z.date(),
  }),
  priority: PriorityScoreSchema,
});

// ============================================================================
// Retrieval Options
// ============================================================================

/**
 * Options for priority-based retrieval.
 */
export interface PriorityRetrievalOptions {
  /** Query string for relevance scoring (optional) */
  readonly query?: string;
  /** Maximum number of results */
  readonly limit?: number;
  /** Minimum priority score threshold */
  readonly minScore?: number;
  /** Override scoring weights for this query */
  readonly weights?: Partial<ScoringWeights>;
  /** Filter by importance levels */
  readonly importanceFilter?: readonly ('low' | 'medium' | 'high')[];
  /** Filter by tags (entries must have at least one matching tag) */
  readonly tagFilter?: readonly string[];
}

/** Zod schema for PriorityRetrievalOptions validation. */
export const PriorityRetrievalOptionsSchema = z.object({
  query: z.string().optional(),
  limit: z.number().int().positive().optional(),
  minScore: z.number().min(0).optional(),
  weights: PartialScoringWeightsSchema.optional(),
  importanceFilter: z.array(z.enum(['low', 'medium', 'high'])).optional(),
  tagFilter: z.array(z.string()).optional(),
});

// ============================================================================
// Adaptive Memory Interface
// ============================================================================

/**
 * Extended memory backend with adaptive priority-based retrieval.
 */
export interface IAdaptiveMemory extends IContextMemoryBackend {
  /**
   * Retrieve memories sorted by priority score.
   * @param opts - Retrieval options
   */
  retrieveByPriority(
    opts?: PriorityRetrievalOptions
  ): Promise<Result<ScoredMemoryEntry[], MemoryError>>;

  /**
   * Get the priority score for a specific memory entry.
   * @param key - Memory key
   * @param query - Optional query for relevance scoring
   */
  getPriorityScore(key: string, query?: string): Promise<Result<PriorityScore, MemoryError>>;

  /**
   * Boost the priority of a memory entry by updating its access time.
   * @param key - Memory key
   */
  touch(key: string): Promise<Result<void, MemoryError>>;

  /**
   * Get the current scoring configuration.
   */
  getScoringConfig(): ScoringConfig;

  /**
   * Update the scoring configuration.
   * @param config - Partial configuration to update
   */
  updateScoringConfig(config: Partial<ScoringConfig>): void;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Complete scoring configuration.
 */
export interface ScoringConfig {
  /** Weights for combining score components */
  readonly weights: ScoringWeights;
  /** Importance level score mappings */
  readonly importanceWeights: ImportanceWeights;
  /** Recency decay configuration */
  readonly decay: DecayConfig;
}

/** Zod schema for ScoringConfig validation. */
export const ScoringConfigSchema = z.object({
  weights: ScoringWeightsSchema,
  importanceWeights: ImportanceWeightsSchema,
  decay: DecayConfigSchema,
});

/**
 * Configuration for AdaptiveMemoryBackend.
 */
export interface AdaptiveMemoryConfig {
  /** Path to SQLite database file */
  readonly dbPath: string;
  /** Directory for Markdown exports */
  readonly markdownDir: string;
  /** Scoring configuration (optional, uses defaults if not provided) */
  readonly scoring?: Partial<ScoringConfig>;
  /** Whether to auto-expire TTL entries (default: true) */
  readonly autoExpire?: boolean;
}

/** Zod schema for AdaptiveMemoryConfig validation. */
export const AdaptiveMemoryConfigSchema = z.object({
  dbPath: z.string().min(1),
  markdownDir: z.string().min(1),
  scoring: ScoringConfigSchema.partial().optional(),
  autoExpire: z.boolean().optional(),
});

// ============================================================================
// Default Configuration
// ============================================================================

/** Default scoring weights (balanced). */
export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  recency: 0.4,
  importance: 0.3,
  relevance: 0.3,
};

/** Default importance weights. */
export const DEFAULT_IMPORTANCE_WEIGHTS: ImportanceWeights = {
  low: 0.25,
  medium: 0.5,
  high: 1.0,
};

/** Default decay configuration (24-hour half-life). */
export const DEFAULT_DECAY_CONFIG: DecayConfig = {
  halfLifeMs: 24 * 60 * 60 * 1000, // 24 hours
  minScore: 0.1,
};

/** Default scoring configuration. */
export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  weights: DEFAULT_SCORING_WEIGHTS,
  importanceWeights: DEFAULT_IMPORTANCE_WEIGHTS,
  decay: DEFAULT_DECAY_CONFIG,
};
