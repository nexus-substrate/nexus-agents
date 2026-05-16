---
title: 'Agent Harness Compatibility Matrix'
description: 'Survey of agent-config standards across the agentic-coding harness ecosystem. AGENTS.md is the canonical surface for this repo; everything else is a thin redirect.'
tier: 2
keywords:
  - agents-md
  - harness-compat
  - cursor
  - windsurf
  - aider
  - cline
  - continue
  - goose
  - opencode
  - claude-code
  - codex-cli
---

# Agent Harness Compatibility Matrix

This doc surveys the agent-config standards across the agentic-coding harness ecosystem and records how nexus-agents reaches each. **AGENTS.md is the canonical surface** (per [#2805](https://github.com/williamzujkowski/nexus-agents/issues/2805), choosing option B of [#2764](https://github.com/williamzujkowski/nexus-agents/issues/2764)). Every other harness file in this repo is a thin redirect.

## Why federate on AGENTS.md

AGENTS.md is the convergence point. As of Q2 2026 it has explicit support in:

- OpenAI Codex CLI (`codex` command)
- Anthropic Claude Code (via fallback when `CLAUDE.md` is absent)
- Cursor (since v0.45 — picked up via `.cursor/rules/` or direct `AGENTS.md` discovery)
- Windsurf (via Cascade context discovery)
- Aider (added in v0.69+)
- Cline / Roo Code (project-context discovery)
- Continue (rule sources can point at `AGENTS.md`)
- Goose (project conventions discovery)
- OpenCode (`opencode.json` `instructions` can reference `AGENTS.md`)

Maintaining one document with thin shims into each harness gives full coverage for ~30 LOC of shims vs. ~6 KLOC of duplicated content if each harness's file were independent.

## What each harness discovers

| Harness                   | Discovery file(s)                                                                 | Discovery scope                                | Loading model                                                                      | Native instruction format                                  |
| ------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Anthropic Claude Code** | `CLAUDE.md` (primary), `AGENTS.md` (fallback)                                     | Project root + walking up to `$HOME`           | Auto-loaded into every session's system prompt                                     | Markdown with optional `<system-reminder>` tags            |
| **OpenAI Codex CLI**      | `AGENTS.md` (canonical, since launch)                                             | Project root + global at `~/.codex/AGENTS.md`  | Auto-loaded at session start                                                       | Markdown                                                   |
| **Cursor**                | `.cursor/rules/*.mdc`, `.cursorrules` (legacy), `AGENTS.md`                       | Project root                                   | Rule files matched by `globs` + `description`; AGENTS.md loaded as project context | MDC (Cursor's markdown-with-frontmatter) or plain markdown |
| **Windsurf**              | `.windsurfrules`, `.windsurf/rules/*.md`, `AGENTS.md`                             | Project root                                   | Cascade indexes all rule sources                                                   | Markdown                                                   |
| **Aider**                 | `.aider.conf.yml` (config), `CONVENTIONS.md` (content), `AGENTS.md`               | Project root                                   | `read: [...]` in conf points at content files                                      | YAML config; markdown content                              |
| **Cline / Roo Code**      | `.clinerules/*`, `AGENTS.md`                                                      | Project root                                   | Loaded into Cline's system message                                                 | Markdown                                                   |
| **Continue**              | `.continue/rules/*.md`, `.continue/config.json`                                   | Project root + global at `~/.continue/`        | Rule files referenced from config; `AGENTS.md` works as a rule source              | Markdown                                                   |
| **Goose**                 | `recipe.yaml` (per-recipe), project conventions in markdown, `AGENTS.md`          | Per-recipe + project root                      | Recipe-scoped; project conventions discovered at session start                     | YAML + markdown                                            |
| **OpenCode**              | `opencode.json` (config + `instructions` array), referenced markdown, `AGENTS.md` | Project root + global at `~/.config/opencode/` | `instructions` field can name `AGENTS.md` directly                                 | JSON config; markdown content                              |

## What nexus-agents ships today

| File                                      | Role                                                                   | Status                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `AGENTS.md`                               | Canonical surface; harness-neutral                                     | **Source of truth**                                                    |
| `CLAUDE.md`                               | Claude Code-specific entry point with plugin/skill integration details | Kept; cross-references AGENTS.md and adds Claude-Code-only sections    |
| `skills/index.yaml` + `skills/*/SKILL.md` | Anthropic Agent Skills spec (#1828)                                    | Discovered by harnesses that support skills; documented from AGENTS.md |
| `.rules/*.md`                             | Per-rule files auto-loaded by Claude Code; referenced from AGENTS.md   | Kept; AGENTS.md indexes them                                           |
| `docs/ENTRYPOINTS.md`                     | CLI + MCP tool reference                                               | Referenced from AGENTS.md                                              |

## What's missing today (Phase 2 of #2805 closes this)

These harness files don't exist yet in the repo. Phase 2 adds them as one-line redirects:

| File                        | Harness  | Content shape                                                      |
| --------------------------- | -------- | ------------------------------------------------------------------ |
| `.cursor/rules/agents.mdc`  | Cursor   | MDC frontmatter `alwaysApply: true`, body redirects to `AGENTS.md` |
| `.windsurf/rules/agents.md` | Windsurf | Markdown; one-line redirect                                        |
| `.aider.conf.yml`           | Aider    | `read: [AGENTS.md, CLAUDE.md]`                                     |
| `.continue/rules/agents.md` | Continue | Markdown redirect                                                  |
| `.clinerules/agents.md`     | Cline    | Markdown redirect                                                  |

`opencode.json` and Goose `recipe.yaml` are project-config files with broader concerns than just instruction surfacing — those stay out of scope unless we ship an OpenCode/Goose adapter directly.

## Federation invariants

When Phase 2 lands, these become invariants of the repo:

1. **AGENTS.md is the only place content is authored.** Shim files MUST point at AGENTS.md, not duplicate content.
2. **`nexus-agents doctor` reports alignment.** Project-level `doctor` walks the discovery files and reports whether each one resolves back to AGENTS.md. Phase 3 of #2805.
3. **Drift detection.** Upstream changes to AGENTS.md community conventions or per-harness rule syntax get flagged via a periodic check (Phase 5).
4. **No content duplication ever.** PRs that duplicate AGENTS.md content into a harness file are refactored to redirects before merge.

## References

- [AGENTS.md community proposal](https://agents.md/)
- [Anthropic Agent Skills spec](https://docs.anthropic.com/en/docs/agents-and-tools/agent-skills) (#1828)
- [Cursor rules docs](https://docs.cursor.com/context/rules-for-ai)
- [Windsurf rules docs](https://docs.windsurf.com/windsurf/cascade/memories)
- [Aider conventions](https://aider.chat/docs/usage/conventions.html)
- [Continue rules](https://docs.continue.dev/customization/rules)
- [Cline custom instructions](https://docs.cline.bot/features/custom-instructions)

## See also

- [`AGENTS.md`](../../AGENTS.md) — the federated surface
- [`CLAUDE.md`](../../CLAUDE.md) — Claude Code-specific complement
- [`skills/index.yaml`](../../skills/index.yaml) — Skill catalog discoverable by spec-aware harnesses
- [#2805](https://github.com/williamzujkowski/nexus-agents/issues/2805) — tracking epic
- [#2764](https://github.com/williamzujkowski/nexus-agents/issues/2764) — original epic-meta
