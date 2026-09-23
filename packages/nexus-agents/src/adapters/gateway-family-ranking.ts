/**
 * Best-first ranking of one family's gateway models (#6604; layers 1-2 of
 * #6625). Sort key, in order:
 *
 * 1. TIER, flagship first: flagship (opus, pro, ultra, and an unmarked id such
 *    as `gpt-5.5` or `o3`), then mid (sonnet, mini, flash), then small (haiku,
 *    nano, lite, including flash-lite). A newer mini never beats a flagship.
 * 2. A vendor `-latest` alias within the tier.
 * 3. Recency from discovery METADATA: the OpenAI-spec `/models` `created`
 *    stamp. It is used only when EVERY model being ranked carries a positive
 *    one; comparing it for some pairs and not others would make the order
 *    depend on the input order.
 * 4. Fallback when `created` does not decide: the generation parsed from the
 *    id, newest first (`claude-opus-4-6` over `claude-opus-4-1`). A date stamp
 *    in the id (`20240307`, `2024-08-06`) is a snapshot label, never a
 *    generation: `claude-3-haiku-20240307` used to outrank `claude-opus-4-6`
 *    because `20240307 > 4`.
 * 5. Registry quality (`reasoning + codeGeneration`), looked up under the id
 *    and its dot/dash respelling (`claude-sonnet-4.6` / `claude-sonnet-4-6`).
 * 6. The id's date stamp, newest first; an undated id counts as oldest.
 * 7. The id, so the order is total and deterministic.
 *
 * OpenAI's o-series has no gpt number, so its generation is placed on the
 * gpt-4 line after gpt-4.5: `o1` as 4.6, `o3` as 4.8, `o4` as 4.9. `gpt-5*`
 * therefore outranks all of them within a tier, and `o4-mini` is mid tier.
 *
 * @module adapters/gateway-family-ranking
 */

import { normaliseModelId } from '../config/model-identity.js';
import { getDefaultRegistry } from '../config/model-registry.js';

/** o-series number → its place on the gpt-4 line (see the module doc). */
const O_SERIES_MINOR: Readonly<Record<string, number>> = { '1': 6, '3': 8, '4': 9 };

const SMALL_TIER = /^(haiku|nano|lite|tiny|small)$/;
const MID_TIER = /^(sonnet|mini|flash|medium)$/;
const TIER_FLAGSHIP = 3;
const TIER_MID = 2;
const TIER_SMALL = 1;

/** One model to rank: its id, and the `/models` `created` stamp when listed. */
export interface RankableModel {
  readonly id: string;
  /** Unix epoch seconds from discovery; absent or non-positive means unknown. */
  readonly created?: number | undefined;
}

interface RankKey {
  readonly id: string;
  readonly created: number | undefined;
  readonly latest: boolean;
  /** Generation segments with dates removed; empty when none parsed. */
  readonly generation: readonly number[];
  readonly tier: number;
  readonly quality: number | undefined;
  /** `yyyymmdd` as a number, or 0 when the id carries no date. */
  readonly date: number;
}

/** Split an id into lowercase tokens on every separator gateways use. */
function tokensOf(id: string): string[] {
  return normaliseModelId(id)
    .replace(/[.:]/g, '-')
    .split('-')
    .filter((t) => t !== '');
}

/** A `yyyymmdd` token, or `yyyy` followed by `mm` (and optionally `dd`). */
function dateAt(tokens: readonly string[], i: number): { value: number; width: number } | null {
  const t = tokens[i] ?? '';
  if (/^(19|20)\d{6}$/.test(t)) return { value: Number(t), width: 1 };
  if (!/^(19|20)\d{2}$/.test(t)) return null;
  const mm = tokens[i + 1] ?? '';
  if (!/^\d{2}$/.test(mm)) return null;
  const dd = /^\d{2}$/.test(tokens[i + 2] ?? '') ? (tokens[i + 2] ?? '') : '00';
  return { value: Number(`${t}${mm}${dd}`), width: dd === '00' ? 2 : 3 };
}

/** Numeric segments of one token: `4` → [4], `4o` → [4, 0], `o3` → o-series. */
function generationOfToken(token: string): number[] | null {
  const oSeries = /^o(\d)$/.exec(token);
  if (oSeries !== null) {
    const minor = O_SERIES_MINOR[oSeries[1] ?? ''];
    return minor === undefined ? null : [4, minor];
  }
  if (/^\d{1,2}$/.test(token)) return [Number(token)];
  if (/^\d{1,2}o$/.test(token)) return [Number(token.slice(0, -1)), 0];
  return null;
}

/** The tier a token marks, or undefined for a token that marks none. */
function tierOfToken(token: string): number | undefined {
  if (SMALL_TIER.test(token)) return TIER_SMALL;
  if (MID_TIER.test(token)) return TIER_MID;
  return undefined;
}

/** Parse the rank fields of an id. A `v<N>` token ends the name (Bedrock `-v1:0`). */
function parseId(id: string): Pick<RankKey, 'generation' | 'tier' | 'date' | 'latest'> {
  const tokens = tokensOf(id);
  const generation: number[] = [];
  let tier = TIER_FLAGSHIP;
  let date = 0;
  let latest = false;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] ?? '';
    if (/^v\d+$/.test(token)) break;
    const d = dateAt(tokens, i);
    if (d !== null) {
      date = d.value;
      i += d.width - 1;
      continue;
    }
    if (token === 'latest') latest = true;
    tier = Math.min(tier, tierOfToken(token) ?? TIER_FLAGSHIP);
    const segments = generationOfToken(token);
    if (segments !== null) generation.push(...segments);
  }
  return { generation, tier, date, latest };
}

/** Registry quality under the id or its dot/dash respelling; undefined when unscored. */
function registryQuality(id: string): number | undefined {
  const registry = getDefaultRegistry();
  const spellings = [id, id.replace(/(\d)\.(\d)/g, '$1-$2'), id.replace(/(\d)-(\d)/g, '$1.$2')];
  for (const spelling of spellings) {
    const q = registry.getEntry(spelling).qualityScores;
    if (q !== undefined) return q.reasoning + q.codeGeneration;
  }
  return undefined;
}

/** Descending comparison of segment lists; a missing segment sorts lower. */
function compareSegmentsDesc(a: readonly number[], b: readonly number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = (b[i] ?? -1) - (a[i] ?? -1);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Metadata recency, newer first; 0 when the stamps are unknown (see `rankFamilyModels`). */
function compareCreatedDesc(a: RankKey, b: RankKey): number {
  if (a.created === undefined || b.created === undefined) return 0;
  return b.created - a.created;
}

/** Tie-breakers after recency: registry quality, id date, then the id itself. */
function compareTieBreakers(a: RankKey, b: RankKey): number {
  const byQuality = (b.quality ?? -1) - (a.quality ?? -1);
  if (byQuality !== 0) return byQuality;
  if (a.date !== b.date) return b.date - a.date;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function compareKeys(a: RankKey, b: RankKey): number {
  if (a.tier !== b.tier) return b.tier - a.tier;
  if (a.latest !== b.latest) return a.latest ? -1 : 1;
  const byCreated = compareCreatedDesc(a, b);
  if (byCreated !== 0) return byCreated;
  const byGeneration = compareSegmentsDesc(a.generation, b.generation);
  if (byGeneration !== 0) return byGeneration;
  return compareTieBreakers(a, b);
}

/** A usable `created` stamp: finite and positive, else unknown. */
function knownCreated(created: number | undefined): number | undefined {
  return created !== undefined && Number.isFinite(created) && created > 0 ? created : undefined;
}

/** Rank one family's models best-first. See the module doc for the key. */
export function rankFamilyModels(models: readonly RankableModel[]): readonly string[] {
  // Metadata recency only when every model has a stamp; with an empty list
  // there is nothing to rank and the flag is never read.
  const useCreated = models.every((m) => knownCreated(m.created) !== undefined);
  return models
    .map((m): RankKey => ({
      id: m.id,
      created: useCreated ? knownCreated(m.created) : undefined,
      ...parseId(m.id),
      quality: registryQuality(m.id),
    }))
    .sort(compareKeys)
    .map((k) => k.id);
}
