/**
 * nexus-agents/core - Model Pricing
 *
 * Cost calculation functions using the canonical model registry.
 * Pricing resolves through the overlay-bearing canonical registry, with legacy
 * in-tree alias/prefix support, to calculate costs from token usage.
 *
 * @see config/model-registry.ts — canonical pricing tiers
 * @module core/trace-pricing
 * (Source: Issue #807, Issue #1149)
 */

import { getInTreeCapabilitiesMatrix } from '../config/model-config-helpers.js';
import { computeTokenCost } from '../learning/token-cost-core.js';
import { getDefaultRegistry, type EntrySource } from '../config/model-registry.js';
import type { PriceBasis } from './price-basis.js';

// The vocabulary lives in a dependency-free leaf module (#4406 review) so the
// persisted decision-cost records can import the zod schema at runtime without
// closing an import cycle back through the model registry. Re-exported here so
// this module stays the one-stop pricing surface for existing callers.
export { PriceBasisSchema, priceBasisCaveat, type PriceBasis } from './price-basis.js';

/**
 * The basis of the rate selected by the pricing chain for this model.
 *
 * Manifest overlay pricing reports `'declared'`: an operator-asserted rate.
 * Other resolved rates report `'list'`, an assumed published rate with the
 * fuzzy-match caveat on {@link PriceBasis}. `'unknown'` means the chain
 * produced nothing, which is not the same as "no price exists".
 */
export function priceBasisFor(model: string): PriceBasis {
  const { pricing, source } = lookupCanonicalPricing(model);
  if (pricing === undefined) return 'unknown';
  return source === 'manifest' ? 'declared' : 'list';
}

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
 * Select pricing and its existing registry-tier provenance together.
 *
 * Initialize the registry at call time before projecting the overlay-aware
 * in-tree matrix. The matrix preserves legacy CLI alias/prefix matching but
 * drops provenance, so recover the selected entry's source by its canonical id.
 * A metadata-only overlay inherits an in-tree rate in this compatibility path;
 * without pricing on the manifest entry itself, that rate remains `'list'`.
 *
 * The full-registry fallback retains normalized/identity resolution. Those
 * matches report `source: 'derived'`; `resolvedFrom` identifies the entry whose
 * rate was applied, including when it came from the manifest tier.
 */
function lookupCanonicalPricing(model: string): {
  readonly pricing: ModelPricing | undefined;
  readonly source: EntrySource;
} {
  // Call time only: first construction touches the filesystem (#3185).
  const registry = getDefaultRegistry();
  const models = getInTreeCapabilitiesMatrix().models;
  const matched =
    models.find((m) => isExactMatch(m, model)) ??
    models.find((m) => m.pricing !== undefined && isPrefixMatch(m, model));
  if (matched !== undefined) {
    const entry = registry.getEntry(matched.id);
    return {
      pricing: toPricing(matched.pricing),
      source: entry.pricing === undefined ? 'in-tree' : entry.source,
    };
  }
  const entry = registry.getEntry(model);
  return {
    pricing: toPricing(entry.pricing),
    source: registry.getEntry(entry.resolvedFrom ?? entry.id).source,
  };
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
  const { pricing } = lookupCanonicalPricing(model);

  // FAIL-CLOSED policy stays here, named, rather than moving into the shared
  // core (#5122). `undefined` means "no rate known", which is NOT $0: cost
  // ceilings are documented fail-closed for unpriced candidates, and a $0 would
  // pass every ceiling. The core computes arithmetic only; it must never be
  // reached without a rate.
  if (pricing === undefined) {
    return undefined;
  }

  return computeTokenCost(
    { input: inputTokens, output: outputTokens },
    { inputPer1M: pricing.inputPer1M, outputPer1M: pricing.outputPer1M }
  ).costUsd;
}
