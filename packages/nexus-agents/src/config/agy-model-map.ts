/**
 * Antigravity CLI transport names, separate from Google's API model IDs.
 * `cliModelName` is also consumed by the Google API adapter and must retain
 * API identifiers. Native availability here was measured with `agy models`
 * on 1.3.5 (2026-10-15); the captured table is regression-tested (#7423).
 * Enumeration is availability evidence, not auth, pricing or permission proof.
 * @module config/agy-model-map
 */
import { findCanonicalModel } from './model-config-helpers.js';

/** Supported Gemini-family native pins; other AGY families use other arms. */
export const AGY_MODEL_SLUGS = [
  'gemini-4-argon-high',
  'gemini-4-argon-medium',
  'gemini-4-argon-low',
  'gemini-3.8-flash-high',
  'gemini-3.8-flash-medium',
  'gemini-3.8-flash-low',
] as const;
export type AgyModelSlug = (typeof AGY_MODEL_SLUGS)[number];

const AGY_FLASH_CANONICAL_MODEL = 'gemini-3.8-flash';
const AGY_ARGON_CANONICAL_MODEL = 'gemini-4-argon';

/** Explicit model migration and effort tier mappings, never substitutes for Pro. */
const CANONICAL_TO_AGY: Readonly<Record<string, AgyModelSlug>> = {
  [AGY_ARGON_CANONICAL_MODEL]: 'gemini-4-argon-high',
  'gemini-4-argon-high': 'gemini-4-argon-high',
  'gemini-4-argon-medium': 'gemini-4-argon-medium',
  'gemini-4-argon-low': 'gemini-4-argon-low',
  [AGY_FLASH_CANONICAL_MODEL]: 'gemini-3.8-flash-high',
  'gemini-3.7-flash': 'gemini-3.8-flash-high',
  'gemini-3.5-flash': 'gemini-3.8-flash-medium',
  'gemini-3-flash': 'gemini-3.8-flash-low',
  'gemini-flash': 'gemini-3.8-flash-low',
};

/** Every native effort tier describes the selected model, not a migrated alias. */
const AGY_TO_CANONICAL: ReadonlyMap<string, string> = new Map([
  ['gemini-4-argon-high', AGY_ARGON_CANONICAL_MODEL],
  ['gemini-4-argon-medium', AGY_ARGON_CANONICAL_MODEL],
  ['gemini-4-argon-low', AGY_ARGON_CANONICAL_MODEL],
  ['gemini-3.8-flash-high', AGY_FLASH_CANONICAL_MODEL],
  ['gemini-3.8-flash-medium', AGY_FLASH_CANONICAL_MODEL],
  ['gemini-3.8-flash-low', AGY_FLASH_CANONICAL_MODEL],
]);

/** Selected canonical identity; unknown/retired native names remain unknown. */
export function fromAgyModelSlug(slug: string): string | null {
  return AGY_TO_CANONICAL.get(slug) ?? null;
}

/** Default native selection. Unsupported explicit pins do not fall back to it. */
export const DEFAULT_AGY_MODEL: AgyModelSlug = 'gemini-3.8-flash-high';

/** Whether a string is a supported native Gemini pin. */
export function isAgyModelSlug(value: string): value is AgyModelSlug {
  return (AGY_MODEL_SLUGS as readonly string[]).includes(value);
}

/**
 * Resolve an exact native pin or an explicitly supported Flash-family alias.
 * Pro, unknown and retired native pins fail before subprocess dispatch rather
 * than silently changing the requested model family. Google API aliases are
 * resolved through the canonical registry, whose IDs are left unchanged.
 */
export function toAgyModelSlug(model: string): AgyModelSlug {
  if (isAgyModelSlug(model)) return model;
  const canonical = Object.hasOwn(CANONICAL_TO_AGY, model)
    ? model
    : findCanonicalModel('gemini', model)?.id;
  const slug =
    canonical !== undefined && Object.hasOwn(CANONICAL_TO_AGY, canonical)
      ? CANONICAL_TO_AGY[canonical]
      : undefined;
  if (slug !== undefined) return slug;
  throw new Error(
    `Unsupported AGY model ${JSON.stringify(model)}; choose an advertised native pin from agy models or use the Google API for Pro.`
  );
}
