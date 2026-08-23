/**
 * Aggregating a verdict over a collection that might be empty (#4580).
 *
 * `[].every(p)` is `true` in JavaScript. So `checks.every((c) => c.passed)`
 * reports **pass** when `checks` is empty — absence rendered as health, on
 * exactly the code paths where that is most dangerous.
 *
 * Confirmed instances of the shape:
 *  - `verify_audit_chain` returns `ok: true` over zero events, so deleting
 *    every audit log file makes a tamper-evident chain verify clean (#4579)
 *  - a quality gate with zero checks reported `pass` (#4544)
 *  - the QA pipeline stage reported `success` after reviewing zero tasks,
 *    letting the graph advance as though implementations had been reviewed
 *
 * ## Why a helper rather than a lint or a type
 *
 * Measured before choosing: 64 non-test `.every()` calls, and most are fine —
 * `github-provider.ts:178` guards with `length > 0` and correctly leaves an
 * empty check set `pending`. A wide surface with sparse defects, so a blanket
 * lint would be mostly false positives, and false positives are what teach
 * people to bypass a gate.
 *
 * What was missing is not enforcement but a *decision point*: nothing made the
 * author say what empty means. `whenEmpty` is a required argument, so they
 * must. Chosen by a 7-voter `higher_order` panel at the supermajority bar.
 *
 * ## Choosing `whenEmpty`
 *
 * Ask what an empty collection is evidence OF. Usually nothing — in which case
 * the honest answer is the non-committal verdict (`pending`, `unmeasured`,
 * `skip`), not the optimistic one. Reserve `true` for cases where vacuous truth
 * is genuinely the contract, and say so at the call site.
 *
 * @module utils/verdict-aggregation
 * (Source: Issue #4580)
 */

/**
 * `predicate` holds for every item — with the empty case named, not defaulted.
 *
 * @param items - The collection to judge.
 * @param predicate - Must hold for each item.
 * @param whenEmpty - The verdict when there is nothing to judge. Required.
 */
export function allOf<T>(
  items: readonly T[],
  predicate: (item: T) => boolean,
  whenEmpty: boolean
): boolean {
  if (items.length === 0) return whenEmpty;
  return items.every(predicate);
}

/**
 * `predicate` holds for at least one item — with the empty case named.
 *
 * `[].some(p)` is already `false`, which is usually right, but not always: a
 * "did anything fail?" check over zero results should often be `unmeasured`
 * rather than a clean `false`. Naming it keeps the reasoning visible.
 *
 * @param items - The collection to judge.
 * @param predicate - Must hold for at least one item.
 * @param whenEmpty - The verdict when there is nothing to judge. Required.
 */
export function anyOf<T>(
  items: readonly T[],
  predicate: (item: T) => boolean,
  whenEmpty: boolean
): boolean {
  if (items.length === 0) return whenEmpty;
  return items.some(predicate);
}

/**
 * Reduce a collection to an arbitrary verdict, with the empty case named.
 *
 * For verdicts richer than a boolean — a severity, a tri-state gate result —
 * where the empty case is usually `unmeasured` rather than the best value.
 *
 * @param items - The collection to judge.
 * @param aggregate - Folds a non-empty collection into a verdict.
 * @param whenEmpty - The verdict when there is nothing to judge. Required.
 */
export function verdictOver<T, V>(
  items: readonly T[],
  aggregate: (items: readonly T[]) => V,
  whenEmpty: V
): V {
  if (items.length === 0) return whenEmpty;
  return aggregate(items);
}
