---
'nexus-agents': minor
---

Add three new skills (Tier A1 of epic #2385, adapted from MIT-licensed [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills)):

- `test-driven-development` — encodes the Red-Green-Refactor discipline already named in CLAUDE.md's prime directive but previously not surfaced as a discoverable skill. Includes the Prove-It Pattern for bug fixes, the test pyramid (~80/15/5), DAMP-over-DRY guidance, and an anti-rationalization table covering common excuses ("I'll write tests after," "too simple to test," etc.).
- `code-simplification` — post-feature refactor discipline. Five principles (preserve behavior, follow conventions, clarity over cleverness, balance, scope to changes), Chesterton's Fence guidance for understanding before deleting, and red flags for misapplied simplification.
- `deprecation-and-migration` — direct lessons learned from epic #2368 (v3.0 gate retirement, 2026-05-04). Pre-removal checklist, four-batch decomposition by blast radius (internal-only / typed-string-union / public-type / runtime), per-batch implementation steps, and post-merge verification including the publish-race check.

Each skill follows the addyosmani template (when-to-trigger, process, anti-rationalization, red flags, verification checklist) and is annotated with nexus-agents canonical sources (CLAUDE.md prime directive, .rules/, docs/architecture/, docs/ops/) and our specific tooling (`pnpm`, `gh`, `consensus_vote`, ESLint gates).

Skill count: 18 → 21. Governance regenerated: `skills/index.yaml`, CLAUDE.md skill table, AGENTS.md routing, plugin manifest.
