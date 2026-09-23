---
'nexus-agents': minor
---

The codex CLI default model is now `gpt-5.6-sol` (was `gpt-5.5`). Codex retires `gpt-5.5` on 2026-10-14 and names `gpt-5.6-sol` as its upgrade, per the codex model cache. Any codex call that resolves to the CLI default now runs `gpt-5.6-sol`, at models.dev pricing of $4/$20 per 1M tokens (was $5/$30). Budget and cost estimates for the codex CLI drop to match.

- New registry entry `gpt-5.6-sol` (id equals the served slug). Its quality scores are carried over from `gpt-5.5`, not measured. When the two tie in selection, `gpt-5.6-sol` wins.
- `gpt-5.5` stays routable, so configs that pin it keep working until the retirement date. Removing it is tracked in #6526.
- `nexus-agents verify`'s `Codex Models` check now warns when the codex cache says a registry slug retires within 30 days, or has already retired. The warning names the date and the upgrade model. It is a warning, not a failure.
- `ModelId` gains the `'gpt-5.6-sol'` member.
