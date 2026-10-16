/**
 * Confidence Router Types and Constants
 *
 * Type definitions and configuration constants for confidence-aware
 * cascade routing based on SATER pattern.
 *
 * @module cli-adapters/confidence-router-types
 * (Source: Issue #99, arXiv:2510.05164 - EMNLP 2025)
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Task complexity levels for confidence estimation.
 */
export type TaskComplexity = 'simple' | 'moderate' | 'complex';

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
