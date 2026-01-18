/**
 * nexus-agents/cli-adapters - Task Classifier for Fallback Chains
 *
 * Classifies tasks into types for selecting appropriate fallback chains.
 * Uses keyword-based classification with configurable patterns.
 *
 * @module cli-adapters/task-classifier
 * (Source: Issue #362 - Task-type-aware fallback chains)
 */

import { z } from 'zod';

/**
 * Task types for fallback chain routing.
 * Distinct from TaskProfile.taskType - these are optimized for CLI selection.
 */
export type FallbackTaskType = 'code' | 'research' | 'documentation' | 'analysis' | 'general';

/**
 * Classification result with confidence score.
 */
export interface TaskClassification {
  /** Classified task type */
  readonly type: FallbackTaskType;
  /** Confidence score (0-1) */
  readonly confidence: number;
  /** Keywords that matched */
  readonly matchedKeywords: readonly string[];
  /** Alternative type if confidence is low */
  readonly alternativeType?: FallbackTaskType | undefined;
}

/**
 * Configurable keyword patterns for task classification.
 */
export interface ClassificationPatterns {
  /** Keywords for code tasks */
  readonly code: readonly string[];
  /** Keywords for research tasks */
  readonly research: readonly string[];
  /** Keywords for documentation tasks */
  readonly documentation: readonly string[];
  /** Keywords for analysis tasks */
  readonly analysis: readonly string[];
}

/**
 * Zod schema for classification patterns.
 */
export const ClassificationPatternsSchema = z.object({
  code: z.array(z.string()).readonly(),
  research: z.array(z.string()).readonly(),
  documentation: z.array(z.string()).readonly(),
  analysis: z.array(z.string()).readonly(),
});

/**
 * Default keyword patterns for task classification.
 * Optimized for CLI routing decisions.
 */
export const DEFAULT_CLASSIFICATION_PATTERNS: ClassificationPatterns = {
  code: [
    'implement',
    'create',
    'build',
    'write code',
    'function',
    'class',
    'module',
    'fix bug',
    'debug',
    'refactor',
    'test',
    'unit test',
    'integration',
    'endpoint',
    'api',
    'compile',
    'typescript',
    'javascript',
    'python',
    'rust',
    'go',
    'code review',
    'pull request',
    'pr',
    'merge',
    'git',
  ],
  research: [
    'research',
    'investigate',
    'explore',
    'find',
    'search',
    'look up',
    'what is',
    'how does',
    'explain',
    'understand',
    'learn',
    'study',
    'compare',
    'alternatives',
    'options',
    'best practices',
    'state of the art',
    'latest',
    'current',
    'trends',
  ],
  documentation: [
    'document',
    'readme',
    'docs',
    'jsdoc',
    'comment',
    'tutorial',
    'guide',
    'how to',
    'instructions',
    'changelog',
    'release notes',
    'api doc',
    'reference',
    'specification',
    'spec',
    'describe',
    'explain how',
    'write up',
  ],
  analysis: [
    'analyze',
    'review',
    'audit',
    'evaluate',
    'assess',
    'inspect',
    'check',
    'verify',
    'validate',
    'security',
    'performance',
    'benchmark',
    'profile',
    'metrics',
    'report',
    'summary',
    'insights',
    'findings',
    'issues',
    'problems',
  ],
} as const;

/**
 * Minimum confidence threshold for classification.
 */
const MIN_CONFIDENCE_THRESHOLD = 0.3;

/**
 * Classifies a task based on its content.
 *
 * @param content - Task content/description to classify
 * @param patterns - Optional custom classification patterns
 * @returns Classification result with type, confidence, and matched keywords
 *
 * @example
 * ```typescript
 * const result = classifyTask('Implement a new authentication module');
 * // result.type === 'code'
 * // result.confidence === 0.7
 * ```
 */
export function classifyTask(
  content: string,
  patterns: ClassificationPatterns = DEFAULT_CLASSIFICATION_PATTERNS
): TaskClassification {
  const normalizedContent = normalizeContent(content);

  // Score each task type
  const scores = scoreAllTypes(normalizedContent, patterns);

  // Find best and second-best matches
  const sortedScores = [...scores].sort((a, b) => b.score - a.score);
  const best = sortedScores[0];
  const secondBest = sortedScores[1];

  if (best === undefined || best.score === 0) {
    return createGeneralClassification();
  }

  const confidence = calculateConfidence(best.score, normalizedContent.length);
  const alternativeType = determineAlternative(best, secondBest, confidence);

  return {
    type: best.type,
    confidence,
    matchedKeywords: best.matchedKeywords,
    alternativeType,
  };
}

/**
 * Normalizes content for keyword matching.
 */
function normalizeContent(content: string): string {
  return content.toLowerCase().trim();
}

/**
 * Scores all task types based on keyword matches.
 */
function scoreAllTypes(
  content: string,
  patterns: ClassificationPatterns
): Array<{ type: FallbackTaskType; score: number; matchedKeywords: string[] }> {
  const types: Array<Exclude<FallbackTaskType, 'general'>> = [
    'code',
    'research',
    'documentation',
    'analysis',
  ];

  return types.map((type) => {
    const keywords = patterns[type];
    const matchedKeywords = findMatchedKeywords(content, keywords);
    const score = calculateTypeScore(matchedKeywords, keywords.length);
    return { type, score, matchedKeywords };
  });
}

/**
 * Finds keywords that match in the content.
 */
function findMatchedKeywords(content: string, keywords: readonly string[]): string[] {
  const matched: string[] = [];
  for (const keyword of keywords) {
    if (content.includes(keyword)) {
      matched.push(keyword);
    }
  }
  return matched;
}

/**
 * Calculates score for a task type.
 * Uses ratio of matched keywords with diminishing returns.
 */
function calculateTypeScore(matchedKeywords: string[], totalKeywords: number): number {
  if (matchedKeywords.length === 0 || totalKeywords === 0) {
    return 0;
  }

  // Base score from match ratio
  const matchRatio = matchedKeywords.length / totalKeywords;

  // Bonus for multiple matches (up to 5)
  const matchBonus = Math.min(matchedKeywords.length, 5) * 0.1;

  return Math.min(1, matchRatio + matchBonus);
}

/**
 * Calculates confidence based on score and content length.
 * Longer content with matches gets higher confidence.
 */
function calculateConfidence(score: number, contentLength: number): number {
  // Base confidence from score
  let confidence = score;

  // Boost for longer content (more context = more reliable)
  if (contentLength > 100) {
    confidence += 0.1;
  }
  if (contentLength > 300) {
    confidence += 0.1;
  }

  return Math.min(1, Math.max(0, confidence));
}

/**
 * Determines alternative type if confidence is borderline.
 */
function determineAlternative(
  best: { type: FallbackTaskType; score: number },
  secondBest: { type: FallbackTaskType; score: number } | undefined,
  confidence: number
): FallbackTaskType | undefined {
  // If confidence is low, suggest general as alternative
  if (confidence < MIN_CONFIDENCE_THRESHOLD) {
    return 'general';
  }

  // If second-best is close to best, suggest it as alternative
  if (secondBest !== undefined && secondBest.score > 0) {
    const scoreDiff = best.score - secondBest.score;
    if (scoreDiff < 0.2) {
      return secondBest.type;
    }
  }

  return undefined;
}

/**
 * Creates a default general classification.
 */
function createGeneralClassification(): TaskClassification {
  return {
    type: 'general',
    confidence: 0.5,
    matchedKeywords: [],
    alternativeType: undefined,
  };
}

/**
 * Checks if a task type is a code-related type.
 */
export function isCodeTask(type: FallbackTaskType): boolean {
  return type === 'code';
}

/**
 * Checks if a task type is a research-related type.
 */
export function isResearchTask(type: FallbackTaskType): boolean {
  return type === 'research';
}

/**
 * Gets all available task types.
 */
export function getAllTaskTypes(): readonly FallbackTaskType[] {
  return ['code', 'research', 'documentation', 'analysis', 'general'] as const;
}
