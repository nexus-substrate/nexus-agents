/**
 * nexus-agents/cli-adapters - TOPSIS Types
 *
 * Types for TOPSIS (Technique for Order of Preference by Similarity
 * to Ideal Solution) multi-criteria decision making algorithm.
 *
 * @module cli-adapters/topsis-types
 * (Source: arXiv:2509.07571, Issue #146)
 */

import type { CliName, CapabilityProfile } from './types.js';

/**
 * A criterion for multi-criteria decision making.
 */
export interface TopsisCredential {
  /** Criterion name (e.g., 'cost', 'latency', 'quality') */
  readonly name: string;
  /** Weight for this criterion (0-1, should sum to 1 across all criteria) */
  readonly weight: number;
  /** Whether higher values are better (true) or lower is better (false) */
  readonly beneficial: boolean;
}

/**
 * Extended model profile with additional metrics for TOPSIS.
 */
export interface TopsisModelProfile {
  /** CLI adapter name */
  readonly cliName: CliName;
  /** Base capability profile */
  readonly capabilities: CapabilityProfile;
  /** Cost per 1M input tokens in USD */
  readonly costPerMillionInput: number;
  /** Cost per 1M output tokens in USD */
  readonly costPerMillionOutput: number;
  /** Average latency in milliseconds (first token) */
  readonly averageLatencyMs: number;
  /** Quality score (0-10, derived from capabilities) */
  readonly qualityScore: number;
}

/**
 * Default criteria weights for TOPSIS routing.
 * Sum to 1.0.
 */
export const DEFAULT_TOPSIS_CRITERIA: readonly TopsisCredential[] = [
  { name: 'quality', weight: 0.5, beneficial: true },
  { name: 'cost', weight: 0.3, beneficial: false },
  { name: 'latency', weight: 0.2, beneficial: false },
] as const;

/**
 * TOPSIS criteria for plan billing mode.
 * Cost weight is zero (monthly plan makes cost irrelevant),
 * redistributed to quality. Sum to 1.0.
 */
export const PLAN_BILLING_TOPSIS_CRITERIA: readonly TopsisCredential[] = [
  { name: 'quality', weight: 0.8, beneficial: true },
  { name: 'cost', weight: 0.0, beneficial: false },
  { name: 'latency', weight: 0.2, beneficial: false },
] as const;

/**
 * Configuration for TOPSIS router.
 */
export interface TopsisConfig {
  /** Criteria with weights (must sum to 1.0) */
  readonly criteria: readonly TopsisCredential[];
  /** Minimum acceptable quality score (0-10) */
  readonly minQualityThreshold: number;
  /** Maximum acceptable latency in ms (optional) */
  readonly maxLatencyMs?: number;
  /** Maximum acceptable cost per request in USD (optional) */
  readonly maxCostPerRequest?: number;
  /** Whether to log detailed scoring info */
  readonly verbose: boolean;
}

/**
 * Default TOPSIS configuration.
 */
export const DEFAULT_TOPSIS_CONFIG: TopsisConfig = {
  criteria: DEFAULT_TOPSIS_CRITERIA,
  minQualityThreshold: 5,
  verbose: false,
};

/**
 * TOPSIS scoring result for a single model.
 */
export interface TopsisScore {
  /** Model identifier */
  readonly cliName: CliName;
  /** Raw values for each criterion */
  readonly rawValues: Readonly<Record<string, number>>;
  /** Normalized values for each criterion */
  readonly normalizedValues: Readonly<Record<string, number>>;
  /** Weighted normalized values */
  readonly weightedValues: Readonly<Record<string, number>>;
  /** Distance to positive ideal solution (PIS) */
  readonly distanceToPIS: number;
  /** Distance to negative ideal solution (NIS) */
  readonly distanceToNIS: number;
  /** Relative closeness to ideal (0-1, higher is better) */
  readonly closenessScore: number;
}

/**
 * TOPSIS routing decision result.
 */
export interface TopsisResult {
  /** Selected model */
  readonly selectedModel: CliName;
  /** All model scores in ranked order */
  readonly scores: readonly TopsisScore[];
  /** Positive ideal solution values */
  readonly positiveIdeal: Readonly<Record<string, number>>;
  /** Negative ideal solution values */
  readonly negativeIdeal: Readonly<Record<string, number>>;
  /** Whether cost was optimized significantly */
  readonly costOptimized: boolean;
  /** Estimated cost savings vs best quality model */
  readonly estimatedSavingsPercent: number;
  /** Reasoning for the selection */
  readonly reasoning: string;
}

/**
 * Default model profiles based on known CLI characteristics.
 * Derived from the canonical model registry (Issue #807).
 */

import { buildTopsisProfiles } from '../config/model-config-helpers.js';

export const DEFAULT_MODEL_PROFILES: readonly TopsisModelProfile[] = buildTopsisProfiles();
