---
'nexus-agents': minor
---

Expose dynamic model discovery to the harness — Phase 1c (#3406, epic #3403). Adds a callable **`list_available_models`** MCP tool that actively probes every discovery transport (OpenRouter live catalog + opencode/claude/codex/gemini CLI adapters) and returns a per-transport health report `{ transport, ok, modelCount, sampleModelIds, error }` — a one-call way to validate the CLIs and APIs are wired and reachable (`includeModelIds` for the full list; `includeOpenRouter` toggles the catalog). Also adds a read-only **`nexus://available-models`** MCP resource surfacing the live discovered set (complements the static `nexus://models`). Both are existence-only — the in-tree registry stays authoritative for pricing/capability, and neither emits key-presence or credential data. Read-only; changes no routing. MCP tool count: 44 → 45.
