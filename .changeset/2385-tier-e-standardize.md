---
'nexus-agents': patch
---

Tier E of epic #2385 (FINAL TIER) — standardize 17 remaining skills with anti-rationalization tables, red-flags sections, and verification checklists. Closes the epic.

State of the world before this PR:

- 8 of 25 skills had all three sections (the new + Tier-D-pollinated ones)
- 17 skills had partial or no coverage

State after:

- All 25 skills have anti-rationalization tables, red-flags lists, and verification-shaped content (named variously: "Verification checklist", "Quality Checklist", "Pre-launch checklist", "Implementation Complete Checklist" — all serve the same gate function)

Per architect's epic-vote cap (~30 lines per skill), each addition is small and focused. Total ~430 lines added across 17 skill files.

Skills enhanced:
research-and-vote, dev-pipeline, codex-delegator, gemini-delegator, release, security-scanning, security-advisory-response, hotfix, system-review, dogfooding-issues, version-check, infrastructure-management, bug-fix, documentation-management, implement-feature, requirements-gathering, reviewing-code, ui-ux-design.

Pure-patch — no API change, no behavior change, no new skills (count stays at 25), frontmatter unchanged in all 17 skills.

This closes epic #2385. Final state: 18 → 25 skills, +5 reference checklists, +3 subagent personas, 25/25 skills standardized with anti-rationalization + red flags + verification gates.
