/**
 * Per-model weather lens (#4194) — the model-keyed sibling of the
 * CLI×category adaptive-bonus lens in `weather-report.ts`.
 *
 * Computed from the same OutcomeStore records via
 * `queryByModelWithFamilyFallback` (#2548): cold-start models borrow
 * family-sibling priors, models with fewer than
 * {@link MODEL_WEATHER_MIN_SAMPLES} samples are excluded, and the lookback
 * window falls back to all history when sparse. Telemetry only — routing
 * bonuses stay CLI×category; only the MCP tool opts in (#4202).
 *
 * Moved out of `weather-report.ts` as a pure extraction (#6148,
 * weather-report row): the only in-tree consumer is the report's optional
 * `modelWeather` section. The two helpers the section shared with the
 * parent (`round3`, `WORKER_MODEL_PREFIX`) now live in
 * `weather-report-types.ts`, so this module does not import the parent and
 * the split introduces no import cycle.
 *
 * @module mcp/tools/weather-report-model-lens
 * (Source: Issue #4194 — per-model telemetry lens; #6148 — split)
 */

import type { OutcomeQuery, TaskOutcome } from '../../orchestration/outcomes/outcome-types.js';
import { getOutcomeStore, type OutcomeStore } from '../../orchestration/outcomes/outcome-store.js';
import type { TaskCategory } from '../../config/task-specialization-types.js';
import type { CliNameLiteral } from '../../config/model-capabilities-types.js';
import type { ModelWeatherEntry, WeatherReportConfig } from './weather-report-types.js';
import { createDefaultWeatherConfig, round3, WORKER_MODEL_PREFIX } from './weather-report-types.js';

/**
 * Minimum samples before a model appears in the per-model lens — same
 * cold-start hygiene as the CLI-lens consumer (weather-bonus-stage
 * MIN_SAMPLE_COUNT) and the #2548 family-fallback threshold.
 */
const MODEL_WEATHER_MIN_SAMPLES = 5;

/** Placeholder outcome `model` values that are not real model ids (#4194). */
const NON_MODEL_PLACEHOLDER_IDS: ReadonlySet<string> = new Set(['unknown', 'pipeline']);

/** True when an outcome's model field names a real model (#4194). */
function isRealModelId(model: string): boolean {
  return !NON_MODEL_PLACEHOLDER_IDS.has(model) && !model.startsWith(WORKER_MODEL_PREFIX);
}

/** Filter options for the per-model lens (subset of report input). */
interface ModelLensOptions {
  readonly cli?: CliNameLiteral;
  readonly category?: string;
}

/** Base filter for per-model lens queries — same e2e-eval exclusion as queryWithLookback (#1680). */
function buildModelLensFilter(options?: ModelLensOptions): Omit<OutcomeQuery, 'limit'> {
  return {
    ...(options?.cli !== undefined && { cli: options.cli }),
    ...(options?.category !== undefined && { category: options.category as TaskCategory }),
    excludeQualitySignals: ['e2e-eval'],
  };
}

/**
 * Per-model performance summary (#4194) — the model-keyed sibling of the
 * CLI×category adaptive-bonus lens, computed from the same OutcomeStore
 * records via `queryByModelWithFamilyFallback` (#2548): cold-start models
 * borrow family-sibling priors, models with fewer than
 * {@link MODEL_WEATHER_MIN_SAMPLES} samples are excluded, and the lookback
 * window falls back to all history when sparse (same rule as
 * `queryWithLookback`). Telemetry only — routing bonuses stay CLI×category;
 * per-model bonus consumption is #4196/#4197 scope.
 */
export function getModelWeatherSummary(
  options?: ModelLensOptions,
  config?: Partial<WeatherReportConfig>
): readonly ModelWeatherEntry[] {
  const cfg = { ...createDefaultWeatherConfig(), ...config };
  const store = getOutcomeStore();
  const filter = buildModelLensFilter(options);
  const entries: ModelWeatherEntry[] = [];
  for (const model of collectObservedModelIds(store, filter)) {
    const entry = buildModelWeatherEntry(store, model, filter, cfg);
    if (entry !== undefined) entries.push(entry);
  }
  return entries.sort((a, b) => b.sampleCount - a.sampleCount || a.model.localeCompare(b.model));
}

/** Distinct real model ids observed in outcomes matching the filter. */
function collectObservedModelIds(
  store: OutcomeStore,
  filter: Omit<OutcomeQuery, 'limit'>
): readonly string[] {
  const ids = new Set<string>();
  for (const o of store.query(filter)) {
    if (isRealModelId(o.model)) ids.add(o.model);
  }
  return [...ids];
}

type ModelFallbackResult = ReturnType<OutcomeStore['queryByModelWithFamilyFallback']>;

/**
 * Query a model's outcomes with the lookback window, falling back to all
 * history when the window is sparse — same rule as `queryWithLookback` (#1401).
 */
function queryModelWithLookback(
  store: OutcomeStore,
  model: string,
  filter: Omit<OutcomeQuery, 'limit'>,
  cfg: WeatherReportConfig
): ModelFallbackResult {
  if (cfg.outcomeLookbackMs > 0) {
    const since = new Date(Date.now() - cfg.outcomeLookbackMs).toISOString();
    const windowed = store.queryByModelWithFamilyFallback(model, {
      threshold: MODEL_WEATHER_MIN_SAMPLES,
      extraFilter: { ...filter, since },
    });
    if (windowed.outcomes.length >= MODEL_WEATHER_MIN_SAMPLES) return windowed;
  }
  return store.queryByModelWithFamilyFallback(model, {
    threshold: MODEL_WEATHER_MIN_SAMPLES,
    extraFilter: filter,
  });
}

/**
 * Family fallback is only meaningful when the registry recognized the model:
 * unrecognized ids all resolve to vendor/family 'unknown', so the family
 * bucket would pool unrelated models into one cohort. Restrict those to
 * literal-id samples.
 */
function restrictFallbackScope(
  model: string,
  result: ModelFallbackResult
): { readonly outcomes: readonly TaskOutcome[]; readonly scope: 'literal' | 'family' } {
  if (result.scope !== 'family') return { outcomes: result.outcomes, scope: 'literal' };
  if (result.vendor !== 'unknown' && result.family !== 'unknown') {
    return { outcomes: result.outcomes, scope: 'family' };
  }
  // Family bucket is a superset of the literal bucket — filter back down.
  return { outcomes: result.outcomes.filter((o) => o.model === model), scope: 'literal' };
}

/** Build one per-model lens entry; undefined when below the min-sample threshold. */
function buildModelWeatherEntry(
  store: OutcomeStore,
  model: string,
  filter: Omit<OutcomeQuery, 'limit'>,
  cfg: WeatherReportConfig
): ModelWeatherEntry | undefined {
  const result = queryModelWithLookback(store, model, filter, cfg);
  const { outcomes, scope } = restrictFallbackScope(model, result);
  if (outcomes.length < MODEL_WEATHER_MIN_SAMPLES) return undefined;
  const successes = outcomes.filter((o) => o.success).length;
  const totalDuration = outcomes.reduce((s, o) => s + o.durationMs, 0);
  return {
    model,
    vendor: result.vendor ?? 'unknown',
    family: result.family ?? 'unknown',
    scope,
    sampleCount: outcomes.length,
    successRate: round3(successes / outcomes.length),
    avgDurationMs: Math.round(totalDuration / outcomes.length),
  };
}
