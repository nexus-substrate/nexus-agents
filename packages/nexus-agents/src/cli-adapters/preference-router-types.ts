/**
 * nexus-agents/cli-adapters - Preference Router Types
 *
 * Type definitions for preference-trained routing (RouteLLM pattern).
 * Uses human preference data to learn routing decisions.
 *
 * @module cli-adapters/preference-router-types
 * (Source: Issue #148, arXiv:2406.18665)
 */

import { z } from 'zod';
import type { CliName } from './types.js';

/**
 * A single preference data point comparing model outputs.
 */
export interface PreferenceDataPoint {
  /** Unique identifier */
  readonly id: string;
  /** The input query */
  readonly query: string;
  /** Extracted query features */
  readonly features: QueryFeatures;
  /** Whether the strong model was preferred */
  readonly strongModelPreferred: boolean;
  /** Optional: actual strong model response quality score */
  readonly strongModelQuality?: number | undefined;
  /** Optional: actual weak model response quality score */
  readonly weakModelQuality?: number | undefined;
  /** When this preference was recorded */
  readonly recordedAt: Date;
  /** Domain or task category */
  readonly domain?: string | undefined;
}

/**
 * Features extracted from a query for preference prediction.
 */
export interface QueryFeatures {
  /** Query length in tokens (estimated) */
  readonly tokenCount: number;
  /** Complexity score (0-1) */
  readonly complexity: number;
  /** Whether query requires reasoning */
  readonly requiresReasoning: boolean;
  /** Whether query requires code generation */
  readonly requiresCode: boolean;
  /** Whether query requires creativity */
  readonly requiresCreativity: boolean;
  /** Whether query has ambiguity */
  readonly hasAmbiguity: boolean;
  /** Domain category */
  readonly domain: string;
  /** Keywords present (hashed for privacy) */
  readonly keywordSignature: string;
}

/**
 * Result of a preference prediction.
 */
export interface PreferencePrediction {
  /** Probability that strong model is significantly better */
  readonly strongModelProbability: number;
  /** Confidence in this prediction (0-1) */
  readonly confidence: number;
  /** Features used for prediction */
  readonly features: QueryFeatures;
  /** Number of similar data points used */
  readonly supportingDataPoints: number;
}

/**
 * Routing decision based on preference prediction.
 */
export interface PreferenceRoutingDecision {
  /** Selected model tier */
  readonly selectedTier: 'strong' | 'weak';
  /** Selected adapter */
  readonly selectedCli: CliName;
  /** Preference prediction details */
  readonly prediction: PreferencePrediction;
  /** Reason for selection */
  readonly reason: string;
  /** Routing decision time in ms */
  readonly routingLatencyMs: number;
  /** Cost savings compared to always using strong model */
  readonly estimatedCostSavings: number;
}

/**
 * Model tier configuration.
 */
export interface ModelTier {
  /** Tier name */
  readonly tier: 'strong' | 'weak';
  /** CLI adapter name */
  readonly cli: CliName;
  /** Cost per 1M tokens (input + output averaged) */
  readonly costPerMillionTokens: number;
  /** Quality baseline (0-1) */
  readonly qualityBaseline: number;
}

/**
 * Preference router configuration.
 */
export interface PreferenceRouterConfig {
  /** Strong model configuration */
  readonly strongModel: ModelTier;
  /** Weak model configuration */
  readonly weakModel: ModelTier;
  /** Threshold for routing to strong model (0-1) */
  readonly routingThreshold: number;
  /** Minimum data points before using learned routing */
  readonly minDataPoints: number;
  /** Maximum data points to store */
  readonly maxDataPoints: number;
  /** Whether to enable online learning */
  readonly enableOnlineLearning: boolean;
  /** Domain-specific threshold overrides */
  readonly domainThresholds?: Record<string, number> | undefined;
}

/**
 * Default preference router configuration.
 */
export const DEFAULT_PREFERENCE_ROUTER_CONFIG: PreferenceRouterConfig = {
  strongModel: {
    tier: 'strong',
    cli: 'claude',
    costPerMillionTokens: 9.0, // Average of input (3) + output (15)
    qualityBaseline: 0.95,
  },
  weakModel: {
    tier: 'weak',
    cli: 'gemini',
    costPerMillionTokens: 0.1875, // Average of input (0.075) + output (0.3)
    qualityBaseline: 0.75,
  },
  routingThreshold: 0.5,
  minDataPoints: 10,
  maxDataPoints: 10000,
  enableOnlineLearning: true,
};

/**
 * Zod schema for config validation.
 */
export const PreferenceRouterConfigSchema = z.object({
  strongModel: z.object({
    tier: z.literal('strong'),
    cli: z.enum(['claude', 'gemini', 'codex']),
    costPerMillionTokens: z.number().positive(),
    qualityBaseline: z.number().min(0).max(1),
  }),
  weakModel: z.object({
    tier: z.literal('weak'),
    cli: z.enum(['claude', 'gemini', 'codex']),
    costPerMillionTokens: z.number().positive(),
    qualityBaseline: z.number().min(0).max(1),
  }),
  routingThreshold: z.number().min(0).max(1).default(0.5),
  minDataPoints: z.number().int().positive().default(10),
  maxDataPoints: z.number().int().positive().default(10000),
  enableOnlineLearning: z.boolean().default(true),
  domainThresholds: z.record(z.number().min(0).max(1)).optional(),
});

/**
 * Statistics about the preference router's learned model.
 */
export interface PreferenceModelStats {
  /** Total data points collected */
  readonly totalDataPoints: number;
  /** Data points by domain */
  readonly dataPointsByDomain: Record<string, number>;
  /** Average strong model preference rate */
  readonly strongModelPreferenceRate: number;
  /** Routing accuracy (if validation data available) */
  readonly routingAccuracy?: number;
  /** Estimated cost savings rate */
  readonly estimatedCostSavingsRate: number;
  /** Last updated timestamp */
  readonly lastUpdatedAt: Date;
}

/**
 * Interface for the preference data store.
 */
export interface IPreferenceDataStore {
  /** Store a new preference data point */
  store(dataPoint: PreferenceDataPoint): void;
  /** Get all data points */
  getAll(): readonly PreferenceDataPoint[];
  /** Get data points by domain */
  getByDomain(domain: string): readonly PreferenceDataPoint[];
  /** Find similar data points based on features */
  findSimilar(features: QueryFeatures, limit: number): readonly PreferenceDataPoint[];
  /** Get statistics */
  getStats(): PreferenceModelStats;
  /** Clear all data */
  clear(): void;
}
