/**
 * nexus-agents/cli - Validation Dashboard Types
 *
 * Type definitions for the validation dashboard CLI command.
 *
 * @module cli/validation-dashboard-types
 * (Source: Issue #273 - Learning Validation Dashboard)
 */

import type { TimePeriod } from '../observability/validation-dashboard-types.js';

/**
 * Validation dashboard CLI command options.
 */
export interface ValidationDashboardOptions {
  /** Time period to filter data */
  readonly period?: TimePeriod;
  /** Filter to specific models */
  readonly models?: readonly string[];
  /** Filter to specific task types */
  readonly taskTypes?: readonly string[];
  /** Minimum sample size for inclusion */
  readonly minSampleSize?: number;
  /** Output format */
  readonly format?: 'ascii' | 'json';
  /** Show confidence intervals */
  readonly showConfidenceIntervals?: boolean;
  /** Show task type breakdown */
  readonly showTaskTypes?: boolean;
  /** Show learning progress */
  readonly showLearningProgress?: boolean;
  /** Show feature importance */
  readonly showFeatureImportance?: boolean;
  /** Verbose output */
  readonly verbose?: boolean;
  /** Maximum width for ASCII output */
  readonly maxWidth?: number;
}

/**
 * Validation dashboard CLI command result.
 */
export interface ValidationDashboardResult {
  /** Whether the command succeeded */
  readonly success: boolean;
  /** Output to display */
  readonly output: string;
  /** Total decisions shown */
  readonly totalDecisions: number;
  /** Models included */
  readonly modelsShown: readonly string[];
  /** Any warnings from the dashboard */
  readonly warnings: readonly string[];
}

/**
 * Valid period options for the CLI.
 */
export const VALID_PERIODS = ['1h', '24h', '7d', '30d', 'all'] as const;

/**
 * Checks if a value is a valid time period.
 */
export function isValidPeriod(value: string | undefined): value is TimePeriod {
  if (value === undefined) return false;
  return VALID_PERIODS.includes(value as TimePeriod);
}

/**
 * Checks if a value is a valid format option.
 */
export function isValidDashboardFormat(value: string | undefined): value is 'ascii' | 'json' {
  return value === 'ascii' || value === 'json';
}
