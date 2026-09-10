---
'nexus-agents': patch
---

`pnpm governance:check` now reports drift outside the generated `GENERATED:FROM_AGENTS` block of CLAUDE.md, and a prettier failure during the check is an actionable message instead of an unhandled rejection (#6087).

Since #6084 the check compared only the marker-bounded block, formatted through the same prettier pass `inject` writes with. CI's idempotency step runs `inject` and then diffs the whole file, so a stripped end-of-file newline or prose outside the markers that prettier reshapes passed the check locally and failed in CI. The check now also compares the whole formatted regeneration (with the on-disk block spliced in, so the measurement is of what lies outside the markers) against the on-disk file and reports a mismatch as its own message, `CLAUDE.md differs outside the generated block — first difference at CLAUDE.md:N`, with the expected and on-disk lines and the `pnpm governance:inject` remedy. Block drift keeps its existing message; the two causes are measured and printed independently, so when both are present both are shown.

A prettier error (a malformed `.prettierrc`, for instance) used to surface as a stack trace from an unhandled rejection in the CLI. It now prints `governance:check: could not format <path>: <prettier message>` and the check exits 1.
