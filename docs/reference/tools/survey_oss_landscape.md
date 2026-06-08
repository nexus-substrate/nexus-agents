---
title: 'MCP Tool: survey_oss_landscape'
description: 'Transient OSS project search (license, stars, last-commit) via GitHub'
tier: 2
keywords: [mcp, tool, reference, survey_oss_landscape]
---

# `survey_oss_landscape`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Transient OSS project search via the GitHub search API. Returns a ranked list of repositories with license (SPDX), last-commit, star-count, and one-line description. Does NOT persist to the research registry — for one-off engineering decisions like "what tools exist in this space?".

## Parameters

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `query` | string | yes | Free-text search query, e.g. "cargo nextest replacement" or "OSS SBOM tools" |
| `maxResults` | number | no | Maximum candidates to return (1-50; default 10) |
| `minStars` | number | no | Minimum star count to include (default 0; useful for filtering noise) |
| `language` | string | no | GitHub language filter, e.g. "rust" or "typescript" |
