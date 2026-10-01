/**
 * Model → CLI ownership: the one place that answers "which CLI serves this
 * model?" (#6866).
 *
 * Two questions, deliberately kept apart:
 *
 * - {@link resolveOwnerCli} — CONFIDENT ownership. The registry entry the id
 *   resolves to EXACTLY (canonical id or alias, any tier), then its `cliName`,
 *   else the in-tree owner of that entry's id or of an id it aliases. A
 *   manifest overlay replaces the whole entry and carries no `cliName`, so the
 *   in-tree fallback keeps a re-priced, re-aliased or re-pointed model
 *   attributed. Fuzzy-matched and derived ids are not owned: the registry
 *   grants them pricing only, never a CLI.
 * - {@link resolveCliSlot} — the ROUTING slot: the owner, else the slot of the
 *   entry's declared `vendor` (`opencode` as the catch-all). Never undefined
 *   for a non-empty id, so outcome recording always has a slot.
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
import type { ModelVendor } from './model-identity.js';

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
 * Confident owner of an already-resolved registry entry: its `cliName`, else
 * the in-tree owner of its id or of any id it aliases. An overlay entry that
 * aliases an in-tree id REPLACES that model in the registry (the alias shadow
 * is dropped, #3293), and routing then sends the overlay model through the
 * replaced model's CLI — `getDefaultModelForCli` returns the resolved id and
 * the codex adapter sends `getCliModelName(getDefaultModelForCli('codex'))`.
 * So the replacement inherits that owner. Keys owned by two CLIs leave the
 * entry unowned (fail closed) and its vendor decides the slot.
 */
function ownerOfEntry(
  entry: Pick<ModelEntry, 'id' | 'cliName' | 'aliases'>
): CliNameLiteral | undefined {
  if (isCliName(entry.cliName)) return entry.cliName;
  const owners = new Set<CliNameLiteral>();
  for (const key of [entry.id, ...(entry.aliases ?? [])]) {
    const owner = inTreeOwner(key);
    if (owner !== undefined) owners.add(owner);
  }
  // Empty: nothing in-tree owns it. Two or more: ambiguous, so not confident.
  return owners.size === 1 ? [...owners][0] : undefined;
}

/**
 * Routing slot of a resolved entry: its confident owner, else the slot of the
 * entry's `vendor` (required on every `ModelEntry`; an overlay declares it,
 * a derived entry takes it from the id), `opencode` as the catch-all.
 */
function slotOfEntry(entry: ModelEntry): CliNameLiteral {
  return ownerOfEntry(entry) ?? VENDOR_TO_CLI_SLOT[entry.vendor] ?? 'opencode';
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
 * Resolve a model string to a canonical `CliName` slot for routing/outcome
 * recording: the resolved entry's confident owner, else its vendor's slot.
 * Returns undefined only for an absent model (no execution happened).
 */
export function resolveCliSlot(model: string | undefined): CliNameLiteral | undefined {
  if (model === undefined || model === '') return undefined;
  return slotOfEntry(getDefaultRegistry().getEntry(model));
}

/**
 * The CLI whose unpriced estimate a registry entry's price bounds: the routing
 * slot for an operator-declared entry, the confident owner otherwise.
 */
export function pricingSiblingCli(entry: ModelEntry): CliNameLiteral | undefined {
  return entry.source === 'manifest' ? slotOfEntry(entry) : ownerOfEntry(entry);
}
