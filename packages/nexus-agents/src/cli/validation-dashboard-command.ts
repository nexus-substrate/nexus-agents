/**
 * nexus-agents/cli - Validation Dashboard Command
 *
 * CLI command to display learning validation metrics and health indicators.
 * Shows model performance with confidence intervals, learning progress,
 * exploration rates, and feature importance.
 *
 * @module cli/validation-dashboard-command
 * (Source: Issue #273 - Learning Validation Dashboard)
 */

import { getErrorMessage, createLogger } from '../core/index.js';
import { ValidationDashboard } from '../observability/validation-dashboard.js';
import type {
  DashboardFilter,
  DashboardRenderOptions,
} from '../observability/validation-dashboard-types.js';
import type {
  ValidationDashboardOptions,
  ValidationDashboardResult,
} from './validation-dashboard-types.js';
import { isValidPeriod } from './validation-dashboard-types.js';

const logger = createLogger({ component: 'validation-dashboard-command' });

// Re-export types for backward API compatibility
export type {
  ValidationDashboardOptions,
  ValidationDashboardResult,
} from './validation-dashboard-types.js';
export {
  isValidPeriod,
  isValidDashboardFormat,
  VALID_PERIODS,
} from './validation-dashboard-types.js';

/** Build filter from options. */
function buildFilter(options: ValidationDashboardOptions): DashboardFilter {
  const filter: DashboardFilter = {};
  if (options.period !== undefined && isValidPeriod(options.period)) {
    (filter as { period: typeof options.period }).period = options.period;
  }
  if (options.models !== undefined && options.models.length > 0) {
    (filter as { models: typeof options.models }).models = options.models;
  }
  if (options.taskTypes !== undefined && options.taskTypes.length > 0) {
    (filter as { taskTypes: typeof options.taskTypes }).taskTypes = options.taskTypes;
  }
  if (options.minSampleSize !== undefined && options.minSampleSize > 0) {
    (filter as { minSampleSize: number }).minSampleSize = options.minSampleSize;
  }
  return filter;
}

/** Build render options with defaults. */
function buildRenderOptions(options: ValidationDashboardOptions): DashboardRenderOptions {
  return {
    showConfidenceIntervals: options.showConfidenceIntervals ?? true,
    showTaskTypes: options.showTaskTypes ?? true,
    showLearningProgress: options.showLearningProgress ?? true,
    showFeatureImportance: options.showFeatureImportance ?? true,
    maxWidth: options.maxWidth ?? 100,
  };
}

/**
 * Runs the validation dashboard command.
 */
export function runValidationDashboard(
  dashboard: ValidationDashboard,
  options: ValidationDashboardOptions = {}
): ValidationDashboardResult {
  try {
    const filter = buildFilter(options);
    const summary = dashboard.getSummary(filter);
    const renderOptions = buildRenderOptions(options);

    const output =
      options.format === 'json'
        ? JSON.stringify(summary, null, 2)
        : dashboard.renderDashboard(filter, renderOptions);

    return {
      success: true,
      output,
      totalDecisions: summary.totalDecisions,
      modelsShown: summary.modelPerformance.map((mp) => mp.model),
      warnings: [...summary.healthIndicators.warnings],
    };
  } catch (error) {
    const message = getErrorMessage(error);
    logger.error(
      'Validation dashboard command failed',
      error instanceof Error ? error : new Error(message)
    );
    return {
      success: false,
      output: `Error: ${message}`,
      totalDecisions: 0,
      modelsShown: [],
      warnings: [],
    };
  }
}

/** Formats the command result for output. */
export function formatValidationDashboardResult(result: ValidationDashboardResult): string {
  return result.output;
}

/**
 * Main command entry point.
 */
export function validationDashboardCommand(options: ValidationDashboardOptions = {}): number {
  try {
    const dashboard = new ValidationDashboard();
    const result = runValidationDashboard(dashboard, options);
    process.stdout.write(result.output + '\n');

    if (options.verbose === true && result.totalDecisions === 0) {
      process.stdout.write(
        '\nNo routing data found. The dashboard populates as routing decisions are made.\n'
      );
      process.stdout.write('Run tasks through the orchestrator to generate data:\n');
      process.stdout.write('  nexus-agents orchestrate "Your task here"\n');
    }
    return result.success ? 0 : 1;
  } catch (error) {
    const message = getErrorMessage(error);
    process.stderr.write(`Error: ${message}\n`);
    logger.error(
      'Validation dashboard command failed',
      error instanceof Error ? error : new Error(message)
    );
    return 1;
  }
}

/** Parsed flags forwarded from the global CLI parser (#6678). */
export interface ValidationParsedFlags {
  readonly period?: string | undefined;
  readonly model?: string | undefined;
}

/** Parse --period=X from positionals or forwarded flag. */
function parsePeriod(positionals: readonly string[], flagPeriod?: string): string | undefined {
  if (flagPeriod !== undefined && isValidPeriod(flagPeriod)) return flagPeriod;
  const arg = positionals.find((p) => p.startsWith('--period='))?.split('=')[1];
  return isValidPeriod(arg) ? arg : undefined;
}

/** Parse --model=X,Y from positionals or forwarded flag. */
function parseModels(positionals: readonly string[], flagModel?: string): string[] | undefined {
  const raw = flagModel ?? positionals.find((p) => p.startsWith('--model='))?.split('=')[1];
  const models = raw?.split(',').filter((m) => m.length > 0);
  return models !== undefined && models.length > 0 ? models : undefined;
}

/** Parse --task-type=X,Y from positionals. */
function parseTaskTypes(positionals: readonly string[]): string[] | undefined {
  const arg = positionals.find((p) => p.startsWith('--task-type='))?.split('=')[1];
  const types = arg?.split(',').filter((t) => t.length > 0);
  return types !== undefined && types.length > 0 ? types : undefined;
}

/** Parse --min-sample=N from positionals. */
function parseMinSample(positionals: readonly string[]): number | undefined {
  const arg = positionals.find((p) => p.startsWith('--min-sample='))?.split('=')[1];
  const value = arg !== undefined ? parseInt(arg, 10) : undefined;
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Parses CLI positionals and forwarded flags to extract validation options (#6678).
 */
export function parseValidationArgs(
  positionals: readonly string[],
  format: string,
  verbose: boolean,
  flags?: ValidationParsedFlags
): Record<string, unknown> {
  const options: Record<string, unknown> = {
    format: format === 'json' ? 'json' : 'ascii',
    verbose,
  };
  const period = parsePeriod(positionals, flags?.period);
  const models = parseModels(positionals, flags?.model);
  const taskTypes = parseTaskTypes(positionals);
  const minSampleSize = parseMinSample(positionals);

  if (period !== undefined) options['period'] = period;
  if (models !== undefined) options['models'] = models;
  if (taskTypes !== undefined) options['taskTypes'] = taskTypes;
  if (minSampleSize !== undefined) options['minSampleSize'] = minSampleSize;
  return options;
}
