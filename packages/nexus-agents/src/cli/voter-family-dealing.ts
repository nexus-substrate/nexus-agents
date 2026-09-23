/**
 * Family-first seat dealing for gateway voter panels (#6606).
 *
 * Seats used to be dealt round-robin over the gateway's LISTING order, so the
 * first N chat models took the panel. On a recorded three-family catalogue that
 * put 5 OpenAI, 2 Anthropic and 0 Google models on a 7-seat panel — listing
 * order is a property of the gateway, not of the models, and it decided how
 * independent the panel was.
 *
 * This deals each seat to the model FAMILY (vendor: Anthropic, OpenAI, Google,
 * ...) with the fewest seats so far, then to the least-used model inside that
 * family, best-ranked first (#6634). Seats already taken — operator pins — seed the counts, so the dealt
 * seats balance around them. Every tie is broken by a fixed order, so the
 * result does not depend on the order the gateway lists its models in.
 *
 * @module cli/voter-family-dealing
 */

import type { ILogger } from '../core/index.js';
import { canonicalModelKey, countDistinctModels } from '../config/model-equivalence.js';
import { resolveModelIdentitySync, type ModelVendor } from '../config/model-identity.js';
import { rankFamilyModels } from '../adapters/gateway-family-ranking.js';
import { createdOf } from '../adapters/gateway-family-slots.js';

/**
 * The family a model belongs to for panel dealing and diversity counting: its
 * vendor, from the canonical identity parser. `unknown` when the id names no
 * recognised vendor.
 */
export function vendorFamilyOf(modelId: string): ModelVendor {
  return resolveModelIdentitySync(modelId).vendor;
}

/**
 * Tie-break order between families holding equally many seats. The three
 * gateway families come first in a fixed order; other recognised vendors
 * follow alphabetically; `unknown` is always last, as its own group.
 */
const FAMILY_PRIORITY: readonly ModelVendor[] = ['anthropic', 'openai', 'google'];

function compareFamilies(a: ModelVendor, b: ModelVendor): number {
  const rank = (f: ModelVendor): number => {
    if (f === 'unknown') return Number.MAX_SAFE_INTEGER;
    const i = FAMILY_PRIORITY.indexOf(f);
    return i === -1 ? FAMILY_PRIORITY.length : i;
  };
  return rank(a) - rank(b) || a.localeCompare(b);
}

/**
 * Default within-family order (#6634): #6623's `rankFamilyModels`, best-first:
 * tier, then the discovery `created` stamp each candidate carries (used only
 * when every model of the family has one), then the id's generation, with the
 * id as the last tie-break. The ranking is total over the ids, so the order
 * does not depend on the order the gateway lists its models in.
 */
function rankedOrder(candidates: readonly { readonly modelId: string }[]): readonly string[] {
  return rankFamilyModels(candidates.map((c) => ({ id: c.modelId, created: createdOf(c) })));
}

interface DealOptions {
  /** Model ids already seated (pins); they seed the family and model counts. */
  readonly seated?: readonly string[];
  /** Orders one family's model ids best-first. Defaults to #6623's family ranking. */
  readonly rankWithinFamily?: (modelIds: readonly string[]) => readonly string[];
}

/** Identity key for "same model": canonical when resolvable, raw otherwise (#4390). */
function identityKey(modelId: string): string {
  return canonicalModelKey(modelId) ?? `raw:${modelId}`;
}

function increment(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/** Groups candidates by family, each family ordered by the ranking seam. */
function groupByFamily<T extends { readonly modelId: string }>(
  candidates: readonly T[],
  rank: (familyCandidates: readonly T[]) => readonly string[]
): Map<ModelVendor, T[]> {
  const byFamily = new Map<ModelVendor, T[]>();
  for (const c of candidates) {
    const family = vendorFamilyOf(c.modelId);
    const list = byFamily.get(family) ?? [];
    list.push(c);
    byFamily.set(family, list);
  }
  for (const [family, list] of byFamily) {
    const order = rank(list);
    const position = (c: T): number => {
      const i = order.indexOf(c.modelId);
      return i === -1 ? order.length : i;
    };
    // Ties (an id the ranker dropped, or a duplicate id) fall back to lexical.
    byFamily.set(
      family,
      [...list].sort((a, b) => position(a) - position(b) || a.modelId.localeCompare(b.modelId))
    );
  }
  return byFamily;
}

/** The family with the fewest seats; ties by {@link compareFamilies}. */
function leastSeatedFamily(
  families: readonly ModelVendor[],
  seats: Map<string, number>
): ModelVendor {
  let best = families[0] as ModelVendor;
  for (const f of families.slice(1)) {
    const diff = (seats.get(f) ?? 0) - (seats.get(best) ?? 0);
    if (diff < 0 || (diff === 0 && compareFamilies(f, best) < 0)) best = f;
  }
  return best;
}

/**
 * Within a family: the model whose IDENTITY is least seated, then the model id
 * least seated, then rank order. Identity first, so two strings for one model
 * (`gpt-4o`, `openai/gpt-4o`) do not both take seats while a different model
 * sits idle.
 */
function leastSeatedModel<T extends { readonly modelId: string }>(
  ranked: readonly T[],
  identitySeats: Map<string, number>,
  idSeats: Map<string, number>
): T {
  let best = ranked[0] as T;
  const score = (c: T): [number, number] => [
    identitySeats.get(identityKey(c.modelId)) ?? 0,
    idSeats.get(c.modelId) ?? 0,
  ];
  for (const c of ranked.slice(1)) {
    const [ci, cm] = score(c);
    const [bi, bm] = score(best);
    if (ci < bi || (ci === bi && cm < bm)) best = c;
  }
  return best;
}

/**
 * Deal `seatCount` seats over `candidates`, families first. Returns one
 * candidate per seat, in seat order. Zero seats or zero candidates deal
 * nothing — an empty array, which the caller must treat as "no assignment".
 */
export function dealSeatsAcrossFamilies<T extends { readonly modelId: string }>(
  seatCount: number,
  candidates: readonly T[],
  options: DealOptions = {}
): T[] {
  if (seatCount <= 0 || candidates.length === 0) return [];
  const custom = options.rankWithinFamily;
  const rank = (list: readonly T[]): readonly string[] =>
    custom === undefined ? rankedOrder(list) : custom(list.map((c) => c.modelId));
  const byFamily = groupByFamily(candidates, rank);
  const families = [...byFamily.keys()].sort(compareFamilies);

  const familySeats = new Map<string, number>();
  const identitySeats = new Map<string, number>();
  const idSeats = new Map<string, number>();
  const seat = (modelId: string): void => {
    increment(familySeats, vendorFamilyOf(modelId));
    increment(identitySeats, identityKey(modelId));
    increment(idSeats, modelId);
  };
  for (const pinned of options.seated ?? []) seat(pinned);

  const dealt: T[] = [];
  for (let i = 0; i < seatCount; i++) {
    const family = leastSeatedFamily(families, familySeats);
    const chosen = leastSeatedModel(byFamily.get(family) ?? [], identitySeats, idSeats);
    dealt.push(chosen);
    seat(chosen.modelId);
  }
  return dealt;
}

/**
 * #6606: a panel on several models of ONE family is still one vendor's
 * judgement. Warn when every assigned model is of the same recognised family;
 * unknown-vendor models cannot be judged either way and do not trigger it.
 */
export function warnIfSingleFamily(
  roleCount: number,
  assignedModels: readonly string[],
  logger: ILogger
): void {
  const families = new Set(assignedModels.map(vendorFamilyOf));
  const [family] = families;
  if (roleCount > 1 && families.size === 1 && family !== undefined && family !== 'unknown') {
    logger.warn('Consensus panel collapsed to a single model family — votes may correlate', {
      family,
      distinctModels: countDistinctModels(assignedModels),
      roleCount,
    });
  }
}
