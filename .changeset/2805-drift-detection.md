---
'nexus-agents': patch
---

**Phase 5 of #2805 (federated AGENTS.md adoption).** New CI drift gate prevents harness-config drift from re-introducing the content-duplication that the federation was built to eliminate.

- `scripts/check-harness-alignment.ts` — reuses `checkHarnessAlignment()` from `src/cli/doctor-harness-alignment.ts` (Phase 3); exits non-zero when any harness file exists but doesn't reference `AGENTS.md`
- New `Harness Alignment Drift` job added to `.github/workflows/docs-check.yml`
- Same logic the `doctor` command uses; the CI gate just makes it blocking

A PR that pastes content into a harness file instead of refactoring to a redirect will now fail CI with a pointer to `docs/architecture/AGENT_COMPATIBILITY.md`.

Closes #2805 (federation epic).
