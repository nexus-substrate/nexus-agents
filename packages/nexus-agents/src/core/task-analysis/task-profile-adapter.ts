/**
 * Task Profile Adapter
 *
 * Provides compatibility bridge between SharedTaskAnalyzer's TaskAnalysisResult
 * and the legacy TaskProfile type used by router components.
 *
 * This adapter enables gradual migration from deprecated task-analyzer.ts
 * to the unified SharedTaskAnalyzer (ADR-0004, Issue #574, Issue #586).
 *
 * @module core/task-analysis/task-profile-adapter
 * (Source: Issue #586 - Migrate routers to SharedTaskAnalyzer)
 */

import type { TaskAnalysisResult, TaskTypeCategory } from './shared-task-analyzer.js';

/**
 * Legacy TaskProfile type for backward compatibility.
 *
 * This mirrors the type from cli-adapters/task-analyzer.ts to enable
 * gradual migration without breaking existing router code.
 */
export interface TaskProfile {
  /** Estimated input tokens required */
  readonly contextRequired: number;
  /** Reasoning complexity on 0-10 scale */
  readonly reasoningComplexity: number;
  /** Whether task involves code generation */
  readonly codeGeneration: boolean;
  /** Whether task involves multimodal content (images, etc.) */
  readonly multimodal: boolean;
  /** Whether task can be split into parallel subtasks */
  readonly parallelizable: boolean;
  /** Whether cost should be minimized */
  readonly budgetSensitive: boolean;
  /** Primary task type classification */
  readonly taskType: TaskTypeCategory;
}

/**
 * Converts TaskAnalysisResult to legacy TaskProfile format.
 *
 * This enables existing code that expects TaskProfile to work with
 * the new SharedTaskAnalyzer without modification.
 *
 * @param analysis - Result from SharedTaskAnalyzer.analyze()
 * @returns TaskProfile compatible with legacy router code
 *
 * @example
 * ```typescript
 * import { createSharedTaskAnalyzer, taskAnalysisResultToTaskProfile } from 'nexus-agents/core';
 *
 * const analyzer = createSharedTaskAnalyzer();
 * const analysis = analyzer.analyze(task);
 * const profile = taskAnalysisResultToTaskProfile(analysis);
 * // profile.reasoningComplexity is 0-10 scale
 * ```
 */
export function taskAnalysisResultToTaskProfile(analysis: TaskAnalysisResult): TaskProfile {
  return {
    // Token estimation - add 500 offset for legacy compatibility
    // Legacy used BASE_TOKEN_OVERHEAD=1000, new uses 500
    contextRequired: analysis.estimatedTokens + 500,

    // Convert 0-1 complexity score to 0-10 scale
    reasoningComplexity: Math.round(analysis.complexityScore * 10),

    // Capability flags map directly
    codeGeneration: analysis.capabilities.codeGeneration,
    multimodal: analysis.capabilities.multimodal,
    parallelizable: analysis.capabilities.parallelizable,
    budgetSensitive: analysis.capabilities.budgetSensitive,

    // Task type maps directly (same enum values)
    taskType: analysis.taskType,
  };
}

/**
 * Summarizes a TaskProfile for logging (legacy compatibility).
 *
 * @param profile - TaskProfile to summarize
 * @returns Human-readable summary string
 */
export function summarizeTaskProfile(profile: TaskProfile): string {
  const flags: string[] = [];
  if (profile.codeGeneration) flags.push('code');
  if (profile.multimodal) flags.push('multimodal');
  if (profile.parallelizable) flags.push('parallel');
  if (profile.budgetSensitive) flags.push('budget');

  return `Type: ${profile.taskType} | Complexity: ${String(profile.reasoningComplexity)}/10 | Tokens: ~${String(profile.contextRequired)}${flags.length > 0 ? ` | Flags: ${flags.join(', ')}` : ''}`;
}

/**
 * Converts TaskAnalysisResult to BanditContext for LinUCB routing.
 *
 * Replaces taskProfileToBanditContext() from composite-router-helpers.ts.
 *
 * @param analysis - Result from SharedTaskAnalyzer.analyze()
 * @returns BanditContext for LinUCB bandit algorithm
 */
export interface BanditContext {
  readonly taskComplexity: number;
  readonly contextLengthNormalized: number;
  readonly isCodeTask: number;
  readonly isReasoningTask: number;
  readonly budgetUtilization: number;
  readonly timePressure: number;
}

export function taskAnalysisResultToBanditContext(
  analysis: TaskAnalysisResult,
  options: { budgetUtilization?: number; timePressure?: number } = {}
): BanditContext {
  return {
    // Complexity score already 0-1
    taskComplexity: analysis.complexityScore,

    // Normalize token count (100K max for scaling)
    contextLengthNormalized: Math.min(analysis.estimatedTokens / 100_000, 1),

    // Binary flags as 0/1
    isCodeTask: analysis.capabilities.codeGeneration ? 1 : 0,
    isReasoningTask:
      analysis.reasoningType === 'reasoning' ? 1 : analysis.complexityScore > 0.5 ? 0.5 : 0,

    // External context (default mid-range if not provided)
    budgetUtilization: options.budgetUtilization ?? 0.5,
    timePressure: options.timePressure ?? 0.3,
  };
}
