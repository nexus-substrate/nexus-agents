---
'nexus-agents': patch
---

feat(lint): `nexus/no-vacuous-verdict` — a verdict may not report a pass over zero items

`[].every(p)` is `true` and `![].some(p)` is `true`, so a verdict aggregated over a collection that turned out empty reports **pass** having measured nothing. #4580 added `allOf`/`anyOf`/`verdictOver` with a required `whenEmpty`, but nothing routed an unaware author to them. This rule does.

Scoped by **verdict position** rather than by directory or by method: it fires only when the aggregation's value is bound to a verdict-shaped name (`passed`, `allSuccess`, `isAllHealthy`, …) or returned from a function with one. Measured first — 68 non-test `.every()` sites, of which 10 were defects — so a blanket ban would have been 85% false positives. Three structural exclusions keep it quiet on correct code: type predicates (`x is T` is never a verdict), predicates handed to `filter`/`find`/`sort`, and receivers that are provably non-empty or already guarded on `.length`.

The vocabulary is a rule option (`verdictWords`, `verdictPrefixes`), not a constant, because it is the rule's known blind spot: a verdict bound to a name outside it escapes silently. Measured recall on the known corpus is 7 of 10. The rule ships with RuleTester fixtures proving it **fires** on every known-bad shape, so it cannot become an instance of the class it polices.

Six further sites it found are fixed here: `doctor`'s health verdict over zero detected CLIs, the data-directory printer over zero subdirectories, the rubric scorer picking the most restrictive scoring mode on zero criteria, the constitutional critic's pass over zero violations, the release validator's secret scan (which now records that it failed to run instead of inheriting a clean result), and the preflight check list (now a literal, so non-emptiness is structural).

`src/governance/claims-verify.ts` is the one site left: it is governance source, requires owner ratification, and is held at `warn` in a single-file config block that #4586 deletes.
