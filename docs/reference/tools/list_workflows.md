---
title: 'MCP Tool: list_workflows'
description: 'Inventory of multi-step TEMPLATES for `run_workflow`'
tier: 2
keywords: [mcp, tool, reference, list_workflows]
---

# `list_workflows`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Inventory of multi-step TEMPLATES available to `run_workflow` (code-review, security-audit, etc.). Use this BEFORE run_workflow to pick a template; returns template name, version, description, and category.

## Parameters

| Parameter | Type | Required | Constraints | Description |
| --------- | ---- | -------- | ----------- | ----------- |
| `category` | string | no | — | Filter by category (e.g., development, security) |
| `format` | enum | no | one of: full \| names; default full | Output format: full (with details) or names (just template names) |
