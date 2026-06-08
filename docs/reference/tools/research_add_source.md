---
title: 'MCP Tool: research_add_source'
description: 'Add a NON-PAPER source (repo/tool/blog) — for arXiv papers use `research_add`'
tier: 2
keywords: [mcp, tool, reference, research_add_source]
---

# `research_add_source`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

NON-PAPER source: add a GitHub repo / tool / blog URL to the research registry with auto quality-scoring. For arXiv papers, use `research_add` instead.

## Parameters

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `url` | string | yes | Source URL (GitHub repo, docs page, blog post) |
| `name` | string | yes | Display name for the source |
| `type` | SourceTypeEnum | yes | Source type classification |
| `vendor` | string | no | Vendor or organization |
| `topics` | array | no | Research topics (max 5) |
| `tags` | array | no | Searchable tags (max 10) |
| `quality_signals` | object | no | Quality signals (auto-fetched for GitHub repos if omitted) |
| `techniques_extracted` | array | no | Techniques identified in this source (max 5) |
| `verdict` | VerdictEnum | no | Adoption verdict |
| `verdict_notes` | string | no | Notes explaining the verdict |
| `dryRun` | boolean | no | Preview without persisting |
