---
title: 'MCP Tool: list_available_models'
description: 'Probe all model-discovery transports (OpenRouter API + opencode/claude/codex/gemini CLIs) and report per-transport health — validates the CLIs/APIs are reachable (#3406)'
tier: 2
keywords: [mcp, tool, reference, list_available_models]
---

# `list_available_models`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Probe every model-discovery transport (#3406, epic #3403) — the OpenRouter live catalog + the opencode/claude/codex/gemini CLI adapters — and return a per-transport health report { transport, ok, modelCount, sampleModelIds, error }. A one-call validation that the CLIs and APIs are wired and reachable. includeModelIds returns the full id list; includeOpenRouter (default true) toggles the catalog probe. Existence only — the in-tree registry stays authoritative for pricing/capability. Read-only; changes no routing.

## Parameters

| Parameter | Type | Required | Constraints | Description |
| --------- | ---- | -------- | ----------- | ----------- |
| `includeModelIds` | boolean | no | — | Include the full model-id list per transport (default false → sample of 5 only). |
| `includeOpenRouter` | boolean | no | — | Probe the OpenRouter live catalog (default true). |
