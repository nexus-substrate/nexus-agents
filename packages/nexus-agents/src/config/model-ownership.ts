/**
 * Model → CLI ownership: the one place that answers "which CLI serves this
 * model?" (#6866).
 *
 * Two questions, deliberately kept apart:
 *
 * - {@link resolveOwnerCli} — CONFIDENT ownership. The registry entry the id
 *   resolves to EXACTLY (canonical id or alias, any tier), then its `cliName`,
 *   else the in-tree owner of that entry's canonical id. A manifest overlay
 *   replaces the whole entry and carries no `cliName`, so the in-tree fallback
 *   keeps a re-priced or re-aliased model attributed. Fuzzy-matched and derived
 *   ids are not owned: the registry grants them pricing only, never a CLI.
 * - {@link resolveCliSlot} — the ROUTING slot: the owner, else the slot the id's
 *   vendor routes to (`opencode` as the catch-all). Never undefined for a
 *   non-empty id, so outcome recording always has a slot.
 *
 * `getCliForModelId` (and through it `confidentCliSlot`, fallback chains and
 * outcome attribution) uses the confident answer: those callers either act on
 * the CLI's own fallback chain or promise never to guess. Pricing siblings use
 * the routing slot for operator-declared (`manifest`) entries — a model the
 * operator added is routed and recorded under that slot, so its price must
 * bound the slot's unpriced estimate — and the confident owner for every other
 * tier, so the models.dev / generated catalogues (thousands of entries nobody
 * declared as served here) never enter a CLI's bound.
 *
 * @module config/model-ownership
 */

import { CLI_NAMES, type CliNameLiteral } from './model-capabilities-types.js';
import { getDefaultRegistry, type ModelEntry } from './model-registry.js';
import { DEFAULT_MODEL_CAPABILITIES } from './in-tree-data.js';
import { resolveModelIdentitySync, type ModelVendor } from './model-identity.js';

/** Narrow a registry `cliName` string to a canonical CLI slot. */
function isCliName(value: string | undefined): value is CliNameLiteral {
  return value !== undefined && (CLI_NAMES as readonly string[]).includes(value);
}

/**
 * The in-tree owner of a canonical id. Matches in-tree aliases too, because an
 * overlay may be keyed by an id the in-tree matrix lists as an alias; the
 * registry then returns the overlay entry under that id.
 */
function inTreeOwner(canonicalId: string): CliNameLiteral | undefined {
  const owner = DEFAULT_MODEL_CAPABILITIES.models.find(
    (m) => m.id === canonicalId || (m.aliases ?? []).includes(canonicalId)
  )?.cliName;
  return isCliName(owner) ? owner : undefined;
}

/** Confident owner of an already-resolved registry entry. */
function ownerOfEntry(entry: Pick<ModelEntry, 'id' | 'cliName'>): CliNameLiteral | undefined {
  return isCliName(entry.cliName) ? entry.cliName : inTreeOwner(entry.id);
}

/**
 * The CLI that confidently serves `modelId`, or undefined. See the module doc
 * for why fuzzy and derived matches are excluded.
 */
export function resolveOwnerCli(modelId: string): CliNameLiteral | undefined {
  // A fuzzy or derived entry keeps the CALLER's id and drops `cliName`, so the
  // in-tree lookup below misses it: no separate guard is needed.
  return ownerOfEntry(getDefaultRegistry().getEntry(modelId));
}

/**
 * Vendor → canonical `CliName` slot, for models with no confident owner
 * (brand-new releases, or API/openrouter models). Keeps the routing/outcome/
 * tune pipeline keyed on a real slot instead of dropping the outcome (#3317 /
 * #3293). `opencode` is the multi-model catch-all slot for non-big-3 vendors.
 */
const VENDOR_TO_CLI_SLOT: Partial<Record<ModelVendor, CliNameLiteral>> = {
  anthropic: 'claude',
  google: 'gemini',
  openai: 'codex',
};

/**
 * Resolve a model string to a canonical `CliName` slot for routing/outcome
 * recording: its confident owner, else the slot derived from the id's vendor.
 * Returns undefined only for an absent model (no execution happened).
 */
export function resolveCliSlot(model: string | undefined): CliNameLiteral | undefined {
  if (model === undefined || model === '') return undefined;
  const owner = resolveOwnerCli(model);
  if (owner !== undefined) return owner;
  const { vendor } = resolveModelIdentitySync(model);
  return VENDOR_TO_CLI_SLOT[vendor] ?? 'opencode';
}

/**
 * The CLI whose unpriced estimate a registry entry's price bounds: the routing
 * slot for an operator-declared entry, the confident owner otherwise.
 */
export function pricingSiblingCli(entry: ModelEntry): CliNameLiteral | undefined {
  return entry.source === 'manifest' ? resolveCliSlot(entry.id) : ownerOfEntry(entry);
}
