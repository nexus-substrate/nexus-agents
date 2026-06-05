---
'nexus-agents': patch
---

Key-free CLI model enumeration via models.dev — Phase 1b (#3405, epic #3403). The claude/codex/gemini CLI adapters now implement `listModels()`, backed by the committed, CI-refreshed models.dev snapshot filtered by vendor (`anthropic`/`openai`/`google`) — no API key needed (their OAuth tokens can't call the vendor `/v1/models` REST endpoints; only opencode has a native list command). New `config/models-dev-by-vendor.ts` exposes `listModelsForCli(cli)` / `listModelsByVendor(vendor)` (fail-open: a missing/malformed snapshot yields `[]`). With this, `registerDefaultModelSources` (#3404) now populates the AvailableModelsCache with all four transports, so the CLI routing pre-filter finally sees real per-CLI model sets. Existence only — the in-tree registry stays authoritative for pricing/capability.
