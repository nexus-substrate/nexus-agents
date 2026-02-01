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
 * NOTE: This module now delegates to SharedTaskAnalyzer internally (Issue #574).
 * Exports are maintained for backward compatibility but will be removed in v3.0.
 *
 * (Source: Issue #78 - Capability-based task router)
 * (Source: Issue #574 - Router consolidation)
 * (Source: cli-project_plan.md v2.1.0, Phase 2)
 */

import { z } from 'zod';
import type { Task } from '../core/types/agent.js';
import { clampScore } from '../utils/math-utils.js';
import {
  type TaskType,
  IMAGE_EXTENSIONS,
  BUDGET_SENSITIVE_KEYWORDS,
  HIGH_COMPLEXITY_KEYWORDS,
  TYPE_COMPLEXITY,
  TASK_TYPE_KEYWORDS,
  MULTIMODAL_KEYWORDS,
  PARALLELIZABLE_KEYWORDS,
  CODE_GENERATION_KEYWORDS,
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
 * Analyzes a task to create a TaskProfile for routing decisions.
 *
 * @deprecated Use SharedTaskAnalyzer.analyze() from 'nexus-agents/core' instead.
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
  // Use legacy detection algorithms for backward compatibility (Issue #574)
  // Note: SharedTaskAnalyzer provides a modern alternative with different behavior.
  // This implementation is preserved for exact API compatibility with existing consumers.
  return analyzeTaskLegacy(task);
}

// Token estimation constants (matches old behavior)
const TOKENS_PER_FILE = 500;
const BASE_TOKEN_OVERHEAD = 1000;
const TOKENS_PER_CHAR = 0.25;

/**
 * Legacy task analysis implementation.
 *
 * Uses original keyword-based detection algorithms to maintain exact
 * backward compatibility with existing tests and consumers.
 */
function analyzeTaskLegacy(task: Task): TaskProfile {
  const text = task.description.toLowerCase();

  // Use legacy task type classification
  const taskType = classifyTaskTypeCompat(text);

  // Use legacy complexity scoring for backward compatibility
  const reasoningComplexity = calculateComplexityCompat(text, taskType);

  // Use legacy multimodal detection
  const multimodal = detectMultimodalCompat(text, task);

  // Use legacy parallelizable detection
  const parallelizable = detectParallelizableCompat(text, taskType);

  // Use legacy code generation detection
  const codeGeneration = detectCodeGenerationCompat(text, taskType);

  // Calculate contextRequired with file-based estimation (backward compatible)
  let contextRequired = estimateContextTokensCompat(task);

  // Apply constraints if specified
  if (task.constraints?.maxTokens !== undefined) {
    contextRequired = Math.min(contextRequired, task.constraints.maxTokens);
  }

  // Budget sensitivity: use legacy keyword detection (backward compatible)
  const budgetSensitive = detectBudgetSensitivityCompat(task);

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
 * Classifies task type using legacy algorithm (backward compatible).
 */
function classifyTaskTypeCompat(text: string): TaskType {
  let bestMatch: TaskType = 'general';
  let bestScore = 0;

  const taskTypes = Object.keys(TASK_TYPE_KEYWORDS) as TaskType[];
  for (const taskType of taskTypes) {
    if (taskType === 'general') continue;

    const keywords = TASK_TYPE_KEYWORDS[taskType];
    let score = 0;
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        score++;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = taskType;
    }
  }

  return bestMatch;
}

/**
 * Detects multimodal content using legacy algorithm (backward compatible).
 */
function detectMultimodalCompat(text: string, task: Task): boolean {
  // Check keywords
  for (const keyword of MULTIMODAL_KEYWORDS) {
    if (text.includes(keyword)) {
      return true;
    }
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
 * Detects parallelizable tasks using legacy algorithm (backward compatible).
 */
function detectParallelizableCompat(text: string, taskType: TaskType): boolean {
  // Bulk operations are inherently parallelizable
  if (taskType === 'bulk_operations') {
    return true;
  }

  // Check for parallelizable keywords (requires >= 2)
  let count = 0;
  for (const keyword of PARALLELIZABLE_KEYWORDS) {
    if (text.includes(keyword)) {
      count++;
    }
  }
  return count >= 2;
}

/**
 * Detects code generation using legacy algorithm (backward compatible).
 */
function detectCodeGenerationCompat(text: string, taskType: TaskType): boolean {
  // Task types that always involve code generation
  const codeGenTypes: TaskType[] = ['code_implementation', 'test_generation'];
  if (codeGenTypes.includes(taskType)) {
    return true;
  }

  // Check for code generation keywords (requires >= 2)
  let count = 0;
  for (const keyword of CODE_GENERATION_KEYWORDS) {
    if (text.includes(keyword)) {
      count++;
    }
  }
  return count >= 2;
}

/**
 * Calculates reasoning complexity using legacy algorithm (backward compatible).
 */
function calculateComplexityCompat(text: string, taskType: TaskType): number {
  const lower = text.toLowerCase();

  // Get base complexity from task type
  let complexity = TYPE_COMPLEXITY[taskType];

  // Adjust based on complexity keywords (max +3)
  let keywordCount = 0;
  for (const keyword of HIGH_COMPLEXITY_KEYWORDS) {
    if (lower.includes(keyword)) {
      keywordCount++;
    }
  }
  complexity += Math.min(keywordCount, 3);

  // Clamp to 0-10
  return clampScore(complexity);
}

/**
 * Detects budget sensitivity using legacy algorithm (backward compatible).
 */
function detectBudgetSensitivityCompat(task: Task): boolean {
  const lower = task.description.toLowerCase();

  // Check keywords
  for (const keyword of BUDGET_SENSITIVE_KEYWORDS) {
    if (lower.includes(keyword)) {
      return true;
    }
  }

  // Low priority tasks are budget sensitive
  if (task.priority !== undefined && task.priority < 3) {
    return true;
  }

  return false;
}

/**
 * Estimates context tokens with file-based calculation (backward compatible).
 */
function estimateContextTokensCompat(task: Task): number {
  let tokens = BASE_TOKEN_OVERHEAD;

  // Task description
  tokens += Math.ceil(task.description.length * TOKENS_PER_CHAR);

  // Context history and metadata
  if (task.context.history !== undefined) {
    for (const item of task.context.history) {
      tokens += Math.ceil(item.content.length * TOKENS_PER_CHAR);
    }
  }
  if (task.context.metadata !== undefined) {
    tokens += Math.ceil(JSON.stringify(task.context.metadata).length * TOKENS_PER_CHAR);
  }

  // File context: 500 tokens per file on average
  if (task.context.files !== undefined) {
    tokens += task.context.files.length * TOKENS_PER_FILE;
  }

  return tokens;
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
