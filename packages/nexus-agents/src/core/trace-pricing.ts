/**
 * nexus-agents/core - Model Pricing
 *
 * Model pricing constants and cost calculation functions.
 * Canonical pricing lives in config/model-capabilities.ts (Issue #807).
 * This module checks the canonical registry first, then falls back to
 * the legacy table for older/versioned model names.
 */

import { DEFAULT_MODEL_CAPABILITIES } from '../config/model-capabilities.js';

// =============================================================================
// Model Pricing (per 1M tokens, USD)
// =============================================================================

/**
 * Pricing information for a model.
 * (Source: Provider pricing pages, verified 2026-01-04)
 */
export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

/**
 * Legacy model pricing table for versioned/non-canonical model names.
 * Canonical models (claude-opus, gemini-pro, etc.) are served from the
 * model capabilities registry. This table covers older model variants.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Anthropic Claude legacy models
  'claude-opus-4': { inputPer1M: 15.0, outputPer1M: 75.0 },
  'claude-sonnet-4': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'claude-3-5-sonnet': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'claude-3-5-haiku': { inputPer1M: 0.8, outputPer1M: 4.0 },
  'claude-3-opus': { inputPer1M: 15.0, outputPer1M: 75.0 },
  'claude-3-sonnet': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'claude-3-haiku': { inputPer1M: 0.25, outputPer1M: 1.25 },

  // OpenAI legacy models
  'gpt-4o': { inputPer1M: 2.5, outputPer1M: 10.0 },
  'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.6 },
  'gpt-4-turbo': { inputPer1M: 10.0, outputPer1M: 30.0 },
  'gpt-4': { inputPer1M: 30.0, outputPer1M: 60.0 },
  'gpt-3.5-turbo': { inputPer1M: 0.5, outputPer1M: 1.5 },
  o1: { inputPer1M: 15.0, outputPer1M: 60.0 },
  'o1-mini': { inputPer1M: 3.0, outputPer1M: 12.0 },

  // Google legacy models
  'gemini-2.5-pro': { inputPer1M: 1.25, outputPer1M: 10.0 },
  'gemini-2.5-flash': { inputPer1M: 0.075, outputPer1M: 0.3 },
  'gemini-2.0-flash': { inputPer1M: 0.1, outputPer1M: 0.4 },
  'gemini-1.5-pro': { inputPer1M: 1.25, outputPer1M: 5.0 },
  'gemini-1.5-flash': { inputPer1M: 0.075, outputPer1M: 0.3 },
};

// =============================================================================
// Cost Calculation
// =============================================================================

/** Looks up pricing from the canonical model registry by model ID or cliModelName. */
function lookupCanonicalPricing(model: string): ModelPricing | undefined {
  for (const m of DEFAULT_MODEL_CAPABILITIES.models) {
    if (m.id === model || m.cliModelName === model) {
      if (m.pricing !== undefined) {
        return { inputPer1M: m.pricing.inputPer1M, outputPer1M: m.pricing.outputPer1M };
      }
    }
  }
  return undefined;
}

/**
 * Calculates the cost of an LLM call based on token usage.
 *
 * @param model - Model identifier
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns Cost in USD, or undefined if pricing not available
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number | undefined {
  // Try canonical registry first (Issue #807)
  let pricing = lookupCanonicalPricing(model);

  // Fall back to legacy table
  pricing ??= MODEL_PRICING[model];

  // If still not found, try partial match (e.g., 'claude-sonnet-4-20250514' -> 'claude-sonnet-4')
  if (pricing === undefined) {
    const baseModel = Object.keys(MODEL_PRICING).find((key) => model.startsWith(key));
    if (baseModel !== undefined) {
      pricing = MODEL_PRICING[baseModel];
    }
  }

  if (pricing === undefined) {
    return undefined;
  }

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M;

  return inputCost + outputCost;
}
