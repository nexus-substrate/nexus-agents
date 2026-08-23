---
'nexus-agents': patch
---

Clean up test scratch dirs in three suites that leaked them (#4630)

`symbol-extractor.test.ts`, `quality-gate-commands.test.ts` and
`quality-gate-cwd.test.ts` created `mkdtemp` directories and never removed
them, leaving 716 stale directories in the test scratch root.

Measured before acting: 89 test files call `mkdtemp*` and only these 3 lacked
cleanup. The convention already exists and is followed 97% of the time, so
these get `afterAll` cleanup matching the other 86 — no new helper, which would
only have created a second convention.

Control: running the three suites without the fix adds 25 directories; with it,
zero.
