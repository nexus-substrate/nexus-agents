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
import { hasMeasuredCategory } from '../orchestration/outcomes/outcome-types.js';
import { TASK_CATEGORIES, type TaskCategory } from '../config/task-specialization-types.js';
import { getAdaptiveBonus } from '../mcp/tools/weather-report.js';
import { ApiArmIdSchema } from '../cli-adapters/types-core.js';
import { allOf, verdictOver } from '../utils/verdict-aggregation.js';

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

/**
 * One arm's success rate. An arm with no outcome rows is `unmeasured` — not a
 * 0% rate, which would claim every attempt failed (#6557).
 */
export type ArmSuccessRate =
  | { readonly status: 'measured'; readonly rate: number; readonly sampleCount: number }
  | { readonly status: 'unmeasured' };

export interface RoutingConvergence {
  /**
   * Mean success rate over MEASURED arms only. `'unmeasured'` when no arm has
   * a row — the empty case, which is neither 0 nor NaN (#6557).
   */
  readonly avgSuccessRate: number | 'unmeasured';
  /** Every routed arm (CLI slots and `api:*` arms), measured or not. */
  readonly armSuccessRates: ReadonlyMap<string, ArmSuccessRate>;
  /** Number of arms with at least one outcome row: the average's divisor. */
  readonly measuredArmCount: number;
  /** Every measured arm has cleared the cold-start threshold; false when none is measured. */
  readonly converged: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const CLI_NAMES = ['claude', 'gemini', 'codex', 'opencode'] as const;
const COLD_START_THRESHOLD = 3;

/**
 * CLI slots plus API arms: every `cli` an attributed outcome row can carry.
 * Routed rows record the arm that ran (`api:anthropic`), not its slot, since
 * #6554. `unknown` is deliberately absent: an unattributed row is no arm's
 * measurement.
 */
const ROUTED_ARMS: readonly string[] = [...CLI_NAMES, ...ApiArmIdSchema.options];

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
    // A defaulted category is not coverage of that category (#6549).
    if (hasMeasuredCategory(o)) categoriesWithData.add(o.category);
  }
  const missing = TASK_CATEGORIES.filter((c) => !categoriesWithData.has(c));

  return { cliStatus, missingCategories: missing, coldStartThreshold: COLD_START_THRESHOLD };
}

/** Round a rate to three decimals for display-stable output. */
function roundRate(rate: number): number {
  return Math.round(rate * 1000) / 1000;
}

interface MeasuredArm {
  readonly rate: number;
  readonly sampleCount: number;
}

/** Tally rows per routed arm; rows carrying no routed arm (`unknown`) are skipped. */
function tallyRowsByArm(): Map<string, { total: number; successes: number }> {
  const byArm = new Map<string, { total: number; successes: number }>();
  for (const o of getOutcomeStore().query()) {
    if (!ROUTED_ARMS.includes(o.cli)) continue;
    const tally = byArm.get(o.cli) ?? { total: 0, successes: 0 };
    tally.total++;
    if (o.success) tally.successes++;
    byArm.set(o.cli, tally);
  }
  return byArm;
}

/**
 * Check routing convergence from outcome success rates (#6557).
 *
 * Covers the arms rows actually carry, CLI and `api:*` alike. An arm with no
 * rows is `unmeasured` and stays out of the average, whose divisor is the
 * number of measured arms, never a fixed list.
 */
function checkConvergence(): RoutingConvergence {
  const rowsByArm = tallyRowsByArm();
  const measured: MeasuredArm[] = [];
  const rates = new Map<string, ArmSuccessRate>();
  for (const arm of ROUTED_ARMS) {
    const tally = rowsByArm.get(arm);
    if (tally === undefined) {
      rates.set(arm, { status: 'unmeasured' });
      continue;
    }
    const rate = tally.successes / tally.total;
    measured.push({ rate, sampleCount: tally.total });
    rates.set(arm, { status: 'measured', rate: roundRate(rate), sampleCount: tally.total });
  }

  // Empty case named: with no measured arm there is no rate to average.
  const avgSuccessRate = verdictOver<MeasuredArm, number | 'unmeasured'>(
    measured,
    (arms) => roundRate(arms.reduce((sum, a) => sum + a.rate, 0) / arms.length),
    'unmeasured'
  );
  // Nothing measured has not converged on anything.
  const converged = allOf(measured, (a) => a.sampleCount >= COLD_START_THRESHOLD, false);

  return {
    avgSuccessRate,
    armSuccessRates: rates,
    measuredArmCount: measured.length,
    converged,
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

/** Render convergence rates, naming unmeasured arms rather than showing them as 0%. */
function formatConvergenceRates(rc: RoutingConvergence): string[] {
  const pct = (rate: number): string => `${(rate * 100).toFixed(1)}%`;
  if (rc.avgSuccessRate === 'unmeasured') {
    return ['  Avg success rate: unmeasured (no arm has outcome rows)'];
  }
  const noun = rc.measuredArmCount === 1 ? 'arm' : 'arms';
  const lines = [
    `  Avg success rate: ${pct(rc.avgSuccessRate)} over ${String(rc.measuredArmCount)} measured ${noun}`,
  ];
  const unmeasured: string[] = [];
  for (const [arm, r] of rc.armSuccessRates) {
    if (r.status === 'unmeasured') unmeasured.push(arm);
    else lines.push(`    ${arm}: ${pct(r.rate)} (${String(r.sampleCount)} runs)`);
  }
  if (unmeasured.length > 0) lines.push(`    Unmeasured (no rows): ${unmeasured.join(', ')}`);
  return lines;
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
  lines.push(...formatConvergenceRates(rc));
  lines.push(`  Converged: ${rc.converged ? 'yes' : 'no (still below cold-start threshold)'}`);

  return lines.join('\n');
}
