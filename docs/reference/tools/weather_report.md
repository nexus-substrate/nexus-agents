---
title: 'MCP Tool: weather_report'
description: 'Multi-CLI performance weather report'
tier: 2
keywords: [mcp, tool, reference, weather_report]
---

# `weather_report`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Get multi-CLI performance weather report with per-CLI success rates and adaptive routing bonuses.

## Parameters

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `cli` | enum | no | Filter by CLI |
| `category` | enum: architecture \| code_generation \| code_review \| research \| security_review \| planning \| documentation \| testing \| devops \| exploration | no | Filter by task category |
| `includeAdaptive` | boolean | no | Include adaptive routing bonuses (default: true) |
