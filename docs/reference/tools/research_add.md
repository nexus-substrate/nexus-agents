---
title: 'MCP Tool: research_add'
description: 'Add an arXiv PAPER to the registry (for non-paper sources use `research_add_source`)'
tier: 2
keywords: [mcp, tool, reference, research_add]
---

# `research_add`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

PAPER-only: add an arXiv preprint to the research registry by arXiv ID. Fetches metadata from arxiv.org. For non-paper sources (GitHub repos, tools, blogs), use `research_add_source` instead.

## Parameters

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `arxivId` | string | yes | arXiv paper ID (e.g., "2401.12345") |
| `topic` | string | no | Research topic to categorize the paper under |
| `priority` | enum: P1 \| P2 \| P3 \| P4 | no | Priority level for the paper |
| `dryRun` | boolean | no | Preview what would be added without persisting |
