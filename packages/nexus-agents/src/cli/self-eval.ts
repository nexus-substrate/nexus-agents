/**
 * nexus-agents evaluate command
 *
 * Self-evaluation CLI for codebase component assessment.
 * All outputs are RECOMMENDATIONS for human review, not decisions.
 *
 * (Source: Issue #140, Self-Evaluation MVP)
 */

import { scanComponents } from '../self-eval/component-scanner.js';
import { evaluateComponent } from '../self-eval/evaluation-agents.js';
import {
  createAggregator,
  type AggregatedResult,
  type OutputOptions,
} from '../self-eval/aggregation-logic.js';
import type { ComponentInfo } from '../self-eval/component-scanner.js';
import type { EvaluationResult } from '../self-eval/evaluation-agents.js';

// ============================================================================
// Types
// ============================================================================

/**
 * CLI options for the evaluate command.
 */
export interface EvaluateOptions {
  /** Target directory to evaluate */
  readonly target: string;
  /** Show verbose output */
  readonly verbose: boolean;
  /** Output as JSON */
  readonly json: boolean;
  /** Timeout in milliseconds */
  readonly timeout: number;
}

/**
 * Complete evaluation result with metadata.
 */
export interface EvaluateCommandResult {
  /** Aggregated results for all components */
  readonly results: readonly AggregatedResult[];
  /** Total components scanned */
  readonly componentsScanned: number;
  /** Total lines of code */
  readonly totalLines: number;
  /** Evaluation duration in milliseconds */
  readonly durationMs: number;
  /** Whether evaluation completed within timeout */
  readonly completedWithinTimeout: boolean;
  /** Summary statistics */
  readonly summary: EvaluationSummary;
  /** Timestamp */
  readonly timestamp: Date;
}

/**
 * Summary statistics for evaluation.
 */
export interface EvaluationSummary {
  /** Count of each recommendation type */
  readonly retain: number;
  readonly review: number;
  readonly refactor: number;
  readonly deprecate: number;
  /** Average confidence */
  readonly averageConfidence: number;
  /** Average evidence quality */
  readonly averageEvidenceQuality: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes
const DEFAULT_TARGET = 'src/adapters/';
const MAX_OUTPUT_BYTES = 10_240; // 10KB for non-verbose

/**
 * ANSI color codes for terminal output.
 */
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
} as const;

/**
 * Symbols for status output.
 */
const symbols = {
  check: process.platform === 'win32' ? '[OK]' : '✓',
  warn: process.platform === 'win32' ? '[!]' : '⚠',
  cross: process.platform === 'win32' ? '[X]' : '✗',
};

// ============================================================================
// Core Evaluation Logic
// ============================================================================

/**
 * Evaluate all components in a directory.
 */
async function evaluateDirectory(
  target: string,
  timeoutMs: number
): Promise<{
  results: readonly AggregatedResult[];
  componentsScanned: number;
  totalLines: number;
  timedOut: boolean;
}> {
  const startTime = Date.now();
  const deadline = startTime + timeoutMs;

  // Scan components
  const inventory = await scanComponents(target, {
    extensions: ['.ts'],
    skipTests: false,
  });

  const evaluationsByComponent = new Map<string, EvaluationResult[]>();
  let timedOut = false;

  // Evaluate each component
  for (const component of inventory.components) {
    if (Date.now() > deadline) {
      timedOut = true;
      break;
    }

    const evaluations = await evaluateComponentWithTimeout(component, deadline - Date.now());
    evaluationsByComponent.set(component.path, [...evaluations]);
  }

  // Aggregate results
  const aggregator = createAggregator();
  const results: AggregatedResult[] = [];

  for (const [path, evaluations] of evaluationsByComponent) {
    if (evaluations.length > 0) {
      results.push(aggregator.aggregate(path, evaluations));
    }
  }

  // Sort by severity (deprecate first, then refactor, review, retain)
  const priority = { deprecate: 0, refactor: 1, review: 2, retain: 3 };
  results.sort((a, b) => priority[a.finalRecommendation] - priority[b.finalRecommendation]);

  return {
    results,
    componentsScanned: inventory.totalFiles,
    totalLines: inventory.totalLines,
    timedOut,
  };
}

/**
 * Evaluate a single component with timeout protection.
 */
async function evaluateComponentWithTimeout(
  component: ComponentInfo,
  remainingMs: number
): Promise<readonly EvaluationResult[]> {
  const componentTimeout = Math.min(remainingMs, 30_000); // Max 30s per component

  try {
    const result = await Promise.race([
      evaluateComponent(component, { timeoutMs: componentTimeout }),
      timeout(componentTimeout),
    ]);
    return result;
  } catch {
    // Return empty on timeout
    return [];
  }
}

/**
 * Timeout promise.
 */
function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('Component evaluation timeout'));
    }, ms);
  });
}

/**
 * Calculate summary statistics.
 */
function calculateSummary(results: readonly AggregatedResult[]): EvaluationSummary {
  const counts = { retain: 0, review: 0, refactor: 0, deprecate: 0 };
  let totalConfidence = 0;
  let totalEvidence = 0;

  for (const result of results) {
    counts[result.finalRecommendation] += 1;
    totalConfidence += result.confidence;
    totalEvidence += result.evidenceQuality;
  }

  const count = results.length || 1; // Avoid division by zero

  return {
    ...counts,
    averageConfidence: totalConfidence / count,
    averageEvidenceQuality: totalEvidence / count,
  };
}

// ============================================================================
// Output Formatting
// ============================================================================

/**
 * Helper to write a line to stdout.
 */
function writeLine(text: string): void {
  process.stdout.write(text + '\n');
}

/**
 * Get color for recommendation.
 */
function getRecommendationColor(rec: string): string {
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
function getRecommendationSymbol(rec: string): string {
  switch (rec) {
    case 'retain':
      return symbols.check;
    case 'deprecate':
      return symbols.cross;
    default:
      return symbols.warn;
  }
}

/**
 * Format a single result for summary mode.
 */
function formatResultSummary(result: AggregatedResult): string {
  const color = getRecommendationColor(result.finalRecommendation);
  const symbol = getRecommendationSymbol(result.finalRecommendation);
  const confidence = (result.confidence * 100).toFixed(0);
  const rec = result.finalRecommendation.toUpperCase();

  const lines: string[] = [
    `${color}${symbol}${colors.reset} ${colors.bold}${result.component}${colors.reset}`,
    `  Recommendation: ${color}${rec}${colors.reset}`,
    `  Confidence: ${confidence}%`,
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
function formatResultVerbose(result: AggregatedResult): string {
  const aggregator = createAggregator();
  const options: OutputOptions = { verbose: true, includeAuditTrail: true };
  return aggregator.format([result], options);
}

/**
 * Print results in summary mode.
 */
function printSummaryMode(commandResult: EvaluateCommandResult): void {
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

  writeLine('');
  writeLine(`${colors.bold}Summary:${colors.reset}`);
  const s = commandResult.summary;
  writeLine(`  ${colors.green}Retain:${colors.reset} ${String(s.retain)}`);
  writeLine(`  ${colors.yellow}Review:${colors.reset} ${String(s.review)}`);
  writeLine(`  ${colors.yellow}Refactor:${colors.reset} ${String(s.refactor)}`);
  writeLine(`  ${colors.red}Deprecate:${colors.reset} ${String(s.deprecate)}`);
  writeLine(`  Avg Confidence: ${(s.averageConfidence * 100).toFixed(1)}%`);
  writeLine(`  Avg Evidence Quality: ${(s.averageEvidenceQuality * 100).toFixed(1)}%`);

  writeLine('');
  writeLine(`${colors.bold}Components:${colors.reset}`);
  writeLine('');

  let outputSize = 0;
  for (const result of commandResult.results) {
    const formatted = formatResultSummary(result);
    outputSize += formatted.length;

    if (outputSize > MAX_OUTPUT_BYTES) {
      const remaining = commandResult.results.length - commandResult.results.indexOf(result);
      writeLine(
        `${colors.dim}... and ${String(remaining)} more components (use --verbose for full output)${colors.reset}`
      );
      break;
    }

    writeLine(formatted);
    writeLine('');
  }

  writeLine(
    `${colors.dim}Note: These are RECOMMENDATIONS for human review, not decisions.${colors.reset}`
  );
  writeLine('');
}

/**
 * Print results in verbose mode.
 */
function printVerboseMode(commandResult: EvaluateCommandResult): void {
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
function printJsonMode(commandResult: EvaluateCommandResult): void {
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

// ============================================================================
// Main Command
// ============================================================================

/**
 * Parse command line options.
 */
export function parseOptions(args: readonly string[]): EvaluateOptions {
  let target = DEFAULT_TARGET;
  let verbose = false;
  let json = false;
  let timeout = DEFAULT_TIMEOUT_MS;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    if (arg === '--target' && nextArg !== undefined) {
      target = nextArg;
      i++;
    } else if (arg === '--verbose') {
      verbose = true;
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--timeout' && nextArg !== undefined) {
      const parsed = parseInt(nextArg, 10);
      if (!isNaN(parsed) && parsed > 0) {
        timeout = parsed;
      }
      i++;
    }
  }

  return { target, verbose, json, timeout };
}

/**
 * Run the evaluate command.
 * Returns exit code (0 = success, 1 = issues found, 2 = error).
 */
export async function evaluateCommand(args: readonly string[] = []): Promise<number> {
  const options = parseOptions(args);
  const startTime = Date.now();

  try {
    const { results, componentsScanned, totalLines, timedOut } = await evaluateDirectory(
      options.target,
      options.timeout
    );

    const summary = calculateSummary(results);

    const commandResult: EvaluateCommandResult = {
      results,
      componentsScanned,
      totalLines,
      durationMs: Date.now() - startTime,
      completedWithinTimeout: !timedOut,
      summary,
      timestamp: new Date(),
    };

    // Output based on mode
    if (options.json) {
      printJsonMode(commandResult);
    } else if (options.verbose) {
      printVerboseMode(commandResult);
    } else {
      printSummaryMode(commandResult);
    }

    // Return appropriate exit code
    if (summary.deprecate > 0) {
      return 1; // Issues found
    }
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${colors.red}Error: ${message}${colors.reset}\n`);
    return 2;
  }
}
