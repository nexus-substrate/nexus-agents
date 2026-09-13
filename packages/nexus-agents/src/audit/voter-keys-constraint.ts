/**
 * Tuple-exhaustiveness constraint for the canonical voter-key order.
 *
 * `CompleteKeys<All, T>` is `unknown` when every member of the key universe
 * `All` appears in the tuple `T`, and `never` when one is missing. Intersected
 * with a parameter type (`keys: T & CompleteKeys<All, T>`) it is a no-op for a
 * complete tuple and makes an incomplete one unassignable, so the omission is a
 * `tsc` error at the call site rather than a silently unhashed field.
 *
 * Why a separate module, and why a type rather than a function:
 *
 * - #6077: the check must be BOUND to the tuple's initialization. A standalone
 *   sentinel const survives lint only through the `^_` unused-vars pattern and
 *   can be deleted by a dead-code pass with no test failing; a constraint on the
 *   parameter that builds the tuple cannot be removed separately from the thing
 *   it checks. `vote-record.ts`'s `defineVoterKeys` is that binding and the
 *   production consumer of this type.
 * - #6092: the constraint must be PROBED by a type test, so that a TypeScript
 *   release that changes inference on intersected conditionals fails
 *   `pnpm typecheck` instead of silently turning the check into a no-op. The
 *   probe lives in `voter-keys-constraint.test.ts` against this exported type;
 *   nothing here has a runtime, so the governor module gains no dead code and
 *   its emitted JavaScript is unchanged.
 *
 * Generic over the key universe so it depends on nothing in `vote-record.ts`:
 * the test can probe it with a two-key universe as well as with the real
 * `keyof VoterSummary`.
 *
 * The check is one-directional on purpose: it catches a universe key the tuple
 * lacks. The other direction — a tuple key the universe lacks — is the caller's
 * `satisfies readonly All[]` on the literal.
 */
export type CompleteKeys<All extends string, T extends readonly All[]> = [All] extends [T[number]]
  ? unknown
  : never;
