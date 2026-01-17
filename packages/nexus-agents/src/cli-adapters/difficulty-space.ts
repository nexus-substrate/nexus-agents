/**
 * nexus-agents/cli-adapters - Difficulty Space
 *
 * Functions for mapping tasks to the universal difficulty space.
 * Each dimension is normalized to 0-1 for consistent comparison.
 *
 * @module cli-adapters/difficulty-space
 * (Source: Issue #338)
 */

import type { CliTask } from './types-capability.js';
import type { TaskProfile } from './task-analyzer.js';
import {
  type DifficultySpace,
  type DifficultyDimension,
  type DifficultyWeights,
  type DifficultyLevel,
  type DifficultyThresholds,
  DIFFICULTY_DIMENSIONS,
  DEFAULT_DIFFICULTY_WEIGHTS,
  DEFAULT_DIFFICULTY_THRESHOLDS,
} from './zero-router-types.js';

// ============================================================================
// Constants for normalization
// ============================================================================

/** Maximum expected context tokens for normalization */
const MAX_CONTEXT_TOKENS = 50_000;

/** Maximum expected complexity score from task analyzer */
const MAX_COMPLEXITY_SCORE = 10;

/** Keywords indicating high reasoning requirements */
const REASONING_KEYWORDS = [
  'analyze',
  'reason',
  'logic',
  'infer',
  'deduce',
  'prove',
  'theorem',
  'algorithm',
  'optimize',
  'trade-off',
  'compare',
  'evaluate',
  'decision',
  'strategy',
  'plan',
  'debug',
  'diagnose',
  'investigate',
] as const;

/** Keywords indicating high knowledge requirements */
const KNOWLEDGE_KEYWORDS = [
  'domain',
  'expert',
  'specialist',
  'technical',
  'advanced',
  'specific',
  'industry',
  'regulation',
  'compliance',
  'standard',
  'protocol',
  'specification',
  'scientific',
  'medical',
  'legal',
  'financial',
] as const;

/** Keywords indicating high creativity requirements */
const CREATIVITY_KEYWORDS = [
  'creative',
  'novel',
  'innovative',
  'unique',
  'original',
  'design',
  'brainstorm',
  'ideate',
  'imagine',
  'invent',
  'generate',
  'create',
  'compose',
  'write',
  'story',
  'artistic',
] as const;

/** Keywords indicating high precision requirements */
const PRECISION_KEYWORDS = [
  'exact',
  'precise',
  'accurate',
  'correct',
  'verify',
  'validate',
  'test',
  'error',
  'bug',
  'fix',
  'security',
  'critical',
  'production',
  'reliable',
  'robust',
  'type-safe',
] as const;

// ============================================================================
// Normalization Functions
// ============================================================================

/**
 * Normalizes a value to the 0-1 range.
 *
 * @param value - Value to normalize
 * @param min - Minimum expected value
 * @param max - Maximum expected value
 * @returns Normalized value between 0 and 1
 */
export function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  const normalized = (value - min) / (max - min);
  return Math.max(0, Math.min(1, normalized));
}

/**
 * Counts keyword matches in text.
 *
 * @param text - Text to search
 * @param keywords - Keywords to match
 * @returns Count of matching keywords
 */
function countKeywordMatches(text: string, keywords: readonly string[]): number {
  const lower = text.toLowerCase();
  let count = 0;
  for (const keyword of keywords) {
    if (lower.includes(keyword)) {
      count++;
    }
  }
  return count;
}

/**
 * Normalizes keyword count to 0-1 difficulty.
 *
 * @param count - Number of keyword matches
 * @param saturationPoint - Count at which difficulty reaches 1.0
 * @returns Normalized difficulty (0-1)
 */
function normalizeKeywordCount(count: number, saturationPoint: number): number {
  if (count === 0) return 0;
  // Use sigmoid-like curve for smooth saturation
  // At least 1 keyword gives minimum of 0.2 difficulty
  const ratio = count / saturationPoint;
  const raw = ratio * (2 - ratio);
  return Math.max(0.2, Math.min(1, raw));
}

// ============================================================================
// Dimension-Specific Estimators
// ============================================================================

/**
 * Estimates reasoning difficulty from task content.
 *
 * @param content - Task content
 * @param profile - Optional task profile from analyzer
 * @returns Normalized reasoning difficulty (0-1)
 */
export function estimateReasoningDifficulty(content: string, profile?: TaskProfile): number {
  // Base from task profile complexity
  let difficulty = profile !== undefined ? profile.reasoningComplexity / MAX_COMPLEXITY_SCORE : 0.5;

  // Adjust based on reasoning keywords
  const keywordCount = countKeywordMatches(content, REASONING_KEYWORDS);
  const keywordFactor = normalizeKeywordCount(keywordCount, 5);

  // Task types that require more reasoning
  const reasoningTasks = ['architecture', 'code_review', 'large_codebase'];
  const taskTypeBonus =
    profile !== undefined && reasoningTasks.includes(profile.taskType) ? 0.15 : 0;

  // Combine factors
  difficulty = difficulty * 0.5 + keywordFactor * 0.35 + taskTypeBonus + 0.15 * difficulty;

  return Math.max(0, Math.min(1, difficulty));
}

/**
 * Estimates knowledge difficulty from task content.
 *
 * @param content - Task content
 * @param profile - Optional task profile from analyzer
 * @returns Normalized knowledge difficulty (0-1)
 */
export function estimateKnowledgeDifficulty(content: string, profile?: TaskProfile): number {
  // Base from keyword analysis
  const keywordCount = countKeywordMatches(content, KNOWLEDGE_KEYWORDS);
  let difficulty = normalizeKeywordCount(keywordCount, 4);

  // Documentation and architecture tasks often require domain knowledge
  const knowledgeTasks = ['documentation', 'architecture'];
  if (profile !== undefined && knowledgeTasks.includes(profile.taskType)) {
    difficulty = Math.min(1, difficulty + 0.2);
  }

  // Long tasks often require more contextual knowledge
  if (content.length > 2000) {
    difficulty = Math.min(1, difficulty + 0.1);
  }

  return difficulty;
}

/**
 * Estimates creativity difficulty from task content.
 *
 * @param content - Task content
 * @param profile - Optional task profile from analyzer
 * @returns Normalized creativity difficulty (0-1)
 */
export function estimateCreativityDifficulty(content: string, profile?: TaskProfile): number {
  // Base from keyword analysis
  const keywordCount = countKeywordMatches(content, CREATIVITY_KEYWORDS);
  let difficulty = normalizeKeywordCount(keywordCount, 4);

  // Code generation from scratch requires creativity
  if (
    profile !== undefined &&
    profile.codeGeneration &&
    profile.taskType === 'code_implementation'
  ) {
    difficulty = Math.min(1, difficulty + 0.25);
  }

  // Architecture tasks require creative solutions
  if (profile?.taskType === 'architecture') {
    difficulty = Math.min(1, difficulty + 0.2);
  }

  return difficulty;
}

/**
 * Estimates precision difficulty from task content.
 *
 * @param content - Task content
 * @param profile - Optional task profile from analyzer
 * @returns Normalized precision difficulty (0-1)
 */
export function estimatePrecisionDifficulty(content: string, profile?: TaskProfile): number {
  // Base from keyword analysis
  const keywordCount = countKeywordMatches(content, PRECISION_KEYWORDS);
  let difficulty = normalizeKeywordCount(keywordCount, 4);

  // Test generation and code review require high precision
  const precisionTasks = ['test_generation', 'code_review'];
  if (profile !== undefined && precisionTasks.includes(profile.taskType)) {
    difficulty = Math.min(1, difficulty + 0.3);
  }

  // Code generation requires precision
  if (profile?.codeGeneration === true) {
    difficulty = Math.min(1, difficulty + 0.15);
  }

  return difficulty;
}

/**
 * Estimates context length difficulty from task content.
 *
 * @param content - Task content
 * @param profile - Optional task profile from analyzer
 * @returns Normalized context length difficulty (0-1)
 */
export function estimateContextLengthDifficulty(content: string, profile?: TaskProfile): number {
  // Use estimated tokens from profile if available
  // More aggressive token estimation for direct content length
  const estimatedTokens =
    profile !== undefined
      ? profile.contextRequired
      : Math.max(content.length * 0.3, content.length / 4);

  // Normalize with diminishing returns curve
  const baseNormalized = normalize(estimatedTokens, 0, MAX_CONTEXT_TOKENS);

  // Large codebase tasks have inherent context challenges
  if (profile?.taskType === 'large_codebase') {
    return Math.min(1, baseNormalized + 0.2);
  }

  // Bonus for very long content (beyond typical tasks)
  if (content.length > 5000) {
    return Math.min(1, baseNormalized + 0.15);
  }

  return baseNormalized;
}

// ============================================================================
// Main Estimation Functions
// ============================================================================

/**
 * Maps a task to the universal difficulty space.
 *
 * @param task - CLI task to analyze
 * @param profile - Optional pre-computed task profile
 * @returns Difficulty space with all dimensions normalized to 0-1
 */
export function estimateDifficultySpace(task: CliTask, profile?: TaskProfile): DifficultySpace {
  const content = task.content + (task.systemPrompt ?? '');

  return {
    reasoning: estimateReasoningDifficulty(content, profile),
    knowledge: estimateKnowledgeDifficulty(content, profile),
    creativity: estimateCreativityDifficulty(content, profile),
    precision: estimatePrecisionDifficulty(content, profile),
    context_length: estimateContextLengthDifficulty(content, profile),
  };
}

/**
 * Aggregates difficulty dimensions into a single score.
 *
 * @param space - Difficulty space to aggregate
 * @param weights - Weights for each dimension (should sum to 1)
 * @returns Aggregate difficulty score (0-1)
 */
export function aggregateDifficulty(
  space: DifficultySpace,
  weights: DifficultyWeights = DEFAULT_DIFFICULTY_WEIGHTS
): number {
  let sum = 0;
  let weightSum = 0;

  for (const dim of DIFFICULTY_DIMENSIONS) {
    sum += space[dim] * weights[dim];
    weightSum += weights[dim];
  }

  // Normalize by weight sum to handle non-normalized weights
  return weightSum > 0 ? sum / weightSum : 0;
}

/**
 * Finds the dominant (highest) difficulty dimension.
 *
 * @param space - Difficulty space to analyze
 * @returns The dimension with highest difficulty
 */
export function findDominantDimension(space: DifficultySpace): DifficultyDimension {
  let maxDim: DifficultyDimension = 'reasoning';
  let maxValue = space.reasoning;

  for (const dim of DIFFICULTY_DIMENSIONS) {
    if (space[dim] > maxValue) {
      maxValue = space[dim];
      maxDim = dim;
    }
  }

  return maxDim;
}

/**
 * Classifies aggregate difficulty into a level.
 *
 * @param aggregateScore - Aggregate difficulty score (0-1)
 * @param thresholds - Optional custom thresholds
 * @returns Difficulty level classification
 */
export function classifyDifficultyLevel(
  aggregateScore: number,
  thresholds: DifficultyThresholds = DEFAULT_DIFFICULTY_THRESHOLDS
): DifficultyLevel {
  if (aggregateScore < thresholds.easyUpperBound) {
    return 'easy';
  }
  if (aggregateScore > thresholds.hardLowerBound) {
    return 'hard';
  }
  return 'medium';
}

/**
 * Calculates confidence in the difficulty estimate.
 * Higher when dimensions are consistent, lower when spread out.
 *
 * @param space - Difficulty space to analyze
 * @returns Confidence score (0-1)
 */
export function calculateEstimateConfidence(space: DifficultySpace): number {
  const values = DIFFICULTY_DIMENSIONS.map((dim) => space[dim]);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;

  // Calculate standard deviation
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  // Lower variance = higher confidence
  // Max stdDev for 0-1 values is ~0.5
  const normalizedStdDev = stdDev / 0.5;
  const confidence = 1 - normalizedStdDev;

  return Math.max(0, Math.min(1, confidence));
}

/**
 * Creates a human-readable summary of the difficulty space.
 *
 * @param space - Difficulty space to summarize
 * @returns Human-readable summary string
 */
export function summarizeDifficultySpace(space: DifficultySpace): string {
  const parts: string[] = [];

  for (const dim of DIFFICULTY_DIMENSIONS) {
    const value = space[dim];
    const level = value < 0.3 ? 'low' : value > 0.7 ? 'high' : 'med';
    parts.push(`${dim}:${level}`);
  }

  return parts.join(' | ');
}
