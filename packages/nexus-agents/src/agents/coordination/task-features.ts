/**
 * Task Feature Extraction
 *
 * Extracts features from tasks for scaling prediction.
 * Uses keyword matching, pattern detection, and structural analysis.
 *
 * @deprecated Use SharedTaskAnalyzer from 'nexus-agents/core' instead.
 * This module is superseded by the unified SharedTaskAnalyzer (ADR-0004).
 * Migration: import { createSharedTaskAnalyzer } from 'nexus-agents/core'
 *   - analyze() provides unified feature extraction
 *   - getCapabilities() replaces parallelizable/multimodal detection
 *
 * @module agents/coordination/task-features
 * (Source: Issue #337, arXiv:2512.08296)
 */

import type { Task } from '../../core/index.js';
import { getTokenEstimator } from '../../core/index.js';
import type { TaskFeatures, ScalingTaskType, TaskSignal } from './scaling-types.js';

// =============================================================================
// Keyword Definitions
// =============================================================================

/**
 * Keywords for task type classification.
 */
const TASK_TYPE_KEYWORDS: Record<ScalingTaskType, readonly string[]> = {
  sequential_reasoning: [
    'step by step',
    'reason through',
    'logical',
    'deduce',
    'infer',
    'chain of thought',
    'sequence',
    'prove',
    'derive',
    'conclude',
    'therefore',
    'consequently',
  ],
  parallelizable: [
    'multiple',
    'each',
    'all of',
    'batch',
    'simultaneously',
    'independently',
    'parallel',
    'distribute',
    'split',
    'separately',
  ],
  tool_heavy: [
    'execute',
    'run',
    'call',
    'invoke',
    'api',
    'command',
    'tool',
    'function',
    'action',
    'perform',
    'shell',
    'terminal',
  ],
  web_navigation: [
    'browser',
    'website',
    'click',
    'navigate',
    'page',
    'url',
    'link',
    'form',
    'submit',
    'scroll',
    'download',
    'web',
  ],
  code_generation: [
    'code',
    'implement',
    'function',
    'class',
    'module',
    'program',
    'script',
    'write',
    'create',
    'build',
    'typescript',
    'javascript',
    'python',
  ],
  knowledge_retrieval: [
    'find',
    'search',
    'lookup',
    'what is',
    'how',
    'explain',
    'describe',
    'information',
    'facts',
    'research',
    'learn',
    'understand',
  ],
  creative: [
    'create',
    'design',
    'imagine',
    'generate',
    'brainstorm',
    'novel',
    'innovative',
    'original',
    'artistic',
    'story',
    'creative',
  ],
  unknown: [],
};

// =============================================================================
// Pattern Definitions
// =============================================================================

/**
 * Patterns indicating parallelizability.
 */
const PARALLELIZABLE_PATTERNS: readonly RegExp[] = [
  /\b(?:for each|for every|all of the|each of the)\b/i,
  /\b\d+\s+(?:files|items|tasks|documents|records)\b/i,
  /\b(?:batch|bulk|mass)\s+(?:process|update|create)\b/i,
  /\b(?:multiple|several|various)\s+\w+\s+(?:at once|simultaneously)\b/i,
  /\beach\b.*\bindependently\b/i,
];

/**
 * Patterns indicating sequential dependencies.
 */
const SEQUENTIAL_PATTERNS: readonly RegExp[] = [
  /\b(?:first|then|after|before|finally|next|lastly)\b/i,
  /\bstep\s*(?:\d|by\s*step)\b/i,
  /\bphase\s*\d/i,
  /\b(?:depends on|requires|prerequisite|must first)\b/i,
  /\b(?:once|when)\s+(?:done|complete|finished)\b/i,
];

/**
 * Patterns indicating tool-heavy tasks.
 */
const TOOL_HEAVY_PATTERNS: readonly RegExp[] = [
  /\b(?:run|execute)\s+(?:the\s+)?(?:command|script|query)\b/i,
  /\bcall\s+(?:the\s+)?(?:api|endpoint|function)\b/i,
  /\buse\s+(?:the\s+)?(?:tool|utility|service)\b/i,
];

// =============================================================================
// Feature Extraction Functions
// =============================================================================

/**
 * Count keyword matches for a task type.
 */
function countKeywordMatches(
  description: string,
  keywords: readonly string[],
  signals: TaskSignal[]
): number {
  let count = 0;
  for (const keyword of keywords) {
    if (description.includes(keyword)) {
      count++;
      signals.push({ name: keyword, weight: 1, source: 'keyword' });
    }
  }
  return count;
}

/**
 * Check patterns and add signals.
 */
function checkPatterns(
  description: string,
  patterns: readonly RegExp[],
  signals: TaskSignal[],
  weight: number
): number {
  let matches = 0;
  for (const pattern of patterns) {
    if (pattern.test(description)) {
      matches++;
      signals.push({
        name: pattern.source.slice(0, 30),
        weight,
        source: 'pattern',
      });
    }
  }
  return matches;
}

/**
 * Classify task type based on keyword matches.
 */
function classifyTaskType(
  description: string,
  signals: TaskSignal[]
): { type: ScalingTaskType; score: number } {
  let bestType: ScalingTaskType = 'unknown';
  let bestScore = 0;

  for (const [type, keywords] of Object.entries(TASK_TYPE_KEYWORDS)) {
    if (type === 'unknown') continue;

    const tempSignals: TaskSignal[] = [];
    const score = countKeywordMatches(description, keywords, tempSignals);

    if (score > bestScore) {
      bestScore = score;
      bestType = type as ScalingTaskType;
      // Only add signals for the winning type
      signals.length = 0;
      signals.push(...tempSignals);
    }
  }

  return { type: bestType, score: bestScore };
}

/**
 * Calculate type confidence based on score.
 */
function calculateTypeConfidence(score: number): number {
  if (score === 0) return 0.3;
  // Confidence increases with more matching keywords, capped at 1.0
  // 5+ matches = max confidence
  return Math.min(1, 0.3 + score * 0.14);
}

/**
 * Estimate complexity based on description properties.
 */
function estimateComplexity(description: string): number {
  const wordCount = description.split(/\s+/).length;
  const sentenceCount = description.split(/[.!?]+/).filter(Boolean).length;

  // Complexity factors:
  // - Longer descriptions indicate more complex tasks
  // - More sentences indicate multi-step tasks
  const lengthFactor = Math.min(1, wordCount / 200);
  const structureFactor = Math.min(1, sentenceCount / 10);

  return Math.min(1, lengthFactor * 0.6 + structureFactor * 0.4);
}

/**
 * Estimate token requirement based on task features.
 * Uses unified TokenEstimator with complexity-based output multiplier.
 */
function estimateTokens(description: string, complexity: number): number {
  // Use TokenEstimator for base input token estimate
  const baseInputTokens = getTokenEstimator().estimateText(description);
  // Scale by complexity for expected output
  const complexityMultiplier = 1 + complexity * 2;
  // Output estimate: base scaled by complexity, with minimum threshold
  return Math.max(1000, Math.round(baseInputTokens * 10 * complexityMultiplier));
}

// =============================================================================
// Main Export
// =============================================================================

/**
 * Extract features from a task for scaling prediction.
 *
 * @param task - Task to analyze
 * @returns Extracted task features
 *
 * @example
 * ```typescript
 * const features = extractTaskFeatures({
 *   id: 'task-1',
 *   description: 'Step by step, reason through this mathematical proof',
 *   context: {}
 * });
 * // features.taskType === 'sequential_reasoning'
 * // features.hasSequentialDependencies === true
 * ```
 */
export function extractTaskFeatures(task: Task): TaskFeatures {
  const description = task.description.toLowerCase();
  const signals: TaskSignal[] = [];

  // 1. Classify task type
  const classification = classifyTaskType(description, signals);
  const typeConfidence = calculateTypeConfidence(classification.score);

  // 2. Check for parallelizability
  const parallelMatches = checkPatterns(description, PARALLELIZABLE_PATTERNS, signals, 1);

  // 3. Check for sequential dependencies
  const sequentialMatches = checkPatterns(description, SEQUENTIAL_PATTERNS, signals, -0.5);
  const hasSequentialDependencies = sequentialMatches > 0;

  // 4. Check for tool intensity
  const toolPatternMatches = checkPatterns(description, TOOL_HEAVY_PATTERNS, signals, 0.5);
  const toolKeywords = TASK_TYPE_KEYWORDS.tool_heavy;
  const toolKeywordMatches = toolKeywords.filter((k) => description.includes(k)).length;
  const toolIntensity = Math.min(1, (toolKeywordMatches + toolPatternMatches * 2) / 5);

  // 5. Estimate complexity
  const complexity = estimateComplexity(description);

  // 6. Estimate tokens
  const estimatedTokens = estimateTokens(description, complexity);

  return {
    taskType: classification.type,
    typeConfidence,
    complexity,
    parallelizability: parallelMatches,
    toolIntensity,
    hasSequentialDependencies,
    estimatedTokens,
    signals: Object.freeze([...signals]),
  };
}

/**
 * Quick check if a task is likely parallelizable.
 *
 * @param task - Task to check
 * @returns True if task shows parallelizable signals
 */
export function isLikelyParallelizable(task: Task): boolean {
  const description = task.description.toLowerCase();
  return PARALLELIZABLE_PATTERNS.some((p) => p.test(description));
}

/**
 * Quick check if a task has sequential dependencies.
 *
 * @param task - Task to check
 * @returns True if task shows sequential dependency signals
 */
export function hasSequentialDependencies(task: Task): boolean {
  const description = task.description.toLowerCase();
  return SEQUENTIAL_PATTERNS.some((p) => p.test(description));
}
