---
'nexus-agents': patch
---

Wire the Schema-Fan-Out gate that two documents have claimed was running since 2026-05-07 (#2408).

`scripts/check-schema-fanout.ts` exists, has tests, and works. No workflow has ever invoked it.

Meanwhile `docs/architecture/SCHEMA_FANOUT_COVERAGE.md:42` says _"A new script `scripts/check-schema-fanout.ts` runs in CI"_, and `skills/documentation-management/SKILL.md:45` records that `docs-check.yml` was _"extended with new 'Schema-Fan-Out Check' job (#2408, 2026-05-07)"_ and _"Runs scripts/check-schema-fanout.ts on every PR"_. The design, the script, the tests and the documentation all landed. Only the job did not.

So the cascade the gate was built to catch — a tracked schema changing without any consumer test changing, the #2253 → #2254 → #2255 sequence — has been unguarded for over three months while two documents asserted otherwise. An unrun gate is indistinguishable from no gate, except that it also produces false confidence.

Added to `docs-check.yml` as designed: warn-only, per-PR, with `fetch-depth: 0` because the check diffs against the PR base. The script exits 0 on warnings and fails only on a missing schema or under `--strict`, so this reports without blocking; promoting to `--strict` needs a false-positive rate to justify it and is a separate decision.

Verified the gate still works before wiring it — an unrun gate rots, as `lint:arch` did (#4490). Touching the `TaskOutcomeSchema` marker without touching a consumer test produces the warning and names the three consumer tests; a clean tree reports no warnings.
