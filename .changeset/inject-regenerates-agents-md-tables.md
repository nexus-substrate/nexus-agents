---
'nexus-agents': patch
---

`pnpm governance:inject` now regenerates the MCP tools reference and the workflows (skills) table in AGENTS.md from the same generators it uses for CLAUDE.md, the way it already regenerated the rules index there. Before, those two AGENTS.md tables were hand-maintained: `inject` copied a stale table into CLAUDE.md and then overwrote it with the generated one, so CLAUDE.md always looked current, `governance:check` passed, and the only way to fix AGENTS.md was a hand edit. `governance:check` now renders AGENTS.md's generated sections and compares them to the file, naming each stale section with its first differing line (`AGENTS.md MCP Tools Reference is stale (#6105) — first difference at AGENTS.md:N`) and prescribing `pnpm governance:inject`, which now actually repairs it.
