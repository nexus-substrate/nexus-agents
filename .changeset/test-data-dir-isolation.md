---
'nexus-agents': patch
---

recognize NEXUS_DATA_DIR, NEXUS_REPO_PREFERRED, NEXUS_ACCESS_POLICY_MODE and NEXUS_SANDBOX in the env schema

All four are documented in CLAUDE.md's environment table and none were in
`env-schema.ts`, so `validateNexusEnv` reported them as **unknown** `NEXUS_*`
variables — offering a typo suggestion for a name spelled correctly. Anyone
following the documentation to set a runtime data root was told the variable
did not exist.

Found while stopping the test suite writing to `~/.nexus-agents/`, the real
cross-repo store holding capability gaps, memory and learning outcomes: test
runs were putting synthetic tool names and fabricated gaps into the data the
routing and improvement loops read. The suite now runs against a per-run data
dir set in `vitest.config.ts`, beside the `TMPDIR` redirect that was already
there.

A test now cross-checks the documented list against the schema, so the two
cannot drift apart again, and another asserts the suite's data dir is not the
real one — the isolation is a single config line, and nothing else would notice
it being dropped.
