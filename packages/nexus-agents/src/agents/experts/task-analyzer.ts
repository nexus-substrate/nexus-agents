/**
 * nexus-agents/agents - Task Analyzer
 *
 * Analyzes tasks to extract features for expert matching.
 * Uses keyword extraction and pattern matching to determine domain, complexity,
 * and required capabilities.
 *
 * @deprecated Use SharedTaskAnalyzer from 'nexus-agents/core' instead.
 * This module is superseded by the unified SharedTaskAnalyzer (ADR-0004).
 * Migration: import { createSharedTaskAnalyzer } from 'nexus-agents/core'
 *   - analyze() provides unified task analysis
 *   - getComplexity() replaces complexity estimation
 */

import type { Task, Result } from '../../core/index.js';
import { ok, err } from '../../core/index.js';
import { clamp } from '../../utils/math-utils.js';
import {
  type TaskAnalysisResult,
  type TaskDomain,
  type TaskComplexity,
  TaskDomain as TaskDomainConst,
  TaskComplexity as TaskComplexityConst,
  TaskAnalysisResultSchema,
  AnalysisError,
} from './task-analyzer-types.js';
import {
  DOMAIN_KEYWORDS,
  CAPABILITY_KEYWORDS,
  COMPLEXITY_INDICATORS,
} from './task-analyzer-keywords.js';
// Shared utilities per ADR-0013
import { STOPWORDS } from '../../utils/text-utils.js';

// Re-export types
export {
  AnalysisError,
  TaskDomain,
  TaskComplexity,
  type TaskAnalysisResult,
  TaskAnalysisResultSchema,
} from './task-analyzer-types.js';

// ============================================================================
// Keyword Extraction
// ============================================================================

/**
 * Extracts keywords from task description.
 * Removes stop words and normalizes text.
 */
function extractKeywords(text: string): string[] {
  // Normalize text: lowercase, remove punctuation, split on whitespace
  const words = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));

  // Return unique keywords
  return [...new Set(words)];
}

// ============================================================================
// Domain Analysis
// ============================================================================

/**
 * Calculates domain scores based on keyword matching.
 */
function calculateDomainScores(keywords: string[]): Map<TaskDomain, number> {
  const scores = new Map<TaskDomain, number>();
  const domains = Object.keys(DOMAIN_KEYWORDS) as TaskDomain[];

  for (const domain of domains) {
    const { primary, secondary } = DOMAIN_KEYWORDS[domain];
    let score = 0;

    for (const keyword of keywords) {
      if (primary.some((p) => keyword.includes(p) || p.includes(keyword))) {
        score += 2; // Primary keywords have higher weight
      } else if (secondary.some((s) => keyword.includes(s) || s.includes(keyword))) {
        score += 1; // Secondary keywords have lower weight
      }
    }

    scores.set(domain, score);
  }

  return scores;
}

/**
 * Determines primary and secondary domains from scores.
 */
function determineDomains(scores: Map<TaskDomain, number>): {
  primary: TaskDomain;
  secondary: TaskDomain[];
} {
  const entries = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const firstEntry = entries[0];

  if (entries.length === 0 || firstEntry === undefined || firstEntry[1] === 0) {
    return { primary: TaskDomainConst.GENERAL, secondary: [] };
  }

  const primary = firstEntry[0];
  const threshold = firstEntry[1] * 0.5; // Secondary domains need at least 50% of primary score

  const secondary = entries
    .slice(1)
    .filter(([, score]) => score >= threshold && score > 0)
    .map(([domain]) => domain);

  return { primary, secondary };
}

// ============================================================================
// Capability Analysis
// ============================================================================

/**
 * Determines required capabilities based on keywords.
 */
function determineCapabilities(keywords: string[]): string[] {
  const capabilities: Set<string> = new Set();

  for (const [capability, capKeywords] of Object.entries(CAPABILITY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (capKeywords.some((ck) => keyword.includes(ck) || ck.includes(keyword))) {
        capabilities.add(capability);
        break;
      }
    }
  }

  // Always include task_execution as base capability
  capabilities.add('task_execution');

  return [...capabilities];
}

// ============================================================================
// Complexity Analysis
// ============================================================================

/**
 * Calculates complexity scores from text.
 */
function calculateComplexityScores(lowerText: string): {
  high: number;
  medium: number;
  low: number;
} {
  let highScore = 0;
  let mediumScore = 0;
  let lowScore = 0;

  for (const indicator of COMPLEXITY_INDICATORS.high) {
    if (lowerText.includes(indicator)) {
      highScore += 2;
    }
  }

  for (const indicator of COMPLEXITY_INDICATORS.medium) {
    if (lowerText.includes(indicator)) {
      mediumScore += 1;
    }
  }

  for (const indicator of COMPLEXITY_INDICATORS.low) {
    if (lowerText.includes(indicator)) {
      lowScore += 2;
    }
  }

  return { high: highScore, medium: mediumScore, low: lowScore };
}

/**
 * Determines task complexity based on indicators.
 */
function determineComplexity(text: string, keywords: string[]): TaskComplexity {
  const lowerText = text.toLowerCase();
  const scores = calculateComplexityScores(lowerText);

  // Consider text length as a factor
  const wordCount = keywords.length;
  if (wordCount > 50) {
    scores.high += 2;
  } else if (wordCount > 20) {
    scores.medium += 1;
  }

  // Determine complexity based on scores
  if (scores.high > scores.medium && scores.high > scores.low) {
    return TaskComplexityConst.HIGH;
  } else if (scores.low > scores.medium) {
    return TaskComplexityConst.LOW;
  }

  return TaskComplexityConst.MEDIUM;
}

// ============================================================================
// Effort Estimation
// ============================================================================

/**
 * Gets base effort from complexity level.
 */
function getBaseEffort(complexity: TaskComplexity): number {
  switch (complexity) {
    case TaskComplexityConst.HIGH:
      return 7;
    case TaskComplexityConst.MEDIUM:
      return 4;
    case TaskComplexityConst.LOW:
      return 2;
  }
}

/**
 * Estimates effort on 1-10 scale.
 */
function estimateEffort(
  complexity: TaskComplexity,
  keywords: string[],
  secondaryDomains: TaskDomain[]
): number {
  let baseEffort = getBaseEffort(complexity);

  // Adjust based on keyword count
  const keywordFactor = Math.min(keywords.length / 20, 1); // Max 1 point for many keywords
  baseEffort += keywordFactor;

  // Adjust for multiple domains
  baseEffort += secondaryDomains.length * 0.5;

  // Clamp to 1-10 range
  return clamp(Math.round(baseEffort), 1, 10);
}

// ============================================================================
// Confidence Calculation
// ============================================================================

/**
 * Calculates confidence in the analysis.
 */
function calculateConfidence(domainScores: Map<TaskDomain, number>, keywords: string[]): number {
  const scores = [...domainScores.values()];
  const maxScore = Math.max(...scores);
  const totalScore = scores.reduce((a, b) => a + b, 0);

  if (totalScore === 0 || keywords.length === 0) {
    return 0.3; // Low confidence for tasks with no matching keywords
  }

  // Confidence is higher when one domain clearly dominates
  const dominance = maxScore / totalScore;
  const keywordCoverage = Math.min(keywords.length / 10, 1); // More keywords = higher confidence

  return Math.min(0.95, dominance * 0.6 + keywordCoverage * 0.4);
}

// ============================================================================
// Full Text Building
// ============================================================================

/**
 * Builds full text for analysis from task.
 */
function buildFullText(task: Task): string {
  let fullText = task.description;

  const workingDir = task.context.workingDirectory;
  if (workingDir !== undefined && workingDir !== '') {
    fullText += ` ${workingDir}`;
  }

  if (task.context.files !== undefined && task.context.files.length > 0) {
    fullText += ` ${task.context.files.join(' ')}`;
  }

  return fullText;
}

// ============================================================================
// Main Analysis Function
// ============================================================================

/**
 * Analyzes a task to extract features for expert matching.
 *
 * @param task - The task to analyze
 * @returns Result containing TaskAnalysisResult or AnalysisError
 */
export function analyzeTask(task: Task): Result<TaskAnalysisResult, AnalysisError> {
  // Validate task input
  if (task.description.trim().length === 0) {
    return err(
      new AnalysisError('Task description is required for analysis', {
        context: { taskId: task.id },
      })
    );
  }

  try {
    // Combine description with context for analysis
    const fullText = buildFullText(task);

    // Extract keywords
    const keywords = extractKeywords(fullText);

    // Calculate domain scores
    const domainScores = calculateDomainScores(keywords);

    // Determine primary and secondary domains
    const { primary: domain, secondary: secondaryDomains } = determineDomains(domainScores);

    // Determine required capabilities
    const requiredCapabilities = determineCapabilities(keywords);

    // Determine complexity
    const complexity = determineComplexity(fullText, keywords);

    // Estimate effort
    const estimatedEffort = estimateEffort(complexity, keywords, secondaryDomains);

    // Calculate confidence
    const confidence = calculateConfidence(domainScores, keywords);

    const result: TaskAnalysisResult = {
      domain,
      complexity,
      requiredCapabilities,
      keywords,
      estimatedEffort,
      secondaryDomains,
      confidence,
    };

    // Validate result against schema
    const validation = TaskAnalysisResultSchema.safeParse(result);
    if (!validation.success) {
      return err(
        new AnalysisError('Analysis result validation failed', {
          context: { taskId: task.id, validationErrors: validation.error.issues },
        })
      );
    }

    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const options: { cause?: Error; context: { taskId: string } } = {
      context: { taskId: task.id },
    };
    if (error instanceof Error) {
      options.cause = error;
    }
    return err(new AnalysisError(`Task analysis failed: ${message}`, options));
  }
}
