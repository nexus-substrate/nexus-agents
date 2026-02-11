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

// ============================================================================
// Input Schema
// ============================================================================

export const WeatherReportInputSchema = z.object({
  /** Filter by CLI name. */
  cli: z.enum(['claude', 'gemini', 'codex']).optional().describe('Filter by CLI'),
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
  readonly cli?: 'claude' | 'gemini' | 'codex';
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
  readonly explorationRate: number;
  readonly coldStartThreshold: number;
  readonly collectedAt: string;
}

// ============================================================================
// Configuration
// ============================================================================

export const WeatherReportConfigSchema = z.object({
  /** Minimum observations before adjusting bonuses. */
  coldStartThreshold: z.number().int().min(1).max(1000).default(10),
  /** Exploration rate: fraction of random routing (0.0-1.0). */
  explorationRate: z.number().min(0).max(1).default(0.1),
  /** Max adaptive bonus adjustment (+/-). */
  maxBonusAdjustment: z.number().min(0).max(10).default(5),
});

export type WeatherReportConfig = z.infer<typeof WeatherReportConfigSchema>;

/** Creates default configuration. */
export function createDefaultWeatherConfig(): WeatherReportConfig {
  return WeatherReportConfigSchema.parse({});
}
