---
'nexus-agents': minor
---

**Phase 3 of #2805 (federated AGENTS.md adoption).** `nexus-agents doctor` now reports per-harness config alignment.

The check walks each of the 5 known harness discovery files in the current working directory:

- `.cursor/rules/agents.mdc` (Cursor)
- `.windsurf/rules/agents.md` (Windsurf)
- `.aider.conf.yml` (Aider)
- `.continue/rules/agents.md` (Continue)
- `.clinerules/agents.md` (Cline)

For each, it reports one of three states:

- **aligned** — file exists and references `AGENTS.md` (the federation invariant)
- **drift** — file exists but doesn't reference `AGENTS.md` (content duplication; needs refactor)
- **absent** — file not present (harness not in use; fine)

Plus a top-level `AGENTS.md: present/MISSING` line. If any drift is detected, the section emits a warning pointing at `docs/architecture/AGENT_COMPATIBILITY.md` for the federation contract.

Implementation:

- New module `src/cli/doctor-harness-alignment.ts` exports `checkHarnessAlignment(cwd)` returning a typed `HarnessAlignmentCheck`
- `DoctorResult` grows a `harnessAlignment` field
- `printDoctorResults` calls a new `printHarnessAlignment` section before the summary
- 8 new tests cover empty repo, all-aligned, mixed drift, mixed absent, unreadable paths

Phases 4-5 of #2805 still pending: AGENTS.md preamble update (Phase 4 — folded into #2806) and periodic drift detection (Phase 5 — separate work).
