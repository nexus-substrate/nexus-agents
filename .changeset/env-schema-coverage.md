---
'nexus-agents': patch
---

fix(config): register the NEXUS_* variables production code actually reads (#5142)

`validateNexusEnv` reports an unrecognized `NEXUS_*` name as unknown with a typo
suggestion. 33 variables that production code reads were never registered, so a
correctly spelled variable was reported as the user's mistake — verified live for
`NEXUS_VOTER_MODEL_ARCHITECT` (a documented per-role routing override),
`NEXUS_JOB_MAX_CONCURRENT_ORCHESTRATE` and `NEXUS_MCP_DEPTH`.

Registers 22 of them with types verified against each consuming call site, and
adds support for the two families whose names are built at runtime by string
concatenation (`NEXUS_VOTER_MODEL_<ROLE>`, `NEXUS_JOB_MAX_CONCURRENT_<TOOL>`) and
therefore can never be fixed schema keys. Role suffixes derive from `VOTER_ROLES`
so the family cannot drift from the canonical role list.

Two consequences worth noting. A previously-ignored bad value is now reported as
invalid rather than silently discarded (`NEXUS_MCP_DEPTH=abc`,
`NEXUS_VERSION_CHECK=yes` — `parseBoolEnv` accepts only `true|1|false|0`).
Validation remains warn-only and never blocks startup.

Adds `scripts/check-env-schema-coverage.ts`, a baseline-aware CI gate for the
reverse direction the #4722 test never covered: every `NEXUS_*` literal read in
`src/` must be registered. It keys on string literals because only 38 of 115 are
reachable by a `process.env.X` scan — the rest go through named constants or
injected env objects. The 11 variables whose accepted value set needs a judgement
call are baselined as visible debt and tracked in #5156.
