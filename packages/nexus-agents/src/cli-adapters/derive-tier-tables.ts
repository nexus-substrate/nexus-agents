/**
 * nexus-agents/cli-adapters - Registry-derived tier / strength / rank tables.
 *
 * SINGLE authoritative source for the per-CLI tier, quality-rank, cost-rank,
 * confidence-profile and premium-partition tables that the routing chain used
 * to hardcode in five separate places (#4195, epic #4175). Every table is
 * DERIVED from each CLI's default model (`DEFAULT_MODEL_PER_CLI`) via its
 * registry `qualityScores` + real registry `pricing` — no hand-maintained
 * tier literals remain alongside these.
 *
 * BINDING fail-safe rules (vote-conditioned, #4195):
 *  1. A CLI whose default model lacks `qualityScores` classifies CONSERVATIVE
 *     (fast) and is EXCLUDED from the powerful tier / premium set — never
 *     powerful. Missing data must not send hard traffic to an unvetted model.
 *  2. Composes safely with `resolve-model-for-tier`: because rule 1 keeps
 *     unscored CLIs out of the powerful tier, the powerful tier only ever names
 *     CLIs whose default is scored, so the tier resolver never has to fall back
 *     to a frontier default for an empty powerful pick.
 *  3. A $0-priced default (a genuine `:free` model or a $0/$0 catalog artifact,
 *     #4209) is treated as the MOST expensive in the cost rank — it can NEVER
 *     win the cost rank and pull real traffic to it as "cheapest".
 *  4. Every ordering is deterministic: value-keyed with stable, explicit
 *     tie-breaks (never `qualityScores`-NaN-sorted, never Map/insertion order).
 *
 * Leaf-only imports (in-tree data + static fallback) mirror `buildTopsisProfiles`
 * so this evaluates safely at module-load time without touching the
 * filesystem-backed registry singleton (TDZ / circular-load safe).
 *
 * @module cli-adapters/derive-tier-tables
 */
import { buildInTreeEntries } from '../config/in-tree-entries.js';
import { DEFAULT_MODEL_PER_CLI, STATIC_CLI_COST_PER_1M } from '../config/in-tree-data.js';
import { CLI_NAMES, type CliNameLiteral } from '../config/model-capabilities-types.js';
import type { ModelTier } from './zero-router-types.js';

/** Canonical, deterministic CLI iteration order for stable tie-breaks. */
const CLI_ORDER: readonly CliNameLiteral[] = CLI_NAMES;

/** Per-CLI signal read from that CLI's default model. */
export interface CliModelData {
  /** Composite quality (reasoning+codeGeneration)/2, or undefined when the
   * default model has no qualityScores (fail-safe: rule 1). */
  readonly quality: number | undefined;
  /** Blended real price (input+output per 1M). A $0 blend is normalized to
   * {@link EXPENSIVE_SENTINEL} so it can never win the cost rank (rule 3). */
  readonly price: number;
  /** speed dimension (0-10), or undefined when unscored. */
  readonly speed: number | undefined;
}

/** Sentinel blended price for a $0 default: ranks as the MOST expensive. */
export const EXPENSIVE_SENTINEL = Number.MAX_SAFE_INTEGER;

/** Quality-rank / cost-rank output scale: best → 3, worst → 1 (matches the
 * legacy hand-tuned magnitude so downstream score boosts stay in range). */
const RANK_MAX = 3;
const RANK_MIN = 1;

function compositeQuality(reasoning: number, codeGeneration: number): number {
  return (reasoning + codeGeneration) / 2;
}

/**
 * Rule 3 guard: a $0 (or negative) blended price is normalized to
 * {@link EXPENSIVE_SENTINEL} so a genuine `:free` model or a $0/$0 catalog
 * artifact (#4209) is treated as the MOST expensive and can never win the cost
 * rank or the premium set.
 */
export function normalizeBlendedPrice(blended: number): number {
  return blended > 0 ? blended : EXPENSIVE_SENTINEL;
}

/** Read the per-CLI signal for each CLI's default model from leaf in-tree data. */
export function readCliModelData(): Record<CliNameLiteral, CliModelData> {
  const byId = new Map(buildInTreeEntries().map((e) => [e.id, e] as const));
  const out = {} as Record<CliNameLiteral, CliModelData>;
  for (const cli of CLI_ORDER) {
    const entry = byId.get(DEFAULT_MODEL_PER_CLI[cli]);
    const q = entry?.qualityScores;
    // Registry `Pricing` is {inputPer1M,outputPer1M}; the static fallback is
    // CostPer1M {input,output}. Blend each in its own shape (mirrors
    // buildTopsisProfiles) — an UNPRICED default stays conservative (#4168).
    const pricing = entry?.pricing;
    const blended =
      pricing !== undefined
        ? pricing.inputPer1M + pricing.outputPer1M
        : STATIC_CLI_COST_PER_1M[cli].input + STATIC_CLI_COST_PER_1M[cli].output;
    out[cli] = {
      quality: q !== undefined ? compositeQuality(q.reasoning, q.codeGeneration) : undefined,
      price: normalizeBlendedPrice(blended),
      speed: q?.speed,
    };
  }
  return out;
}

/** Linear-map a value in [min,max] onto [RANK_MIN,RANK_MAX]. Flat cohort → MAX. */
function scaleRank(value: number, min: number, max: number, invert: boolean): number {
  if (max === min) return RANK_MAX;
  const t = (value - min) / (max - min);
  const norm = invert ? 1 - t : t;
  return RANK_MIN + norm * (RANK_MAX - RANK_MIN);
}

/**
 * Quality rank per CLI (higher = stronger). Unscored CLIs (rule 1) get 0 —
 * strictly below every scored CLI — so they are never quality-boosted.
 */
export function buildQualityRank(
  data: Record<CliNameLiteral, CliModelData>
): Record<CliNameLiteral, number> {
  const scored = CLI_ORDER.map((c) => data[c].quality).filter((q): q is number => q !== undefined);
  const min = scored.length > 0 ? Math.min(...scored) : 0;
  const max = scored.length > 0 ? Math.max(...scored) : 0;
  const out = {} as Record<CliNameLiteral, number>;
  for (const cli of CLI_ORDER) {
    const q = data[cli].quality;
    out[cli] = q === undefined ? 0 : scaleRank(q, min, max, false);
  }
  return out;
}

/**
 * Cost-efficiency rank per CLI (higher = cheaper). Uses real registry pricing;
 * a $0 default is normalized to most-expensive upstream, so it ranks LOWEST
 * (rule 3) and can never look "cheapest-and-best".
 */
export function buildCostRank(
  data: Record<CliNameLiteral, CliModelData>
): Record<CliNameLiteral, number> {
  const prices = CLI_ORDER.map((c) => data[c].price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const out = {} as Record<CliNameLiteral, number>;
  for (const cli of CLI_ORDER) {
    // invert: cheaper (lower price) → higher rank.
    out[cli] = scaleRank(data[cli].price, min, max, true);
  }
  return out;
}

/** Best-first comparator factory with an explicit, deterministic tie-break. */
function byDescThen(
  primary: (c: CliNameLiteral) => number,
  secondary: (c: CliNameLiteral) => number
): (a: CliNameLiteral, b: CliNameLiteral) => number {
  return (a, b) => {
    const p = primary(b) - primary(a);
    if (p !== 0) return p;
    const s = secondary(b) - secondary(a);
    if (s !== 0) return s;
    return CLI_ORDER.indexOf(a) - CLI_ORDER.indexOf(b);
  };
}

/**
 * Ordered CLI preference list per tier (deterministic).
 *  - powerful: strongest quality first (tie-break: pricier/premium first);
 *    EXCLUDES unscored CLIs entirely (rule 1 + rule 2 composition).
 *  - fast: fastest first (tie-break: cheaper first).
 *  - balanced: best quality/cost blend first.
 */
export function buildTierToClis(
  data: Record<CliNameLiteral, CliModelData>
): Record<ModelTier, CliNameLiteral[]> {
  const quality = buildQualityRank(data);
  const cost = buildCostRank(data);
  const speed = (c: CliNameLiteral): number => data[c].speed ?? 0;
  const powerful = CLI_ORDER.filter((c) => data[c].quality !== undefined).sort(
    byDescThen(
      (c) => quality[c],
      (c) => data[c].price
    )
  );
  const fast = [...CLI_ORDER].sort(byDescThen(speed, (c) => cost[c]));
  const balanced = [...CLI_ORDER].sort(
    byDescThen(
      (c) => (quality[c] + cost[c]) / 2,
      (c) => cost[c]
    )
  );
  return { powerful, balanced, fast };
}

/**
 * Confidence profile per CLI. `complexScore` tracks quality (hard tasks want the
 * strongest model); `simpleScore` tracks speed (easy tasks want the fastest).
 * Both are 0-1. An unscored default gets the conservative floor 0 on quality.
 */
export function buildConfidenceProfiles(
  data: Record<CliNameLiteral, CliModelData>
): Record<CliNameLiteral, { simpleScore: number; complexScore: number }> {
  const out = {} as Record<CliNameLiteral, { simpleScore: number; complexScore: number }>;
  for (const cli of CLI_ORDER) {
    const datum = data[cli];
    out[cli] = {
      simpleScore: (datum.speed ?? 0) / 10,
      complexScore: (datum.quality ?? 0) / 10,
    };
  }
  return out;
}

/**
 * Premium ("strong") CLI set for preference routing: the most expensive
 * default(s) — the deliberate premium tier — among CLIs that HAVE qualityScores
 * (rule 1: an unscored / $0 default can never be premium). Deterministic: the
 * exact max real price. Everything else is "weak" (budget).
 */
export function buildPremiumClis(data: Record<CliNameLiteral, CliModelData>): CliNameLiteral[] {
  const eligible = CLI_ORDER.filter(
    (c) => data[c].quality !== undefined && data[c].price !== EXPENSIVE_SENTINEL
  );
  if (eligible.length === 0) return [];
  const maxPrice = Math.max(...eligible.map((c) => data[c].price));
  return eligible.filter((c) => data[c].price === maxPrice);
}

// ---------------------------------------------------------------------------
// Memoized public derivers (no-arg) — what the five routing consumers import.
// ---------------------------------------------------------------------------

let cachedData: Record<CliNameLiteral, CliModelData> | undefined;
function data(): Record<CliNameLiteral, CliModelData> {
  return (cachedData ??= readCliModelData());
}

/** @see buildQualityRank */
export function deriveCliQualityRank(): Record<CliNameLiteral, number> {
  return buildQualityRank(data());
}

/** @see buildCostRank */
export function deriveCliCostRank(): Record<CliNameLiteral, number> {
  return buildCostRank(data());
}

/** @see buildTierToClis */
export function deriveTierToClis(): Record<ModelTier, CliNameLiteral[]> {
  return buildTierToClis(data());
}

/** @see buildConfidenceProfiles */
export function deriveCliConfidenceProfiles(): Record<
  CliNameLiteral,
  { simpleScore: number; complexScore: number }
> {
  return buildConfidenceProfiles(data());
}

/** Premium ("strong") CLIs for preference routing. @see buildPremiumClis */
export function deriveStrongClis(): CliNameLiteral[] {
  return buildPremiumClis(data());
}

/** Budget ("weak") CLIs = everything not premium. */
export function deriveWeakClis(): CliNameLiteral[] {
  const strong = new Set(deriveStrongClis());
  return CLI_ORDER.filter((c) => !strong.has(c));
}
