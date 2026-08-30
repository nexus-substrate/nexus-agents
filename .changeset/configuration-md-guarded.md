---
'nexus-agents': patch
---

fix(docs): correct the phantom NEXUS_RATE_LIMIT row and guard CONFIGURATION.md (#5159)

`docs/getting-started/CONFIGURATION.md` documented `NEXUS_RATE_LIMIT`
("Requests per minute", default `60`). No code reads that name anywhere. The
variable that does exactly that is `NEXUS_RATE_LIMIT_RPM` — same description,
same default — and it was documented nowhere. Anyone following the doc set a
name that did nothing and got an unknown-variable warning naming a spelling
they had never seen.

The #4722 regression test that exists to catch this reads AGENTS.md, which
carries only the most-used table and defers to CONFIGURATION.md for the full
list — so the authoritative document was the one nothing checked. It now is,
with the deliberately-removed vars (#2977, #4180), the accepted coverage
baseline (#5142, being resolved in #5156), and script-scoped vars excluded.

`NEXUS_DRIFT_ADVISORY` is now documented as script-scoped: it is read by
`scripts/check-model-string-drift.ts`, never by the server, so it is
deliberately absent from the runtime env-schema.
