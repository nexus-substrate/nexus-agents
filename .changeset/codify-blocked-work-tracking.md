---
'nexus-agents': patch
---

docs(governance): codify dependency-blocked work tracking

Strengthens the "track all work" discipline (AGENTS.md + `.rules/track-deferred-work.md`) to explicitly cover the most-forgotten case: work deferred _because it depends on another deliverable_ ("do after X lands", "increment B once A merges"). Such work must get an issue the moment it's named — not when the blocker clears — with the blocking dependency and unblock trigger recorded. Adds a "when a blocker clears, surface its dependents" step (search `gh issue list --search "#<id>"` / walk the epic's children) so a completed dependency surfaces the next work instead of relying on memory. Clarifies that a prose "Phase 3 / increment B will…" in an epic body is a description, not a tracked task — every step needs its own issue.
