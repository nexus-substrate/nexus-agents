---
'nexus-agents': patch
---

Aggregating a verdict over a possibly-empty collection now requires naming what empty means — and the `general` pipeline template gains the `decompose` stage it was missing.

Addresses a second defect class, distinct from #4561's "a check nothing runs": **a check that runs and returns a passing verdict for an empty input.** `[].every(p)` is `true` in JavaScript, so `checks.every((c) => c.passed)` reports pass when there are no checks.

Chosen by a 7-voter `higher_order` panel at the supermajority bar (4 of 6, exactly at 2/3).

**Measured before choosing.** 64 non-test `.every()` calls, but most are correct — `github-provider.ts:178` guards with `length > 0` and leaves an empty check set `pending`. A wide surface with sparse defects, so a blanket lint would be mostly false positives, and false positives teach people to bypass gates. What was missing was not enforcement but a _decision point_.

`allOf` / `anyOf` / `verdictOver` take a **required** `whenEmpty`, so an author cannot aggregate without stating what nothing means.

**A real instance, found by hunting for the shape.** The QA pipeline stage computed `reviews.every((r) => r.verdict === 'pass')`, and `pipeline-graph.ts:174` advances the graph on `success: true`. Reviewing zero tasks therefore reported a QA pass indistinguishable in the trace from "reviewed N, all passed".

**Making that verdict honest exposed why it mattered.** The `general` template is `dev` minus `decompose` — and both `implement` and `qa` read `state[TASKS]`, which only `decompose` writes. So `general` implemented nothing, reviewed nothing, and passed. Every run of it, including the retired `research` template which aliases to it. The template now includes `decompose`; a template with implement and qa stages that cannot receive tasks is the bug, not the honest verdict.

Known limitation, named by the panel: adoption is voluntary. The helper protects code that uses it. A later targeted lint over verdict-shaped modules would convert convention into mechanism, and the panel's contrarian proposed exactly that — an AST rule scoped to verdict directories — as the option nobody offered.
