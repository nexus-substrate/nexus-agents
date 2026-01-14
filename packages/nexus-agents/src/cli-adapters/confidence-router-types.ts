/**
 * Confidence Router Types and Constants
 *
 * Type definitions and configuration constants for confidence-aware
 * cascade routing based on SATER pattern.
 *
 * @module cli-adapters/confidence-router-types
 * (Source: Issue #99, arXiv:2510.05164 - EMNLP 2025)
 */

import type { CliName, CliResponse, ConfidenceEstimate, CascadeOptions } from './types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Response cache entry for avoiding redundant model calls.
 */
export interface CacheEntry {
  readonly response: CliResponse;
  readonly confidence: ConfidenceEstimate;
  readonly timestamp: number;
}

/**
 * Task complexity levels for confidence estimation.
 */
export type TaskComplexity = 'simple' | 'moderate' | 'complex';

/**
 * Cache statistics for monitoring.
 */
export interface CacheStats {
  readonly size: number;
  readonly maxSize: number;
  readonly maxAgeMs: number;
}

// =============================================================================
// Default Configuration
// =============================================================================

/**
 * Default cascade configuration.
 */
export const DEFAULT_CASCADE_OPTIONS: Required<CascadeOptions> = {
  confidenceThreshold: 0.7,
  fastModel: 'gemini' as CliName, // Gemini Flash for speed/cost
  expensiveModel: 'claude' as CliName, // Claude for quality
  maxEscalations: 2,
  cacheResponses: true,
};

// =============================================================================
// Confidence Indicators
// =============================================================================

/**
 * Hedging phrases that indicate low confidence in responses.
 * Static patterns only (no user-provided RegExp - ReDoS prevention).
 */
export const HEDGING_PHRASES = [
  'i think',
  'i believe',
  'probably',
  'maybe',
  'might be',
  'could be',
  'possibly',
  'not sure',
  'uncertain',
  'i guess',
  "i'm not certain",
  'it seems',
  'appears to',
  'likely',
  'unlikely',
] as const;

/**
 * Uncertainty indicators that suggest the model lacks confidence.
 */
export const UNCERTAINTY_INDICATORS = [
  'however',
  'although',
  'but',
  'on the other hand',
  'alternatively',
  'caveat',
  'note that',
  'be aware',
  'keep in mind',
  'disclaimer',
] as const;

// =============================================================================
// Complexity Indicators
// =============================================================================

/**
 * Keywords indicating complex tasks.
 */
export const COMPLEX_TASK_INDICATORS = [
  'design',
  'architecture',
  'implement',
  'optimize',
  'refactor',
  'security',
  'performance',
  'scalable',
  'distributed',
  'algorithm',
] as const;

/**
 * Keywords indicating simple tasks.
 */
export const SIMPLE_TASK_INDICATORS = [
  'fix',
  'add',
  'remove',
  'update',
  'change',
  'simple',
  'basic',
  'quick',
] as const;

// =============================================================================
// Confidence Weights
// =============================================================================

/**
 * Weights for confidence factor calculation (from SATER paper).
 */
export const CONFIDENCE_WEIGHTS = {
  length: 0.2,
  hedging: 0.3,
  structure: 0.25,
  uncertainty: 0.25,
} as const;

/**
 * Expected word count ranges by task complexity.
 */
export const EXPECTED_WORD_COUNTS: Record<TaskComplexity, { min: number; max: number }> = {
  simple: { min: 20, max: 200 },
  moderate: { min: 50, max: 500 },
  complex: { min: 100, max: 1000 },
} as const;
