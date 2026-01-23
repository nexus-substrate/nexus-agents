/**
 * nexus-agents/swe-bench - Evaluation Report Types
 *
 * Types for generating evaluation reports and metrics summaries.
 * Supports both human-readable and machine-readable formats.
 *
 * @module swe-bench/evaluation-report-types
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

// Re-export statistics types
export type {
  StatisticalSummary,
  TimingStatistics,
  ResourceStatistics,
} from './evaluation-statistics-types.js';

// Re-export failure types
export type {
  FailureCategory,
  FailureAnalysis,
  FailurePattern,
  FailureStatistics,
} from './evaluation-failure-types.js';

// Re-export cost types
export type {
  TokensByPhase,
  TokenUsageBreakdown,
  ModelPricing,
  CostEstimate,
} from './evaluation-cost-types.js';

// Re-export report core types
export type {
  ReportFormat,
  ReportDetailLevel,
  ReportConfig,
  ReportSummary,
  ReportMetrics,
  ReportRepositoryBreakdown,
  ReportComparison,
  ReportInstanceDetails,
  ReportMetadata,
  EvaluationReport,
  IReportGenerator,
} from './evaluation-report-core-types.js';

export { DEFAULT_REPORT_CONFIG, ReportGenerationError } from './evaluation-report-core-types.js';
