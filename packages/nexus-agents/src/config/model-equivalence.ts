/**
 * nexus-agents/config - Canonical model equivalence
 *
 * Answers "are these two model strings the same underlying model?" (#4390).
 *
 * The same weights are reachable through several gateways under different
 * strings — `claude-sonnet-4-6` via the claude CLI,
 * `anthropic/claude-sonnet-4-6` via opencode, `custom/claude-sonnet-4-6` via an
 * OpenAI-compatible endpoint. Comparing those strings directly makes one model
 * look like three, which is why the consensus panel's diversity check could not
 * see two roles running identical weights, and why cost rollup prices one model
 * as several.
 *
 * Measured context for why this matters at all: of 2,955 distinct model ids on
 * models.dev, 943 are served by more than one provider. `claude-sonnet-4-6`
 * alone is served by 19.
 *
 * @module config/model-equivalence
 */

import { resolveModelIdentitySync } from './model-identity.js';

/**
 * A key that is equal for two model strings iff they denote the same model, or
 * `null` when the model cannot be identified.
 *
 * `null` is deliberate rather than a sentinel string. A bare alias like
 * `sonnet` — which the claude CLI adapter really can report — resolves to
 * `unknown` vendor and family. If unidentifiable models shared a key they would
 * compare EQUAL to each other, so two genuinely different models would be
 * called the same. That is the inverse of the bug this module fixes, and the
 * worse direction: it would silence a diversity warning that should fire.
 *
 * Gateway prefixes are handled by `resolveModelIdentitySync`, which normalises
 * `/` to `-` and matches vendor/family with unanchored patterns. That behaviour
 * is incidental to its design but is test-covered for the prefixed form.
 */
export function canonicalModelKey(modelId: string): string | null {
  if (modelId === '') return null;
  const identity = resolveModelIdentitySync(modelId);
  if (identity.vendor === 'unknown' || identity.family === 'unknown') return null;
  return `${identity.vendor}|${identity.family}|${identity.version ?? ''}`;
}

/**
 * How many genuinely distinct models a set of model strings represents.
 *
 * Unidentifiable entries are counted by their raw string: two adapters
 * configured with the same unrecognised model ARE the same adapter config, but
 * two different unrecognised strings must never be assumed equivalent.
 */
export function countDistinctModels(modelIds: readonly string[]): number {
  const distinct = new Set<string>();
  for (const id of modelIds) {
    const key = canonicalModelKey(id);
    // Prefix the raw fallback so an unresolvable string can never collide with
    // a resolved key.
    distinct.add(key ?? `raw:${id}`);
  }
  return distinct.size;
}

/**
 * What a {@link ResilientAdapter} reports as its `modelId` before lazy
 * detection (#811) resolves a concrete CLI behind it.
 *
 * It is a placeholder, not a model. The distinction matters because
 * {@link countDistinctModels} treats two identical unrecognised strings as one
 * model — true of two adapters configured alike, false of two adapters that
 * have merely not looked yet.
 */
export const UNRESOLVED_MODEL_ID = 'pending-detection';

/**
 * Whether a voter panel's roles run on genuinely different models.
 *
 * `unmeasured` is a distinct outcome rather than a defaulted `diverse` or
 * `collapsed`: a panel nobody could measure is not a healthy panel and not a
 * correlated one, and reporting either would be inventing a measurement
 * (#4983).
 */
export type PanelIndependence =
  | { readonly kind: 'unmeasured'; readonly unresolved: number; readonly total: number }
  | { readonly kind: 'collapsed'; readonly model: string }
  | { readonly kind: 'diverse'; readonly distinct: number };

/**
 * Classifies a panel from the model ids its role adapters report.
 *
 * Any unresolved id makes the whole panel unmeasured. Concluding from the
 * resolved subset would be guessing: two resolved ids that collide say nothing
 * about the arm that has not reported yet.
 */
export function assessPanelIndependence(
  modelIds: readonly (string | undefined)[]
): PanelIndependence {
  // `undefined` is in the input type because real adapters supply it: the
  // interface declares `modelId: string`, but an adapter constructed without
  // one reports undefined at runtime, and this runs AFTER the votes are in —
  // a diagnostic that throws here would discard a completed panel's results.
  const resolved = modelIds.filter(
    (id): id is string => typeof id === 'string' && id !== '' && id !== UNRESOLVED_MODEL_ID
  );
  const unresolved = modelIds.length - resolved.length;
  // An empty panel is unmeasured, not diverse — `countDistinctModels([])` is 0,
  // which would otherwise slip past the `=== 1` collapse test and report the
  // absence of any adapter as a healthy spread.
  if (unresolved > 0 || modelIds.length === 0) {
    return { kind: 'unmeasured', unresolved, total: modelIds.length };
  }
  const distinct = countDistinctModels(resolved);
  if (distinct === 1) return { kind: 'collapsed', model: resolved[0] ?? '' };
  return { kind: 'diverse', distinct };
}
