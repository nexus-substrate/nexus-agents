---
'nexus-agents': patch
---

**docs(rules):** admin-merge clause for CI outages in `.rules/autonomous.md` (#3076 primitive #3).

Follow-up to PR #3078 (primitive #1, `ci_health_check`) and PR #3080 (primitive #2, codified wait-pattern). This addition codifies WHEN admin-merge is acceptable during a CI infrastructure outage — five clauses that ALL must hold.

## Why

During the 2026-05-26 outage (#3070), I admin-merged 7 PRs once the local quality gates were green and the CI failures were confirmed to be infrastructure-wide (not per-PR). The pattern worked but wasn't codified — the next agent session would have to re-derive when admin-merge is appropriate vs. when to keep waiting. This change makes the bypass conditions explicit so the audit chain stays clean.

## What the rule says

`gh pr merge --admin` is allowed during outages ONLY when all five clauses hold:

1. `ci_health_check` returned `outage` or `degraded` AND the failure is confirmed global.
2. Local quality gates green on the branch.
3. Change is mechanical or well-tested (no untested new features).
4. An outage tracking issue exists with a link to the PR.
5. PR was waiting >30 min with no progress, OR crosses a release boundary.

Plus: state the bypass reason in the merge commit body, comment on the outage issue. Audit chain over convenience.

## Closes

Partial close on #3076 — primitive #3 of 4 shipped. Primitive #4 (outage frequency telemetry via `outcome_store` tagging) remains.
