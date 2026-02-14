/**
 * Routing strategy A/B comparison framework.
 *
 * Replays task sequences against two routing configurations
 * and produces a comparison report showing routing differences.
 *
 * @module cli/routing-ab
 * (Source: Issue #1033 — Routing strategy A/B framework)
 */

import type { TaskCategory } from '../config/task-specialization-types.js';
import { TASK_CATEGORIES } from '../config/task-specialization-types.js';

// ============================================================================
// Types
// ============================================================================

/** A routing variant configuration for A/B comparison. */
export interface RoutingVariant {
  readonly name: string;
  readonly linucbAlpha: number;
  readonly topsisQualityWeight: number;
  readonly topsisCostWeight: number;
  readonly topsisLatencyWeight: number;
}

/** Single task entry for replay. */
export interface ReplayTask {
  readonly id: string;
  readonly category: TaskCategory;
  readonly description: string;
}

/** Per-variant result for a single replayed task. */
export interface VariantTaskResult {
  readonly taskId: string;
  readonly selectedCli: string;
  readonly simulatedSuccess: boolean;
  readonly simulatedDurationMs: number;
}

/** A/B comparison report. */
export interface ABComparisonReport {
  readonly variantA: VariantSummary;
  readonly variantB: VariantSummary;
  readonly taskCount: number;
  readonly allocationDiff: readonly AllocationDiffEntry[];
  readonly winnerBySuccessRate: string;
  readonly details: readonly string[];
}

/** Summary for a single variant. */
export interface VariantSummary {
  readonly name: string;
  readonly config: RoutingVariant;
  readonly successRate: number;
  readonly avgDurationMs: number;
  readonly cliAllocation: ReadonlyMap<string, number>;
}

/** Per-CLI allocation difference. */
export interface AllocationDiffEntry {
  readonly cli: string;
  readonly variantACount: number;
  readonly variantBCount: number;
  readonly diff: number;
}

/** Full A/B run configuration. */
export interface ABRunConfig {
  readonly variantA: RoutingVariant;
  readonly variantB: RoutingVariant;
  readonly taskCount: number;
  readonly seed?: number;
}

// ============================================================================
// Constants
// ============================================================================

const CLI_NAMES = ['claude', 'gemini', 'codex'] as const;
type CliName = (typeof CLI_NAMES)[number];

const DEFAULT_TASK_COUNT = 30;

const DEFAULT_VARIANT_A: RoutingVariant = {
  name: 'default',
  linucbAlpha: 1.0,
  topsisQualityWeight: 0.5,
  topsisCostWeight: 0.3,
  topsisLatencyWeight: 0.2,
};

const DEFAULT_VARIANT_B: RoutingVariant = {
  name: 'explorative',
  linucbAlpha: 2.0,
  topsisQualityWeight: 0.4,
  topsisCostWeight: 0.2,
  topsisLatencyWeight: 0.4,
};

/** Default variant presets. */
export const PRESET_VARIANTS: Record<string, RoutingVariant> = {
  default: {
    name: 'default',
    linucbAlpha: 1.0,
    topsisQualityWeight: 0.5,
    topsisCostWeight: 0.3,
    topsisLatencyWeight: 0.2,
  },
  explorative: {
    name: 'explorative',
    linucbAlpha: 2.0,
    topsisQualityWeight: 0.4,
    topsisCostWeight: 0.2,
    topsisLatencyWeight: 0.4,
  },
  quality: {
    name: 'quality-focused',
    linucbAlpha: 0.5,
    topsisQualityWeight: 0.8,
    topsisCostWeight: 0.1,
    topsisLatencyWeight: 0.1,
  },
};

// ============================================================================
// Seeded RNG (deterministic replay)
// ============================================================================

/** Simple seeded pseudo-random number generator (xoshiro128**). */
function createSeededRng(seed: number): () => number {
  let s = seed | 0;
  return (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================================
// Task Generation
// ============================================================================

/** Generate a fixed set of tasks for replay. */
function generateTasks(count: number, rng: () => number): ReplayTask[] {
  const tasks: ReplayTask[] = [];
  for (let i = 0; i < count; i++) {
    const catIdx = Math.floor(rng() * TASK_CATEGORIES.length);
    const category = TASK_CATEGORIES[catIdx] ?? 'code_generation';
    tasks.push({
      id: `ab-task-${String(i)}`,
      category,
      description: `Simulated ${category} task #${String(i)}`,
    });
  }
  return tasks;
}

// ============================================================================
// Simulated Routing
// ============================================================================

/** Simulates routing with a given variant config. */
function simulateRouting(
  task: ReplayTask,
  variant: RoutingVariant,
  rng: () => number
): VariantTaskResult {
  const score = simulateCliScores(task, variant, rng);
  const best = selectBest(score);
  const successRate = baseSuccessRate(best.cli, task.category);
  const success = rng() < successRate;
  const duration = 2000 + rng() * 8000;

  return {
    taskId: task.id,
    selectedCli: best.cli,
    simulatedSuccess: success,
    simulatedDurationMs: Math.round(duration),
  };
}

interface CliScore {
  cli: CliName;
  score: number;
}

/** Compute simulated scores for each CLI given variant config. */
function simulateCliScores(
  task: ReplayTask,
  variant: RoutingVariant,
  rng: () => number
): CliScore[] {
  return CLI_NAMES.map((cli) => {
    const quality = baseQuality(cli, task.category);
    const cost = baseCost(cli);
    const latency = baseLatency(cli);
    const topsis =
      quality * variant.topsisQualityWeight +
      (1 - cost) * variant.topsisCostWeight +
      (1 - latency) * variant.topsisLatencyWeight;
    const ucbBonus = variant.linucbAlpha * rng() * 0.3;
    return { cli, score: topsis + ucbBonus };
  });
}

function selectBest(scores: CliScore[]): CliScore {
  return scores.reduce((a, b) => (a.score >= b.score ? a : b));
}

/** Base quality score per CLI/category [0..1]. */
function baseQuality(cli: CliName, cat: TaskCategory): number {
  const map: Record<CliName, readonly TaskCategory[]> = {
    claude: ['architecture', 'security_review', 'planning', 'devops'],
    gemini: ['research', 'documentation', 'exploration'],
    codex: ['code_generation', 'code_review', 'testing'],
  };
  return map[cli].includes(cat) ? 0.85 : 0.55;
}

function baseCost(cli: CliName): number {
  const costs: Record<CliName, number> = { claude: 0.7, gemini: 0.4, codex: 0.5 };
  return costs[cli];
}

function baseLatency(cli: CliName): number {
  const lat: Record<CliName, number> = { claude: 0.5, gemini: 0.3, codex: 0.4 };
  return lat[cli];
}

function baseSuccessRate(cli: CliName, cat: TaskCategory): number {
  return baseQuality(cli, cat) * 0.95;
}

// ============================================================================
// Comparison
// ============================================================================

/** Run A/B comparison and produce report. */
function compareVariants(
  tasks: readonly ReplayTask[],
  resultsA: readonly VariantTaskResult[],
  resultsB: readonly VariantTaskResult[],
  config: ABRunConfig
): ABComparisonReport {
  const summaryA = summarizeVariant(config.variantA, resultsA);
  const summaryB = summarizeVariant(config.variantB, resultsB);
  const allocationDiff = buildAllocationDiff(summaryA, summaryB);
  const winner =
    summaryA.successRate >= summaryB.successRate ? config.variantA.name : config.variantB.name;
  const details = formatDetails(tasks.length, summaryA, summaryB, allocationDiff);

  return {
    variantA: summaryA,
    variantB: summaryB,
    taskCount: tasks.length,
    allocationDiff,
    winnerBySuccessRate: winner,
    details,
  };
}

function summarizeVariant(
  config: RoutingVariant,
  results: readonly VariantTaskResult[]
): VariantSummary {
  const successes = results.filter((r) => r.simulatedSuccess).length;
  const totalDuration = results.reduce((s, r) => s + r.simulatedDurationMs, 0);
  const allocation = new Map<string, number>();
  for (const cli of CLI_NAMES) allocation.set(cli, 0);
  for (const r of results) {
    allocation.set(r.selectedCli, (allocation.get(r.selectedCli) ?? 0) + 1);
  }

  return {
    name: config.name,
    config,
    successRate: results.length > 0 ? successes / results.length : 0,
    avgDurationMs: results.length > 0 ? Math.round(totalDuration / results.length) : 0,
    cliAllocation: allocation,
  };
}

function buildAllocationDiff(a: VariantSummary, b: VariantSummary): AllocationDiffEntry[] {
  return CLI_NAMES.map((cli) => {
    const aCount = a.cliAllocation.get(cli) ?? 0;
    const bCount = b.cliAllocation.get(cli) ?? 0;
    return { cli, variantACount: aCount, variantBCount: bCount, diff: aCount - bCount };
  });
}

function formatDetails(
  taskCount: number,
  a: VariantSummary,
  b: VariantSummary,
  diff: readonly AllocationDiffEntry[]
): string[] {
  const lines: string[] = [`Tasks: ${String(taskCount)}`];
  lines.push(`\nVariant A (${a.name}):`);
  lines.push(`  Success rate: ${(a.successRate * 100).toFixed(1)}%`);
  lines.push(`  Avg duration: ${String(a.avgDurationMs)}ms`);
  lines.push(`  Alpha: ${String(a.config.linucbAlpha)}`);

  lines.push(`\nVariant B (${b.name}):`);
  lines.push(`  Success rate: ${(b.successRate * 100).toFixed(1)}%`);
  lines.push(`  Avg duration: ${String(b.avgDurationMs)}ms`);
  lines.push(`  Alpha: ${String(b.config.linucbAlpha)}`);

  lines.push('\nAllocation diff:');
  for (const d of diff) {
    const sign = d.diff > 0 ? '+' : '';
    lines.push(
      `  ${d.cli}: A=${String(d.variantACount)} B=${String(d.variantBCount)} (${sign}${String(d.diff)})`
    );
  }
  return lines;
}

// ============================================================================
// Public API
// ============================================================================

/** Run an A/B comparison of two routing variants. */
export function runRoutingAB(config?: Partial<ABRunConfig>): ABComparisonReport {
  const taskCount = config?.taskCount ?? DEFAULT_TASK_COUNT;
  const variantA = config?.variantA ?? DEFAULT_VARIANT_A;
  const variantB = config?.variantB ?? DEFAULT_VARIANT_B;
  const seed = config?.seed ?? 42;

  const rng = createSeededRng(seed);
  const tasks = generateTasks(taskCount, rng);

  // Run variant A with its own RNG fork
  const rngA = createSeededRng(seed + 1);
  const resultsA = tasks.map((t) => simulateRouting(t, variantA, rngA));

  // Run variant B with its own RNG fork
  const rngB = createSeededRng(seed + 2);
  const resultsB = tasks.map((t) => simulateRouting(t, variantB, rngB));

  return compareVariants(tasks, resultsA, resultsB, {
    variantA,
    variantB,
    taskCount,
    seed,
  });
}

/** Format A/B comparison for CLI output. */
export function formatABReport(report: ABComparisonReport): string {
  const lines = ['\n=== Routing A/B Comparison ===\n', ...report.details];
  lines.push(`\nWinner (by success rate): ${report.winnerBySuccessRate}`);
  return lines.join('\n');
}
