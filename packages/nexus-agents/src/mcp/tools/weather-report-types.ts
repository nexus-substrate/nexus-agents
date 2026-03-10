/**
 * Type definitions for the Weather Report MCP tool.
 *
 * Surfaces observed model performance as a living "weather report"
 * and computes adaptive routing bonuses from outcome data.
 *
 * @module mcp/tools/weather-report-types
 * (Source: Issue #865 — Weather report with adaptive routing)
 */

import { z } from 'zod';
import type { TaskCategory } from '../../config/task-specialization-types.js';
import type { GroupStats } from '../../orchestration/outcomes/outcome-types.js';
import { CLI_NAMES, type CliNameLiteral } from '../../config/model-capabilities-types.js';

// ============================================================================
// Input Schema
// ============================================================================

export const WeatherReportInputSchema = z.object({
  /** Filter by CLI name. */
  cli: z.enum(CLI_NAMES).optional().describe('Filter by CLI'),
  /** Filter by task category. */
  category: z
    .enum([
      'architecture',
      'code_generation',
      'code_review',
      'research',
      'security_review',
      'planning',
      'documentation',
      'testing',
      'devops',
      'exploration',
    ])
    .optional()
    .describe('Filter by task category'),
  /** Include adaptive routing bonus data. */
  includeAdaptive: z
    .boolean()
    .optional()
    .default(true)
    .describe('Include adaptive routing bonuses (default: true)'),
});

/** Validated MCP input (includeAdaptive is always populated after Zod parse). */
export type WeatherReportInput = z.infer<typeof WeatherReportInputSchema>;

/** Options for generateWeatherReport (all fields optional). */
export interface WeatherReportOptions {
  readonly cli?: CliNameLiteral;
  readonly category?: string;
  readonly includeAdaptive?: boolean;
}

// ============================================================================
// Output Types
// ============================================================================

/** Per-CLI performance stats in the weather report. */
export interface CliWeather {
  readonly cli: string;
  readonly totalTasks: number;
  readonly successRate: number;
  readonly avgDurationMs: number;
  readonly byCategory: ReadonlyMap<string, GroupStats>;
}

/** Adaptive bonus for a CLI+category pair. */
export interface AdaptiveBonus {
  readonly cli: string;
  readonly category: TaskCategory;
  readonly staticBonus: number;
  readonly adaptiveBonus: number;
  readonly sampleCount: number;
  readonly sufficient: boolean;
}

/** Tier recommendation surfaced in the weather report (#895). */
export interface TierRecommendationEntry {
  readonly category: string;
  readonly direction: 'promote' | 'demote';
  readonly currentTier: number;
  readonly recommendedTier: number;
  readonly successRate: number;
  readonly sampleCount: number;
  readonly reason: string;
}

/** Learning insight for a CLI+category pair (Issue #901, Phase 4). */
export interface LearningInsight {
  readonly cli: string;
  readonly category: TaskCategory;
  readonly trend: 'improving' | 'declining' | 'stable';
  readonly confidence: number;
  readonly adjustedBaseline: number;
  readonly sampleCount: number;
}

/** Recommended CLI→category mapping for LinUCB cold-start (Epic #952, Phase 6). */
export interface RecommendedMapping {
  readonly category: TaskCategory;
  readonly recommendedCli: string;
  readonly successRate: number;
  readonly sampleCount: number;
  readonly confidence: 'high' | 'medium' | 'low';
}

/** Rate limit stats per provider (Issue #996). */
export interface RateLimitReport {
  readonly provider: string;
  readonly totalHits: number;
  readonly lastHitAt: number;
  readonly avgRetryAfterMs: number | undefined;
}

/** Per-tool performance stats (Issue #1022). */
export interface ToolPerformanceEntry {
  readonly toolName: string;
  readonly totalCalls: number;
  readonly successRate: number;
  readonly avgDurationMs: number;
  readonly errorCount: number;
}

/** Failure breakdown entry for the weather report (Issue #1025). */
export interface FailureBreakdownEntry {
  readonly category: string;
  readonly count: number;
  readonly percentage: number;
}

/** Per-expert-role performance stats from worker dispatch outcomes (Issue #1324, #1427). */
export interface ExpertPerformanceEntry {
  readonly role: string;
  readonly totalTasks: number;
  readonly successRate: number;
  readonly avgDurationMs: number;
  readonly dominantErrorPattern?: string;
  /** Number of consecutive failures at tail of outcome history (Issue #1427). */
  readonly consecutiveFailures: number;
  /** ISO timestamp of last successful outcome (Issue #1427). */
  readonly lastSuccessAt?: string;
  /** True when successRate < 0.5 — signals operator attention needed (Issue #1427). */
  readonly degraded: boolean;
}

/** Agent health summary from heartbeat monitor (Issue #1032). */
export interface AgentHealthSummary {
  readonly activeSessions: number;
  readonly stalledSessions: number;
  readonly sessions: readonly AgentSessionEntry[];
}

/** Single agent session health entry. */
export interface AgentSessionEntry {
  readonly sessionId: string;
  readonly expertId: string;
  readonly health: 'alive' | 'slow' | 'stalled';
  readonly elapsedMs: number;
  readonly timeSinceHeartbeatMs: number;
  readonly heartbeatCount: number;
}

/** Swarm health metrics dashboard (Issue #1403, Phase 6.2). */
export interface SwarmHealthMetrics {
  /** % of dispatched expert roles that produced at least one success. Target: 70-90%. */
  readonly agentUtilization: number;
  /** Successful tasks / total worker dispatches. Target: > 0.1. */
  readonly collaborationEfficiency: number;
  /** % of tasks routed to the empirically best CLI for their category. Target: > 80%. */
  readonly routingAccuracy: number;
  /** Avg gap between actual success rate and best-possible rate per category. Target: decreasing. */
  readonly weeklyRegret: number;
  /** Avg samples to reach 'high' confidence per category. Target: < 50. */
  readonly adaptationSpeed: number;
  /** Number of observed categories with sufficient data. */
  readonly observedCategories: number;
  /** Number of expert roles observed. */
  readonly observedRoles: number;
}

/** Worker failure triage statistics (#1506). */
export interface TriageStats {
  /** Total outcomes that were retried via triage. */
  readonly totalRetried: number;
  /** Retry success rate (retried + success / total retried). */
  readonly retrySuccessRate: number;
  /** Breakdown by triage action. */
  readonly actionBreakdown: readonly { readonly action: string; readonly count: number }[];
}

/** Full weather report response. */
export interface WeatherReportResponse {
  readonly overall: {
    readonly totalTasks: number;
    readonly successRate: number;
    readonly avgDurationMs: number;
  };
  readonly cliWeather: readonly CliWeather[];
  readonly adaptiveBonuses: readonly AdaptiveBonus[];
  /** Outcome-driven tier change recommendations (#895). */
  readonly tierRecommendations: readonly TierRecommendationEntry[];
  /** Adaptive learning insights per CLI+category (#901). */
  readonly learningInsights?: readonly LearningInsight[];
  /** Recommended CLI mappings per category for LinUCB priors (Epic #952). */
  readonly recommendedMappings?: readonly RecommendedMapping[];
  /** Rate limit utilization per provider (Issue #996). */
  readonly rateLimits?: readonly RateLimitReport[];
  /** Per-tool invocation metrics (Issue #1022). */
  readonly toolPerformance?: readonly ToolPerformanceEntry[];
  /** Failure breakdown by category (Issue #1025). */
  readonly failureBreakdown?: readonly FailureBreakdownEntry[];
  /** Agent health from heartbeat monitor (Issue #1032). */
  readonly agentHealth?: AgentHealthSummary;
  /** Per-expert-role performance from worker dispatch outcomes (Issue #1324). */
  readonly expertPerformance?: readonly ExpertPerformanceEntry[];
  /** Swarm health metrics dashboard (Issue #1403). */
  readonly swarmHealth?: SwarmHealthMetrics;
  /** Worker failure triage statistics (#1506). */
  readonly triageStats?: TriageStats;
  readonly explorationRate: number;
  readonly coldStartThreshold: number;
  readonly collectedAt: string;
}

// ============================================================================
// Configuration
// ============================================================================

/** Default lookback window: 7 days in milliseconds. */
export const DEFAULT_OUTCOME_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

export const WeatherReportConfigSchema = z.object({
  /** Minimum observations before adjusting bonuses (lowered for faster activation). */
  coldStartThreshold: z.number().int().min(1).max(1000).default(3),
  /** Exploration rate: fraction of random routing (0.0-1.0). */
  explorationRate: z.number().min(0).max(1).default(0.1),
  /** Max adaptive bonus adjustment (+/-). */
  maxBonusAdjustment: z.number().min(0).max(20).default(10),
  /**
   * Lookback window for outcome queries (ms). Only outcomes within this
   * window are used for adaptive bonuses. Falls back to all history if
   * the window has fewer samples than coldStartThreshold. Default: 7 days.
   */
  outcomeLookbackMs: z.number().int().min(0).default(DEFAULT_OUTCOME_LOOKBACK_MS),
});

export type WeatherReportConfig = z.infer<typeof WeatherReportConfigSchema>;

/** Creates default configuration. */
export function createDefaultWeatherConfig(): WeatherReportConfig {
  return WeatherReportConfigSchema.parse({});
}
