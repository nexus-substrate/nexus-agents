/**
 * nexus-agents/cli-adapters - Difficulty Estimators
 *
 * Dimension-specific difficulty estimation functions.
 * Extracted from difficulty-space.ts to maintain file size limits.
 *
 * @module cli-adapters/difficulty-estimators
 * (Source: Issue #339)
 */

import type { TaskProfile } from './task-analyzer.js';

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
// Helper Functions
// ============================================================================

/**
 * Counts keyword matches in text.
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
 */
function normalizeKeywordCount(count: number, saturationPoint: number): number {
  if (count === 0) return 0;
  const ratio = count / saturationPoint;
  const raw = ratio * (2 - ratio);
  return Math.max(0.2, Math.min(1, raw));
}

/**
 * Normalizes a value to the 0-1 range.
 */
function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  const normalized = (value - min) / (max - min);
  return Math.max(0, Math.min(1, normalized));
}

// ============================================================================
// Dimension-Specific Estimators
// ============================================================================

/**
 * Estimates reasoning difficulty from task content.
 */
export function estimateReasoningDifficulty(content: string, profile?: TaskProfile): number {
  let difficulty = profile !== undefined ? profile.reasoningComplexity / MAX_COMPLEXITY_SCORE : 0.5;

  const keywordCount = countKeywordMatches(content, REASONING_KEYWORDS);
  const keywordFactor = normalizeKeywordCount(keywordCount, 5);

  const reasoningTasks = ['architecture', 'code_review', 'large_codebase'];
  const taskTypeBonus =
    profile !== undefined && reasoningTasks.includes(profile.taskType) ? 0.15 : 0;

  difficulty = difficulty * 0.5 + keywordFactor * 0.35 + taskTypeBonus + 0.15 * difficulty;

  return Math.max(0, Math.min(1, difficulty));
}

/**
 * Estimates knowledge difficulty from task content.
 */
export function estimateKnowledgeDifficulty(content: string, profile?: TaskProfile): number {
  const keywordCount = countKeywordMatches(content, KNOWLEDGE_KEYWORDS);
  let difficulty = normalizeKeywordCount(keywordCount, 4);

  const knowledgeTasks = ['documentation', 'architecture'];
  if (profile !== undefined && knowledgeTasks.includes(profile.taskType)) {
    difficulty = Math.min(1, difficulty + 0.2);
  }

  if (content.length > 2000) {
    difficulty = Math.min(1, difficulty + 0.1);
  }

  return difficulty;
}

/**
 * Estimates creativity difficulty from task content.
 */
export function estimateCreativityDifficulty(content: string, profile?: TaskProfile): number {
  const keywordCount = countKeywordMatches(content, CREATIVITY_KEYWORDS);
  let difficulty = normalizeKeywordCount(keywordCount, 4);

  if (
    profile !== undefined &&
    profile.codeGeneration &&
    profile.taskType === 'code_implementation'
  ) {
    difficulty = Math.min(1, difficulty + 0.25);
  }

  if (profile?.taskType === 'architecture') {
    difficulty = Math.min(1, difficulty + 0.2);
  }

  return difficulty;
}

/**
 * Estimates precision difficulty from task content.
 */
export function estimatePrecisionDifficulty(content: string, profile?: TaskProfile): number {
  const keywordCount = countKeywordMatches(content, PRECISION_KEYWORDS);
  let difficulty = normalizeKeywordCount(keywordCount, 4);

  const precisionTasks = ['test_generation', 'code_review'];
  if (profile !== undefined && precisionTasks.includes(profile.taskType)) {
    difficulty = Math.min(1, difficulty + 0.3);
  }

  if (profile?.codeGeneration === true) {
    difficulty = Math.min(1, difficulty + 0.15);
  }

  return difficulty;
}

/**
 * Estimates context length difficulty from task content.
 */
export function estimateContextLengthDifficulty(content: string, profile?: TaskProfile): number {
  const estimatedTokens =
    profile !== undefined
      ? profile.contextRequired
      : Math.max(content.length * 0.3, content.length / 4);

  const baseNormalized = normalize(estimatedTokens, 0, MAX_CONTEXT_TOKENS);

  if (profile?.taskType === 'large_codebase') {
    return Math.min(1, baseNormalized + 0.2);
  }

  if (content.length > 5000) {
    return Math.min(1, baseNormalized + 0.15);
  }

  return baseNormalized;
}
