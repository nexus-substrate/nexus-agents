/**
 * nexus-agents/swe-bench - Report Renderer
 *
 * Renders evaluation reports to various formats (Markdown, HTML, CSV, JSON).
 *
 * @module swe-bench/report-renderer
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import type { EvaluationReport, ReportFormat } from './evaluation-report-types.js';

// ============================================================================
// Render Functions
// ============================================================================

/**
 * Renders report to the specified format.
 */
export function renderReport(report: EvaluationReport, format: ReportFormat): string {
  switch (format) {
    case 'markdown':
      return renderMarkdown(report);
    case 'html':
      return renderHtml(report);
    case 'csv':
      return renderCsv(report);
    default:
      return JSON.stringify(report, null, 2);
  }
}

/**
 * Renders report as Markdown.
 */
export function renderMarkdown(report: EvaluationReport): string {
  const lines: string[] = [];
  const { metadata, summary, metrics, repositoryBreakdown, failureAnalysis } = report;

  renderHeader(lines, metadata);
  renderSummarySection(lines, summary);
  renderMetricsSection(lines, metrics);
  renderRepositorySection(lines, repositoryBreakdown);
  renderFailureSection(lines, failureAnalysis);

  return lines.join('\n');
}

/**
 * Renders the report header.
 */
function renderHeader(lines: string[], metadata: EvaluationReport['metadata']): void {
  lines.push(`# ${metadata.title}`);
  lines.push('');
  lines.push(`**Generated:** ${metadata.generatedAt}`);
  lines.push(`**Model:** ${metadata.modelName}`);
  lines.push(`**Dataset:** ${metadata.variant}`);
  lines.push('');
}

/**
 * Renders the summary section.
 */
function renderSummarySection(lines: string[], summary: EvaluationReport['summary']): void {
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`| ------ | ----- |`);
  lines.push(`| Resolution Rate | ${(summary.resolutionRate * 100).toFixed(1)}% |`);
  lines.push(`| Resolved | ${String(summary.resolvedCount)} / ${String(summary.totalCount)} |`);
  if (summary.ranking !== undefined) {
    lines.push(`| Ranking | #${String(summary.ranking)} |`);
  }
  lines.push('');

  if (summary.highlights.length > 0) {
    lines.push('### Highlights');
    for (const h of summary.highlights) {
      lines.push(`- ${h}`);
    }
    lines.push('');
  }
}

/**
 * Renders the metrics section.
 */
function renderMetricsSection(lines: string[], metrics: EvaluationReport['metrics']): void {
  lines.push('## Metrics');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`| ------ | ----- |`);
  lines.push(
    `| Total Duration | ${String(Math.round(metrics.timing.totalWallTime / 60000))} min |`
  );
  lines.push(
    `| Avg per Instance | ${String(Math.round(metrics.timing.instanceDuration.mean / 1000))} sec |`
  );
  lines.push('');
}

/**
 * Renders the repository performance section.
 */
function renderRepositorySection(
  lines: string[],
  repositoryBreakdown: EvaluationReport['repositoryBreakdown']
): void {
  lines.push('## Repository Performance');
  lines.push('');
  lines.push(`| Repository | Resolved | Rate |`);
  lines.push(`| ---------- | -------- | ---- |`);
  for (const repo of repositoryBreakdown.repositories) {
    const resolved = `${String(repo.resolvedInstances)}/${String(repo.totalInstances)}`;
    const rate = `${(repo.resolutionRate * 100).toFixed(1)}%`;
    lines.push(`| ${repo.repository} | ${resolved} | ${rate} |`);
  }
  lines.push('');
}

/**
 * Renders the failure analysis section.
 */
function renderFailureSection(
  lines: string[],
  failureAnalysis: EvaluationReport['failureAnalysis']
): void {
  lines.push('## Failure Analysis');
  lines.push('');
  const totalFailures = Object.values(failureAnalysis.byCategory).reduce((a, b) => a + b, 0);
  lines.push(`Total Failures: ${String(totalFailures)}`);
  lines.push('');
  lines.push(`| Category | Count |`);
  lines.push(`| -------- | ----- |`);
  for (const [category, count] of Object.entries(failureAnalysis.byCategory)) {
    if (count > 0) {
      lines.push(`| ${category} | ${String(count)} |`);
    }
  }
  lines.push('');
}

/**
 * Renders report as HTML.
 */
export function renderHtml(report: EvaluationReport): string {
  const markdown = renderMarkdown(report);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${report.metadata.title}</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f5f5f5; }
    h1, h2, h3 { color: #333; }
    pre { white-space: pre-wrap; background: #f5f5f5; padding: 10px; }
  </style>
</head>
<body>
<pre>${markdown}</pre>
</body>
</html>`;
}

/**
 * Renders report as CSV.
 */
export function renderCsv(report: EvaluationReport): string {
  const lines: string[] = [];
  lines.push('instance_id,resolved,status,tests_passed,tests_failed,duration_ms');

  for (const instance of report.rawResult.instanceResults) {
    lines.push(
      [
        instance.instanceId,
        String(instance.resolved),
        instance.status,
        String(instance.testsPassed),
        String(instance.testsFailed),
        String(instance.durationMs),
      ].join(',')
    );
  }

  return lines.join('\n');
}
