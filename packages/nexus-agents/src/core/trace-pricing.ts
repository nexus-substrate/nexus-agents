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
import { getDefaultRegistry } from '../config/model-registry.js';
import type { PriceBasis } from './price-basis.js';

// The vocabulary lives in a dependency-free leaf module (#4406 review) so the
// persisted decision-cost records can import the zod schema at runtime without
// closing an import cycle back through the model registry. Re-exported here so
// this module stays the one-stop pricing surface for existing callers.
export { PriceBasisSchema, priceBasisCaveat, type PriceBasis } from './price-basis.js';

/**
 * Whether the pricing chain resolved a rate for this model.
 *
 * `'list'` means a rate WAS resolved and should be read as an assumed published
 * rate — not a guarantee that it is the vendor's list price rather than an
 * operator override or a fuzzy-matched sibling's rate. `'unknown'` means the
 * chain produced nothing, which is not the same as "no price exists". Both
 * caveats are spelled out on {@link PriceBasis} in `core/price-basis.ts`.
 */
export function priceBasisFor(model: string): PriceBasis {
  return lookupCanonicalPricing(model) === undefined ? 'unknown' : 'list';
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
 * Looks up pricing for a model.
 *
 * Order: the curated in-tree entries first (exact, then prefix), then the full
 * `ModelRegistry` — which merges the models.dev catalogue tier on top of
 * in-tree data.
 *
 * That fall-through is the point (#4406). Previously this read ONLY the static
 * in-tree matrix, so a model the catalogue prices perfectly well came back
 * unpriced: `calculateCost('gpt-4o', 1M, 1M)` returned `undefined` while the
 * registry held `2.5 / 10` for it the whole time. A missing price is not free —
 * cost ceilings are documented as fail-closed for unpriced candidates — so
 * reporting "unknown" when a public list price is available is the worse
 * answer.
 *
 * The sibling `computeCostDetail` (learning/usage-log.ts) already resolved
 * through the registry; this had been a second, narrower implementation of the
 * same lookup.
 *
 * IMPORTANT: a catalogue price is a PUBLIC LIST PRICE. It is the vendor's
 * advertised rate, not a rate anyone verified against the operator's account —
 * an enterprise contract, negotiated discount, flat-rate gateway or free tier
 * will all bill differently. See {@link PriceBasis}.
 */
function lookupCanonicalPricing(model: string): ModelPricing | undefined {
  const models = getInTreeCapabilitiesMatrix().models;
  for (const m of models) {
    if (isExactMatch(m, model)) return toPricing(m.pricing);
  }
  for (const m of models) {
    if (m.pricing !== undefined && isPrefixMatch(m, model)) return toPricing(m.pricing);
  }
  // Fall through to the full registry (in-tree + generated + models.dev +
  // manifest overlay + derived). Read at CALL time, never module load — first
  // construction touches the filesystem (#3185 bootstrap hazard).
  return toPricing(getDefaultRegistry().getEntry(model).pricing);
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
