---
'nexus-agents': patch
---

stop execute_spec passing a spec that has no acceptance criteria

`executeSpec` short-circuited an empty acceptance-criteria list to a hardcoded
`satisfaction: 1, metCount: 0, allMet: true` — a perfect score for a spec that
was never checked against anything.

The empty list is reachable in production: `parseSpec` returns `[]` when the
`## Acceptance Criteria` heading is absent or misspelled, and records the gap in
`missingSections` without erroring. Nothing upstream rejects it — the decomposer
requires only non-empty requirements, and the tool schema only checks the spec
is a string.

`validateScenario` already refuses this input; the short-circuit bypassed the
sibling that got it right. It now returns a `validate`-stage error naming the
missing section, so the caller is told what to add rather than told it passed.

This matters beyond the returned value: `execute_spec` persists `satisfaction`
into tool memory as a learning and appends a `success: true` outcome record used
for adaptive routing. A vacuous pass was poisoning both.

Fixes #4826.
