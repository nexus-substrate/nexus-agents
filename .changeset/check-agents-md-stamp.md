---
'nexus-agents': patch
---

fix(governance): `check` measures the AGENTS.md governance stamp and count phrases (#6130)

`pnpm governance:check` passed on an AGENTS.md whose `_Governance Version:_` line had been hand-edited to a bogus hash. `inject` wrote that stamp through an ancillary replacer and nothing read it back; the CLAUDE.md render copied the stale value in and overwrote it with the computed one, so CLAUDE.md was a fixed point and the stale AGENTS.md — the file Codex, Gemini CLI and OpenCode read — went unreported. The AGENTS.md render now carries the VERSION section (from the same generator as CLAUDE.md's) and the two count phrases (`for all N skills.`, `Nexus-agents exposes N MCP tools`), so the render is the one write path for AGENTS.md's generated text and `check` compares it to the file. A stale stamp fails as `AGENTS.md governance stamp is stale (#6130) — first difference at AGENTS.md:N` with the expected and on-disk lines; a stale count phrase as `AGENTS.md skills count is stale (#6130): <on disk> → <expected>`; each cause is reported independently of the others, and one `pnpm governance:inject` repairs all of them. A committed tree that already carries the computed stamp is unchanged.
