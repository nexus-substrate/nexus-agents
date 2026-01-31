/**
 * Routing Audit Type Definitions
 *
 * Type definitions for the routing-audit CLI command.
 *
 * @module cli/routing-audit-types
 * (Source: Issue #170, Alignment Roadmap Phase 1)
 */

import type { CliName } from '../cli-adapters/types.js';
import type { TopsisResult } from '../cli-adapters/topsis-types.js';
import type { TaskProfile } from '../core/index.js';

// =============================================================================
// Command Options & Result Types
// =============================================================================

/** Options for the routing-audit command. */
export interface RoutingAuditOptions {
  readonly task: string;
  readonly explain?: boolean;
  readonly deterministic?: boolean;
  readonly json?: boolean;
  readonly verbose?: boolean;
  readonly banditStats?: boolean;
}

/** Budget filter result for a single CLI. */
export interface BudgetFilterResult {
  readonly cliName: CliName;
  readonly withinBudget: boolean;
  readonly reason: string;
}

/** LinUCB arm detail. */
export interface LinUCBArmDetail {
  readonly cliName: CliName;
  readonly ucbScore: number;
  readonly pullCount: number;
  readonly avgReward: number;
  readonly isExploration: boolean;
}

/** Feature importance for LinUCB. */
export interface FeatureImportance {
  readonly feature: string;
  readonly importance: number;
}

/** Detailed LinUCB arm statistics. */
export interface DetailedArmStats {
  readonly cliName: CliName;
  readonly pullCount: number;
  readonly avgReward: number;
  readonly cumulativeReward: number;
  readonly learnedWeights: readonly number[];
  readonly featureImportance: readonly FeatureImportance[];
}

/** LinUCB exploration statistics. */
export interface ExplorationStats {
  readonly totalPulls: number;
  readonly explorationRatio: number;
  readonly armDistribution: readonly { name: string; proportion: number }[];
}

/** Complete bandit statistics (Issue #174). */
export interface BanditStats {
  readonly detailedArms: readonly DetailedArmStats[];
  readonly exploration: ExplorationStats;
}

/** Complete routing audit result. */
export interface RoutingAuditResult {
  readonly task: string;
  readonly taskProfile: TaskProfile;
  readonly budgetResults: readonly BudgetFilterResult[];
  readonly topsisResult: TopsisResult;
  readonly linucbDetails: readonly LinUCBArmDetail[];
  readonly selectedCli: CliName;
  readonly selectionReason: string;
  readonly isExploration: boolean;
  readonly banditStats?: BanditStats;
}

// =============================================================================
// ANSI Formatting Constants
// =============================================================================

export const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
} as const;

export function color(text: string, code: string): string {
  return `${code}${text}${ANSI.reset}`;
}

export const BOX_WIDTH = 65;

export function horizontalLine(char = '─'): string {
  return char.repeat(BOX_WIDTH - 2);
}

export function boxLine(content: string): string {
  return color('│', ANSI.cyan) + content.padEnd(BOX_WIDTH - 2) + color('│', ANSI.cyan);
}
