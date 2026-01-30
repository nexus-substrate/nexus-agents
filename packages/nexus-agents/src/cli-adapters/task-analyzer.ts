/**
 * nexus-agents/cli-adapters - Task Analyzer
 *
 * Analyzes tasks to create a TaskProfile for intelligent routing.
 * Uses heuristics and keywords to determine task requirements.
 *
 * @deprecated Use SharedTaskAnalyzer from 'nexus-agents/core' instead.
 * This module is superseded by the unified SharedTaskAnalyzer (ADR-0004).
 * Migration: import { createSharedTaskAnalyzer } from 'nexus-agents/core'
 *   - getTaskType() replaces classifyTaskType()
 *   - getCapabilities() replaces analyzeTask() capability flags
 *
 * (Source: Issue #78 - Capability-based task router)
 * (Source: cli-project_plan.md v2.1.0, Phase 2)
 */

import { z } from 'zod';
import type { Task } from '../core/types/agent.js';
import {
  type TaskType,
  TASK_TYPE_KEYWORDS,
  HIGH_COMPLEXITY_KEYWORDS,
  CODE_GENERATION_KEYWORDS,
  MULTIMODAL_KEYWORDS,
  PARALLELIZABLE_KEYWORDS,
  BUDGET_SENSITIVE_KEYWORDS,
  IMAGE_EXTENSIONS,
  TYPE_COMPLEXITY,
} from './task-analyzer-keywords.js';

// Re-export TaskType for backwards compatibility
export type { TaskType } from './task-analyzer-keywords.js';

/**
 * Task profile schema for validation.
 */
export const TaskProfileSchema = z.object({
  /** Estimated input tokens required */
  contextRequired: z.number().min(0),
  /** Reasoning complexity on 0-10 scale */
  reasoningComplexity: z.number().min(0).max(10),
  /** Whether task involves code generation */
  codeGeneration: z.boolean(),
  /** Whether task involves multimodal content (images, etc.) */
  multimodal: z.boolean(),
  /** Whether task can be split into parallel subtasks */
  parallelizable: z.boolean(),
  /** Whether cost should be minimized */
  budgetSensitive: z.boolean(),
  /** Primary task type classification */
  taskType: z.enum([
    'architecture',
    'code_implementation',
    'code_review',
    'test_generation',
    'documentation',
    'large_codebase',
    'bulk_operations',
    'general',
  ]),
});

export type TaskProfile = z.infer<typeof TaskProfileSchema>;

/**
 * Average tokens per character (rough estimate).
 */
const TOKENS_PER_CHAR = 0.25;

/**
 * Base tokens for system prompt and overhead.
 */
const BASE_TOKEN_OVERHEAD = 1000;

/**
 * Analyzes a task to create a TaskProfile for routing decisions.
 *
 * @param task - Task to analyze
 * @returns TaskProfile with analyzed characteristics
 *
 * @example
 * ```typescript
 * const profile = analyzeTask({
 *   id: '1',
 *   description: 'Implement a new authentication module',
 *   context: { files: ['src/auth.ts'] }
 * });
 * // profile.codeGeneration === true
 * // profile.taskType === 'code_implementation'
 * ```
 */
export function analyzeTask(task: Task): TaskProfile {
  const text = normalizeText(task.description);
  const contextText = extractContextText(task);

  const taskType = classifyTaskType(text);
  const contextRequired = estimateContextTokens(task, contextText);
  const reasoningComplexity = calculateComplexity(text, taskType);
  const codeGeneration = detectCodeGeneration(text, taskType);
  const multimodal = detectMultimodal(text, task);
  const parallelizable = detectParallelizable(text, taskType);
  const budgetSensitive = detectBudgetSensitivity(text, task);

  return {
    contextRequired,
    reasoningComplexity,
    codeGeneration,
    multimodal,
    parallelizable,
    budgetSensitive,
    taskType,
  };
}

/**
 * Normalizes text for keyword matching.
 */
function normalizeText(text: string): string {
  return text.toLowerCase().trim();
}

/**
 * Extracts additional context text from task.
 */
function extractContextText(task: Task): string {
  const parts: string[] = [];

  if (task.context.history !== undefined) {
    for (const item of task.context.history) {
      parts.push(item.content);
    }
  }

  if (task.context.metadata !== undefined) {
    parts.push(JSON.stringify(task.context.metadata));
  }

  return parts.join(' ');
}

/**
 * Classifies the primary task type based on keywords.
 */
function classifyTaskType(text: string): TaskType {
  let bestMatch: TaskType = 'general';
  let bestScore = 0;

  const taskTypes = Object.keys(TASK_TYPE_KEYWORDS) as TaskType[];
  for (const taskType of taskTypes) {
    if (taskType === 'general') continue;

    const keywords = TASK_TYPE_KEYWORDS[taskType];
    const score = countKeywordMatches(text, keywords);

    if (score > bestScore) {
      bestScore = score;
      bestMatch = taskType;
    }
  }

  return bestMatch;
}

/**
 * Counts keyword matches in text.
 */
function countKeywordMatches(text: string, keywords: readonly string[]): number {
  let count = 0;
  for (const keyword of keywords) {
    if (text.includes(keyword)) {
      count++;
    }
  }
  return count;
}

/**
 * Estimates context tokens required for the task.
 */
function estimateContextTokens(task: Task, contextText: string): number {
  let tokens = BASE_TOKEN_OVERHEAD;

  // Task description
  tokens += Math.ceil(task.description.length * TOKENS_PER_CHAR);

  // Context text (history, metadata)
  tokens += Math.ceil(contextText.length * TOKENS_PER_CHAR);

  // File context (estimate based on file count)
  if (task.context.files !== undefined) {
    // Rough estimate: 500 tokens per file on average
    tokens += task.context.files.length * 500;
  }

  // Apply constraints if specified
  if (task.constraints?.maxTokens !== undefined) {
    tokens = Math.min(tokens, task.constraints.maxTokens);
  }

  return tokens;
}

/**
 * Calculates reasoning complexity (0-10 scale).
 */
function calculateComplexity(text: string, taskType: TaskType): number {
  // Get base complexity from task type
  let complexity = TYPE_COMPLEXITY[taskType];

  // Adjust based on complexity keywords
  const complexityKeywordCount = countKeywordMatches(text, HIGH_COMPLEXITY_KEYWORDS);
  complexity += Math.min(complexityKeywordCount, 3); // Max +3 from keywords

  // Clamp to 0-10
  return Math.min(10, Math.max(0, complexity));
}

/**
 * Detects if task involves code generation.
 */
function detectCodeGeneration(text: string, taskType: TaskType): boolean {
  // Task types that always involve code generation
  const codeGenTypes: TaskType[] = ['code_implementation', 'test_generation'];
  if (codeGenTypes.includes(taskType)) {
    return true;
  }

  // Check for code generation keywords
  return countKeywordMatches(text, CODE_GENERATION_KEYWORDS) >= 2;
}

/**
 * Detects if task involves multimodal content.
 */
function detectMultimodal(text: string, task: Task): boolean {
  // Check keywords
  if (countKeywordMatches(text, MULTIMODAL_KEYWORDS) >= 1) {
    return true;
  }

  // Check for image files in context
  if (task.context.files !== undefined) {
    for (const file of task.context.files) {
      const lower = file.toLowerCase();
      if (IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Detects if task can be parallelized.
 */
function detectParallelizable(text: string, taskType: TaskType): boolean {
  // Bulk operations are inherently parallelizable
  if (taskType === 'bulk_operations') {
    return true;
  }

  // Check for parallelizable keywords
  return countKeywordMatches(text, PARALLELIZABLE_KEYWORDS) >= 2;
}

/**
 * Detects if task is budget sensitive.
 */
function detectBudgetSensitivity(text: string, task: Task): boolean {
  // Check keywords
  if (countKeywordMatches(text, BUDGET_SENSITIVE_KEYWORDS) >= 1) {
    return true;
  }

  // Low priority tasks are budget sensitive
  if (task.priority !== undefined && task.priority < 3) {
    return true;
  }

  return false;
}

/**
 * Gets a human-readable summary of a task profile.
 *
 * @param profile - Task profile to summarize
 * @returns Human-readable summary string
 */
export function summarizeProfile(profile: TaskProfile): string {
  const parts: string[] = [
    `Type: ${profile.taskType}`,
    `Context: ~${String(profile.contextRequired)} tokens`,
    `Complexity: ${String(profile.reasoningComplexity)}/10`,
  ];

  const flags: string[] = [];
  if (profile.codeGeneration) flags.push('code-gen');
  if (profile.multimodal) flags.push('multimodal');
  if (profile.parallelizable) flags.push('parallel');
  if (profile.budgetSensitive) flags.push('budget');

  if (flags.length > 0) {
    parts.push(`Flags: [${flags.join(', ')}]`);
  }

  return parts.join(' | ');
}
