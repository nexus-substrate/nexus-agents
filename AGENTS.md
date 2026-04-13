# AGENTS.md — nexus-agents

Guidance for AI coding agents (Claude Code, OpenCode, Codex, Gemini CLI, Cursor, Aider, Goose, Continue, Cline) working in this repo.

## Primary instructions

The canonical project instructions live in **[CLAUDE.md](./CLAUDE.md)**. Read that file first. It covers:

- Prime directive (correctness > simplicity > performance > cleverness)
- TDD, YAGNI, DRY discipline
- Canonical paths (task analysis, routing, consensus, adapters, pipelines, security)
- Zero `any` TypeScript policy
- Anti-sprawl + canonical-path rules
- Governance (voting thresholds, refactor gates, fitness audit)
- Untrusted input handling

Non-Claude agents should treat CLAUDE.md as authoritative repo context equivalent to what Codex/OpenCode call `AGENTS.md`.

## Skills

This repo ships skills at **`skills/<name>/SKILL.md`** following the Anthropic Agent Skills spec. Claude Code autoloads them natively. Other agents should consult the generated index below.

**Discovery for non-Claude agents:**

1. Read **[`skills/index.yaml`](./skills/index.yaml)** — compact list of `{name, description, triggers, path}` for all 17 skills.
2. When a user request matches a skill's triggers, read the full `SKILL.md` at the listed path.
3. Follow its workflow.

**Freshness:** `skills/index.yaml` is regenerated via `npx tsx scripts/generate-skills-index.ts` and gated in CI. Never edit it by hand.

## Expert agents

Twelve expert-role prompts ship at **`agents/<name>-expert.md`** (security, architecture, code, research, testing, documentation, devops, pm, ux, infrastructure, qa, data-visualization). Claude Code surfaces these via `/agents`.

**Discovery for non-Claude agents:** read **[`agents/index.yaml`](./agents/index.yaml)** — `{name, description, path}` per expert. Pick the one matching the task (e.g., security review → `security-expert`) and read its full prompt before responding. Regenerated via `npx tsx scripts/generate-agents-index.ts`; CI enforces gap-coverage against `BUILT_IN_EXPERTS`.

## MCP server

Nexus-agents exposes 30 MCP tools via stdio. From any MCP-aware agent:

```
npx -y nexus-agents --mode=server
```

Tool reference: [docs/ENTRYPOINTS.md](./docs/ENTRYPOINTS.md).

## Quick map

| Need                                 | Go to                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| Project instructions                 | [CLAUDE.md](./CLAUDE.md)                                                           |
| Skills (canonical)                   | [`skills/<name>/SKILL.md`](./skills/)                                              |
| Skills (index for non-Claude agents) | [`skills/index.yaml`](./skills/index.yaml)                                         |
| MCP tool reference                   | [docs/ENTRYPOINTS.md](./docs/ENTRYPOINTS.md)                                       |
| Documentation index                  | [docs/README.md](./docs/README.md)                                                 |
| Contribution workflow                | [docs/development/CONTRIBUTION_GUIDE.md](./docs/development/CONTRIBUTION_GUIDE.md) |
