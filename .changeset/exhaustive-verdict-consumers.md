---
'nexus-agents': patch
---

A new member of a verdict, severity, or readiness union is now a compile error at its consumers ([#4563](https://github.com/nexus-substrate/nexus-agents/issues/4563)).

Two defects this session had the same shape: a union gained a member and every consumer stayed silently valid. `Assessment` gained `throttled`, and `route()`'s `if (assessment !== 'exhausted') continue` swallowed it alongside `healthy` — a rate-limited candidate became invisible in every trace. `GateVerdict` gained `skip`, and a consumer testing `!== 'fail'` let a blocking ship gate pass on zero coverage.

No gate can catch that after the fact; the code is valid. The compiler can catch it at the moment of the change.

Three consumers converted to exhaustive `switch` with a `const exhaustive: never` assertion — the idiom already used at six sites here, rather than a new helper:

- `classifyAndFilter` on `Assessment` (`capacity-stage.ts`)
- `formatReadiness`'s icon on `LevelOutcome` (`cli-readiness.ts`) — a new status would have rendered as `·`, silently reporting "not attempted"
- the scratch term of `isAllHealthy`, extracted as `scratchSeverityIsAcceptable` (`doctor.ts`) — `!== 'critical'` would have let a hypothetical `fatal` pass

**Two measurements changed the plan.** The issue proposed enabling `@typescript-eslint/switch-exhaustiveness-check`. Measured: 32 violations across 158 switches, and **zero in the decision-bearing files** — because those used `if`/`!==` chains, which the rule does not inspect. Enabling it would have fixed 32 unrelated switches and nothing that motivated the issue.

Then: a bare `switch` does not force exhaustiveness either. Verified by adding a member and watching the build stay green. The `never` assertion is what makes it fail, and it needs no lint rule — so there is no tooling to keep wired, which is the property the panel cared about.

All three verified in both directions: adding a member to each union produces `TS2322 ... not assignable to type 'never'` at the consumer; reverting returns to clean.
