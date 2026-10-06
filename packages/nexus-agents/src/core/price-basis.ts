/**
 * nexus-agents/core - Price-basis vocabulary (#4406)
 *
 * The kind of rate a recorded dollar figure rests on, defined ONCE for both
 * consumers: the pricing chain (`core/trace-pricing.ts`, which turns a model id
 * into a cost) and the persisted decision-cost records
 * (`observability/decision-cost.ts`, which have to transport the basis into
 * JSONL and an MCP `outputSchema`).
 *
 * WHY A SEPARATE LEAF MODULE. `core/trace-pricing` pulls in the model registry,
 * and a runtime edge from `observability/decision-cost` to it closes a cycle
 * back through weather-report → decision-cost-store → decision-cost, which left
 * the zod schema `undefined` at evaluation time. The first fix was a type-only
 * import plus a hand-written `['list', 'unknown'] as const satisfies readonly
 * PriceBasis[]` mirror in decision-cost.ts. That mirror was a data-loss hazard:
 * `satisfies` rejects a member being RENAMED or DROPPED but happily accepts the
 * union GAINING one, so an added member would compile, fail validation at the
 * persistence boundary, and make `JsonlStore` reject the ENTIRE decision record
 * — `append` returning `persisted: false`, and on read the line skipped with
 * only an aggregate debug count. Governance and billing data lost wholesale
 * over one unrecognised field value.
 *
 * This module has no imports beyond zod, so both sides can import it at runtime
 * without a cycle, and the duplication is gone rather than merely guarded: the
 * schema is the single definition and the TypeScript union is DERIVED from it,
 * so a new member cannot be added to one and not the other.
 *
 * @module core/price-basis
 * (Source: Issue #4406)
 */

import { z } from 'zod';

/**
 * The vocabulary itself. Members:
 *
 * - `'list'` — a registry-chain rate, read as an assumed published rate;
 *   the fuzzy-match caveat on {@link PriceBasis} applies.
 * - `'declared'` — an operator-asserted manifest-overlay price (#4600) or
 *   `NEXUS_GATEWAY_COST` statement: `priced:<in>,<out>`, `free`, or `local`
 *   (#6664). The assertion does not verify the vendor's billing rate.
 * - `'unknown'` — no price was resolved for this model. Read it as "the chain
 *   produced nothing", not "no price exists in the world": the generated
 *   catalog loader (`config/models-generated-loader.ts`) deliberately discards
 *   a published $0/$0 rate unless the id ends `:free`, so a genuinely free
 *   model can land here.
 *
 * Deriving the type from the schema (rather than the reverse) is what keeps the
 * runtime validator and the compile-time union from drifting.
 */
export const PriceBasisSchema = z.enum(['list', 'declared', 'unknown']);

/**
 * Where a price came from, so a consumer can caveat it honestly (#4406).
 *
 * `'list'` is an ASSUMPTION about the pricing chain, not a verified property
 * of the number. Most tiers supply vendors' advertised public rates. The
 * normalized/fuzzy identity tier (`config/model-registry.ts`
 * `mergeMatchedWithDerived`) can grant a decorated gateway id the pricing of
 * a DIFFERENT canonical entry it matched, so a resolved published rate need
 * not belong to the id being priced.
 *
 * The manifest overlay (`config/manifest-overlay.ts`) is the highest pricing
 * tier. A price supplied there reports `'declared'`, using the existing
 * `source: 'manifest'` provenance, including through a fuzzy match's
 * `resolvedFrom`. Metadata-only overlays do not declare an inherited rate.
 *
 * Explicit `NEXUS_GATEWAY_COST` rates (`priced:<in>,<out>`, `free`, `local`)
 * also report `'declared'`, including measured zero. Bare `priced` delegates
 * to the registry and inherits its basis. Missing or invalid declarations
 * remain `'unknown'`. `'unknown'` does not claim that no price exists; see
 * the loader caveat above.
 *
 * There is deliberately no `'contract'` member: manifest-overlay prices use
 * the existing `'declared'` label for operator assertions, whether negotiated
 * or otherwise. Neither declaration path verifies an account's contract.
 * Reusing this vocabulary preserves older JSONL readers and MCP output schemas.
 */
export type PriceBasis = z.infer<typeof PriceBasisSchema>;

/**
 * Human-readable caveat for a {@link PriceBasis}, for surfaces that show a cost
 * to a person. Keeps the wording in one place rather than restated per caller.
 *
 * Returns undefined for `'unknown'`: there is no price to caveat.
 */
export function priceBasisCaveat(basis: PriceBasis): string | undefined {
  switch (basis) {
    case 'list':
      return 'Estimated from public list prices — your contract, gateway or free-tier rate may differ.';
    case 'declared':
      return 'Based on an operator-declared rate, not a verified published price.';
    case 'unknown':
      return undefined;
    default: {
      const unreachable: never = basis;
      throw new Error(`Unhandled price basis: ${String(unreachable)}`);
    }
  }
}
