---
title: 'MCP Tool: memory_query'
description: 'Query across all memory backends'
tier: 2
keywords: [mcp, tool, reference, memory_query]
---

# `memory_query`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Query across all memory backends with unified results and relevance scoring.

## Parameters

| Parameter | Type | Required | Constraints | Description |
| --------- | ---- | -------- | ----------- | ----------- |
| `query` | string | yes | minLength 1; maxLength 500 | Search query to match against memory contents |
| `limit` | integer | no | min 1; max 50; default 10 | Maximum results to return (default: 10, max: 50) |
| `source` | enum | no | one of: session \| belief \| agentic \| typed \| adaptive \| all; default all | Filter by memory source (default: all) |
