/**
 * nexus-agents/core - Model Pricing
 *
 * Cost calculation functions using the canonical model registry.
 * All pricing data lives in config/in-tree-data.ts — this module
 * provides a convenience function to calculate costs from token usage.
 *
 * @see config/in-tree-data.ts — single source of truth for model pricing
 * @module core/trace-pricing
 * (Source: Issue #807, Issue #1149)
 */

import { getInTreeCapabilitiesMatrix } from '../config/model-config-helpers.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Pricing information for a model.
 */
export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

// =============================================================================
// Canonical Pricing Lookup
// =============================================================================

/** Extracts ModelPricing from a registry entry's pricing field. */
function toPricing(
  pricing: { inputPer1M: number; outputPer1M: number } | undefined
): ModelPricing | undefined {
  if (pricing === undefined) return undefined;
  return { inputPer1M: pricing.inputPer1M, outputPer1M: pricing.outputPer1M };
}

/** Checks if the query matches a registry entry by exact id, cliModelName, or cliAlias. */
function isExactMatch(
  entry: { id: string; cliModelName?: string | undefined; cliAlias?: string | undefined },
  query: string
): boolean {
  return entry.id === query || entry.cliModelName === query || entry.cliAlias === query;
}

/** Checks if the query starts with a registry entry's id or cliModelName. */
function isPrefixMatch(
  entry: { id: string; cliModelName?: string | undefined },
  query: string
): boolean {
  const id = entry.id;
  const cliName = entry.cliModelName ?? '';
  return (
    (id.length > 0 && query.startsWith(id)) || (cliName.length > 0 && query.startsWith(cliName))
  );
}

/**
 * Looks up pricing from the canonical model registry.
 * Matches by: exact (id, cliModelName, cliAlias), then prefix match.
 */
function lookupCanonicalPricing(model: string): ModelPricing | undefined {
  const models = getInTreeCapabilitiesMatrix().models;
  for (const m of models) {
    if (isExactMatch(m, model)) return toPricing(m.pricing);
  }
  for (const m of models) {
    if (m.pricing !== undefined && isPrefixMatch(m, model)) return toPricing(m.pricing);
  }
  return undefined;
}

// =============================================================================
// Cost Calculation
// =============================================================================

/**
 * Calculates the cost of an LLM call based on token usage.
 * Looks up pricing from the canonical model registry only.
 *
 * @param model - Model identifier (canonical id, cliModelName, or versioned name)
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns Cost in USD, or undefined if model not in canonical registry
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number | undefined {
  const pricing = lookupCanonicalPricing(model);

  if (pricing === undefined) {
    return undefined;
  }

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M;

  return inputCost + outputCost;
}
