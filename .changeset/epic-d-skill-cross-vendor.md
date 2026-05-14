---
'nexus-agents': patch
---

Codex Skills cross-vendor compatibility ([#2660](https://github.com/williamzujkowski/nexus-agents/issues/2660), Epic D).

Research refuted the issue's "translation layer" premise: Codex's Skills primitive (Dec 2025) uses the **same** `SKILL.md` filename and the **same** required frontmatter (`name`, `description`) as the Anthropic Agent Skills spec — the 31 skills are already cross-vendor compatible, and `generate-skills-index.ts` already validates the required fields and is CI-gated. There is nothing to convert and no redundant new gate to add.

Delivered instead: the `name`/`description` validation in `generate-skills-index.ts` is now documented + test-locked as the cross-vendor contract, and `AGENTS.md` documents Codex's discovery path (`.agents/skills/` or a `[[skills.config]]` entry pointing at `skills/`) so Codex operators get the full catalog.
