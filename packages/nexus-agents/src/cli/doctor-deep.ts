/**
 * Deep diagnostics for the doctor command.
 *
 * Surfaces learning loop health, data sufficiency, routing convergence,
 * and memory system status. Opt-in via `--deep` flag.
 *
 * @module cli/doctor-deep
 * (Source: Issue #1031 — Enhanced doctor --deep diagnostics)
 */

import { getOutcomeStore } from '../orchestration/outcomes/outcome-store.js';
import { TASK_CATEGORIES, type TaskCategory } from '../config/task-specialization-types.js';
import { getAdaptiveBonus } from '../mcp/tools/weather-report.js';

// ============================================================================
// Types
// ============================================================================

/** Per-CLI data sufficiency snapshot. */
export interface CliDataStatus {
  readonly cli: string;
  readonly taskCount: number;
  readonly aboveThreshold: boolean;
}

/** Deep diagnostics result. */
export interface DeepDiagnostics {
  readonly learningLoop: LearningLoopHealth;
  readonly dataSufficiency: DataSufficiency;
  readonly routingConvergence: RoutingConvergence;
}

export interface LearningLoopHealth {
  readonly totalOutcomes: number;
  readonly latestTimestamp: string | null;
  readonly activeBonuses: number;
  readonly totalBonusPairs: number;
}

export interface DataSufficiency {
  readonly cliStatus: readonly CliDataStatus[];
  readonly missingCategories: readonly string[];
  readonly coldStartThreshold: number;
}

export interface RoutingConvergence {
  readonly avgSuccessRate: number;
  readonly cliSuccessRates: ReadonlyMap<string, number>;
  readonly converged: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const CLI_NAMES = ['claude', 'gemini', 'codex'] as const;
const COLD_START_THRESHOLD = 3;

// ============================================================================
// Diagnostics
// ============================================================================

/** Check learning loop health: outcome count, latest timestamp, bonuses. */
function checkLearningLoop(): LearningLoopHealth {
  const store = getOutcomeStore();
  const outcomes = store.query();
  const latestTimestamp =
    outcomes.length > 0 ? (outcomes[outcomes.length - 1]?.timestamp ?? null) : null;

  let activeBonuses = 0;
  const totalPairs = CLI_NAMES.length * TASK_CATEGORIES.length;
  for (const cli of CLI_NAMES) {
    for (const cat of TASK_CATEGORIES) {
      if (getAdaptiveBonus(cli, cat) !== 0) activeBonuses++;
    }
  }

  return {
    totalOutcomes: outcomes.length,
    latestTimestamp,
    activeBonuses,
    totalBonusPairs: totalPairs,
  };
}

/** Check per-CLI data sufficiency against cold-start threshold. */
function checkDataSufficiency(): DataSufficiency {
  const store = getOutcomeStore();
  const cliStatus: CliDataStatus[] = [];

  for (const cli of CLI_NAMES) {
    const outcomes = store.query({ cli });
    cliStatus.push({
      cli,
      taskCount: outcomes.length,
      aboveThreshold: outcomes.length >= COLD_START_THRESHOLD,
    });
  }

  const categoriesWithData = new Set<TaskCategory>();
  const allOutcomes = store.query();
  for (const o of allOutcomes) {
    categoriesWithData.add(o.category);
  }
  const missing = TASK_CATEGORIES.filter((c) => !categoriesWithData.has(c));

  return { cliStatus, missingCategories: missing, coldStartThreshold: COLD_START_THRESHOLD };
}

/** Check routing convergence from outcome success rates. */
function checkConvergence(): RoutingConvergence {
  const store = getOutcomeStore();
  const rates = new Map<string, number>();
  let totalRate = 0;

  for (const cli of CLI_NAMES) {
    const outcomes = store.query({ cli });
    if (outcomes.length > 0) {
      const rate = outcomes.filter((o) => o.success).length / outcomes.length;
      rates.set(cli, Math.round(rate * 1000) / 1000);
      totalRate += rate;
    } else {
      rates.set(cli, 0);
    }
  }

  const avgRate = totalRate / CLI_NAMES.length;
  const allAboveThreshold = CLI_NAMES.every((cli) => {
    const outcomes = store.query({ cli });
    return outcomes.length >= COLD_START_THRESHOLD;
  });

  return {
    avgSuccessRate: Math.round(avgRate * 1000) / 1000,
    cliSuccessRates: rates,
    converged: allAboveThreshold,
  };
}

// ============================================================================
// Public API
// ============================================================================

/** Run all deep diagnostics. */
export function runDeepDiagnostics(): DeepDiagnostics {
  return {
    learningLoop: checkLearningLoop(),
    dataSufficiency: checkDataSufficiency(),
    routingConvergence: checkConvergence(),
  };
}

/** Format deep diagnostics for CLI output. */
export function formatDeepDiagnostics(diag: DeepDiagnostics): string {
  const lines: string[] = ['\n=== Deep Diagnostics ===\n'];

  // Learning Loop
  const ll = diag.learningLoop;
  lines.push('Learning Loop:');
  const outcomeIcon = ll.totalOutcomes > 0 ? '+' : '-';
  lines.push(`  ${outcomeIcon} OutcomeStore: ${String(ll.totalOutcomes)} entries`);
  const bonusIcon = ll.activeBonuses > 0 ? '+' : '-';
  lines.push(
    `  ${bonusIcon} Adaptive bonuses: ${String(ll.activeBonuses)}/${String(ll.totalBonusPairs)} active`
  );

  // Data Sufficiency
  lines.push('\nData Sufficiency:');
  for (const cs of diag.dataSufficiency.cliStatus) {
    const icon = cs.aboveThreshold ? '+' : '!';
    const label = cs.aboveThreshold ? 'above threshold' : 'below threshold';
    lines.push(`  ${icon} ${cs.cli}: ${String(cs.taskCount)} tasks (${label})`);
  }
  if (diag.dataSufficiency.missingCategories.length > 0) {
    lines.push(`  Missing categories: ${diag.dataSufficiency.missingCategories.join(', ')}`);
  }

  // Routing Convergence
  const rc = diag.routingConvergence;
  lines.push('\nRouting Convergence:');
  lines.push(`  Avg success rate: ${(rc.avgSuccessRate * 100).toFixed(1)}%`);
  lines.push(`  Converged: ${rc.converged ? 'yes' : 'no (still below cold-start threshold)'}`);

  return lines.join('\n');
}
