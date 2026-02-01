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

import type {
  TaskAnalysisResult as SharedTaskAnalysisResult,
  TaskTypeCategory,
  ComplexityLevel,
} from './shared-task-analyzer.js';
import { clamp } from '../../utils/math-utils.js';

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
export function taskAnalysisResultToTaskProfile(analysis: SharedTaskAnalysisResult): TaskProfile {
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
  analysis: SharedTaskAnalysisResult,
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

// ============================================================================
// Expert Selector Adapter (ADR-0004, Issue #593)
// ============================================================================

/**
 * Legacy TaskDomain type for expert-selector compatibility.
 * Maps to domain values used by expert definitions.
 */
export type ExpertTaskDomain =
  | 'code'
  | 'security'
  | 'architecture'
  | 'documentation'
  | 'testing'
  | 'infrastructure'
  | 'general';

/**
 * Legacy TaskComplexity type for expert-selector compatibility.
 */
export type ExpertTaskComplexity = 'low' | 'medium' | 'high';

/**
 * Legacy TaskAnalysisResult type for expert-selector compatibility.
 *
 * This mirrors the type from agents/experts/task-analyzer-types.ts
 * to enable migration without changing expert definitions.
 */
export interface ExpertTaskAnalysisResult {
  /** Primary domain of the task */
  readonly domain: ExpertTaskDomain;
  /** Task complexity level */
  readonly complexity: ExpertTaskComplexity;
  /** Required capabilities for the task */
  readonly requiredCapabilities: readonly string[];
  /** Keywords extracted from the task */
  readonly keywords: readonly string[];
  /** Estimated effort on 1-10 scale */
  readonly estimatedEffort: number;
  /** Secondary domains if task spans multiple areas */
  readonly secondaryDomains: readonly ExpertTaskDomain[];
  /** Confidence in the analysis (0-1) */
  readonly confidence: number;
}

/**
 * Maps TaskTypeCategory to ExpertTaskDomain.
 */
function mapTaskTypeToDomain(taskType: TaskTypeCategory): ExpertTaskDomain {
  const mapping: Record<TaskTypeCategory, ExpertTaskDomain> = {
    architecture: 'architecture',
    code_implementation: 'code',
    code_review: 'code',
    test_generation: 'testing',
    documentation: 'documentation',
    large_codebase: 'code',
    bulk_operations: 'infrastructure',
    general: 'general',
  };
  return mapping[taskType];
}

/**
 * Maps ComplexityLevel to ExpertTaskComplexity.
 */
function mapComplexityLevel(level: ComplexityLevel): ExpertTaskComplexity {
  const mapping: Record<ComplexityLevel, ExpertTaskComplexity> = {
    simple: 'low',
    moderate: 'medium',
    complex: 'high',
    expert: 'high',
  };
  return mapping[level];
}

/**
 * Extracts required capabilities from analysis.
 */
function extractRequiredCapabilities(analysis: SharedTaskAnalysisResult): string[] {
  const capabilities: string[] = [];

  // Map capability flags to capability strings
  if (analysis.capabilities.codeGeneration) capabilities.push('code-generation');
  if (analysis.capabilities.multimodal) capabilities.push('multimodal');
  if (analysis.capabilities.parallelizable) capabilities.push('parallel-execution');
  if (analysis.capabilities.highContext) capabilities.push('large-context');

  // Map reasoning type to capabilities
  if (analysis.reasoningType === 'reasoning') {
    capabilities.push('complex-reasoning', 'problem-solving');
  }

  // Map complexity to capabilities
  if (analysis.complexity === 'complex' || analysis.complexity === 'expert') {
    capabilities.push('deep-analysis', 'collaboration');
  }

  // Map task type to capabilities
  const taskTypeCapabilities: Record<TaskTypeCategory, string[]> = {
    architecture: ['system-design', 'architectural-patterns'],
    code_implementation: ['code-generation', 'implementation'],
    code_review: ['code-analysis', 'security-review'],
    test_generation: ['testing', 'test-generation'],
    documentation: ['documentation', 'technical-writing'],
    large_codebase: ['large-context', 'codebase-analysis'],
    bulk_operations: ['batch-processing', 'automation'],
    general: [],
  };
  capabilities.push(...taskTypeCapabilities[analysis.taskType]);

  return [...new Set(capabilities)];
}

/**
 * Extracts keywords from matched signals.
 */
function extractKeywords(analysis: SharedTaskAnalysisResult): string[] {
  return analysis.matchedSignals.map((signal) => {
    // Extract keyword part from signal (format: "category:keyword" or "category:type:keyword")
    const parts = signal.split(':');
    return parts[parts.length - 1] ?? signal;
  });
}

/**
 * Detects secondary domains from analysis signals.
 */
function detectSecondaryDomains(analysis: SharedTaskAnalysisResult): ExpertTaskDomain[] {
  const secondary: ExpertTaskDomain[] = [];
  const signals = analysis.matchedSignals.join(' ').toLowerCase();

  // Detect security-related signals
  if (signals.includes('security') || signals.includes('vulnerabilit')) {
    secondary.push('security');
  }

  // Detect testing-related signals
  if (signals.includes('test') && analysis.taskType !== 'test_generation') {
    secondary.push('testing');
  }

  // Detect documentation-related signals
  if (signals.includes('doc') && analysis.taskType !== 'documentation') {
    secondary.push('documentation');
  }

  // Detect architecture-related signals
  if (
    (signals.includes('design') || signals.includes('pattern')) &&
    analysis.taskType !== 'architecture'
  ) {
    secondary.push('architecture');
  }

  return secondary;
}

/**
 * Converts SharedTaskAnalysisResult to ExpertTaskAnalysisResult.
 *
 * This adapter enables expert-selector.ts to use SharedTaskAnalyzer
 * without changing expert definitions that expect TaskDomain and
 * TaskComplexity values.
 *
 * @param analysis - Result from SharedTaskAnalyzer.analyze()
 * @returns ExpertTaskAnalysisResult compatible with expert-selector
 *
 * @example
 * ```typescript
 * import { createSharedTaskAnalyzer, toExpertTaskAnalysisResult } from 'nexus-agents/core';
 *
 * const analyzer = createSharedTaskAnalyzer();
 * const analysis = analyzer.analyze(task);
 * const expertAnalysis = toExpertTaskAnalysisResult(analysis);
 * // expertAnalysis.domain is TaskDomain compatible
 * ```
 */
export function toExpertTaskAnalysisResult(
  analysis: SharedTaskAnalysisResult
): ExpertTaskAnalysisResult {
  return {
    domain: mapTaskTypeToDomain(analysis.taskType),
    complexity: mapComplexityLevel(analysis.complexity),
    requiredCapabilities: extractRequiredCapabilities(analysis),
    keywords: extractKeywords(analysis),
    estimatedEffort: clamp(Math.round(analysis.complexityScore * 10), 1, 10),
    secondaryDomains: detectSecondaryDomains(analysis),
    confidence: Math.max(analysis.taskTypeConfidence, analysis.reasoningConfidence),
  };
}
