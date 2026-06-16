---
'nexus-agents': minor
---

feat(governance): claims-to-reality registry + blocking claims:check gate (#3825, #3826)

Add a machine-verifiable claims registry — the durable home for the substantive
claims README.md / ARCHITECTURE.md make about the system — plus a CI gate that
fails when a documented claim goes unbacked or stale.

- `governance/claims-registry.yaml` — versioned registry; each entry pairs a
  human-readable claim with a `verification` recipe (method + evidence path +
  expected) a script can run against live source. Populated from the 2026-06-09
  claims audit: MCP tool count (46), consensus-strategy enum (6 names / 5
  strategies, alias noted), built-in expert types (12), hash-chained audit +
  `verify_audit_chain`, closed-loop LinUCB+TOPSIS routing, and the Phase 2/3
  aspirational roadmap items (standalone CLI, REST gateway).
- `src/governance/claims-registry.ts` — Zod schema + loader/validator
  (strict, zero-`any`); `src/governance/claims-verify.ts` — pure verification
  runner over an injectable filesystem.
- `scripts/claims-check.ts` + `pnpm claims:check` — verify every claim, exit
  non-zero on drift with a per-claim report.
- Wired into the Documentation Gate workflow as a blocking `claims-check` job
  (sibling to governance-drift).

Deferred to a #3826 follow-up: the heuristic detector for NEW undeclared
numeric/capability claims appearing in docs; the contributor doc + README badge
(#3827); and the four standalone doc-side mismatch fixes (#3828).
