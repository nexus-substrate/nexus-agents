/**
 * nexus-agents/orchestration - Workflow Pattern Router Types
 *
 * Type definitions for the intelligent workflow pattern selection system.
 * The router maps task characteristics to the optimal orchestration pattern.
 *
 * @module orchestration/workflow-router-types
 * (Source: Issue #844 — Intelligent Workflow Pattern Router)
 */

import type { TaskAnalysisResult } from '../core/task-analysis/shared-task-analyzer.js';
import type { CapabilityGapReport } from '../core/task-analysis/capability-gap-detector.js';

/**
 * Orchestration patterns available in nexus-agents.
 * Each maps to a concrete execution module.
 */
export type WorkflowPattern = 'sequential' | 'wave' | 'graph' | 'consensus' | 'aflow' | 'puppeteer';

/**
 * Dependency structure classification for a task.
 */
export type DependencyStructure = 'linear' | 'dag' | 'independent' | 'unknown';

/**
 * Time constraint urgency level.
 */
export type TimeConstraint = 'urgent' | 'normal' | 'relaxed';

/**
 * Quality requirement level.
 */
export type QualityRequirement = 'best-effort' | 'high' | 'critical';

/**
 * Input signals for workflow routing decisions.
 * Combines explicit caller hints with SharedTaskAnalyzer output.
 */
export interface TaskSignals {
  /** Natural language task description */
  readonly description: string;
  /** Estimated number of subtasks (optional hint) */
  readonly subtaskCount?: number | undefined;
  /** Whether subtasks depend on each other (optional hint) */
  readonly hasDependencies?: boolean | undefined;
  /** Dependency structure classification (optional hint) */
  readonly dependencyStructure?: DependencyStructure | undefined;
  /** Whether multi-perspective consensus is needed */
  readonly requiresConsensus?: boolean | undefined;
  /** Whether this task type has been seen before */
  readonly isNovel?: boolean | undefined;
  /** Time urgency */
  readonly timeConstraint?: TimeConstraint | undefined;
  /** Quality requirement level */
  readonly qualityRequirement?: QualityRequirement | undefined;
  /** Force a specific pattern (escape hatch per DevEx feedback) */
  readonly forcePattern?: WorkflowPattern | undefined;
}

/**
 * Routing decision with explanation.
 */
export interface RoutingDecision {
  /** Selected workflow pattern */
  readonly pattern: WorkflowPattern;
  /** Human-readable explanation of why this pattern was selected */
  readonly reasoning: string;
  /** Confidence in the selection (0-1) */
  readonly confidence: number;
  /** Which rules matched during selection */
  readonly matchedRules: readonly string[];
  /** Alternative patterns that were considered */
  readonly alternatives: readonly WorkflowPattern[];
  /** Analysis result from SharedTaskAnalyzer */
  readonly analysis: TaskAnalysisResult;
  /** Whether the task should be clarified before execution (Issue #904) */
  readonly needsClarification?: boolean;
  /** Suggested clarification questions when needsClarification is true */
  readonly suggestedQuestions?: readonly string[];
  /** Capability gap report — what's available vs what's needed (Issue #906) */
  readonly capabilityGaps?: CapabilityGapReport;
}

/**
 * Options for the workflow router.
 */
export interface WorkflowRouterOptions {
  /** Dry run mode — return decision without executing (per DevEx feedback) */
  readonly dryRun?: boolean | undefined;
}

/**
 * Recorded outcome for pattern performance tracking.
 */
export interface PatternOutcome {
  /** Pattern that was used */
  readonly pattern: WorkflowPattern;
  /** Task type from analyzer */
  readonly taskType: string;
  /** Whether execution succeeded */
  readonly success: boolean;
  /** Duration in milliseconds */
  readonly durationMs: number;
  /** Timestamp of recording */
  readonly timestamp: number;
}

/**
 * Aggregated performance metrics for a pattern-task combination.
 */
export interface PatternMetrics {
  readonly pattern: WorkflowPattern;
  readonly taskType: string;
  readonly totalExecutions: number;
  readonly successCount: number;
  readonly successRate: number;
  readonly avgDurationMs: number;
}
