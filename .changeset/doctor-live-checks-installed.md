---
'nexus-agents': patch
---

make doctor --live actually check whether a CLI is installed

The `installed` rung of the readiness ladder was the literal
`{ status: 'verified' }` — the first level of a readiness report asserting
itself. Nothing probed PATH.

It now calls `detectCliBinary`, and a missing binary fails the ladder at
`installed` with `authenticated` and `serves` reported `not-attempted`, per the
ladder's own rule that a skipped level is never `failed`. That also fixes a
misattributed reason: a CLI that was simply absent previously surfaced as
"no usable credentials found", because the auth rung was consulted for a
binary that does not exist.

Narrower than #4840 claimed — the `authenticated` rung was not inventing a pass,
and the base `doctor` output already printed a truthful "Not installed" line
just above the ladder. Details on the issue.

Fixes #4840.
