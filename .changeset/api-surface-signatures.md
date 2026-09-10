---
'nexus-agents': patch
---

fix(scripts): make the api-surface gate able to see function signatures (#6061)

The extractor recorded `: typeof <name>` for every exported function — a string
constant with respect to the signature — so parameters, arity and return type
were invisible and the gate could not report a signature change on any of the
461 exported functions it covers.

Found by accident: a positional-`number`-to-object parameter change on a
published function produced zero snapshot diff while working on #5385. Confirmed
by widening an unrelated published return type, which also produced nothing.

`signatureLines` now renders each call signature as `(param: Type, …) => Return`,
taking parameters from the declaration (which knows `?` and `...`) and the return
type from the signature (which knows the inferred type). All overloads are
recorded in declaration order. Interface methods were never affected — a
method's type has no name to collapse to, which is why the gate caught real
changes elsewhere and this stayed hidden.

The snapshot regenerates with 465 changed lines: the 461 placeholders gaining
real content, plus 4 lines where a union's members render in a different order
(`"test" | "report" | "spec" | "analysis"` becomes
`"analysis" | "test" | "report" | "spec"`). No public API changed. The reorder is
a one-time consequence of resolving more types during extraction — verified
deterministic across three consecutive runs, and it is the reason union-member
order should eventually be normalised (#6065).

Also makes the extractor's in-memory test harness `strict`. Without it
`strictNullChecks` was off, so `string | undefined` rendered as plain `string`
and a test asserting a widened return type passed against unchanged output —
the harness could not observe the property it was asserting.
