/**
 * nexus-agents/mcp - Weather Report routing arms
 *
 * The arm sets the weather report reads outcome rows by (#6574). Since #6554 a
 * routed API run records its arm id (`api:anthropic`), not its CLI slot, so a
 * reader that iterates CLI slots alone misses those rows. Two ways to read
 * them, chosen by what the reader's consumer does:
 *
 * - a consumer that routes by CLI slot (adaptive bonuses, recommended
 *   mappings) folds each arm into its slot through {@link rowsOfSlot};
 * - a report keeps the arms apart and iterates {@link ROUTED_ARMS}, as
 *   `analyzeCategoryRouting` does.
 *
 * @module mcp/tools/weather-report-arms
 */

import type { TaskOutcome } from '../../orchestration/outcomes/outcome-types.js';
import { CLI_NAMES } from '../../config/model-capabilities-types.js';
import {
  ApiArmIdSchema,
  routingArmDisplaySlot,
  type RoutingArmId,
} from '../../cli-adapters/types-core.js';

/** CLI slots plus API arms: every `cli` an attributed outcome row can carry (#6552). */
export const ROUTED_ARMS: readonly RoutingArmId[] = [...CLI_NAMES, ...ApiArmIdSchema.options];

/**
 * Per CLI slot, the arms whose rows count toward it: the slot itself plus each
 * `api:*` arm {@link routingArmDisplaySlot} maps to it. Derived from that
 * mapping, never restated, so a new API vendor folds without an edit here.
 */
const SLOT_ARMS: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  CLI_NAMES.map((slot) => [
    slot,
    new Set<string>(ROUTED_ARMS.filter((arm) => routingArmDisplaySlot(arm) === slot)),
  ])
);

/**
 * Rows of `outcomes` recorded under `slot` or under one of its API arms.
 * An unknown slot has no arms, so it matches no row.
 */
export function rowsOfSlot(outcomes: readonly TaskOutcome[], slot: string): readonly TaskOutcome[] {
  const arms = SLOT_ARMS.get(slot);
  if (arms === undefined) return [];
  return outcomes.filter((o) => arms.has(o.cli));
}
