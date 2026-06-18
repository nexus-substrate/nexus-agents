---
title: 'MCP Tool: research_query'
description: 'Query research registry (status, overlap, stats, search)'
tier: 2
keywords: [mcp, tool, reference, research_query]
---

# `research_query`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Query the research registry for technique status, overlaps, statistics, or text search.

## Parameters

| Parameter | Type | Required | Constraints | Description |
| --------- | ---- | -------- | ----------- | ----------- |
| `action` | enum | yes | one of: status \| overlap \| stats \| search | Query action: status (technique status), overlap (find related techniques), stats (registry statistics), search (text search) |
| `techniqueId` | string | no | — | Technique ID for status/overlap queries |
| `query` | string | no | — | Search query string for search action |
| `status` | enum | no | one of: implemented \| planned \| not-started \| rejected \| all; default all | Filter by technique status (for status action) |
| `threshold` | number | no | min 0; max 1; default 0.3 | Overlap threshold (0-1) for overlap action |
