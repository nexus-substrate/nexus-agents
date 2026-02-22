/**
 * Model Capability Estimation
 *
 * Estimates model capabilities for different task types.
 * Used by the scaling predictor to determine if single-agent
 * or multi-agent coordination is optimal.
 *
 * @module agents/coordination/capability-estimator
 * (Source: Issue #337, arXiv:2512.08296)
 */

import type { ModelCapability, ScalingTaskType } from './scaling-types.js';
import { clamp } from '../../utils/math-utils.js';
import { DEFAULT_MODEL_CAPABILITIES } from '../../config/model-capabilities.js';

// =============================================================================
// Capability Data — derived from canonical model registry
// =============================================================================

/**
 * Base capability data for known models.
 * Based on benchmark data and empirical observations.
 */
interface BaseCapability {
  readonly estimatedAccuracy: number;
  readonly relativeCost: number;
  readonly avgLatencyMs: number;
}

/** Avg latency estimates per provider (ms). Not in canonical registry. */
const PROVIDER_AVG_LATENCY: Record<string, number> = {
  anthropic: 3000,
  google: 1500,
  openai: 2500,
};

/**
 * Derive BaseCapability from canonical registry quality scores.
 * Maps quality scores (1-10) to the 0-1 accuracy/cost scale used here.
 */
function deriveFromCanonical(): Record<string, BaseCapability> {
  const result: Record<string, BaseCapability> = {};
  for (const m of DEFAULT_MODEL_CAPABILITIES.models) {
    const q = m.qualityScores;
    if (q === undefined) continue;
    const avgQuality = (q.reasoning + q.codeGeneration) / 2;
    const baseLatency = PROVIDER_AVG_LATENCY[m.provider] ?? 2000;
    const speedFactor = q.speed / 10;
    const cap: BaseCapability = {
      estimatedAccuracy: clamp(avgQuality / 10, 0, 1),
      relativeCost: clamp(1 - q.cost / 10, 0, 1),
      avgLatencyMs: Math.round(baseLatency * (1.5 - speedFactor)),
    };
    result[m.id] = cap;
    // Also register by cliModelName for versioned lookups
    if (m.cliModelName !== undefined) {
      result[m.cliModelName] = cap;
    }
  }
  return result;
}

/**
 * Known model capabilities — derived from canonical model-capabilities.ts registry.
 * Open-source models included for multi-agent scaling comparisons.
 *
 * @see config/model-capabilities.ts — single source of truth for current models
 */
const MODEL_CAPABILITIES: Record<string, BaseCapability> = {
  // Canonical models (derived from registry)
  ...deriveFromCanonical(),
  // Open source models (not in canonical registry — kept for scaling comparisons)
  'llama-3.1-405b': { estimatedAccuracy: 0.78, relativeCost: 0.3, avgLatencyMs: 3000 },
  'llama-3.1-70b': { estimatedAccuracy: 0.68, relativeCost: 0.15, avgLatencyMs: 1500 },
  'mixtral-8x7b': { estimatedAccuracy: 0.62, relativeCost: 0.1, avgLatencyMs: 1200 },
};

/**
 * Task type adjustments to base accuracy.
 * Some models perform better or worse on certain task types.
 */
const TASK_TYPE_ADJUSTMENTS: Record<ScalingTaskType, number> = {
  sequential_reasoning: -0.05, // Slightly harder
  parallelizable: 0, // Neutral
  tool_heavy: -0.1, // Tool use is challenging
  web_navigation: -0.15, // Web nav is complex
  code_generation: 0.05, // LLMs good at code
  knowledge_retrieval: 0, // Neutral
  creative: -0.05, // Slightly harder to evaluate
  unknown: -0.1, // Unknown = conservative estimate
};

/**
 * Saturation threshold from research.
 * Multi-agent coordination shows diminishing returns above this accuracy.
 */
const SATURATION_THRESHOLD = 0.45;

/**
 * Default capability for unknown models.
 */
const DEFAULT_BASE_CAPABILITY: BaseCapability = {
  estimatedAccuracy: 0.5,
  relativeCost: 0.5,
  avgLatencyMs: 2000,
};

// =============================================================================
// Capability Registry
// =============================================================================

/**
 * Mutable registry for runtime capability updates.
 */
const capabilityRegistry = new Map<string, BaseCapability>(Object.entries(MODEL_CAPABILITIES));

// =============================================================================
// Main Functions
// =============================================================================

/**
 * Estimate model capability for a specific task type.
 *
 * @param modelId - Model identifier
 * @param taskType - Type of task
 * @returns Estimated model capability
 *
 * @example
 * ```typescript
 * const capability = estimateModelCapability('claude-3-opus', 'code_generation');
 * // capability.estimatedAccuracy === 0.9 (0.85 base + 0.05 code boost)
 * // capability.exceedsSaturationThreshold === true
 * ```
 */
export function estimateModelCapability(
  modelId: string,
  taskType: ScalingTaskType
): ModelCapability {
  // Look up base capability or use defaults
  const base = findBaseCapability(modelId);

  // Apply task type adjustment
  const adjustment = TASK_TYPE_ADJUSTMENTS[taskType];
  const adjustedAccuracy = clamp(base.estimatedAccuracy + adjustment, 0, 1);

  return {
    modelId,
    estimatedAccuracy: adjustedAccuracy,
    exceedsSaturationThreshold: adjustedAccuracy > SATURATION_THRESHOLD,
    relativeCost: base.relativeCost,
    avgLatencyMs: base.avgLatencyMs,
  };
}

/**
 * Find base capability for a model, with fuzzy matching.
 */
function findBaseCapability(modelId: string): BaseCapability {
  // Exact match
  const exact = capabilityRegistry.get(modelId);
  if (exact) return exact;

  // Normalize model ID for fuzzy matching
  const normalized = modelId.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Try prefix matching
  for (const [key, value] of capabilityRegistry) {
    const keyNormalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalized.startsWith(keyNormalized) || keyNormalized.startsWith(normalized)) {
      return value;
    }
  }

  // Family matching (e.g., "claude-3-opus-20240229" -> "claude-3-opus")
  for (const [key, value] of capabilityRegistry) {
    if (modelId.includes(key) || key.includes(modelId)) {
      return value;
    }
  }

  return DEFAULT_BASE_CAPABILITY;
}

/**
 * Register a new model capability estimate.
 *
 * @param modelId - Model identifier
 * @param capability - Capability data
 *
 * @example
 * ```typescript
 * registerModelCapability('my-custom-model', {
 *   estimatedAccuracy: 0.7,
 *   relativeCost: 0.3,
 *   avgLatencyMs: 1500
 * });
 * ```
 */
export function registerModelCapability(
  modelId: string,
  capability: Partial<BaseCapability>
): void {
  const existing = findBaseCapability(modelId);
  capabilityRegistry.set(modelId, {
    estimatedAccuracy: capability.estimatedAccuracy ?? existing.estimatedAccuracy,
    relativeCost: capability.relativeCost ?? existing.relativeCost,
    avgLatencyMs: capability.avgLatencyMs ?? existing.avgLatencyMs,
  });
}

/**
 * Get the best performing model from a list.
 *
 * @param modelIds - List of model identifiers
 * @param taskType - Type of task
 * @returns Best model capability
 */
export function findBestModel(
  modelIds: readonly string[],
  taskType: ScalingTaskType
): ModelCapability | undefined {
  if (modelIds.length === 0) return undefined;

  let best: ModelCapability | undefined;
  for (const modelId of modelIds) {
    const cap = estimateModelCapability(modelId, taskType);
    if (!best || cap.estimatedAccuracy > best.estimatedAccuracy) {
      best = cap;
    }
  }
  return best;
}

/**
 * Get model capabilities sorted by efficiency (accuracy / cost).
 *
 * @param modelIds - List of model identifiers
 * @param taskType - Type of task
 * @returns Sorted array of capabilities (most efficient first)
 */
export function rankModelsByEfficiency(
  modelIds: readonly string[],
  taskType: ScalingTaskType
): ModelCapability[] {
  return modelIds
    .map((id) => estimateModelCapability(id, taskType))
    .sort((a, b) => {
      const efficiencyA = a.estimatedAccuracy / Math.max(0.01, a.relativeCost);
      const efficiencyB = b.estimatedAccuracy / Math.max(0.01, b.relativeCost);
      return efficiencyB - efficiencyA;
    });
}

/**
 * Check if a model exceeds the saturation threshold for a task type.
 *
 * @param modelId - Model identifier
 * @param taskType - Type of task
 * @returns True if model exceeds saturation threshold
 */
export function exceedsSaturation(modelId: string, taskType: ScalingTaskType): boolean {
  const cap = estimateModelCapability(modelId, taskType);
  return cap.exceedsSaturationThreshold;
}

/**
 * Get the current saturation threshold value.
 */
export function getSaturationThreshold(): number {
  return SATURATION_THRESHOLD;
}

/**
 * Get list of all known model IDs.
 */
export function getKnownModelIds(): readonly string[] {
  return [...capabilityRegistry.keys()];
}
