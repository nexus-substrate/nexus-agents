/**
 * nexus-agents/swe-bench - Evaluation Report Core Types
 *
 * Core report structure types for evaluation reports.
 *
 * @module swe-bench/evaluation-report-core-types
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
import type { TimingStatistics, ResourceStatistics } from './evaluation-statistics-types.js';
import type {
  FailureCategory,
  FailureAnalysis,
  FailureStatistics,
} from './evaluation-failure-types.js';
import type { TokenUsageBreakdown, CostEstimate } from './evaluation-cost-types.js';

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
