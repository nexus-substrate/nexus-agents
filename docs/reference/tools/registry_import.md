---
title: 'MCP Tool: registry_import'
description: 'Draft YAML for a NEW model entry (for picking existing models use `delegate_to_model`)'
tier: 2
keywords: [mcp, tool, reference, registry_import]
---

# `registry_import`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Draft a registry ENTRY YAML for a NEW model so routing can consider it later. Returns the YAML to stdout for human review; does not write the registry. For picking among already-registered models, use `delegate_to_model`.

## Parameters

| Parameter | Type | Required | Constraints | Description |
| --------- | ---- | -------- | ----------- | ----------- |
| `provider` | enum | yes | one of: anthropic \| google \| openai | Model provider (anthropic, google, openai) |
| `modelId` | string | yes | minLength 1 | Provider model identifier |
| `dryRun` | boolean | no | default true | Preview without persisting |
