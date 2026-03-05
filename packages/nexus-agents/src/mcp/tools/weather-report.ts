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

import type { PerformanceSummary, GroupStats } from '../../orchestration/outcomes/outcome-types.js';
import {
  getOutcomeStore,
  categorizeOutcomeErrorMessage,
} from '../../orchestration/outcomes/index.js';
import type { TaskCategory } from '../../config/task-specialization-types.js';
import { TASK_CATEGORIES } from '../../config/task-specialization-types.js';
import { getSpecialization } from '../../config/task-specialization.js';
import type { CliNameLiteral } from '../../config/model-capabilities-types.js';
import type {
  WeatherReportOptions,
  WeatherReportResponse,
  CliWeather,
  AdaptiveBonus,
  WeatherReportConfig,
  TierRecommendationEntry,
  LearningInsight,
  RecommendedMapping,
  ToolPerformanceEntry,
  FailureBreakdownEntry,
  ExpertPerformanceEntry,
  SwarmHealthMetrics,
} from './weather-report-types.js';
import type { RateLimitReport } from './weather-report-types.js';
import { createDefaultWeatherConfig } from './weather-report-types.js';
import { generateTierRecommendations } from '../gateway/tier-recommender.js';
import { computeAdaptiveThresholds } from '../../orchestration/outcomes/adaptive-thresholds.js';
import { getRateLimitStats } from '../../adapters/rate-limit-detector.js';
import { getToolStats } from '../middleware/tool-metrics.js';
import { getHeartbeatMonitor } from '../../agents/heartbeat-monitor.js';
import type { AgentHealthSummary } from './weather-report-types.js';

// ============================================================================
// Public API
// ============================================================================

const CLI_NAMES = ['claude', 'gemini', 'codex', 'opencode'] as const;

/**
 * Generates the weather report from current outcome data.
 */
export function generateWeatherReport(
  input: WeatherReportOptions,
  config?: Partial<WeatherReportConfig>
): WeatherReportResponse {
  const cfg = { ...createDefaultWeatherConfig(), ...config };
  const store = getOutcomeStore();
  const includeAdaptive = input.includeAdaptive ?? true;

  const summary = store.summarize(buildQuery(input.cli, input.category));

  const cliWeather = buildCliWeather(summary, input);
  const adaptiveBonuses = includeAdaptive ? computeAdaptiveBonuses(cfg) : [];
  const tierRecommendations = buildTierRecommendations(summary);
  const rateLimits = buildRateLimitReport();
  const toolPerformance = buildToolPerformance();
  const failureBreakdown = buildFailureBreakdown(input);
  const agentHealth = buildAgentHealth();
  const expertPerformance = buildExpertPerformance();
  const swarmHealth = buildSwarmHealth(expertPerformance);
  const base = {
    overall: {
      totalTasks: summary.totalTasks,
      successRate: summary.successRate,
      avgDurationMs: summary.avgDurationMs,
    },
    cliWeather,
    adaptiveBonuses,
    tierRecommendations,
    ...(rateLimits.length > 0 ? { rateLimits } : {}),
    ...(toolPerformance.length > 0 ? { toolPerformance } : {}),
    ...(failureBreakdown.length > 0 ? { failureBreakdown } : {}),
    ...(agentHealth !== undefined ? { agentHealth } : {}),
    ...(expertPerformance.length > 0 ? { expertPerformance } : {}),
    ...(swarmHealth !== undefined ? { swarmHealth } : {}),
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

  const outcomes = store.query({ cli: cliName, category });
  if (outcomes.length < cfg.coldStartThreshold) return 0;

  const thresholds = computeAdaptiveThresholds(store, cliName, category);
  const successRate = outcomes.filter((o) => o.success).length / outcomes.length;
  const delta = successRate - thresholds.baseline;

  // Scale: +30% above baseline → +maxBonus (adaptive, not hardcoded)
  const maxBonus = thresholds.maxBonus > 0 ? thresholds.maxBonus : cfg.maxBonusAdjustment;
  const scaled = (delta / 0.3) * maxBonus;
  return clamp(scaled, -maxBonus, maxBonus);
}

/**
 * Determines if exploration should override normal routing.
 * Uses epsilon-greedy: returns true with probability = explorationRate.
 */
export function shouldExplore(config?: Partial<WeatherReportConfig>): boolean {
  const cfg = { ...createDefaultWeatherConfig(), ...config };
  return Math.random() < cfg.explorationRate;
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
      const outcomes = store.query({ cli, category });
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

/** Minimum observations per category to count toward routing accuracy. */
const ROUTING_MIN_SAMPLES = 3;

/** Confidence threshold for adaptation speed measurement. */
const ADAPTATION_CONFIDENCE_THRESHOLD = 0.7;

/** Per-category routing analysis result. */
interface CategoryRoutingStats {
  readonly accurateCount: number;
  readonly totalRouted: number;
  readonly regret: number;
}

/** Tolerance band for routing accuracy — CLIs within this % of best are "good". */
const ROUTING_ACCURACY_TOLERANCE = 0.05;

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
    const cat = f.failureCategory ?? 'unknown';
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

/** Builds per-expert-role performance from worker dispatch outcomes (Issue #1324). */
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

    entries.push({
      role,
      totalTasks: outcomes.length,
      successRate: successes / outcomes.length,
      avgDurationMs: Math.round(totalDuration / outcomes.length),
      ...(dominantErrorPattern !== undefined ? { dominantErrorPattern } : {}),
    });
  }

  return entries.sort((a, b) => b.totalTasks - a.totalTasks);
}

/** Builds failure breakdown from failed outcomes (Issue #1025). */
function buildFailureBreakdown(input: WeatherReportOptions): readonly FailureBreakdownEntry[] {
  const store = getOutcomeStore();
  const outcomes = store.query(buildQuery(input.cli, input.category));
  const failed = outcomes.filter((o) => !o.success);
  if (failed.length === 0) return [];

  const counts = new Map<string, number>();
  for (const o of failed) {
    let cat = o.failureCategory ?? 'unknown';
    // Retroactive reclassification: re-classify unknown failures using stored error message
    if (cat === 'unknown' && typeof o.errorMessage === 'string' && o.errorMessage.length > 0) {
      cat = categorizeOutcomeErrorMessage(o.errorMessage);
    }
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
