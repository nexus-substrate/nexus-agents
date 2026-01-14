/**
 * Confidence Router Helper Functions
 *
 * Pure functions for confidence estimation and factor calculation.
 *
 * @module cli-adapters/confidence-router-helpers
 * (Source: Issue #99, arXiv:2510.05164 - EMNLP 2025)
 */

import type { ConfidenceFactors, CliTask, CliResponse, ConfidenceEstimate } from './types.js';
import {
  type TaskComplexity,
  HEDGING_PHRASES,
  UNCERTAINTY_INDICATORS,
  COMPLEX_TASK_INDICATORS,
  SIMPLE_TASK_INDICATORS,
  CONFIDENCE_WEIGHTS,
  EXPECTED_WORD_COUNTS,
} from './confidence-router-types.js';

// =============================================================================
// Task Complexity Estimation
// =============================================================================

/**
 * Estimate task complexity from task content.
 */
export function estimateTaskComplexity(task: CliTask): TaskComplexity {
  const content = task.content.toLowerCase();
  const wordCount = content.split(/\s+/).length;

  const complexCount = COMPLEX_TASK_INDICATORS.filter((i) => content.includes(i)).length;
  const simpleCount = SIMPLE_TASK_INDICATORS.filter((i) => content.includes(i)).length;

  if (wordCount > 100 || complexCount >= 2) {
    return 'complex';
  } else if (wordCount < 30 || simpleCount >= 2) {
    return 'simple';
  }
  return 'moderate';
}

// =============================================================================
// Factor Calculations
// =============================================================================

/**
 * Calculate length factor based on response length appropriateness.
 */
export function calculateLengthFactor(wordCount: number, complexity: TaskComplexity): number {
  const expected = EXPECTED_WORD_COUNTS[complexity];

  if (wordCount < expected.min * 0.5) {
    // Too short - likely incomplete
    return 0.4;
  } else if (wordCount < expected.min) {
    // Slightly short
    return 0.7;
  } else if (wordCount <= expected.max) {
    // Optimal range
    return 1.0;
  } else if (wordCount <= expected.max * 1.5) {
    // Slightly long
    return 0.8;
  } else {
    // Too long - may indicate padding or uncertainty
    return 0.6;
  }
}

/**
 * Calculate hedging factor based on hedging phrase count.
 * Inverted - fewer hedging phrases = higher confidence.
 */
export function calculateHedgingFactor(responseText: string): number {
  const lower = responseText.toLowerCase();
  const hedgingCount = HEDGING_PHRASES.filter((phrase) => lower.includes(phrase)).length;
  return Math.max(0, 1 - hedgingCount * 0.15);
}

/**
 * Calculate structure factor based on response formatting.
 */
export function calculateStructureFactor(content: string): number {
  let score = 0.5; // Base score

  // Check for structured elements
  if (content.includes('```')) score += 0.15; // Code blocks
  if (/^\s*[-*]\s/m.test(content)) score += 0.1; // Bullet points
  if (/^\s*\d+\.\s/m.test(content)) score += 0.1; // Numbered lists
  if (/^#+\s/m.test(content)) score += 0.1; // Headers
  if (content.includes('\n\n')) score += 0.05; // Paragraph breaks

  return Math.min(1, score);
}

/**
 * Calculate uncertainty factor based on uncertainty indicators.
 * Inverted - fewer uncertainty indicators = higher confidence.
 */
export function calculateUncertaintyFactor(responseText: string): number {
  const lower = responseText.toLowerCase();
  const uncertaintyCount = UNCERTAINTY_INDICATORS.filter((indicator) =>
    lower.includes(indicator)
  ).length;
  return Math.max(0, 1 - uncertaintyCount * 0.1);
}

// =============================================================================
// Confidence Calculation
// =============================================================================

/**
 * Calculate all confidence factors for a response.
 */
export function calculateFactors(task: CliTask, response: CliResponse): ConfidenceFactors {
  const responseText = response.text;
  const wordCount = responseText.split(/\s+/).length;
  const complexity = estimateTaskComplexity(task);

  return {
    lengthFactor: calculateLengthFactor(wordCount, complexity),
    hedgingFactor: calculateHedgingFactor(responseText),
    structureFactor: calculateStructureFactor(responseText),
    uncertaintyFactor: calculateUncertaintyFactor(responseText),
  };
}

/**
 * Calculate weighted confidence score from factors.
 */
export function calculateConfidenceScore(factors: ConfidenceFactors): number {
  return (
    factors.lengthFactor * CONFIDENCE_WEIGHTS.length +
    factors.hedgingFactor * CONFIDENCE_WEIGHTS.hedging +
    factors.structureFactor * CONFIDENCE_WEIGHTS.structure +
    factors.uncertaintyFactor * CONFIDENCE_WEIGHTS.uncertainty
  );
}

/**
 * Generate human-readable reason for confidence score.
 */
export function generateConfidenceReason(factors: ConfidenceFactors, score: number): string {
  const issues: string[] = [];

  if (factors.lengthFactor < 0.7) issues.push('response length concerns');
  if (factors.hedgingFactor < 0.7) issues.push('hedging language detected');
  if (factors.structureFactor < 0.6) issues.push('limited structure');
  if (factors.uncertaintyFactor < 0.7) issues.push('uncertainty indicators');

  if (issues.length === 0) {
    return `High confidence (${(score * 100).toFixed(1)}%)`;
  }

  return `Confidence ${(score * 100).toFixed(1)}%: ${issues.join(', ')}`;
}

/**
 * Estimate confidence in a model's response.
 * Uses multiple heuristic factors based on SATER research.
 */
export function estimateConfidence(
  task: CliTask,
  response: CliResponse,
  threshold: number
): ConfidenceEstimate {
  const factors = calculateFactors(task, response);
  const score = calculateConfidenceScore(factors);
  const shouldEscalate = score < threshold;
  const reason = generateConfidenceReason(factors, score);

  return { score, factors, shouldEscalate, reason };
}
