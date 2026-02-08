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
import { getOutcomeStore } from '../../orchestration/outcomes/index.js';
import type { TaskCategory } from '../../config/task-specialization-types.js';
import { TASK_CATEGORIES } from '../../config/task-specialization-types.js';
import { getSpecialization } from '../../config/task-specialization.js';
import type {
  WeatherReportOptions,
  WeatherReportResponse,
  CliWeather,
  AdaptiveBonus,
  WeatherReportConfig,
  TierRecommendationEntry,
} from './weather-report-types.js';
import { createDefaultWeatherConfig } from './weather-report-types.js';
import { generateTierRecommendations } from '../gateway/tier-recommender.js';

// ============================================================================
// Public API
// ============================================================================

const CLI_NAMES = ['claude', 'gemini', 'codex'] as const;

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

  return {
    overall: {
      totalTasks: summary.totalTasks,
      successRate: summary.successRate,
      avgDurationMs: summary.avgDurationMs,
    },
    cliWeather,
    adaptiveBonuses,
    tierRecommendations,
    explorationRate: cfg.explorationRate,
    coldStartThreshold: cfg.coldStartThreshold,
    collectedAt: new Date().toISOString(),
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

  const outcomes = store.query({ cli: cli as 'claude' | 'gemini' | 'codex', category });
  if (outcomes.length < cfg.coldStartThreshold) return 0;

  const successRate = outcomes.filter((o) => o.success).length / outcomes.length;
  const baseline = 0.7; // Expected baseline success rate
  const delta = successRate - baseline;

  // Scale: +30% above baseline → +maxBonusAdjustment
  const scaled = (delta / 0.3) * cfg.maxBonusAdjustment;
  return clamp(scaled, -cfg.maxBonusAdjustment, cfg.maxBonusAdjustment);
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
): { cli?: 'claude' | 'gemini' | 'codex'; category?: TaskCategory } {
  const query: { cli?: 'claude' | 'gemini' | 'codex'; category?: TaskCategory } = {};
  if (cli !== undefined) query.cli = cli as 'claude' | 'gemini' | 'codex';
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
