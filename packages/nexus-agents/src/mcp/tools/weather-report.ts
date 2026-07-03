/* eslint-disable max-lines */
/**
 * nexus-agents/mcp - Weather Report
 *
 * Computes a living performance dashboard from task outcome data
 * and calculates adaptive routing bonuses using epsilon-greedy
 * exploration/exploitation tradeoff.
 *
 * @module mcp/tools/weather-report
 * (Source: Issue #865 — Weather report with adaptive routing)
 */

import type {
  PerformanceSummary,
  GroupStats,
  TaskOutcome,
  OutcomeQuery,
} from '../../orchestration/outcomes/outcome-types.js';
import { getRandomProvider } from '../../core/index.js';
import { getOutcomeStore, type OutcomeStore } from '../../orchestration/outcomes/outcome-store.js';
import { categorizeOutcomeErrorMessage } from '../../orchestration/outcomes/outcome-types.js';
import type { TaskCategory } from '../../config/task-specialization-types.js';
import { TASK_CATEGORIES } from '../../config/task-specialization-types.js';
import { getSpecialization } from '../../config/task-specialization.js';
import type { CliNameLiteral } from '../../config/model-capabilities-types.js';
import type {
  WeatherReportOptions,
  WeatherReportResponse,
  CliWeather,
  AdaptiveBonus,
  AdapterAttemptStats,
  WeatherReportConfig,
  TierRecommendationEntry,
  LearningInsight,
  ModelWeatherEntry,
  RecommendedMapping,
  ToolPerformanceEntry,
  FailureBreakdownEntry,
  ExpertPerformanceEntry,
  SwarmHealthMetrics,
} from './weather-report-types.js';
import type { RateLimitReport, TriageStats } from './weather-report-types.js';
import { createDefaultWeatherConfig } from './weather-report-types.js';
import { generateTierRecommendations } from '../gateway/tier-recommender.js';
import { computeAdaptiveThresholds } from '../../orchestration/outcomes/adaptive-thresholds.js';
import { getRateLimitStats } from '../../adapters/rate-limit-detector.js';
import { getToolStats } from '../middleware/tool-metrics.js';
import { getHeartbeatMonitor } from '../../agents/heartbeat-monitor.js';
import type { AgentHealthSummary, CostSection } from './weather-report-types.js';
import { isPersistenceEnabled } from '../../config/learning-persistence.js';
import { aggregateDecisionCosts } from '../../observability/decision-cost-aggregate.js';
import {
  DecisionCostStore,
  type DecisionCostRecord,
} from '../../observability/decision-cost-store.js';
import { strategyCostProfiles } from '../../orchestration/strategy-manifest-registry.js';

// ============================================================================
// Public API
// ============================================================================

const CLI_NAMES = ['claude', 'gemini', 'codex', 'opencode'] as const;

/**
 * Optional injectable dependencies for {@link generateWeatherReport} (#3856).
 * The cost section reads persisted per-decision cost records; tests inject a
 * deterministic set via {@link WeatherReportDeps.decisionCostRecords} rather than
 * touching the durable {@link DecisionCostStore}.
 */
export interface WeatherReportDeps {
  /**
   * Pre-resolved decision-cost records to aggregate for the cost section. When
   * omitted, the records are read from the durable {@link DecisionCostStore} iff
   * persistence is enabled (no store is constructed when it is off).
   */
  readonly decisionCostRecords?: readonly DecisionCostRecord[];
}

/** Collect non-empty optional sections into a spread-friendly object. */
function collectOptionalSections(sections: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(sections)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    result[key] = value;
  }
  return result;
}

/**
 * Generates the weather report from current outcome data.
 */
/** Builds all optional report sections, filtering out empty ones. */
function buildOptionalSections(
  input: WeatherReportOptions,
  cfg: WeatherReportConfig
): Record<string, unknown> {
  const expertPerformance = buildExpertPerformance();
  return collectOptionalSections({
    rateLimits: buildRateLimitReport(),
    toolPerformance: buildToolPerformance(),
    failureBreakdown: buildFailureBreakdown(input),
    agentHealth: buildAgentHealth(),
    expertPerformance,
    swarmHealth: buildSwarmHealth(expertPerformance),
    triageStats: buildTriageStats(input),
    recentWindow: buildRecentWindow(cfg),
    // Per-model telemetry lens (#4194) — additive optional section; the
    // routing-visible adaptiveBonuses above stay CLI×category.
    modelWeather: getModelWeatherSummary(input, cfg),
  });
}

/**
 * Generates the weather report from current outcome data.
 */
export function generateWeatherReport(
  input: WeatherReportOptions,
  config?: Partial<WeatherReportConfig>,
  deps?: WeatherReportDeps
): WeatherReportResponse {
  const cfg = { ...createDefaultWeatherConfig(), ...config };
  const store = getOutcomeStore();
  const includeAdaptive = input.includeAdaptive ?? true;
  const summary = store.summarize(buildQuery(input.cli, input.category));
  const overallOutcomes = store.query(buildQuery(input.cli, input.category));

  const base = {
    overall: {
      totalTasks: summary.totalTasks,
      successRate: summary.successRate,
      avgDurationMs: summary.avgDurationMs,
      ...computeAdapterAttemptStats(overallOutcomes),
    },
    cliWeather: buildCliWeather(summary, input),
    adaptiveBonuses: includeAdaptive ? computeAdaptiveBonuses(cfg) : [],
    tierRecommendations: buildTierRecommendations(summary),
    ...buildOptionalSections(input, cfg),
    costSection: buildCostSection(cfg, deps),
    explorationRate: cfg.explorationRate,
    coldStartThreshold: cfg.coldStartThreshold,
    collectedAt: new Date().toISOString(),
  };

  if (includeAdaptive) {
    return {
      ...base,
      learningInsights: buildLearningInsights(),
      recommendedMappings: buildRecommendedMappings(),
    };
  }

  return base;
}

/** Builds agent health from heartbeat monitor (Issue #1032). */
function buildAgentHealth(): AgentHealthSummary | undefined {
  const monitor = getHeartbeatMonitor();
  if (monitor.activeCount === 0) return undefined;
  const health = monitor.getHealth();
  return {
    activeSessions: health.activeSessions,
    stalledSessions: health.stalledSessions,
    sessions: health.sessions.map((s) => ({
      sessionId: s.sessionId,
      expertId: s.expertId,
      health: s.health,
      elapsedMs: s.elapsedMs,
      timeSinceHeartbeatMs: s.timeSinceHeartbeatMs,
      heartbeatCount: s.heartbeatCount,
    })),
  };
}

/** Builds recent-window performance stats within the lookback period (#1401). */
function buildRecentWindow(cfg: WeatherReportConfig): WeatherReportResponse['recentWindow'] {
  if (cfg.outcomeLookbackMs <= 0) return undefined;
  const store = getOutcomeStore();
  const since = new Date(Date.now() - cfg.outcomeLookbackMs).toISOString();
  const recent = store.query({ since });
  if (recent.length === 0) return undefined;

  const successes = recent.filter((o) => o.success).length;
  const totalDuration = recent.reduce((s, o) => s + o.durationMs, 0);
  return {
    windowMs: cfg.outcomeLookbackMs,
    totalTasks: recent.length,
    successRate: round3(successes / recent.length),
    avgDurationMs: Math.round(totalDuration / recent.length),
  };
}

/**
 * Builds the cost section (Epic G, #3856): MEASURED per-gate decision-cost
 * aggregates over the lookback window + each strategy's declared cost profile.
 *
 * The strategy cost profiles always come from the manifest registry (pure). The
 * decision-cost records come from `deps.decisionCostRecords` when injected
 * (tests), else from the durable {@link DecisionCostStore} — but ONLY when
 * persistence is enabled, so a persistence-off context (or a test that mocks it
 * off) never constructs the store and the section degrades to an empty
 * `decisionCosts` rather than throwing.
 */
function buildCostSection(cfg: WeatherReportConfig, deps?: WeatherReportDeps): CostSection {
  const windowMs = cfg.outcomeLookbackMs;
  const records = resolveDecisionCostRecords(windowMs, deps);
  return {
    decisionCosts: aggregateDecisionCosts(records, windowMs),
    strategyCostProfiles: strategyCostProfiles(),
  };
}

/**
 * Resolves the decision-cost records to aggregate: the injected set when
 * present, else the durable store windowed to the lookback (all history when
 * `windowMs <= 0`). Returns `[]` when persistence is off so no store is built.
 */
function resolveDecisionCostRecords(
  windowMs: number,
  deps?: WeatherReportDeps
): readonly DecisionCostRecord[] {
  if (deps?.decisionCostRecords !== undefined) return deps.decisionCostRecords;
  // Only construct the store when persistence is on — its constructor touches the
  // learning dir, which a persistence-off (or test-mocked) context lacks.
  if (!isPersistenceEnabled()) return [];
  const store = new DecisionCostStore();
  if (windowMs <= 0) return store.all();
  const since = new Date(Date.now() - windowMs).toISOString();
  return store.query({ since });
}

/** Builds rate limit report from tracked events (Issue #996). */
function buildRateLimitReport(): readonly RateLimitReport[] {
  return getRateLimitStats().map((s) => ({
    provider: s.provider,
    totalHits: s.totalHits,
    lastHitAt: s.lastHitAt,
    avgRetryAfterMs: s.avgRetryAfterMs,
  }));
}

/**
 * Queries outcomes with a lookback window, falling back to all history
 * if the window has fewer samples than coldStartThreshold. (#1401)
 */
export function queryWithLookback(
  store: OutcomeStore,
  cli: CliNameLiteral,
  category: TaskCategory,
  cfg: WeatherReportConfig
): readonly TaskOutcome[] {
  // Exclude e2e-eval outcomes — they measure the eval harness, not CLI reliability (#1680)
  const exclude = ['e2e-eval'];
  if (cfg.outcomeLookbackMs > 0) {
    const since = new Date(Date.now() - cfg.outcomeLookbackMs).toISOString();
    const recent = store.query({ cli, category, since, excludeQualitySignals: exclude });
    if (recent.length >= cfg.coldStartThreshold) return recent;
  }
  // Fall back to all history if lookback window has insufficient data
  return store.query({ cli, category, excludeQualitySignals: exclude });
}

// ============================================================================
// Per-Model Lens (#4194)
// ============================================================================

/**
 * Minimum samples before a model appears in the per-model lens — same
 * cold-start hygiene as the CLI-lens consumer (weather-bonus-stage
 * MIN_SAMPLE_COUNT) and the #2548 family-fallback threshold.
 */
export const MODEL_WEATHER_MIN_SAMPLES = 5;

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

/**
 * Calculates adaptive specialization bonus for a given CLI+category.
 * Returns the adjustment on top of the static bonus.
 *
 * - Below cold-start threshold: returns 0 (no adjustment)
 * - Above threshold: scales bonus by observed success rate vs baseline
 * - Clamped to [-maxBonusAdjustment, +maxBonusAdjustment]
 */
export function getAdaptiveBonus(
  cli: string,
  category: TaskCategory,
  config?: Partial<WeatherReportConfig>
): number {
  const cfg = { ...createDefaultWeatherConfig(), ...config };
  const store = getOutcomeStore();
  const cliName = cli as CliNameLiteral;

  // Use lookback window for recent-weighted adaptive bonuses (#1401)
  const outcomes = queryWithLookback(store, cliName, category, cfg);
  if (outcomes.length < cfg.coldStartThreshold) return 0;

  const successRate = outcomes.filter((o) => o.success).length / outcomes.length;
  // Compare against fixed baseline (0.7), not adaptive baseline (#1483).
  // The adaptive baseline self-adjusts to match observed rate, zeroing delta.
  const FIXED_BASELINE = 0.7;
  const delta = successRate - FIXED_BASELINE;

  // Compute confidence from windowed outcomes (not all-time) to prevent
  // stale historical data from inflating bonus magnitude (#1676).
  const FULL_CONFIDENCE_SAMPLES = 50;
  const windowedConfidence = Math.min(1, outcomes.length / FULL_CONFIDENCE_SAMPLES);
  const maxBonus = Math.min(cfg.maxBonusAdjustment * windowedConfidence, cfg.maxBonusAdjustment);

  // Scale: +30% above baseline → +maxBonus; config caps adaptive value
  const scaled = (delta / 0.3) * maxBonus;
  return clamp(scaled, -maxBonus, maxBonus);
}

/**
 * Determines if exploration should override normal routing.
 * Uses epsilon-greedy: returns true with probability = explorationRate.
 */
export function shouldExplore(config?: Partial<WeatherReportConfig>): boolean {
  const cfg = { ...createDefaultWeatherConfig(), ...config };
  // #2961: use the random-provider so seeded tests can reproduce
  // exploration decisions. Math.random() makes replay non-deterministic.
  return getRandomProvider().random() < cfg.explorationRate;
}

// ============================================================================
// Internal Helpers
// ============================================================================

function buildQuery(
  cli?: string,
  category?: string
): { cli?: CliNameLiteral; category?: TaskCategory } {
  const query: { cli?: CliNameLiteral; category?: TaskCategory } = {};
  if (cli !== undefined) query.cli = cli as CliNameLiteral;
  if (category !== undefined) query.category = category as TaskCategory;
  return query;
}

/**
 * Computes adapter attempt stats from a set of outcomes, separating infrastructure
 * failures (adapter_unavailable) from model-quality failures. Returns an empty
 * stats object (zeros) when the input is empty. (#1982)
 */
function computeAdapterAttemptStats(outcomes: readonly TaskOutcome[]): AdapterAttemptStats {
  if (outcomes.length === 0) {
    return { adapterAttemptSuccessRate: 0, adapterUnavailableCount: 0, adapterUnavailableRate: 0 };
  }
  const adapterUnavailable = outcomes.filter((o) => {
    if (o.success) return false;
    const cat =
      o.failureCategory ??
      (typeof o.errorMessage === 'string' && o.errorMessage.length > 0
        ? categorizeOutcomeErrorMessage(o.errorMessage)
        : undefined);
    return cat === 'adapter_unavailable';
  }).length;
  const attempted = outcomes.length - adapterUnavailable;
  const successes = outcomes.filter((o) => o.success).length;
  const attemptSuccessRate = attempted > 0 ? successes / attempted : 0;
  return {
    adapterAttemptSuccessRate: round3(attemptSuccessRate),
    adapterUnavailableCount: adapterUnavailable,
    adapterUnavailableRate: round3(adapterUnavailable / outcomes.length),
  };
}

function buildCliWeather(
  summary: PerformanceSummary,
  input: WeatherReportOptions
): readonly CliWeather[] {
  const clis = input.cli !== undefined ? [input.cli] : [...CLI_NAMES];

  return clis.map((cli) => {
    const stats = summary.byCli.get(cli);
    const store = getOutcomeStore();
    const cliOutcomes = store.query({ cli: cli });

    // Build per-category breakdown for this CLI
    const byCategory = new Map<string, GroupStats>();
    for (const cat of TASK_CATEGORIES) {
      const catOutcomes = cliOutcomes.filter((o) => o.category === cat);
      if (catOutcomes.length > 0) {
        const sc = catOutcomes.filter((o) => o.success).length;
        const td = catOutcomes.reduce((s, o) => s + o.durationMs, 0);
        byCategory.set(cat, {
          count: catOutcomes.length,
          successRate: sc / catOutcomes.length,
          avgDurationMs: td / catOutcomes.length,
        });
      }
    }

    return {
      cli,
      totalTasks: stats?.count ?? 0,
      successRate: stats?.successRate ?? 0,
      avgDurationMs: stats?.avgDurationMs ?? 0,
      byCategory,
      ...computeAdapterAttemptStats(cliOutcomes),
    };
  });
}

function computeAdaptiveBonuses(cfg: WeatherReportConfig): readonly AdaptiveBonus[] {
  const bonuses: AdaptiveBonus[] = [];

  for (const cli of CLI_NAMES) {
    for (const category of TASK_CATEGORIES) {
      const spec = getSpecialization(category);
      const staticBonus = getStaticBonusForCli(cli, spec);
      const store = getOutcomeStore();
      const outcomes = queryWithLookback(store, cli, category, cfg);
      const sampleCount = outcomes.length;
      const sufficient = sampleCount >= cfg.coldStartThreshold;
      const adaptiveAdj = sufficient ? getAdaptiveBonus(cli, category, cfg) : 0;

      // Only include entries with actual data or non-zero bonuses
      if (sampleCount > 0 || staticBonus > 0 || adaptiveAdj !== 0) {
        bonuses.push({
          cli,
          category,
          staticBonus,
          adaptiveBonus: Math.round(adaptiveAdj * 10) / 10,
          sampleCount,
          sufficient,
        });
      }
    }
  }

  return bonuses;
}

/** Gets the static specialization bonus for a CLI in a given spec. */
function getStaticBonusForCli(
  cli: string,
  spec: { primaryCli: string; secondaryCli: string; bonus: number }
): number {
  if (cli === spec.primaryCli) return spec.bonus;
  if (cli === spec.secondaryCli) return Math.floor(spec.bonus / 2);
  return 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Builds learning insights from adaptive thresholds (#901). */
function buildLearningInsights(): readonly LearningInsight[] {
  const store = getOutcomeStore();
  const insights: LearningInsight[] = [];

  for (const cli of CLI_NAMES) {
    for (const category of TASK_CATEGORIES) {
      const thresholds = computeAdaptiveThresholds(store, cli, category);
      if (thresholds.sampleCount > 0) {
        insights.push({
          cli,
          category,
          trend: thresholds.trend,
          confidence: thresholds.confidence,
          adjustedBaseline: thresholds.baseline,
          sampleCount: thresholds.sampleCount,
        });
      }
    }
  }

  return insights;
}

/** Builds recommended CLI mappings per category for LinUCB cold-start (#952). */
function buildRecommendedMappings(): readonly RecommendedMapping[] {
  const store = getOutcomeStore();
  const mappings: RecommendedMapping[] = [];

  for (const category of TASK_CATEGORIES) {
    let bestCli = '';
    let bestRate = -1;
    let bestCount = 0;

    for (const cli of CLI_NAMES) {
      const outcomes = store.query({ cli, category });
      if (outcomes.length === 0) continue;
      const rate = outcomes.filter((o) => o.success).length / outcomes.length;
      if (rate > bestRate || (rate === bestRate && outcomes.length > bestCount)) {
        bestCli = cli;
        bestRate = rate;
        bestCount = outcomes.length;
      }
    }

    if (bestCli !== '') {
      const confidence = bestCount >= 20 ? 'high' : bestCount >= 10 ? 'medium' : 'low';
      mappings.push({
        category,
        recommendedCli: bestCli,
        successRate: bestRate,
        sampleCount: bestCount,
        confidence: confidence,
      });
    }
  }

  return mappings;
}

/** Minimum observations per category to count toward routing accuracy (#1442). */
const ROUTING_MIN_SAMPLES = 5;

/** Confidence threshold for adaptation speed measurement. */
const ADAPTATION_CONFIDENCE_THRESHOLD = 0.7;

/** Per-category routing analysis result. */
interface CategoryRoutingStats {
  readonly accurateCount: number;
  readonly totalRouted: number;
  readonly regret: number;
}

/** Tolerance band for routing accuracy — CLIs within this % of best are "good" (#1442, #1488).
 * Widened from 10% to 25%: a CLI achieving ≥75% of the best rate is acceptable routing. */
const ROUTING_ACCURACY_TOLERANCE = 0.25;

/** Analyzes routing accuracy and regret for a single category. */
function analyzeCategoryRouting(
  catOutcomes: ReadonlyArray<{ cli: string; success: boolean }>
): CategoryRoutingStats | null {
  let bestRate = 0;
  const cliRates = new Map<string, number>();
  for (const cli of CLI_NAMES) {
    const cliCat = catOutcomes.filter((o) => o.cli === cli);
    if (cliCat.length === 0) continue;
    const rate = cliCat.filter((o) => o.success).length / cliCat.length;
    cliRates.set(cli, rate);
    if (rate > bestRate) bestRate = rate;
  }
  if (cliRates.size === 0) return null;

  // Count tasks routed to any "good" CLI (within tolerance band of best)
  const threshold = bestRate * (1 - ROUTING_ACCURACY_TOLERANCE);
  const goodClis = new Set<string>();
  for (const [cli, rate] of cliRates) {
    if (rate >= threshold) goodClis.add(cli);
  }

  const routed = catOutcomes.filter((o) => goodClis.has(o.cli)).length;
  const actualRate = catOutcomes.filter((o) => o.success).length / catOutcomes.length;
  return { accurateCount: routed, totalRouted: catOutcomes.length, regret: bestRate - actualRate };
}

/** Computes avg samples for the best CLI per category to reach high confidence. */
function computeAdaptationSpeed(): number {
  const store = getOutcomeStore();
  let speedSum = 0;
  let speedCount = 0;
  for (const category of TASK_CATEGORIES) {
    // Find the best CLI for this category (fewest samples to reach confidence)
    let bestSamples = Infinity;
    let found = false;
    for (const cli of CLI_NAMES) {
      const thresholds = computeAdaptiveThresholds(store, cli, category);
      if (thresholds.confidence >= ADAPTATION_CONFIDENCE_THRESHOLD && thresholds.sampleCount > 0) {
        if (thresholds.sampleCount < bestSamples) {
          bestSamples = thresholds.sampleCount;
          found = true;
        }
      }
    }
    if (found) {
      speedSum += bestSamples;
      speedCount++;
    }
  }
  return speedCount > 0 ? speedSum / speedCount : 0;
}

/** Builds swarm health metrics from outcome + expert data (Issue #1403). */
function buildSwarmHealth(
  expertPerf: readonly ExpertPerformanceEntry[]
): SwarmHealthMetrics | undefined {
  const allOutcomes = getOutcomeStore().query();
  if (allOutcomes.length === 0) return undefined;

  const activeRoles = expertPerf.filter((e) => e.successRate > 0).length;
  const agentUtilization = expertPerf.length > 0 ? activeRoles / expertPerf.length : 0;

  const delegateOutcomes = allOutcomes.filter((o) => o.source === 'delegate');
  const delegateSuccesses = delegateOutcomes.filter((o) => o.success).length;
  const collaborationEfficiency =
    delegateOutcomes.length > 0 ? delegateSuccesses / delegateOutcomes.length : 0;

  let accurateCount = 0;
  let totalRouted = 0;
  let regretSum = 0;
  let observedCategories = 0;

  for (const category of TASK_CATEGORIES) {
    const catOutcomes = allOutcomes.filter((o) => o.category === category);
    if (catOutcomes.length < ROUTING_MIN_SAMPLES) continue;
    observedCategories++;
    const stats = analyzeCategoryRouting(catOutcomes);
    if (stats === null) continue;
    accurateCount += stats.accurateCount;
    totalRouted += stats.totalRouted;
    regretSum += stats.regret;
  }

  const regretCategories = totalRouted > 0 ? observedCategories : 0;
  return {
    agentUtilization: round3(agentUtilization),
    collaborationEfficiency: round3(collaborationEfficiency),
    routingAccuracy: round3(totalRouted > 0 ? accurateCount / totalRouted : 0),
    weeklyRegret: round3(regretCategories > 0 ? regretSum / regretCategories : 0),
    adaptationSpeed: Math.round(computeAdaptationSpeed()),
    observedCategories,
    observedRoles: expertPerf.length,
  };
}

/** Round to 3 decimal places. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Worker model prefix used by recordWorkerOutcomes (Issue #1323). */
const WORKER_MODEL_PREFIX = 'worker-';

/** Finds the most common failure category among failed outcomes. */
function findDominantError(
  failed: ReadonlyArray<{ failureCategory?: string | undefined }>
): string | undefined {
  if (failed.length === 0) return undefined;
  const counts = new Map<string, number>();
  for (const f of failed) {
    const cat = f.failureCategory ?? 'execution';
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }
  let maxCount = 0;
  let dominant: string | undefined;
  for (const [cat, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      dominant = cat;
    }
  }
  return dominant;
}

/** Count consecutive failures from the tail of an outcome list (Issue #1427). */
function countTrailingFailures(outcomes: ReadonlyArray<{ success: boolean }>): number {
  let count = 0;
  for (let i = outcomes.length - 1; i >= 0; i--) {
    if (outcomes[i]?.success === false) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

/** Builds per-expert-role performance from worker dispatch outcomes (Issue #1324, #1427). */
function buildExpertPerformance(): readonly ExpertPerformanceEntry[] {
  const store = getOutcomeStore();
  const allOutcomes = store.query();
  const workerOutcomes = allOutcomes.filter((o) => o.model.startsWith(WORKER_MODEL_PREFIX));
  if (workerOutcomes.length === 0) return [];

  const byRole = new Map<string, typeof workerOutcomes>();
  for (const o of workerOutcomes) {
    const role = o.model.slice(WORKER_MODEL_PREFIX.length);
    const existing = byRole.get(role) ?? [];
    existing.push(o);
    byRole.set(role, existing);
  }

  const entries: ExpertPerformanceEntry[] = [];
  for (const [role, outcomes] of byRole) {
    const successes = outcomes.filter((o) => o.success).length;
    const totalDuration = outcomes.reduce((s, o) => s + o.durationMs, 0);
    const dominantErrorPattern = findDominantError(outcomes.filter((o) => !o.success));
    const successRate = successes / outcomes.length;

    // Count consecutive failures from the tail of history (Issue #1427)
    const consecutiveFailures = countTrailingFailures(outcomes);

    // Find last success timestamp
    const lastSuccess = [...outcomes].reverse().find((o) => o.success);
    const lastSuccessAt =
      lastSuccess !== undefined ? new Date(lastSuccess.timestamp).toISOString() : undefined;

    entries.push({
      role,
      totalTasks: outcomes.length,
      successRate,
      avgDurationMs: Math.round(totalDuration / outcomes.length),
      consecutiveFailures,
      degraded: successRate < 0.5,
      ...(dominantErrorPattern !== undefined ? { dominantErrorPattern } : {}),
      ...(lastSuccessAt !== undefined ? { lastSuccessAt } : {}),
    });
  }

  // Sort by reliability (worst first) per Issue #1427
  return entries.sort((a, b) => a.successRate - b.successRate);
}

/** Builds failure breakdown from failed outcomes (Issue #1025). */
function buildFailureBreakdown(input: WeatherReportOptions): readonly FailureBreakdownEntry[] {
  const store = getOutcomeStore();
  const outcomes = store.query(buildQuery(input.cli, input.category));
  const failed = outcomes.filter((o) => !o.success);
  if (failed.length === 0) return [];

  const counts = new Map<string, number>();
  for (const o of failed) {
    // Retroactive reclassification for pre-#1441 entries missing failureCategory
    const cat =
      o.failureCategory ??
      (typeof o.errorMessage === 'string' && o.errorMessage.length > 0
        ? categorizeOutcomeErrorMessage(o.errorMessage)
        : 'execution');
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }

  const entries: FailureBreakdownEntry[] = [];
  for (const [category, count] of counts) {
    entries.push({
      category,
      count,
      percentage: Math.round((count / failed.length) * 1000) / 10,
    });
  }
  return entries.sort((a, b) => b.count - a.count);
}

/** Builds triage statistics from outcome data (#1506). */
function buildTriageStats(input: WeatherReportOptions): TriageStats | undefined {
  const store = getOutcomeStore();
  const outcomes = store.query(buildQuery(input.cli, input.category));

  const retriedOutcomes = outcomes.filter(
    (o) => (o as Record<string, unknown>)['wasRetried'] === true
  );
  if (retriedOutcomes.length === 0) return undefined;

  const retrySuccesses = retriedOutcomes.filter((o) => o.success).length;
  const actionCounts = new Map<string, number>();
  for (const o of outcomes) {
    const action = (o as Record<string, unknown>)['triageAction'];
    if (typeof action === 'string') {
      actionCounts.set(action, (actionCounts.get(action) ?? 0) + 1);
    }
  }

  return {
    totalRetried: retriedOutcomes.length,
    retrySuccessRate: Math.round((retrySuccesses / retriedOutcomes.length) * 1000) / 1000,
    actionBreakdown: Array.from(actionCounts.entries())
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/** Builds per-tool performance stats from recorded metrics (#1022). */
function buildToolPerformance(): readonly ToolPerformanceEntry[] {
  return getToolStats().map((s) => ({
    toolName: s.toolName,
    totalCalls: s.totalCalls,
    successRate: Math.round(s.successRate * 1000) / 1000,
    avgDurationMs: Math.round(s.avgDurationMs),
    errorCount: s.errorCount,
  }));
}

/** Generates tier recommendations from outcome summary (#895). */
function buildTierRecommendations(summary: PerformanceSummary): readonly TierRecommendationEntry[] {
  return generateTierRecommendations(summary).map((r) => ({
    category: r.category,
    direction: r.direction,
    currentTier: r.currentTier,
    recommendedTier: r.recommendedTier,
    successRate: r.successRate,
    sampleCount: r.sampleCount,
    reason: r.reason,
  }));
}
