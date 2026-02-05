/**
 * nexus-agents/swe-bench - Report Generator
 *
 * Generates detailed evaluation reports with metrics, comparisons, and analysis.
 *
 * @module swe-bench/report-generator
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getTimeProvider } from '../core/index.js';
import type { ILogger } from '../core/logger.js';
import { createLogger } from '../core/logger.js';
import type {
  EvaluationRunResult,
  CompetitorResult,
  RepositoryMetrics,
} from './evaluation-harness-types.js';
import type {
  IReportGenerator,
  ReportConfig,
  ReportFormat,
  EvaluationReport,
  ReportSummary,
  ReportMetrics,
  ReportRepositoryBreakdown,
  StatisticalSummary,
  TimingStatistics,
  ReportMetadata,
  ResourceStatistics,
} from './evaluation-report-types.js';
import { DEFAULT_REPORT_CONFIG } from './evaluation-report-types.js';
import { renderReport } from './report-renderer.js';
import { generateFailureStatistics, generateInstanceDetails } from './report-failure-analyzer.js';
import { generateComparison } from './report-comparison.js';

// ============================================================================
// Report Generator Implementation
// ============================================================================

/**
 * Generates detailed evaluation reports.
 *
 * Supports:
 * - Multiple output formats (JSON, Markdown, HTML)
 * - Statistical analysis
 * - Failure categorization
 * - Competitor comparisons
 */
export class ReportGenerator implements IReportGenerator {
  private readonly logger: ILogger;

  constructor(logger?: ILogger) {
    this.logger = logger ?? createLogger({ component: 'report-generator' });
  }

  /**
   * Generates a full evaluation report.
   *
   * Note: Method is async to satisfy IReportGenerator interface contract,
   * which allows implementations to perform async operations (e.g., network
   * calls for competitor data, async template processing).
   */
  async generate(
    result: EvaluationRunResult,
    config: ReportConfig,
    competitors?: readonly CompetitorResult[]
  ): Promise<EvaluationReport> {
    this.logger.info('Generating evaluation report', {
      runId: result.runId,
      format: config.format,
    });

    const effectiveConfig = { ...DEFAULT_REPORT_CONFIG, ...config };

    const metadata = this.generateMetadata(result, effectiveConfig);
    const summary = this.generateSummary(result, competitors);
    const metrics = this.generateMetrics(result);
    const repositoryBreakdown = this.generateRepositoryBreakdown(result);
    const failureAnalysis = generateFailureStatistics(result);
    const instanceDetails = generateInstanceDetails(result, effectiveConfig);

    const report: EvaluationReport = {
      metadata,
      summary,
      metrics,
      repositoryBreakdown,
      failureAnalysis,
      rawResult: result,
    };

    // Add optional sections
    if (instanceDetails !== undefined) {
      const reportWithDetails: EvaluationReport = { ...report, instanceDetails };
      if (competitors !== undefined && competitors.length > 0 && config.includeComparison) {
        const comparison = generateComparison(result, competitors);
        return Promise.resolve({ ...reportWithDetails, comparison });
      }
      return Promise.resolve(reportWithDetails);
    }

    if (competitors !== undefined && competitors.length > 0 && config.includeComparison) {
      const comparison = generateComparison(result, competitors);
      return Promise.resolve({ ...report, comparison });
    }

    return Promise.resolve(report);
  }

  /**
   * Renders report to the specified format.
   *
   * Note: Method is async to satisfy IReportGenerator interface contract,
   * which allows implementations to perform async operations (e.g., async
   * template engines, remote rendering services).
   */
  async render(report: EvaluationReport, format: ReportFormat): Promise<string> {
    return Promise.resolve(renderReport(report, format));
  }

  /**
   * Saves report to file.
   */
  async save(report: EvaluationReport, config: ReportConfig): Promise<void> {
    this.logger.info('Saving report', { outputPath: config.outputPath });

    const content = await this.render(report, config.format);

    await fs.mkdir(path.dirname(config.outputPath), { recursive: true });
    await fs.writeFile(config.outputPath, content, 'utf-8');

    this.logger.info('Report saved', { path: config.outputPath, format: config.format });
  }

  /**
   * Generates report metadata.
   */
  private generateMetadata(result: EvaluationRunResult, config: ReportConfig): ReportMetadata {
    return {
      title: config.title ?? `SWE-bench Evaluation: ${result.modelNameOrPath}`,
      generatedAt: getTimeProvider().nowIso(),
      variant: result.datasetName,
      modelName: result.modelNameOrPath,
      nexusVersion: '2.2.0', // Would be dynamic in real implementation
      reportVersion: '1.0.0',
    };
  }

  /**
   * Generates report summary.
   */
  private generateSummary(
    result: EvaluationRunResult,
    competitors?: readonly CompetitorResult[]
  ): ReportSummary {
    const { metrics } = result;
    const highlights = this.generateHighlights(result);
    const improvementAreas = this.generateImprovementAreas(result);

    let ranking: number | undefined;
    if (competitors !== undefined && competitors.length > 0) {
      const allRates = [metrics.resolutionRate, ...competitors.map((c) => c.resolutionRate)].sort(
        (a, b) => b - a
      );
      ranking = allRates.indexOf(metrics.resolutionRate) + 1;
    }

    const summary: ReportSummary = {
      resolutionRate: metrics.resolutionRate,
      resolvedCount: metrics.resolvedInstances,
      totalCount: metrics.totalInstances,
      highlights,
      improvementAreas,
    };

    if (ranking !== undefined) {
      return { ...summary, ranking };
    }

    return summary;
  }

  /**
   * Generates highlights based on results.
   */
  private generateHighlights(result: EvaluationRunResult): readonly string[] {
    const highlights: string[] = [];
    const { metrics } = result;

    if (metrics.resolutionRate >= 0.5) {
      highlights.push(`Resolved ${String(Math.round(metrics.resolutionRate * 100))}% of instances`);
    }

    if (metrics.patchApplicationRate >= 0.9) {
      highlights.push('Excellent patch application rate (>90%)');
    }

    if (metrics.timeouts === 0) {
      highlights.push('No timeouts during evaluation');
    }

    return highlights;
  }

  /**
   * Generates improvement areas based on results.
   */
  private generateImprovementAreas(result: EvaluationRunResult): readonly string[] {
    const areas: string[] = [];
    const { metrics } = result;

    if (metrics.resolutionRate < 0.3) {
      areas.push('Low resolution rate - investigate failure patterns');
    }

    if (metrics.patchApplicationRate < 0.7) {
      areas.push('Many patch application failures - improve patch generation');
    }

    if (metrics.timeouts > metrics.totalInstances * 0.1) {
      areas.push('High timeout rate - consider increasing limits or optimizing');
    }

    return areas;
  }

  /**
   * Generates detailed metrics.
   */
  private generateMetrics(result: EvaluationRunResult): ReportMetrics {
    const timing = this.generateTimingStatistics(result);
    const resources = this.generateResourceStatistics(result);

    return {
      evaluation: result.metrics,
      timing,
      resources,
    };
  }

  /**
   * Generates timing statistics.
   */
  private generateTimingStatistics(result: EvaluationRunResult): TimingStatistics {
    const durations = result.instanceResults.map((r) => r.durationMs);
    const instanceDuration = this.calculateStatisticalSummary(durations);

    return {
      instanceDuration,
      totalWallTime: result.metrics.totalDurationMs,
      patchApplicationTime: Math.round(result.metrics.totalDurationMs * 0.1), // Estimate
      testExecutionTime: Math.round(result.metrics.totalDurationMs * 0.8), // Estimate
    };
  }

  /**
   * Generates resource statistics from evaluation result.
   *
   * Note: Memory tracking is estimated from current process; disk tracking
   * is not yet implemented. Container count uses evaluated instance count
   * as each instance runs in its own container.
   *
   * (Improved per Issue #454 - replace placeholder zeros with estimates)
   */
  private generateResourceStatistics(result: EvaluationRunResult): ResourceStatistics {
    // Get current process memory as estimate (imperfect but informative)
    const memUsage = process.memoryUsage();
    const currentMemoryMB = Math.round(memUsage.heapUsed / 1024 / 1024);

    // Each evaluated instance typically runs in its own container
    const containersCreated = result.instanceResults.length;

    // Estimate avg memory based on instance count (rough heuristic)
    // Assumes ~100MB base + ~50MB per concurrent container
    const estimatedAvgMemory =
      containersCreated > 0
        ? Math.round(100 + (containersCreated * 50) / result.config.maxWorkers)
        : currentMemoryMB;

    return {
      // Use current heap as peak estimate (actual peak may have been higher)
      peakMemory: Math.max(currentMemoryMB, estimatedAvgMemory),
      avgMemory: estimatedAvgMemory,
      // Disk tracking not yet implemented - would need to check docker volumes
      diskSpaceUsed: 0,
      containersCreated,
    };
  }

  /**
   * Calculates statistical summary from values.
   */
  private calculateStatisticalSummary(values: readonly number[]): StatisticalSummary {
    if (values.length === 0) {
      return {
        min: 0,
        max: 0,
        mean: 0,
        median: 0,
        stdDev: 0,
        p25: 0,
        p75: 0,
        p90: 0,
        p95: 0,
        count: 0,
      };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const mean = sum / sorted.length;

    const squaredDiffs = sorted.map((v) => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / sorted.length;
    const stdDev = Math.sqrt(variance);

    return {
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
      mean,
      median: this.percentile(sorted, 50),
      stdDev,
      p25: this.percentile(sorted, 25),
      p75: this.percentile(sorted, 75),
      p90: this.percentile(sorted, 90),
      p95: this.percentile(sorted, 95),
      count: sorted.length,
    };
  }

  /**
   * Calculates percentile from sorted array.
   */
  private percentile(sorted: readonly number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))] ?? 0;
  }

  /**
   * Generates repository breakdown.
   */
  private generateRepositoryBreakdown(result: EvaluationRunResult): ReportRepositoryBreakdown {
    const repositories = result.repositoryMetrics;

    const sorted = [...repositories].sort((a, b) => b.resolutionRate - a.resolutionRate);
    const bestRepository = sorted[0] ?? this.createEmptyRepoMetrics();
    const worstRepository = sorted[sorted.length - 1] ?? this.createEmptyRepoMetrics();

    const rates = repositories.map((r) => r.resolutionRate);
    const mean = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
    const squaredDiffs = rates.map((r) => Math.pow(r - mean, 2));
    const performanceVariance =
      squaredDiffs.length > 0 ? squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length : 0;

    return {
      repositories,
      bestRepository,
      worstRepository,
      performanceVariance,
    };
  }

  /**
   * Creates empty repository metrics for edge cases.
   */
  private createEmptyRepoMetrics(): RepositoryMetrics {
    return {
      repository: 'unknown',
      totalInstances: 0,
      resolvedInstances: 0,
      resolutionRate: 0,
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates a new report generator instance.
 */
export function createReportGenerator(logger?: ILogger): ReportGenerator {
  return new ReportGenerator(logger);
}

/**
 * Quick helper to generate a report.
 */
export async function generateReport(
  result: EvaluationRunResult,
  config?: Partial<ReportConfig>,
  competitors?: readonly CompetitorResult[]
): Promise<EvaluationReport> {
  const generator = createReportGenerator();
  return generator.generate(result, { ...DEFAULT_REPORT_CONFIG, ...config }, competitors);
}

/**
 * Quick helper to export a report.
 */
export async function exportReport(
  result: EvaluationRunResult,
  outputPath: string,
  config?: Partial<ReportConfig>
): Promise<void> {
  const generator = createReportGenerator();
  const fullConfig: ReportConfig = { ...DEFAULT_REPORT_CONFIG, ...config, outputPath };
  const report = await generator.generate(result, fullConfig);
  await generator.save(report, fullConfig);
}
