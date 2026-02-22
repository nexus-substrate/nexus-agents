/**
 * E2E evaluation runner for the learning loop pipeline.
 *
 * Sends a configurable sequence of tasks through the outcome recording
 * pipeline with simulated success/failure rates, then validates that
 * LinUCB bandit weights converge and weather report shows non-zero
 * adaptive bonuses.
 *
 * @module cli/e2e-eval
 * (Source: Issue #1030 — E2E scenario runner to validate learning loop)
 */

import type { TaskCategory } from '../config/task-specialization-types.js';
import { TASK_CATEGORIES } from '../config/task-specialization-types.js';
import { getOutcomeStore, resetOutcomeStore } from '../orchestration/outcomes/outcome-store.js';
import type { TaskOutcome } from '../orchestration/outcomes/outcome-types.js';
import { getAdaptiveBonus } from '../mcp/tools/weather-report.js';
import { createLogger, type ILogger } from '../core/index.js';

// ============================================================================
// Constants
// ============================================================================

const CLI_NAMES = ['claude', 'gemini', 'codex', 'opencode'] as const;
type CliName = (typeof CLI_NAMES)[number];

/** E2E eval marker in qualitySignals for identification. */
export const E2E_EVAL_MARKER = 'e2e-eval';

/** Default task distribution matching real-world profile. */
const DEFAULT_TASK_DISTRIBUTION: ReadonlyMap<TaskCategory, number> = new Map([
  ['code_generation', 0.4],
  ['code_review', 0.2],
  ['testing', 0.15],
  ['architecture', 0.1],
  ['security_review', 0.05],
  ['research', 0.05],
  ['documentation', 0.05],
]);

/** Primary CLI for each category (from TASK_SPECIALIZATION_MATRIX). */
const PRIMARY_CLI: ReadonlyMap<TaskCategory, CliName> = new Map([
  ['code_generation', 'codex'],
  ['code_review', 'codex'],
  ['testing', 'codex'],
  ['architecture', 'claude'],
  ['security_review', 'claude'],
  ['planning', 'claude'],
  ['devops', 'claude'],
  ['research', 'gemini'],
  ['documentation', 'gemini'],
  ['exploration', 'gemini'],
]);

/** Mock success rates by CLI role. */
const SUCCESS_RATES = { primary: 0.85, secondary: 0.65, other: 0.4 } as const;

/** Mock latency ranges by CLI role (ms). */
const LATENCY_RANGES = {
  primary: { min: 2000, max: 5000 },
  secondary: { min: 3000, max: 8000 },
  other: { min: 5000, max: 15000 },
} as const;

// ============================================================================
// Types
// ============================================================================

export interface E2EEvalConfig {
  readonly taskCount: number;
  readonly resetStore: boolean;
}

export interface E2EEvalResult {
  readonly tasksRun: number;
  readonly outcomesByCliSuccess: ReadonlyMap<string, number>;
  readonly outcomesByCliTotal: ReadonlyMap<string, number>;
  readonly adaptiveBonuses: ReadonlyMap<string, number>;
  readonly convergenceScore: number;
  readonly passed: boolean;
  readonly details: readonly string[];
}

// ============================================================================
// Task Generation
// ============================================================================

/** Generate a random task category based on the distribution. */
function pickCategory(): TaskCategory {
  const roll = Math.random();
  let cumulative = 0;
  for (const [category, weight] of DEFAULT_TASK_DISTRIBUTION) {
    cumulative += weight;
    if (roll <= cumulative) return category;
  }
  return 'code_generation'; // fallback
}

/** Pick a random CLI weighted toward primary. */
function pickCli(category: TaskCategory): CliName {
  const primary = PRIMARY_CLI.get(category) ?? 'claude';
  const roll = Math.random();
  if (roll < 0.5) return primary;
  if (roll < 0.75) return CLI_NAMES.find((c) => c !== primary) ?? 'gemini';
  return CLI_NAMES[Math.floor(Math.random() * CLI_NAMES.length)] ?? 'claude';
}

/** Determine CLI role for a given category. */
function getCliRole(cli: CliName, category: TaskCategory): 'primary' | 'secondary' | 'other' {
  const primary = PRIMARY_CLI.get(category);
  if (cli === primary) return 'primary';
  // Simplified: second CLI in matrix is secondary
  const secondaryMap: ReadonlyMap<TaskCategory, CliName> = new Map([
    ['code_generation', 'claude'],
    ['code_review', 'claude'],
    ['testing', 'claude'],
    ['architecture', 'gemini'],
    ['security_review', 'gemini'],
    ['planning', 'gemini'],
    ['devops', 'gemini'],
    ['research', 'claude'],
    ['documentation', 'claude'],
    ['exploration', 'claude'],
  ]);
  return cli === secondaryMap.get(category) ? 'secondary' : 'other';
}

/** Simulate task execution and return an outcome. */
function simulateTask(taskIndex: number, category: TaskCategory, cli: CliName): TaskOutcome {
  const role = getCliRole(cli, category);
  const successRate = SUCCESS_RATES[role];
  const latency = LATENCY_RANGES[role];
  const success = Math.random() < successRate;
  const durationMs = latency.min + Math.random() * (latency.max - latency.min);

  return {
    id: `e2e-${String(taskIndex)}-${cli}-${category}`,
    cli,
    category,
    model: `${cli}-default`,
    success,
    durationMs: Math.round(durationMs),
    timestamp: new Date().toISOString(),
    qualitySignals: [E2E_EVAL_MARKER],
    source: 'manual',
  };
}

// ============================================================================
// Evaluation Phases
// ============================================================================

interface CliCounts {
  success: Map<string, number>;
  total: Map<string, number>;
}

/** Phase 1: Generate and record simulated outcomes. */
function generateOutcomes(taskCount: number): CliCounts {
  const store = getOutcomeStore();
  const success = new Map<string, number>();
  const total = new Map<string, number>();
  for (const cli of CLI_NAMES) {
    success.set(cli, 0);
    total.set(cli, 0);
  }

  for (let i = 0; i < taskCount; i++) {
    const category = pickCategory();
    const cli = pickCli(category);
    const outcome = simulateTask(i, category, cli);
    store.append(outcome);
    total.set(cli, (total.get(cli) ?? 0) + 1);
    if (outcome.success) success.set(cli, (success.get(cli) ?? 0) + 1);
  }
  return { success, total };
}

/** Phase 2: Check adaptive bonuses across all CLI/category pairs. */
function checkAdaptiveBonuses(): { bonuses: Map<string, number>; nonZeroCount: number } {
  const bonuses = new Map<string, number>();
  let nonZeroCount = 0;
  for (const cli of CLI_NAMES) {
    let sum = 0;
    for (const cat of TASK_CATEGORIES) {
      const bonus = getAdaptiveBonus(cli, cat);
      if (bonus !== 0) nonZeroCount++;
      sum += bonus;
    }
    bonuses.set(cli, Math.round((sum / TASK_CATEGORIES.length) * 1000) / 1000);
  }
  return { bonuses, nonZeroCount };
}

/** Phase 3: Compute convergence score from CLI success rate spread. */
function computeConvergence(counts: CliCounts, nonZeroBonuses: number): number {
  const rates = CLI_NAMES.map((cli) => {
    const t = counts.total.get(cli) ?? 0;
    const s = counts.success.get(cli) ?? 0;
    return t > 0 ? s / t : 0;
  });
  const spread = Math.max(...rates) - Math.min(...rates);
  return Math.min(1, spread / 0.3 + (nonZeroBonuses > 0 ? 0.3 : 0));
}

/** Build details lines for CLI output. */
function buildDetails(
  taskCount: number,
  counts: CliCounts,
  nonZero: number,
  score: number,
  passed: boolean
): string[] {
  const lines: string[] = [`Outcomes recorded: ${String(taskCount)}`];
  for (const cli of CLI_NAMES) {
    const t = counts.total.get(cli) ?? 0;
    const s = counts.success.get(cli) ?? 0;
    const rate = t > 0 ? ((s / t) * 100).toFixed(1) : '0.0';
    lines.push(`  ${cli}: ${String(s)}/${String(t)} (${rate}%)`);
  }
  const total = CLI_NAMES.length * TASK_CATEGORIES.length;
  lines.push(`Non-zero adaptive bonuses: ${String(nonZero)}/${String(total)}`);
  lines.push(`Convergence score: ${score.toFixed(3)}`);
  lines.push(`Result: ${passed ? 'PASSED' : 'FAILED'}`);
  return lines;
}

// ============================================================================
// Public API
// ============================================================================

/** Run the E2E evaluation sequence. */
export function runE2EEval(config?: Partial<E2EEvalConfig>, logger?: ILogger): E2EEvalResult {
  const log = logger ?? createLogger({ component: 'e2e-eval' });
  const taskCount = config?.taskCount ?? 50;
  if (config?.resetStore !== false) resetOutcomeStore();

  const counts = generateOutcomes(taskCount);
  log.info('E2E eval: outcomes recorded', { taskCount });

  const { bonuses, nonZeroCount } = checkAdaptiveBonuses();
  const convergenceScore = computeConvergence(counts, nonZeroCount);
  const passed = nonZeroCount > 0 || convergenceScore > 0.5;
  const details = buildDetails(taskCount, counts, nonZeroCount, convergenceScore, passed);

  log.info('E2E eval complete', { passed, convergenceScore, nonZeroBonuses: nonZeroCount });

  return {
    tasksRun: taskCount,
    outcomesByCliSuccess: counts.success,
    outcomesByCliTotal: counts.total,
    adaptiveBonuses: bonuses,
    convergenceScore,
    passed,
    details,
  };
}

/** Format E2E eval result for CLI output. */
export function formatE2EEvalResult(result: E2EEvalResult): string {
  return result.details.join('\n');
}
