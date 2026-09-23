---
'nexus-agents': patch
---

Repoint two codex registry entries at models the installed codex CLI serves. codex-cli 0.155.1 no longer serves `gpt-5.3-codex-spark` or `gpt-5.4-mini`, so every codex call routed to `codex-5.2` or `codex-5.1-mini` was rejected, and `nexus-agents verify` warned `Codex Models: not served`.

- `codex-5.2` (fast codex tier, still the balanced-tier pick) now runs `gpt-5.6-luna`: $0.20/$1.20 per 1M tokens, 1.05M context.
- `codex-5.1-mini` (compact tier) now runs `gpt-6-luna`, the cheapest served model: $0.10/$0.50 per 1M tokens, 1.05M context.

The registry ids are unchanged, so routing history and any config naming `codex-5.2` / `codex-5.1-mini` keep working. Cost estimates for both ids drop to match the new models, and `codex-5.2`'s cost score moves from 7 to 9 to follow its price. `OPENAI_MODELS.GPT_5_2_CODEX`, which derives from `codex-5.2`, now resolves to `gpt-5.6-luna`.
