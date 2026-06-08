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

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `topic` | string | yes | Research topic to search for (e.g., "multi-agent orchestration") |
| `source` | enum: arxiv \| github \| google_ai \| meta_fair \| microsoft \| deepmind \| semantic_scholar \| papers_with_code \| openalex \| all | no | Source to search: arxiv, github, google_ai, meta_fair, microsoft, deepmind, semantic_scholar, papers_with_code, openalex, or all |
| `maxResults` | number | no | Maximum results to return |
| `sinceDate` | string | no | Only return results after this date (YYYY-MM-DD format) |
| `relevanceThreshold` | number | no | Minimum relevance score (0-1) to include in results. Higher values filter more aggressively. |
