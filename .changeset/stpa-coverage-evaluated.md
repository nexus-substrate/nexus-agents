---
'nexus-agents': minor
---

fix(safety): report STPA constraint coverage from what was actually checked

`ValidationResult.passed` was presented as the constraints a tool satisfied,
and used as the coverage signal. It was not one. `checkConstraint` returned
`null` — and the caller filed the id under `passed` — in four distinct
situations, only one of which was a pass:

1. the constraint was evaluated and satisfied;
2. `doesConstraintApply` said it did not apply, so nothing was checked;
3. `checkRateLimitViolation` returned `null` unconditionally, so every
   RATE_LIMIT constraint was credited without being examined;
4. the `default` switch arm returned `null` for every enforcement type with no
   check — `ALERT`, `REQUIRE_CONFIRMATION`, `REQUIRE_PRIVILEGE`.

A tool could therefore be reported as satisfying a set of safety constraints
none of which had been evaluated.

`ValidationResult` now carries `evaluated` (applicable, and checked by a check
that could have failed) and `notApplicable` (judged not to govern this tool).
Coverage is `evaluated.length`. Constraints whose enforcement type has no check
land in neither list and raise an `UNMEASURED_ENFORCEMENT` warning naming them,
rather than being silently counted as passing.

`passed` now carries an `@deprecated` note pointing readers at `evaluated`. Its
contents change in one direction: applicable constraints whose enforcement type
has no check used to land in it and now land in no bucket, so `passed` gets less
wrong rather than staying identical. It still absorbs non-applicable
constraints, which is exactly why it is not a coverage signal.

The two new fields are optional in `ValidationResultSchema` while required on
the `ValidationResult` interface. That split is deliberate: the interface
describes what this package produces, the schema is the lenient inbound edge for
a result that arrived from elsewhere. There is no in-tree persistence path — the
schema is a published export with no producer or consumer in this repo — so the
case it accommodates is an external holder, not a stored record here.

`checkRateLimitViolation` is removed. Rate limiting needs call counts and a
time window, neither of which is reachable from a tool's JSON Schema, so there
was no check to implement — a function that can only return "no violation" is
not a check. RATE_LIMIT constraints are still generated for
RESOURCE_EXHAUSTION and DENIAL_OF_SERVICE hazards and are still enforced at
runtime by `mcp/middleware/tool-rate-limiter.ts`; schema-time validation now
reports them as unmeasured instead of passed.

`valid` follows the same rule. It already reported `false` when no constraints
were supplied and when the input schema was uninspectable; an applicable
constraint that no check could judge is a third way to be unmeasured, and it
now fails closed too. Without that the vacuous pass simply moved out of
`passed` and into the verdict field: a tool whose only governing constraint was
a RATE_LIMIT reported `valid: true` with `evaluated` empty. Constraints that do
not apply are excluded — applicability was judged, so that is a decision rather
than a gap.
