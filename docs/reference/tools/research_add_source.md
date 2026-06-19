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

| Parameter | Type | Required | Constraints | Description |
| --------- | ---- | -------- | ----------- | ----------- |
| `url` | string | yes | minLength 1; maxLength 500 | Source URL (GitHub repo, docs page, blog post) |
| `name` | string | yes | minLength 1; maxLength 200 | Display name for the source |
| `type` | enum | yes | one of: product_docs \| specification \| research_blog \| code_analysis \| open_source_repo | Source type classification |
| `vendor` | string | no | maxLength 100 | Vendor or organization |
| `topics` | array of string | no | — | Research topics (max 5) |
| `tags` | array of string | no | — | Searchable tags (max 10) |
| `quality_signals` | object | no | — | Quality signals used to compute quality_score; provide explicitly — no GitHub metadata is fetched |
| `techniques_extracted` | array of string | no | — | Techniques identified in this source (max 5) |
| `verdict` | enum | no | one of: adopted \| partially_adopted \| rejected \| monitoring \| planned | Adoption verdict |
| `verdict_notes` | string | no | maxLength 500 | Notes explaining the verdict |
| `dryRun` | boolean | no | default false | Preview without persisting |
