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
 * - `'list'` — a price WAS resolved from the registry chain. Read it as "an
 *   assumed published rate", not a guaranteed vendor list rate: see
 *   {@link PriceBasis} for the cases where the resolved number is something
 *   else and is still reported this way.
 * - `'unknown'` — no price was resolved for this model. Read it as "the chain
 *   produced nothing", not "no price exists in the world": the generated
 *   catalog loader (`config/models-generated-loader.ts`) deliberately discards
 *   a published $0/$0 rate unless the id ends `:free`, so a genuinely free
 *   model can land here.
 *
 * Deriving the type from the schema (rather than the reverse) is what keeps the
 * runtime validator and the compile-time union from drifting.
 */
export const PriceBasisSchema = z.enum(['list', 'unknown']);

/**
 * Where a price came from, so a consumer can caveat it honestly (#4406).
 *
 * `'list'` is an ASSUMPTION about the pricing chain, not a verified property of
 * the number. The chain's tiers are mostly vendors' advertised public rates,
 * but at least three paths put something else behind the same label:
 *
 *  1. The operator manifest overlay (`config/manifest-overlay.ts`) is the
 *     HIGHEST-precedence tier and carries `pricing` in its passthrough keys —
 *     it exists specifically to override pricing. An operator's negotiated rate
 *     entered there is reported `'list'`, and {@link priceBasisCaveat} then
 *     warns the reader their contract may differ over the contract rate.
 *  2. The normalized/fuzzy identity tier (`config/model-registry.ts`
 *     `mergeMatchedWithDerived`) grants a decorated gateway id the pricing of a
 *     DIFFERENT canonical entry it matched. That rate is a real vendor rate for
 *     some other model, not necessarily for the id being priced.
 *  3. In the reverse direction, `'unknown'` is not a claim that no price
 *     exists — see the loader caveat on {@link PriceBasisSchema}.
 *
 * There is deliberately no `'contract'` member. The gap is NOT that an operator
 * has no way to state a negotiated rate — the manifest overlay above is exactly
 * that mechanism — it is that the mechanism carries no LABEL distinguishing a
 * negotiated rate from a published one, so nothing downstream could populate
 * `'contract'` truthfully. Adding the label, and the member, is tracked
 * separately; until then `'list'` over-claims in the conservative direction
 * (it warns about an estimate over a number that may be exact) and every basis
 * a consumer sees should be read as "the best rate the chain knew about".
 */
export type PriceBasis = z.infer<typeof PriceBasisSchema>;

/**
 * Human-readable caveat for a {@link PriceBasis}, for surfaces that show a cost
 * to a person. Keeps the wording in one place rather than restated per caller.
 *
 * Returns undefined for `'unknown'`: there is no price to caveat.
 */
export function priceBasisCaveat(basis: PriceBasis): string | undefined {
  return basis === 'list'
    ? 'Estimated from public list prices — your contract, gateway or free-tier rate may differ.'
    : undefined;
}
