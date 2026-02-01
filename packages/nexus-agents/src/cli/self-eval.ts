/**
 * nexus-agents evaluate command
 *
 * Self-evaluation CLI for codebase component assessment.
 * All outputs are RECOMMENDATIONS for human review, not decisions.
 *
 * @module cli/self-eval
 * (Source: Issue #140, Self-Evaluation MVP)
 */

import { scanComponents } from '../self-eval/component-scanner.js';
import { evaluateComponent } from '../self-eval/evaluation-agents.js';
import { createAggregator, type AggregatedResult } from '../self-eval/aggregation-logic.js';
import { getTimeProvider, getErrorMessage } from '../core/index.js';
import type { ComponentInfo } from '../self-eval/component-scanner.js';
import type { EvaluationResult } from '../self-eval/evaluation-agents.js';
import type {
  EvaluateOptions,
  EvaluateCommandResult,
  EvaluationSummary,
} from './self-eval-types.js';
import { DEFAULT_TIMEOUT_MS, DEFAULT_TARGET, colors } from './self-eval-types.js';
import { printSummaryMode, printVerboseMode, printJsonMode } from './self-eval-format.js';

// Re-export types for backward compatibility
export type {
  EvaluateOptions,
  EvaluateCommandResult,
  EvaluationSummary,
} from './self-eval-types.js';

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
  const time = getTimeProvider();
  const startTime = time.now();
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
    if (time.now() > deadline) {
      timedOut = true;
      break;
    }

    const evaluations = await evaluateComponentWithTimeout(component, deadline - time.now());
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
  const startTime = getTimeProvider().now();

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
      durationMs: getTimeProvider().now() - startTime,
      completedWithinTimeout: !timedOut,
      summary,
      timestamp: new Date(getTimeProvider().now()),
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
    const message = getErrorMessage(error);
    process.stderr.write(`${colors.red}Error: ${message}${colors.reset}\n`);
    return 2;
  }
}
