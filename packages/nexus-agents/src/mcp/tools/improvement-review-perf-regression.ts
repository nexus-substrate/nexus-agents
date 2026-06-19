/**
 * Deterministic performance-regression detector for `improvement_review`
 * (#3692 + #3246, design-vote Option A).
 *
 * Maps a benchmark measurement against a STATIC, PINNED baseline + a fixed
 * tolerance to an optional `perf-regression` {@link ImprovementSignal}. This is
 * the deterministic core of the observability-feedback cluster: same inputs →
 * same output, NO model judgment.
 *
 * LOAD-BEARING CONSTRAINT (why this is deterministic and NOT #3230 auto-tuning):
 * the baseline is STATIC — supplied by a configured/committed baseline map, never
 * derived from a rolling window over the OutcomeStore or recent runs. A rolling
 * baseline would reintroduce the deferred #3230 adaptive control. If no baseline
 * is configured for a component+operation, this emits NOTHING (conservative — a
 * missing baseline is "unknown", never "regressed"), so it cannot invent a
 * regression from recent data.
 *
 * SURFACED-NOT-AUTO-ACTED: this module only BUILDS signals. The returned
 * signals are spread into `improvement_review`'s surfaced-signals list exactly
 * like the tech-debt / tool-fitness / below-floor signals. Nothing here mutates a
 * fitness or governance score, applies a penalty, or takes any autonomous action.
 *
 * @module mcp/tools/improvement-review-perf-regression
 * (Source: Issue #3692, #3246)
 */

import type { ImprovementSignal } from './improvement-review.js';
import type { BenchmarkSuiteResult } from '../../benchmarks/benchmark-types.js';

/**
 * A static, pinned baseline for one benchmarked component+operation. These values
 * are CONFIGURED/COMMITTED (e.g. a baseline field in benchmark config or a
 * versioned baseline file) — they are never auto-derived from recent runs.
 */
export interface PerfBaseline {
  /**
   * Baseline p95 latency in milliseconds. A measured p95 above
   * `baselineP95Ms * (1 + tolerance)` is a latency regression. Omit to skip the
   * latency check for this operation.
   */
  readonly baselineP95Ms?: number;
  /**
   * Baseline throughput in ops/second. A measured throughput below
   * `baselineThroughput * (1 - tolerance)` is a throughput regression. Omit to
   * skip the throughput check for this operation.
   */
  readonly baselineThroughput?: number;
}

/**
 * Static baseline map keyed by `"<component>::<operation>"`. A component+operation
 * with NO entry here produces no signal (conservative — no false regressions).
 * Construct the key with {@link baselineKey}.
 */
export type PerfBaselineMap = ReadonlyMap<string, PerfBaseline>;

/**
 * Documented default regression tolerance: a measurement may be up to 20% worse
 * than baseline before it is flagged. 0.2 = 20% worse than baseline.
 */
export const DEFAULT_REGRESSION_TOLERANCE_FRACTION = 0.2;

/** Stable key for the {@link PerfBaselineMap}: `"<component>::<operation>"`. */
export function baselineKey(component: string, operation: string): string {
  return `${component}::${operation}`;
}

/** Round to 2 decimals for stable, readable signal payloads. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Percentage delta worse-than-baseline, rounded, for the signal body. */
function pctWorse(measured: number, baseline: number): number {
  if (baseline === 0) return 0;
  return round2((Math.abs(measured - baseline) / baseline) * 100);
}

/**
 * Build a latency-regression signal. Boundary is EXCLUSIVE: fires only when
 * `measuredP95Ms > baselineP95Ms * (1 + tolerance)` — exactly at the threshold is
 * NOT a regression (conservative).
 */
function latencyRegressionSignal(
  component: string,
  operation: string,
  measuredP95Ms: number,
  baselineP95Ms: number,
  tolerance: number
): ImprovementSignal | undefined {
  const threshold = baselineP95Ms * (1 + tolerance);
  if (measuredP95Ms <= threshold) return undefined;
  const deltaPct = pctWorse(measuredP95Ms, baselineP95Ms);
  return {
    category: 'perf-regression',
    signalKey: `perf-regression:latency:${component}:${operation}`,
    severity: 'warning',
    title: `perf-regression: ${component}/${operation} p95 latency ${String(round2(measuredP95Ms))}ms vs baseline ${String(round2(baselineP95Ms))}ms (+${String(deltaPct)}%)`,
    body: [
      `Measured p95 latency regressed beyond the configured tolerance against a STATIC baseline.`,
      '',
      `- Component: \`${component}\``,
      `- Operation: \`${operation}\``,
      `- Measured p95: ${String(round2(measuredP95Ms))} ms`,
      `- Baseline p95: ${String(round2(baselineP95Ms))} ms (static/configured — not a rolling window)`,
      `- Tolerance: ${String(round2(tolerance * 100))}% (regression threshold ${String(round2(threshold))} ms)`,
      `- Delta: +${String(deltaPct)}% worse than baseline`,
      '',
      'Surfaced as a candidate finding for human review. No fitness/governance score is mutated and no remediation is auto-applied.',
    ].join('\n'),
    evidence: { observedValue: round2(measuredP95Ms), threshold: round2(threshold) },
  };
}

/**
 * Build a throughput-regression signal. Boundary is EXCLUSIVE: fires only when
 * `measuredThroughput < baselineThroughput * (1 - tolerance)` — exactly at the
 * threshold is NOT a regression (conservative).
 */
function throughputRegressionSignal(
  component: string,
  operation: string,
  measuredThroughput: number,
  baselineThroughput: number,
  tolerance: number
): ImprovementSignal | undefined {
  const threshold = baselineThroughput * (1 - tolerance);
  if (measuredThroughput >= threshold) return undefined;
  const deltaPct = pctWorse(measuredThroughput, baselineThroughput);
  return {
    category: 'perf-regression',
    signalKey: `perf-regression:throughput:${component}:${operation}`,
    severity: 'warning',
    title: `perf-regression: ${component}/${operation} throughput ${String(round2(measuredThroughput))} ops/s vs baseline ${String(round2(baselineThroughput))} ops/s (-${String(deltaPct)}%)`,
    body: [
      `Measured throughput regressed beyond the configured tolerance against a STATIC baseline.`,
      '',
      `- Component: \`${component}\``,
      `- Operation: \`${operation}\``,
      `- Measured throughput: ${String(round2(measuredThroughput))} ops/s`,
      `- Baseline throughput: ${String(round2(baselineThroughput))} ops/s (static/configured — not a rolling window)`,
      `- Tolerance: ${String(round2(tolerance * 100))}% (regression threshold ${String(round2(threshold))} ops/s)`,
      `- Delta: -${String(deltaPct)}% below baseline`,
      '',
      'Surfaced as a candidate finding for human review. No fitness/governance score is mutated and no remediation is auto-applied.',
    ].join('\n'),
    evidence: { observedValue: round2(measuredThroughput), threshold: round2(threshold) },
  };
}

/**
 * Map a benchmark suite result + a STATIC baseline map to `perf-regression`
 * signals. Pure and deterministic: same inputs → same output.
 *
 * For each operation, looks up `"<component>::<operation>"` in `baselines`:
 * - No entry → emit nothing (conservative; never invents a baseline).
 * - Latency: emit when measured p95 > baseline p95 * (1 + tolerance).
 * - Throughput: emit when measured throughput < baseline throughput * (1 - tolerance).
 * Latency and throughput are independent — an operation can emit both.
 *
 * @param result    the measured benchmark suite (component + operations).
 * @param baselines the static, configured baseline map (never auto-derived).
 * @param tolerance fractional tolerance; defaults to
 *                  {@link DEFAULT_REGRESSION_TOLERANCE_FRACTION} (0.2 = 20%).
 */
export function detectPerfRegressionSignals(
  result: BenchmarkSuiteResult,
  baselines: PerfBaselineMap,
  tolerance: number = DEFAULT_REGRESSION_TOLERANCE_FRACTION
): readonly ImprovementSignal[] {
  const signals: ImprovementSignal[] = [];
  for (const op of result.operations) {
    const baseline = baselines.get(baselineKey(result.component, op.operation));
    if (baseline === undefined) continue; // no configured baseline → no signal.
    if (baseline.baselineP95Ms !== undefined) {
      const sig = latencyRegressionSignal(
        result.component,
        op.operation,
        op.latency.p95,
        baseline.baselineP95Ms,
        tolerance
      );
      if (sig !== undefined) signals.push(sig);
    }
    if (baseline.baselineThroughput !== undefined) {
      const sig = throughputRegressionSignal(
        result.component,
        op.operation,
        op.throughput.opsPerSecond,
        baseline.baselineThroughput,
        tolerance
      );
      if (sig !== undefined) signals.push(sig);
    }
  }
  return signals;
}
