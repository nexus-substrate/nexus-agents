/**
 * Self-Evaluation Output Formatting
 *
 * Formatting functions for displaying evaluation results.
 *
 * @module cli/self-eval-format
 * (Source: Issue #140, Self-Evaluation MVP)
 */

import {
  createAggregator,
  type AggregatedResult,
  type OutputOptions,
} from '../self-eval/aggregation-logic.js';
import type { EvaluateCommandResult } from './self-eval-types.js';
import { colors, symbols, MAX_OUTPUT_BYTES } from './self-eval-types.js';
import { writeLine } from './ansi-output.js';
import { formatPercentage } from '../core/index.js';

// Re-export for backward compatibility
export { writeLine };

/**
 * Get color for recommendation.
 */
export function getRecommendationColor(rec: string): string {
  switch (rec) {
    case 'retain':
      return colors.green;
    case 'review':
      return colors.yellow;
    case 'refactor':
      return colors.yellow;
    case 'deprecate':
      return colors.red;
    default:
      return colors.reset;
  }
}

/**
 * Get symbol for recommendation.
 */
export function getRecommendationSymbol(rec: string): string {
  switch (rec) {
    case 'retain':
      return symbols.check;
    case 'deprecate':
      return symbols.cross;
    default:
      return symbols.warn;
  }
}

// ============================================================================
// Result Formatters
// ============================================================================

/**
 * Format a single result for summary mode.
 */
export function formatResultSummary(result: AggregatedResult): string {
  const color = getRecommendationColor(result.finalRecommendation);
  const symbol = getRecommendationSymbol(result.finalRecommendation);
  const confidence = formatPercentage(result.confidence);
  const rec = result.finalRecommendation.toUpperCase();

  const lines: string[] = [
    `${color}${symbol}${colors.reset} ${colors.bold}${result.component}${colors.reset}`,
    `  Recommendation: ${color}${rec}${colors.reset}`,
    `  Confidence: ${confidence}`,
  ];

  // Add brief summary based on concerns
  if (result.dissent.length > 0) {
    const dissentCount = result.dissent.length;
    lines.push(
      `  ${colors.dim}(${String(dissentCount)} dissenting opinion${dissentCount > 1 ? 's' : ''})${colors.reset}`
    );
  }

  return lines.join('\n');
}

/**
 * Format a single result for verbose mode.
 */
export function formatResultVerbose(result: AggregatedResult): string {
  const aggregator = createAggregator();
  const options: OutputOptions = { verbose: true, includeAuditTrail: true };
  return aggregator.format([result], options);
}

// ============================================================================
// Output Modes
// ============================================================================

/**
 * Print the report header with scan statistics.
 */
function printSummaryHeader(commandResult: EvaluateCommandResult): void {
  writeLine('');
  writeLine(`${colors.bold}Self-Evaluation Report${colors.reset}`);
  writeLine('='.repeat(50));
  writeLine('');

  writeLine(
    `${colors.cyan}Scanned:${colors.reset} ${String(commandResult.componentsScanned)} components`
  );
  writeLine(`${colors.cyan}Total Lines:${colors.reset} ${String(commandResult.totalLines)}`);
  writeLine(`${colors.cyan}Duration:${colors.reset} ${String(commandResult.durationMs)}ms`);

  if (!commandResult.completedWithinTimeout) {
    writeLine(
      `${colors.yellow}${symbols.warn} Evaluation timed out, results may be incomplete${colors.reset}`
    );
  }
}

/**
 * Print the summary statistics section.
 */
function printSummaryStats(summary: EvaluateCommandResult['summary']): void {
  writeLine('');
  writeLine(`${colors.bold}Summary:${colors.reset}`);
  writeLine(`  ${colors.green}Retain:${colors.reset} ${String(summary.retain)}`);
  writeLine(`  ${colors.yellow}Review:${colors.reset} ${String(summary.review)}`);
  writeLine(`  ${colors.yellow}Refactor:${colors.reset} ${String(summary.refactor)}`);
  writeLine(`  ${colors.red}Deprecate:${colors.reset} ${String(summary.deprecate)}`);
  writeLine(`  Avg Confidence: ${formatPercentage(summary.averageConfidence, 1)}`);
  writeLine(`  Avg Evidence Quality: ${formatPercentage(summary.averageEvidenceQuality, 1)}`);
}

/**
 * Print the components list with size limiting.
 */
function printSummaryComponents(results: readonly AggregatedResult[]): void {
  writeLine('');
  writeLine(`${colors.bold}Components:${colors.reset}`);
  writeLine('');

  let outputSize = 0;
  for (const result of results) {
    const formatted = formatResultSummary(result);
    outputSize += formatted.length;

    if (outputSize > MAX_OUTPUT_BYTES) {
      const remaining = results.length - results.indexOf(result);
      writeLine(
        `${colors.dim}... and ${String(remaining)} more components (use --verbose for full output)${colors.reset}`
      );
      break;
    }

    writeLine(formatted);
    writeLine('');
  }
}

/**
 * Print results in summary mode.
 */
export function printSummaryMode(commandResult: EvaluateCommandResult): void {
  printSummaryHeader(commandResult);
  printSummaryStats(commandResult.summary);
  printSummaryComponents(commandResult.results);

  writeLine(
    `${colors.dim}Note: These are RECOMMENDATIONS for human review, not decisions.${colors.reset}`
  );
  writeLine('');
}

/**
 * Print results in verbose mode.
 */
export function printVerboseMode(commandResult: EvaluateCommandResult): void {
  writeLine('');
  writeLine(`${colors.bold}Self-Evaluation Report (Verbose)${colors.reset}`);
  writeLine('='.repeat(60));

  writeLine(`Scanned: ${String(commandResult.componentsScanned)} components`);
  writeLine(`Total Lines: ${String(commandResult.totalLines)}`);
  writeLine(`Duration: ${String(commandResult.durationMs)}ms`);

  if (!commandResult.completedWithinTimeout) {
    writeLine(`${colors.yellow}Warning: Evaluation timed out${colors.reset}`);
  }

  writeLine('');

  for (const result of commandResult.results) {
    writeLine(formatResultVerbose(result));
  }

  writeLine(
    `${colors.dim}Note: These are RECOMMENDATIONS for human review, not decisions.${colors.reset}`
  );
  writeLine('');
}

/**
 * Print results as JSON.
 */
export function printJsonMode(commandResult: EvaluateCommandResult): void {
  // Create a JSON-serializable version
  const jsonOutput = {
    timestamp: commandResult.timestamp.toISOString(),
    durationMs: commandResult.durationMs,
    componentsScanned: commandResult.componentsScanned,
    totalLines: commandResult.totalLines,
    completedWithinTimeout: commandResult.completedWithinTimeout,
    summary: commandResult.summary,
    results: commandResult.results.map((r) => ({
      component: r.component,
      recommendation: r.finalRecommendation,
      confidence: r.confidence,
      evidenceQuality: r.evidenceQuality,
      isRecommendation: r.isRecommendation,
      votes: r.votes.map((v) => ({
        agent: v.agent,
        recommendation: v.recommendation,
        confidence: v.confidence,
        concerns: v.concerns,
      })),
      dissent: r.dissent.map((d) => ({
        agent: d.agent,
        recommendation: d.recommendation,
      })),
    })),
    notice: 'These are RECOMMENDATIONS for human review, not decisions.',
  };

  process.stdout.write(JSON.stringify(jsonOutput, null, 2) + '\n');
}
