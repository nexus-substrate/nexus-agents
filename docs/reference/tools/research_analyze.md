---
title: 'MCP Tool: research_analyze'
description: 'Analyze registry for gaps, trends, coverage'
tier: 2
keywords: [mcp, tool, reference, research_analyze]
---

# `research_analyze`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Analyze the research registry for gaps, trends, priorities, stale entries, or coverage.

## Parameters

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `focus` | enum: gaps \| trends \| priorities \| stale \| coverage | yes | Analysis focus: gaps (missing coverage), trends (topic distribution), priorities (P1/P2 backlog), stale (outdated entries), coverage (implementation status) |
| `topic` | string | no | Optional topic filter to narrow analysis |
