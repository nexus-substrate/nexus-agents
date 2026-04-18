/**
 * SWE-Bench barrel exports.
 *
 * NOTE (deprecation, #1960/#1966): This in-tree SWE-bench suite is being
 * superseded by the standalone [nexus-eval-swebench](https://github.com/williamzujkowski/nexus-eval-swebench)
 * package, which implements the `BenchmarkAdapter` contract and is the
 * recommended integration point going forward. These exports remain
 * functional for backwards compatibility and will be kept for at least
 * one minor version cycle.
 *
 * Migration:
 *
 *   // Before (in-tree):
 *   import { SWEBenchRunner } from 'nexus-agents';
 *
 *   // After (standalone, recommended):
 *   import { runBenchmark } from 'nexus-agents';
 *   import { SweBenchAdapter } from 'nexus-eval-swebench';
 *   const summary = await runBenchmark(new SweBenchAdapter({ variant: 'lite' }), {});
 *
 * The underlying runner types (SWEBenchRunner, SWEBenchInstance, etc.)
 * are still exported from here because `nexus-eval-swebench` depends on
 * them via peer dep. Removing them is a breaking change tracked
 * separately.
 *
 * @module exports/swe-bench
 * (Source: Issue #257 - SWE-Bench Evaluation; Issue #1960 extraction epic)
 */

export * from '../swe-bench/index.js';
