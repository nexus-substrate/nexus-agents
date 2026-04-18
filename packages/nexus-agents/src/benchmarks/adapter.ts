/**
 * BenchmarkAdapter — public contract for benchmark integrations.
 *
 * Standalone benchmark repos (nexus-eval-swebench, nexus-eval-safety, etc.)
 * implement this interface. nexus-agents core exposes it so any benchmark
 * runner can plug into the same CLI / reporting / CI surface.
 *
 * (Source: Issue #1960 — extract benchmark suites into standalone repos)
 *
 * @module benchmarks/adapter
 */

/**
 * High-level summary of a benchmark run, CLI-printable and JSON-serializable.
 * Benchmarks that need extra dimensions attach them via `metadata`.
 */
export interface BenchmarkRunSummary {
  /** Benchmark name (e.g., 'swe-bench'). */
  readonly name: string;
  /** Variant, if applicable (e.g., 'lite', 'verified'). */
  readonly variant: string | undefined;
  /** Total instances attempted. */
  readonly total: number;
  /** Instances whose evaluation reported pass. */
  readonly passed: number;
  /** passed / total, in [0, 1]. */
  readonly passRate: number;
  /** Wall-clock runtime in milliseconds. */
  readonly runTimeMs: number;
  /** Benchmark-specific extras (dataset hash, model IDs, etc.). */
  readonly metadata: Record<string, unknown>;
}

/**
 * Execution context handed to a runner.
 *
 * Keep this interface narrow — benchmarks that need more (e.g. access to
 * specific adapters) should take those as constructor args, not widen this.
 */
export interface BenchmarkRunContext {
  /** Per-instance timeout budget in milliseconds. */
  readonly timeoutMs: number;
  /** Emit progress updates for long-running benchmarks. */
  readonly onProgress?: (completed: number, total: number, label?: string) => void;
  /** Optional abort signal for cancellation. */
  readonly signal?: AbortSignal;
}

/**
 * Contract every benchmark implementation fulfills.
 *
 * Type parameters:
 * - `TInstance`: one task / problem in the benchmark (e.g., a SWE-bench issue)
 * - `TPrediction`: the solver's output (e.g., a proposed patch)
 * - `TEvalResult`: the evaluator's verdict (e.g., patch applied + tests passed)
 *
 * A correct implementation composes as:
 *   `loadInstances -> runInstance(each) -> evaluate(each) -> summarize`
 *
 * @example
 * ```ts
 * class SweBenchAdapter implements BenchmarkAdapter<SweIssue, SwePatch, SweEval> {
 *   readonly name = 'swe-bench';
 *   readonly variant = 'lite';
 *   async loadInstances(config) { ... }
 *   async runInstance(inst, ctx) { ... }
 *   async evaluate(inst, pred) { ... }
 *   summarize(results) { ... }
 * }
 * ```
 */
export interface BenchmarkAdapter<TInstance, TPrediction, TEvalResult> {
  /** Stable identifier (e.g., 'swe-bench', 'humaneval'). Used in CLI routing and reporting. */
  readonly name: string;
  /** Optional variant within a benchmark family (e.g., 'lite' vs 'verified'). */
  readonly variant?: string;

  /** Load the benchmark task set from disk/remote. Runs once per invocation. */
  loadInstances(config: Record<string, unknown>): Promise<readonly TInstance[]>;

  /** Execute the solver on one instance. No evaluation here — just generate the prediction. */
  runInstance(instance: TInstance, ctx: BenchmarkRunContext): Promise<TPrediction>;

  /** Evaluate a prediction against ground truth. Returns a benchmark-specific verdict. */
  evaluate(instance: TInstance, prediction: TPrediction): Promise<TEvalResult>;

  /** Determine whether a verdict counts as pass. Keeps pass/fail semantics localized. */
  isPass(result: TEvalResult): boolean;

  /** Aggregate instance results into a summary. Should be pure + deterministic. */
  summarize(results: readonly TEvalResult[], runTimeMs: number): BenchmarkRunSummary;
}

/** Default no-op progress handler. */
export const NOOP_PROGRESS: BenchmarkRunContext['onProgress'] = () => {
  // intentionally empty
};
