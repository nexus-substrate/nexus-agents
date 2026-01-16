/**
 * nexus-agents/cli - Learning Metrics Dashboard Command
 *
 * CLI command to display aggregated learning metrics from LinUCB bandit,
 * routing metrics collector, and feedback integration.
 *
 * @module cli/learning-metrics-command
 * (Source: Issue #284 - Learning metrics dashboard)
 */

import { writeFileSync } from 'node:fs';
import { createLogger } from '../core/index.js';
import type { LinUCBBandit } from '../cli-adapters/linucb-bandit.js';
import type { RoutingMetricsCollector } from '../observability/routing-metrics.js';
import type { FeedbackIntegration } from '../learning/feedback-integration.js';
import type { LearningMetricsOptions, LearningMetricsResult } from './learning-metrics-types.js';
import { gatherLearningMetrics } from './learning-metrics-logic.js';
import { formatAsciiOutput, formatJsonOutput } from './learning-metrics-format.js';

// Re-export types
export type {
  LearningMetricsOptions,
  LearningMetricsResult,
  ModelLearningStats,
  BanditProgress,
  RewardTrend,
  FeedbackLoopStats,
  FeatureImportance,
} from './learning-metrics-types.js';

// Re-export logic functions
export { gatherLearningMetrics } from './learning-metrics-logic.js';

const logger = createLogger({ component: 'learning-metrics' });

/**
 * Context for learning metrics - components can be injected for testing
 * or passed from the MCP server context.
 */
export interface LearningMetricsContext {
  readonly bandit?: LinUCBBandit;
  readonly metricsCollector?: RoutingMetricsCollector;
  readonly feedbackIntegration?: FeedbackIntegration;
}

/**
 * Default options for the learning metrics command.
 */
export const DEFAULT_LEARNING_METRICS_OPTIONS: LearningMetricsOptions = {
  period: 24,
  format: 'ascii',
  banditStats: false,
  showTrends: true,
};

/** Parses a period argument value. */
function parsePeriodArg(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const period = parseInt(value, 10);
  return !isNaN(period) && period > 0 ? period : undefined;
}

/** Parsed state from argument processing. */
interface ParseState {
  period: number;
  format: 'ascii' | 'json';
  banditStats: boolean;
  showTrends: boolean;
  exportPath: string | undefined;
}

/** Process a single flag argument. */
function processFlag(state: ParseState, flag: string): void {
  switch (flag) {
    case '--json':
      state.format = 'json';
      break;
    case '--bandit-stats':
      state.banditStats = true;
      break;
    case '--no-trends':
      state.showTrends = false;
      break;
  }
}

/** Process a value argument (period or export). */
function processValueArg(state: ParseState, flag: string, value: string | undefined): void {
  if (value === undefined) return;
  if (flag === '--period' || flag === '-p') {
    const parsed = parsePeriodArg(value);
    if (parsed !== undefined) state.period = parsed;
  } else if (flag === '--export') {
    state.exportPath = value;
    state.format = 'json';
  }
}

/**
 * Parses learning metrics command arguments.
 */
export function parseLearningMetricsArgs(args: readonly string[]): LearningMetricsOptions {
  const state: ParseState = {
    period: DEFAULT_LEARNING_METRICS_OPTIONS.period,
    format: DEFAULT_LEARNING_METRICS_OPTIONS.format,
    banditStats: DEFAULT_LEARNING_METRICS_OPTIONS.banditStats,
    showTrends: DEFAULT_LEARNING_METRICS_OPTIONS.showTrends,
    exportPath: undefined,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;
    processFlag(state, arg);
    if ((arg === '--period' || arg === '-p' || arg === '--export') && i + 1 < args.length) {
      processValueArg(state, arg, args[++i]);
    }
  }

  return {
    period: state.period,
    format: state.format,
    banditStats: state.banditStats,
    showTrends: state.showTrends,
    ...(state.exportPath !== undefined && { exportPath: state.exportPath }),
  };
}

/**
 * Runs the learning-metrics command.
 *
 * @param options - Command options
 * @param context - Optional component context for dependency injection
 * @returns Exit code (0 for success)
 */
export function learningMetricsCommand(
  options: LearningMetricsOptions,
  context?: LearningMetricsContext
): number {
  try {
    const result = gatherLearningMetrics(
      context?.bandit,
      context?.metricsCollector,
      context?.feedbackIntegration,
      options
    );

    const output =
      options.format === 'json' ? formatJsonOutput(result) : formatAsciiOutput(result, options);

    // Handle export if specified
    if (options.exportPath !== undefined) {
      writeFileSync(options.exportPath, output, 'utf8');
      process.stdout.write(`Exported to: ${options.exportPath}\n`);
    } else {
      process.stdout.write(output + '\n');
    }

    return 0;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: ${msg}\n`);
    logger.error('Learning metrics failed', error instanceof Error ? error : new Error(msg));
    return 1;
  }
}

/**
 * Runs the learning metrics dashboard with default options.
 * Utility for programmatic usage.
 */
export function runLearningMetrics(
  context?: LearningMetricsContext,
  options?: Partial<LearningMetricsOptions>
): LearningMetricsResult {
  const mergedOptions: LearningMetricsOptions = {
    ...DEFAULT_LEARNING_METRICS_OPTIONS,
    ...options,
  };

  return gatherLearningMetrics(
    context?.bandit,
    context?.metricsCollector,
    context?.feedbackIntegration,
    mergedOptions
  );
}

/**
 * Prints learning metrics help information.
 */
export function printLearningMetricsHelp(): void {
  const help = `
Learning Metrics Dashboard
==========================

Displays aggregated learning metrics from the routing system.

Usage:
  nexus-agents learning-metrics [options]

Options:
  --period, -p <hours>  Time period for metrics (default: 24)
  --json                Output in JSON format
  --bandit-stats        Include detailed LinUCB bandit statistics
  --no-trends           Hide reward trend analysis
  --export <path>       Export metrics to file (JSON format)

Examples:
  nexus-agents learning-metrics
  nexus-agents learning-metrics --period 48 --bandit-stats
  nexus-agents learning-metrics --json --export metrics.json

Metrics included:
  - Model selection distribution and rewards
  - LinUCB bandit progress (exploration/exploitation)
  - Feature importance analysis
  - Reward trend analysis
  - Feedback loop statistics
`;

  process.stdout.write(help);
}
