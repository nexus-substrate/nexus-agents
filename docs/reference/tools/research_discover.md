---
title: 'MCP Tool: research_discover'
description: 'Discover papers/repos from external sources'
tier: 2
keywords: [mcp, tool, reference, research_discover]
---

# `research_discover`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Discover new research papers and repositories from external sources. Searches arXiv, GitHub, and other sources.

## Parameters

| Parameter | Type | Required | Constraints | Description |
| --------- | ---- | -------- | ----------- | ----------- |
| `topic` | string | yes | minLength 1; maxLength 200 | Research topic to search for (e.g., "multi-agent orchestration") |
| `source` | enum | no | one of: arxiv \| github \| google_ai \| meta_fair \| microsoft \| deepmind \| semantic_scholar \| papers_with_code \| openalex \| all; default all | Source to search: arxiv, github, google_ai, meta_fair, microsoft, deepmind, semantic_scholar, papers_with_code, openalex, or all |
| `maxResults` | number | no | min 1; max 20; default 10 | Maximum results to return |
| `sinceDate` | string | no | — | Only return results after this date (YYYY-MM-DD format) |
| `relevanceThreshold` | number | no | min 0; max 1; default 0.3 | Minimum relevance score (0-1) to include in results. Higher values filter more aggressively. |
