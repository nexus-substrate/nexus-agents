---
---

docs: add periodic end-to-end validation methodology + e2e-validation skill

Establishes running the real loops (research → vote → plan → dev-pipeline →
graph → memory → audit) on a cadence with live adapters to validate that fixes,
docs, and claims hold in actual usage — catching what unit tests miss (live
voter-panel auth, adapter routing, pipeline stage wiring, audit integrity).
Adds a methodology section to AGENTS.md (injected into CLAUDE.md) and a new
`e2e-validation` skill as the executable runbook (skills 32 → 33). No shipped
code (skills/, AGENTS.md not in the package `files`).
