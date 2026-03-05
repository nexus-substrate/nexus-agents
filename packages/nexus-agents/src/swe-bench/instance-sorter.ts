/**
 * nexus-agents/swe-bench - Instance Priority Sorter
 *
 * Sorts SWE-bench instances by estimated difficulty to maximize early
 * throughput. Easier instances run first, producing results faster and
 * enabling early stopping strategies.
 *
 * Scoring factors:
 * 1. Repository complexity (Flask=1, Django=7, SymPy=9)
 * 2. Problem statement length (proxy for issue complexity)
 * 3. Past success rates from memory (when available)
 *
 * @module swe-bench/instance-sorter
 * (Source: Issue #1407 - SWE-bench parallel execution)
 */

import type { SWEBenchInstance } from './types.js';

/**
 * Relative complexity scores for SWE-bench Lite repositories.
 * Based on codebase size, framework complexity, and historical solve rates.
 * Lower = easier. Scale: 1-10.
 */
export const REPO_COMPLEXITY: Record<string, number> = {
  'pallets/flask': 2,
  'psf/requests': 2,
  'mwaskom/seaborn': 3,
  'pydata/xarray': 5,
  'pylint-dev/pylint': 5,
  'pytest-dev/pytest': 5,
  'astropy/astropy': 6,
  'matplotlib/matplotlib': 6,
  'sphinx-doc/sphinx': 6,
  'scikit-learn/scikit-learn': 7,
  'django/django': 7,
  'sympy/sympy': 9,
};

/** Default complexity for repos not in the map. */
const DEFAULT_COMPLEXITY = 5;

/** Weight for problem statement length factor (normalized 0-10). */
const LENGTH_WEIGHT = 0.3;

/** Characters at which problem statement is considered "max complexity". */
const MAX_PROBLEM_LENGTH = 3000;

/** Weight for past success rate factor (0 = no history, reduces score if high). */
const SUCCESS_WEIGHT = 5;

/** Penalty for instances that have failed before. */
const FAILURE_PENALTY = 3;

/** Options for priority sorting. */
export interface SortOptions {
  /** Map of instance_id -> success rate (0.0-1.0) from past runs. */
  readonly pastSuccessRates?: ReadonlyMap<string, number>;
}

/**
 * Estimate difficulty score for an instance (lower = easier).
 * Range: roughly 0-15 without memory, 0-20 with memory penalties.
 */
export function estimateDifficulty(instance: SWEBenchInstance, options?: SortOptions): number {
  // Factor 1: Repo complexity (1-10)
  const repoScore = REPO_COMPLEXITY[instance.repo] ?? DEFAULT_COMPLEXITY;

  // Factor 2: Problem statement length (0-10, scaled)
  const stmtLen = instance.problem_statement.length;
  const lengthScore = Math.min(stmtLen / MAX_PROBLEM_LENGTH, 1) * 10 * LENGTH_WEIGHT;

  // Factor 3: Past success/failure adjustment
  let memoryAdjust = 0;
  if (options?.pastSuccessRates !== undefined) {
    const rate = options.pastSuccessRates.get(instance.instance_id);
    if (rate !== undefined) {
      if (rate > 0.5) {
        // Previously succeeded → reduce difficulty (easier to solve)
        memoryAdjust = -SUCCESS_WEIGHT * rate;
      } else {
        // Previously failed → increase difficulty
        memoryAdjust = FAILURE_PENALTY;
      }
    }
  }

  return repoScore + lengthScore + memoryAdjust;
}

/**
 * Sort instances by estimated difficulty (easiest first).
 * Returns a new array; does not modify the input.
 */
export function sortByPriority(
  instances: readonly SWEBenchInstance[],
  options?: SortOptions
): SWEBenchInstance[] {
  return [...instances].sort(
    (a, b) => estimateDifficulty(a, options) - estimateDifficulty(b, options)
  );
}
