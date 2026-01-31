/**
 * Adaptive Memory Helpers
 *
 * Helper functions for adaptive memory scoring including recency decay,
 * importance weighting, and relevance calculation.
 *
 * @module context/adaptive-memory-helpers
 * (Source: Issue #143, arXiv:2310.08560)
 */

import { getTimeProvider } from '../core/index.js';
import type { MemoryEntry, MemoryRow, ISQLiteDatabase } from './memory-backend-types.js';
import { MemoryImportance } from './memory-backend-types.js';
import type {
  ScoringConfig,
  PriorityScore,
  PriorityScoreComponents,
  ScoredMemoryEntry,
  PriorityRetrievalOptions,
  ScoringWeights,
} from './adaptive-memory-types.js';
import { DEFAULT_SCORING_CONFIG } from './adaptive-memory-types.js';
// Shared utilities per ADR-0013
import {
  tokenize as sharedTokenize,
  stringifyValue as sharedStringifyValue,
} from '../utils/text-utils.js';
import { calculateTokenOverlap } from '../utils/similarity-utils.js';
import {
  memoryRowToEntry as sharedMemoryRowToEntry,
  memoryExists as sharedMemoryExists,
  getMemoryRow as sharedGetMemoryRow,
  getAllMemoryRows as sharedGetAllMemoryRows,
} from '../utils/memory-db-utils.js';

// ============================================================================
// Recency Scoring
// ============================================================================

/**
 * Calculate recency score using exponential decay.
 * Score = max(minScore, e^(-λt)) where λ = ln(2) / halfLife
 *
 * @param accessedAt - Last access time
 * @param now - Current time
 * @param halfLifeMs - Half-life in milliseconds
 * @param minScore - Minimum score floor
 */
export function calculateRecencyScore(
  accessedAt: Date,
  now: Date,
  halfLifeMs: number,
  minScore: number
): number {
  const elapsedMs = now.getTime() - accessedAt.getTime();
  if (elapsedMs <= 0) return 1.0;

  // λ = ln(2) / halfLife
  const lambda = Math.LN2 / halfLifeMs;
  const decayedScore = Math.exp(-lambda * elapsedMs);

  return Math.max(minScore, decayedScore);
}

// ============================================================================
// Importance Scoring
// ============================================================================

/**
 * Calculate importance score based on importance level.
 *
 * @param importance - Memory importance level
 * @param config - Scoring configuration
 */
export function calculateImportanceScore(importance: string, config: ScoringConfig): number {
  switch (importance) {
    case MemoryImportance.HIGH:
      return config.importanceWeights.high;
    case MemoryImportance.MEDIUM:
      return config.importanceWeights.medium;
    case MemoryImportance.LOW:
      return config.importanceWeights.low;
    default:
      return config.importanceWeights.medium;
  }
}

// ============================================================================
// Relevance Scoring
// ============================================================================

/**
 * Calculate relevance score between query and memory value.
 * Uses token overlap scoring via shared similarity-utils (ADR-0013).
 *
 * @param query - Search query
 * @param value - Memory value (stringified)
 */
export function calculateRelevanceScore(query: string | undefined, value: string): number {
  if (query === undefined || query.trim() === '') return 1.0;

  const queryTokens = tokenize(query);
  const valueTokens = tokenize(value);

  if (queryTokens.length === 0 || valueTokens.length === 0) return 0.5;

  // Use shared utility for overlap calculation (ADR-0013)
  return calculateTokenOverlap(queryTokens, valueTokens);
}

/**
 * Tokenize a string into lowercase words.
 * Uses shared utility from utils/text-utils.ts per ADR-0013.
 */
function tokenize(text: string): string[] {
  return sharedTokenize(text, 1); // Use minLength=1 to match original filter(t.length > 0)
}

// ============================================================================
// Combined Priority Scoring
// ============================================================================

/**
 * Configuration for priority calculation.
 */
export interface PriorityCalculationConfig {
  readonly entry: MemoryEntry;
  readonly query?: string;
  readonly now: Date;
  readonly config: ScoringConfig;
  readonly weightOverrides?: Partial<ScoringWeights>;
}

/**
 * Calculate combined priority score for a memory entry.
 */
export function calculatePriorityScore(input: PriorityCalculationConfig): PriorityScore {
  const { entry, query, now, config, weightOverrides } = input;

  // Calculate individual components
  const recency = calculateRecencyScore(
    entry.accessedAt,
    now,
    config.decay.halfLifeMs,
    config.decay.minScore
  );
  const importance = calculateImportanceScore(entry.metadata.importance, config);
  const relevance = calculateRelevanceScore(query, stringifyValue(entry.value));

  const components: PriorityScoreComponents = { recency, importance, relevance };

  // Apply weights
  const weights = resolveWeights(config.weights, weightOverrides);
  const score =
    recency * weights.recency + importance * weights.importance + relevance * weights.relevance;

  return { score, components };
}

/**
 * Stringify a value for relevance scoring.
 * Uses shared utility from utils/text-utils.ts per ADR-0013.
 */
function stringifyValue(value: unknown): string {
  return sharedStringifyValue(value);
}

/**
 * Resolve weights with optional overrides.
 */
function resolveWeights(base: ScoringWeights, overrides?: Partial<ScoringWeights>): ScoringWeights {
  if (overrides === undefined) return base;

  const merged = {
    recency: overrides.recency ?? base.recency,
    importance: overrides.importance ?? base.importance,
    relevance: overrides.relevance ?? base.relevance,
  };

  // Normalize if overrides don't sum to 1
  const sum = merged.recency + merged.importance + merged.relevance;
  if (Math.abs(sum - 1.0) > 0.001) {
    return {
      recency: merged.recency / sum,
      importance: merged.importance / sum,
      relevance: merged.relevance / sum,
    };
  }

  return merged;
}

// ============================================================================
// Memory Row Conversion
// ============================================================================

/**
 * Convert a MemoryRow to a MemoryEntry.
 * @deprecated Use import from '../utils/memory-db-utils.js' directly. Will be removed in v3.0.
 */
export function memoryRowToEntry(row: MemoryRow): MemoryEntry {
  return sharedMemoryRowToEntry(row);
}

// ============================================================================
// Filtering
// ============================================================================

/**
 * Configuration for filtering scored entries.
 */
export interface FilterConfig {
  readonly minScore?: number;
  readonly importanceFilter?: readonly string[];
  readonly tagFilter?: readonly string[];
}

/**
 * Filter scored entries based on options.
 */
export function filterScoredEntries(
  entries: ScoredMemoryEntry[],
  config: FilterConfig
): ScoredMemoryEntry[] {
  return entries.filter((e) => {
    // Score threshold
    if (config.minScore !== undefined && e.priority.score < config.minScore) {
      return false;
    }

    // Importance filter
    if (config.importanceFilter !== undefined && config.importanceFilter.length > 0) {
      if (!config.importanceFilter.includes(e.entry.metadata.importance)) {
        return false;
      }
    }

    // Tag filter (at least one matching tag)
    if (config.tagFilter !== undefined && config.tagFilter.length > 0) {
      const entryTags = e.entry.metadata.tags ?? [];
      const hasMatch = config.tagFilter.some((t) => entryTags.includes(t));
      if (!hasMatch) return false;
    }

    return true;
  });
}

// ============================================================================
// Database Queries
// ============================================================================

/**
 * Get all memory rows from the database.
 * @deprecated Use import from '../utils/memory-db-utils.js' directly. Will be removed in v3.0.
 */
export function getAllMemoryRows(db: ISQLiteDatabase, limit: number): MemoryRow[] {
  return sharedGetAllMemoryRows(db, limit);
}

/**
 * Get a single memory row by key.
 * @deprecated Use import from '../utils/memory-db-utils.js' directly. Will be removed in v3.0.
 */
export function getMemoryRow(db: ISQLiteDatabase, key: string): MemoryRow | undefined {
  return sharedGetMemoryRow(db, key);
}

/**
 * Update the accessed_at timestamp for a memory.
 */
export function touchMemory(db: ISQLiteDatabase, key: string): boolean {
  const stmt = db.prepare('UPDATE memories SET accessed_at = ? WHERE key = ?');
  const result = stmt.run(getTimeProvider().now(), key);
  return result.changes > 0;
}

/**
 * Check if a memory key exists.
 * @deprecated Use import from '../utils/memory-db-utils.js' directly. Will be removed in v3.0.
 */
export function memoryExists(db: ISQLiteDatabase, key: string): boolean {
  return sharedMemoryExists(db, key);
}

// ============================================================================
// Scoring Pipeline
// ============================================================================

/**
 * Score all entries and return sorted by priority.
 */
export function scoreAndSortEntries(
  rows: MemoryRow[],
  opts: PriorityRetrievalOptions | undefined,
  config: ScoringConfig
): ScoredMemoryEntry[] {
  const now = new Date(getTimeProvider().now());

  // Convert and score
  const scored: ScoredMemoryEntry[] = rows.map((row) => {
    const entry = sharedMemoryRowToEntry(row);
    const priority = calculatePriorityScore({
      entry,
      now,
      config,
      ...(opts?.query !== undefined && { query: opts.query }),
      ...(opts?.weights !== undefined && { weightOverrides: opts.weights }),
    });
    return { entry, priority };
  });

  // Filter - build config with only defined properties
  const filterConfig: FilterConfig = {
    ...(opts?.minScore !== undefined && { minScore: opts.minScore }),
    ...(opts?.importanceFilter !== undefined && { importanceFilter: opts.importanceFilter }),
    ...(opts?.tagFilter !== undefined && { tagFilter: opts.tagFilter }),
  };
  const filtered = filterScoredEntries(scored, filterConfig);

  // Sort by score descending
  filtered.sort((a, b) => b.priority.score - a.priority.score);

  // Apply limit
  const limit = opts?.limit ?? 100;
  return filtered.slice(0, limit);
}

// ============================================================================
// Configuration Merging
// ============================================================================

/**
 * Merge partial scoring config with defaults.
 */
export function mergeScoringConfig(partial?: Partial<ScoringConfig>): ScoringConfig {
  if (partial === undefined) return DEFAULT_SCORING_CONFIG;

  return {
    weights: partial.weights ?? DEFAULT_SCORING_CONFIG.weights,
    importanceWeights: partial.importanceWeights ?? DEFAULT_SCORING_CONFIG.importanceWeights,
    decay: partial.decay ?? DEFAULT_SCORING_CONFIG.decay,
  };
}
