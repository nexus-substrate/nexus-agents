---
title: 'MCP Tool: research_catalog_review'
description: 'Review auto-cataloged research references'
tier: 2
keywords: [mcp, tool, reference, research_catalog_review]
---

# `research_catalog_review`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Review auto-cataloged research references found during tool execution.

## Parameters

| Parameter | Type | Required | Constraints | Description |
| --------- | ---- | -------- | ----------- | ----------- |
| `action` | enum | yes | one of: list \| approve \| dismiss \| flush | Action: list (show pending), approve (add to registry), dismiss (remove), flush (clear all) |
| `identifier` | string | no | — | Reference identifier for approve/dismiss actions (arXiv ID or GitHub URL) |
| `topic` | string | no | — | Topic to assign when approving an arXiv paper |
| `createIssue` | boolean | no | default false | When approving, also create a GitHub issue for the paper |
