/**
 * nexus-agents/swe-bench - Evaluation Report Types
 *
 * Types for generating evaluation reports and metrics summaries.
 * Supports both human-readable and machine-readable formats.
 *
 * @module swe-bench/evaluation-report-types
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import type { SWEBenchVariant } from './types.js';
import type {
  EvaluationRunResult,
  EvaluationMetrics,
  RepositoryMetrics,
  InstanceEvaluationResult,
  CompetitorResult,
} from './evaluation-harness-types.js';

// ============================================================================
// Report Configuration
// ============================================================================

/**
 * Output format for evaluation reports.
 */
export type ReportFormat = 'json' | 'markdown' | 'html' | 'csv';

/**
 * Detail level for reports.
 */
export type ReportDetailLevel = 'summary' | 'standard' | 'detailed' | 'verbose';

/**
 * Configuration for report generation.
 */
export interface ReportConfig {
  /** Output format. */
  readonly format: ReportFormat;
  /** Detail level. */
  readonly detailLevel: ReportDetailLevel;
  /** Include per-instance breakdown. */
  readonly includeInstanceDetails: boolean;
  /** Include competitor comparison. */
  readonly includeComparison: boolean;
  /** Include charts/visualizations (for HTML). */
  readonly includeCharts: boolean;
  /** Output file path. */
  readonly outputPath: string;
  /** Report title. */
  readonly title?: string;
}

/**
 * Default report configuration.
 */
export const DEFAULT_REPORT_CONFIG: ReportConfig = {
  format: 'markdown',
  detailLevel: 'standard',
  includeInstanceDetails: true,
  includeComparison: true,
  includeCharts: false,
  outputPath: './swe-bench-report.md',
};

// ============================================================================
// Summary Statistics
// ============================================================================

/**
 * Statistical summary with distribution info.
 */
export interface StatisticalSummary {
  /** Minimum value. */
  readonly min: number;
  /** Maximum value. */
  readonly max: number;
  /** Mean (average). */
  readonly mean: number;
  /** Median (50th percentile). */
  readonly median: number;
  /** Standard deviation. */
  readonly stdDev: number;
  /** 25th percentile. */
  readonly p25: number;
  /** 75th percentile. */
  readonly p75: number;
  /** 90th percentile. */
  readonly p90: number;
  /** 95th percentile. */
  readonly p95: number;
  /** Sample count. */
  readonly count: number;
}

/**
 * Timing statistics for evaluation.
 */
export interface TimingStatistics {
  /** Per-instance duration stats (ms). */
  readonly instanceDuration: StatisticalSummary;
  /** Total wall-clock time (ms). */
  readonly totalWallTime: number;
  /** Total CPU time (ms). */
  readonly totalCpuTime?: number;
  /** Time spent applying patches (ms). */
  readonly patchApplicationTime: number;
  /** Time spent running tests (ms). */
  readonly testExecutionTime: number;
}

/**
 * Resource usage statistics.
 */
export interface ResourceStatistics {
  /** Peak memory usage (bytes). */
  readonly peakMemory: number;
  /** Average memory usage (bytes). */
  readonly avgMemory: number;
  /** Total disk space used (bytes). */
  readonly diskSpaceUsed: number;
  /** Number of Docker containers created. */
  readonly containersCreated: number;
}

// ============================================================================
// Failure Analysis
// ============================================================================

/**
 * Categories of failures for analysis.
 */
export type FailureCategory =
  | 'patch_not_applicable'
  | 'test_failure'
  | 'syntax_error'
  | 'runtime_error'
  | 'timeout'
  | 'missing_dependency'
  | 'wrong_file_modified'
  | 'incomplete_fix'
  | 'regression_introduced'
  | 'unknown';

/**
 * Failure analysis for an instance.
 */
export interface FailureAnalysis {
  /** Instance ID. */
  readonly instanceId: string;
  /** Primary failure category. */
  readonly category: FailureCategory;
  /** Detailed error message. */
  readonly errorMessage: string;
  /** Affected file(s). */
  readonly affectedFiles: readonly string[];
  /** Suggested fix approach (if determinable). */
  readonly suggestedApproach?: string;
  /** Similarity to other failures (for clustering). */
  readonly similarFailures?: readonly string[];
}

/**
 * Aggregate failure statistics.
 */
export interface FailureStatistics {
  /** Breakdown by failure category. */
  readonly byCategory: Record<FailureCategory, number>;
  /** Most common failure patterns. */
  readonly commonPatterns: readonly FailurePattern[];
  /** Failures by repository. */
  readonly byRepository: Record<string, number>;
}

/**
 * A pattern of recurring failures.
 */
export interface FailurePattern {
  /** Pattern description. */
  readonly description: string;
  /** Number of occurrences. */
  readonly occurrences: number;
  /** Example instance IDs. */
  readonly examples: readonly string[];
  /** Potential root cause. */
  readonly potentialCause?: string;
}

// ============================================================================
// Token and Cost Analysis
// ============================================================================

/**
 * Token usage breakdown.
 */
export interface TokenUsageBreakdown {
  /** Total input tokens. */
  readonly totalInputTokens: number;
  /** Total output tokens. */
  readonly totalOutputTokens: number;
  /** Total tokens. */
  readonly totalTokens: number;
  /** Per-instance token stats. */
  readonly perInstance: StatisticalSummary;
  /** Tokens by phase. */
  readonly byPhase: TokensByPhase;
}

/**
 * Token usage by evaluation phase.
 */
export interface TokensByPhase {
  /** Exploration/reading phase. */
  readonly exploration: number;
  /** Planning phase. */
  readonly planning: number;
  /** Implementation phase. */
  readonly implementation: number;
  /** Retry/iteration phase. */
  readonly retry: number;
}

/**
 * Cost estimation for the evaluation.
 */
export interface CostEstimate {
  /** Total estimated cost (USD). */
  readonly totalCostUsd: number;
  /** Cost per instance (USD). */
  readonly perInstanceCostUsd: number;
  /** Cost per resolved instance (USD). */
  readonly perResolvedInstanceCostUsd: number;
  /** Model pricing used for estimate. */
  readonly pricingModel: ModelPricing;
}

/**
 * Model pricing information.
 */
export interface ModelPricing {
  /** Model name. */
  readonly modelName: string;
  /** Price per 1M input tokens (USD). */
  readonly inputPricePerMillion: number;
  /** Price per 1M output tokens (USD). */
  readonly outputPricePerMillion: number;
  /** Price effective date. */
  readonly priceDate: string;
}

// ============================================================================
// Complete Report Types
// ============================================================================

/**
 * Summary section of the report.
 */
export interface ReportSummary {
  /** Headline metric: resolution rate. */
  readonly resolutionRate: number;
  /** Instances resolved. */
  readonly resolvedCount: number;
  /** Total instances evaluated. */
  readonly totalCount: number;
  /** Ranking vs competitors (if compared). */
  readonly ranking?: number;
  /** Key highlights. */
  readonly highlights: readonly string[];
  /** Areas needing improvement. */
  readonly improvementAreas: readonly string[];
}

/**
 * Detailed metrics section.
 */
export interface ReportMetrics {
  /** Core evaluation metrics. */
  readonly evaluation: EvaluationMetrics;
  /** Timing statistics. */
  readonly timing: TimingStatistics;
  /** Resource usage. */
  readonly resources: ResourceStatistics;
  /** Token usage (if tracked). */
  readonly tokens?: TokenUsageBreakdown;
  /** Cost estimate (if calculable). */
  readonly cost?: CostEstimate;
}

/**
 * Repository breakdown section.
 */
export interface ReportRepositoryBreakdown {
  /** Per-repository metrics. */
  readonly repositories: readonly RepositoryMetrics[];
  /** Best performing repository. */
  readonly bestRepository: RepositoryMetrics;
  /** Worst performing repository. */
  readonly worstRepository: RepositoryMetrics;
  /** Variance in performance across repos. */
  readonly performanceVariance: number;
}

/**
 * Competitor comparison section.
 */
export interface ReportComparison {
  /** Competitor results. */
  readonly competitors: readonly CompetitorResult[];
  /** nexus-agents ranking. */
  readonly nexusRanking: number;
  /** Resolution rate difference from top system. */
  readonly gapFromTop: number;
  /** Resolution rate difference from average. */
  readonly differenceFromAverage: number;
  /** Areas where nexus-agents excels. */
  readonly strengths: readonly string[];
  /** Areas where nexus-agents lags. */
  readonly weaknesses: readonly string[];
}

/**
 * Instance-level details section.
 */
export interface ReportInstanceDetails {
  /** Resolved instances. */
  readonly resolved: readonly InstanceEvaluationResult[];
  /** Unresolved instances with failure analysis. */
  readonly unresolved: readonly FailureAnalysis[];
  /** Grouped by failure category. */
  readonly byFailureCategory: Record<FailureCategory, readonly FailureAnalysis[]>;
}

/**
 * Complete evaluation report.
 */
export interface EvaluationReport {
  /** Report metadata. */
  readonly metadata: ReportMetadata;
  /** Executive summary. */
  readonly summary: ReportSummary;
  /** Detailed metrics. */
  readonly metrics: ReportMetrics;
  /** Repository breakdown. */
  readonly repositoryBreakdown: ReportRepositoryBreakdown;
  /** Failure analysis. */
  readonly failureAnalysis: FailureStatistics;
  /** Competitor comparison (if included). */
  readonly comparison?: ReportComparison;
  /** Instance details (if included). */
  readonly instanceDetails?: ReportInstanceDetails;
  /** Raw evaluation result. */
  readonly rawResult: EvaluationRunResult;
}

/**
 * Report metadata.
 */
export interface ReportMetadata {
  /** Report title. */
  readonly title: string;
  /** Report generation timestamp. */
  readonly generatedAt: string;
  /** Dataset variant. */
  readonly variant: SWEBenchVariant;
  /** Model evaluated. */
  readonly modelName: string;
  /** nexus-agents version. */
  readonly nexusVersion: string;
  /** Report version/format. */
  readonly reportVersion: string;
}

// ============================================================================
// Report Generator Interface
// ============================================================================

/**
 * Interface for report generators.
 */
export interface IReportGenerator {
  /**
   * Generates a report from evaluation results.
   */
  generate(
    result: EvaluationRunResult,
    config: ReportConfig,
    competitors?: readonly CompetitorResult[]
  ): Promise<EvaluationReport>;

  /**
   * Renders report to the specified format.
   */
  render(report: EvaluationReport, format: ReportFormat): Promise<string>;

  /**
   * Saves report to file.
   */
  save(report: EvaluationReport, config: ReportConfig): Promise<void>;
}

/**
 * Error for report generation failures.
 */
export class ReportGenerationError extends Error {
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'ReportGenerationError';
    this.cause = cause;
  }
}
