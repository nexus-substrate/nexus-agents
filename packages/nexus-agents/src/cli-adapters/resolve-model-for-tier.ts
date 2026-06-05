/**
 * Tier→concrete-model resolution at route time (#3394, epic #3403 / #3150 P4).
 *
 * ZeroRouter computes a difficulty tier (fast/balanced/powerful) but nothing used
 * it to pick a concrete MODEL — the model was resolved late in the adapter. This
 * resolves the tier to the best in-tree model for the selected CLI, ranked by a
 * tier-appropriate quality dimension, so `route()` can return a (CLI, model) pair.
 *
 * Pure + deterministic. Conservative + fail-safe (per the consensus refinements):
 *  - **Table-driven** tier→dimension mapping (one constant, unit-testable).
 *  - Models **missing the tier's qualityScore are skipped** — never NaN-sorted to
 *    the top.
 *  - When `liveModelIds` is supplied (a READ of the AvailableModelsCache — never a
 *    hot-path probe), only live models are eligible; an empty/undefined set means
 *    "registry-only" (fail-open).
 *  - Falls back to `getDefaultModelForCli` when nothing qualifies.
 *
 * @module cli-adapters/resolve-model-for-tier
 */
import { findInTreeByCli, getDefaultModelForCli } from '../config/model-config-helpers.js';

import type { ModelTier } from './zero-router-types.js';
import type { CliNameLiteral } from '../config/model-capabilities-types.js';

type QualityDimension = 'reasoning' | 'codeGeneration' | 'speed' | 'cost';

/** Whether route-time concrete-model selection is enabled (opt-in; default OFF). */
export function isRouteModelSelectionEnabled(): boolean {
  return process.env['NEXUS_ROUTE_MODEL_SELECTION'] === 'true';
}

/** Which quality dimension each difficulty tier optimizes. Table-driven. */
export const TIER_QUALITY_DIMENSION: Readonly<Record<ModelTier, QualityDimension>> = {
  powerful: 'reasoning',
  balanced: 'codeGeneration',
  fast: 'speed',
};

export interface ResolveModelForTierOptions {
  /**
   * Live model ids (a snapshot READ of the AvailableModelsCache — this function
   * never probes). When provided, only candidates whose `id` or `cliModelName`
   * is in the set are eligible. Undefined/empty → registry-only (fail-open).
   */
  readonly liveModelIds?: ReadonlySet<string>;
}

/**
 * Best in-tree model for `(cliName, tier)`, or the CLI default when none
 * qualifies. Pure; safe to call on the routing hot path (in-memory registry
 * read only).
 */
interface Scored {
  readonly id: string;
  readonly score: number;
  readonly cost: number;
}

/** Eligible = no live filter, or the model's id/cliModelName is in the live set. */
function isEligible(
  m: { id: string; cliModelName?: string | undefined },
  live: ReadonlySet<string> | undefined
): boolean {
  return live === undefined || live.has(m.id) || live.has(m.cliModelName ?? '');
}

/** Best-first: tier score, then cheaper, then lexicographic (deterministic). */
function compareScored(a: Scored, b: Scored): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.cost !== a.cost) return b.cost - a.cost;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Collect the eligible, tier-scored candidates for a CLI. */
function collectScored(
  cliName: CliNameLiteral,
  dimension: QualityDimension,
  live: ReadonlySet<string> | undefined
): Scored[] {
  const scored: Scored[] = [];
  for (const m of findInTreeByCli(cliName)) {
    if (!isEligible(m, live)) continue;
    const score = m.qualityScores?.[dimension];
    // Skip models without the tier's quality dimension — never NaN-sort.
    if (typeof score !== 'number') continue;
    scored.push({ id: m.id, score, cost: m.qualityScores?.cost ?? 0 });
  }
  return scored;
}

export function resolveModelForTier(
  cliName: CliNameLiteral,
  tier: ModelTier,
  opts: ResolveModelForTierOptions = {}
): string {
  const scored = collectScored(cliName, TIER_QUALITY_DIMENSION[tier], opts.liveModelIds);
  if (scored.length === 0) return getDefaultModelForCli(cliName);
  scored.sort(compareScored);
  return scored[0]?.id ?? getDefaultModelForCli(cliName);
}
