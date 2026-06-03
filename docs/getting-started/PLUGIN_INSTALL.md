---
title: 'Claude Code Plugin Install'
description: Install nexus-agents as a Claude Code plugin — exposes 44 MCP tools, 32 skills, 12 agent mirrors, and governance hooks
tier: 2
keywords: [plugin, claude-code, installation, marketplace, mcp, getting-started]
---

# Installing nexus-agents as a Claude Code plugin

**Status:** Canonical
**Issue:** [#1826](https://github.com/nexus-substrate/nexus-agents/issues/1826)

Nexus-agents ships as a Claude Code plugin. Installing it exposes:

- 44 MCP tools (`orchestrate`, `consensus_vote`, `research_*`, `run_*`, etc.)
- 32 skills (research-and-vote, implement-feature, bug-fix, …)
- 12 agent mirrors (security, architecture, code, research, testing experts)
- 2 governance hooks (fitness-gate, secret-scan)

## Prerequisites

- **Node.js 22.x LTS** — required for the MCP server
- **Claude Code** (or another agent that reads `.claude-plugin/` directly)

## Install

The marketplace is self-hosted on this repo. Add it once, then install nexus-agents:

```
/plugin marketplace add nexus-substrate/nexus-agents
/plugin install nexus-agents@nexus-substrate
```

Claude Code resolves the marketplace from `.claude-plugin/marketplace.json` at the repo root and pins the source to the current commit SHA. Updates re-resolve the SHA.

## Verify

After install, confirm the 44 MCP tools are reachable:

```
/mcp
```

You should see `nexus-agents` listed with tools like `orchestrate`, `consensus_vote`, `run_pipeline`. The 32 skills appear in `/skills`, and the 12 agents in `/agents`.

## What gets installed

| Component          | Path in repo                                | Loaded by                                                                               |
| ------------------ | ------------------------------------------- | --------------------------------------------------------------------------------------- |
| Plugin manifest    | `.claude-plugin/plugin.json`                | Claude Code                                                                             |
| MCP config         | `.mcp.json` (copy from `.mcp.json.example`) | Claude Code (stdio server)                                                              |
| Skills (canonical) | `skills/<name>/SKILL.md` (17)               | Claude Code autoloads; non-Claude agents discover via `AGENTS.md` → `skills/index.yaml` |
| Agents             | `agents/*.md` (5)                           | `/agents` UI                                                                            |
| Hooks              | `hooks/hooks.json` + `*.sh`                 | `PreToolUse` matchers                                                                   |

## Uninstall

```
/plugin uninstall nexus-agents
```

Cache at `~/.claude/plugins/` is cleared automatically.

## Troubleshooting

**MCP tools don't appear.** Ensure Node 22+ is on your `PATH` — the server launches via `npx -y nexus-agents --mode=server`. Check the Claude Code logs for `ENOENT` or `EACCES`.

**Hooks don't fire.** Hooks are registered at plugin root via `${CLAUDE_PLUGIN_ROOT}/hooks/*.sh`. Verify the plugin's runtime root is resolvable via `echo $CLAUDE_PLUGIN_ROOT` inside a hook script.

**Skill activation misses.** Claude Code autoloads SKILL.md frontmatter by description. If a trigger isn't firing, make the `description` more explicit (e.g., quote the exact user phrase). Non-Claude agents use `skills/index.yaml` for discovery — see `AGENTS.md`.

## Related

- [AGENTS.md](../../AGENTS.md) — guidance for non-Claude agents
- [docs/ENTRYPOINTS.md](../ENTRYPOINTS.md) — full CLI/MCP reference
- [docs/architecture/RESEARCH_PIPELINE.md](../architecture/RESEARCH_PIPELINE.md) — research pipeline component
- Epic [#1825](https://github.com/nexus-substrate/nexus-agents/issues/1825) — plugin integration
