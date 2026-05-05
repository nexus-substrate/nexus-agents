---
'nexus-agents': patch
---

Tier D2 of epic #2385 — cross-pollinate addyosmani/agent-skills patterns into 3 existing skills:

**`security-scanning`** — adds the Three-Tier Boundary System (Always Do / Ask First / Never Do) for hardening discipline, cross-referenced with our existing `.rules/untrusted-input.md` Tier 1-4 trust system. Adds an anti-rationalization table for security review (6 rows: internal-tool, real-users-later, library-handles-it, fix-audit-later, trust-third-party, dev-only-path).

**`release`** — adds a comprehensive pre-launch checklist (Code quality / Security / Documentation / Pipeline health) gated before tagging. References `docs/ops/release-changeset-race.md` (#2382) for the publish-race avoidance protocol that bit us 2026-05-04. Cross-link to `deprecation-and-migration` skill for releases that retire deprecated APIs.

**`dev-pipeline`** — adds the spec-driven 4-phase gated workflow (SPECIFY → PLAN → TASKS → IMPLEMENT) with vote() gates between phases. Includes the assumption-surfacing pattern ("ASSUMPTIONS I'M MAKING: …" before producing the spec) which is the highest-leverage discipline from the upstream spec-driven-development skill. Cross-references our `run_dev_pipeline` MCP tool, `.rules/subagent-coordination.md`, and the new `context-engineering` skill.

All edits purely additive — existing content unchanged. Pure-patch release.
