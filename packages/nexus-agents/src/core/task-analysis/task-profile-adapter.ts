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
import type { ProductType } from '../../config/product-matrix/types.js';
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
  /** Detected product type from task content (optional) */
  readonly detectedProductType?: ProductType;
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
  const profile: TaskProfile = {
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

    // Product type detection (optional, only set when detected)
    ...(analysis.detectedProductType !== undefined && {
      detectedProductType: analysis.detectedProductType,
    }),
  };

  return profile;
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

  const productSuffix =
    profile.detectedProductType !== undefined ? ` | Product: ${profile.detectedProductType}` : '';

  return `Type: ${profile.taskType} | Complexity: ${String(profile.reasoningComplexity)}/10 | Tokens: ~${String(profile.contextRequired)}${flags.length > 0 ? ` | Flags: ${flags.join(', ')}` : ''}${productSuffix}`;
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
    security_review: 'security',
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
 * Uses capability names matching expert-defaults.ts definitions.
 */
function extractRequiredCapabilities(analysis: SharedTaskAnalysisResult): string[] {
  const capabilities: string[] = [];

  // Always include task_execution as base capability
  capabilities.push('task_execution');

  // Map capability flags to expert capability strings
  if (analysis.capabilities.codeGeneration) capabilities.push('code_generation');

  // Map reasoning type to capabilities
  if (analysis.reasoningType === 'reasoning') {
    capabilities.push('research');
  }

  // Map complexity to capabilities
  if (analysis.complexity === 'complex' || analysis.complexity === 'expert') {
    capabilities.push('collaboration');
  }

  // Map task type to capabilities
  const taskTypeCapabilities: Record<TaskTypeCategory, string[]> = {
    architecture: ['research', 'collaboration'],
    code_implementation: ['code_generation', 'tool_use'],
    code_review: ['code_review'],
    security_review: ['code_review', 'research'],
    test_generation: ['code_generation', 'code_review', 'tool_use'],
    documentation: ['research', 'tool_use'],
    large_codebase: ['tool_use'],
    bulk_operations: ['tool_use'],
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
 * Strong security-related signals that indicate a security-focused task.
 * These keywords override the base domain detection.
 */
const STRONG_SECURITY_SIGNALS = [
  'security',
  'vulnerability',
  'vulnerabilities',
  'audit',
  'authentication',
  'authorization',
  'exploit',
  'penetration',
  'xss',
  'sql injection',
  'csrf',
  'attack',
  'threat',
  'malware',
  'encryption',
  'cryptograph',
];

/**
 * Detects if task is primarily security-focused based on strong signals.
 */
function isSecurityFocused(analysis: SharedTaskAnalysisResult): boolean {
  const signals = analysis.matchedSignals.join(' ').toLowerCase();
  let securityScore = 0;

  for (const keyword of STRONG_SECURITY_SIGNALS) {
    if (signals.includes(keyword)) {
      securityScore++;
    }
  }

  // Also check if task type suggests security review
  if (
    (analysis.taskType === 'code_review' || analysis.taskType === 'security_review') &&
    securityScore > 0
  ) {
    securityScore++;
  }

  // Require at least 2 security signals to override primary domain
  return securityScore >= 2;
}

/**
 * Checks if security should be a secondary domain.
 */
function shouldAddSecuritySecondary(signals: string, primaryDomain: ExpertTaskDomain): boolean {
  return (
    primaryDomain !== 'security' &&
    (signals.includes('security') || signals.includes('vulnerabilit'))
  );
}

/**
 * Checks if testing should be a secondary domain.
 */
function shouldAddTestingSecondary(signals: string, taskType: TaskTypeCategory): boolean {
  return signals.includes('test') && taskType !== 'test_generation';
}

/**
 * Checks if documentation should be a secondary domain.
 */
function shouldAddDocumentationSecondary(signals: string, taskType: TaskTypeCategory): boolean {
  return signals.includes('doc') && taskType !== 'documentation';
}

/**
 * Checks if architecture should be a secondary domain.
 */
function shouldAddArchitectureSecondary(signals: string, taskType: TaskTypeCategory): boolean {
  return (signals.includes('design') || signals.includes('pattern')) && taskType !== 'architecture';
}

/**
 * Detects secondary domains from analysis signals.
 */
function detectSecondaryDomains(
  analysis: SharedTaskAnalysisResult,
  primaryDomain: ExpertTaskDomain
): ExpertTaskDomain[] {
  const secondary: ExpertTaskDomain[] = [];
  const signals = analysis.matchedSignals.join(' ').toLowerCase();

  if (shouldAddSecuritySecondary(signals, primaryDomain)) secondary.push('security');
  if (shouldAddTestingSecondary(signals, analysis.taskType)) secondary.push('testing');
  if (shouldAddDocumentationSecondary(signals, analysis.taskType)) secondary.push('documentation');
  if (shouldAddArchitectureSecondary(signals, analysis.taskType)) secondary.push('architecture');

  // If security became primary, add original domain as secondary
  if (primaryDomain === 'security') {
    const baseDomain = mapTaskTypeToDomain(analysis.taskType);
    if (baseDomain !== 'security' && baseDomain !== 'general') {
      secondary.push(baseDomain);
    }
  }

  return secondary;
}

/**
 * Determines the primary domain, promoting security when appropriate.
 */
function determinePrimaryDomain(analysis: SharedTaskAnalysisResult): ExpertTaskDomain {
  // Check for strong security focus first
  if (isSecurityFocused(analysis)) {
    return 'security';
  }

  return mapTaskTypeToDomain(analysis.taskType);
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
  const primaryDomain = determinePrimaryDomain(analysis);

  return {
    domain: primaryDomain,
    complexity: mapComplexityLevel(analysis.complexity),
    requiredCapabilities: extractRequiredCapabilities(analysis),
    keywords: extractKeywords(analysis),
    estimatedEffort: clamp(Math.round(analysis.complexityScore * 10), 1, 10),
    secondaryDomains: detectSecondaryDomains(analysis, primaryDomain),
    confidence: Math.max(analysis.taskTypeConfidence, analysis.reasoningConfidence),
  };
}
