---
title: 'MCP Tool: list_experts'
description: 'Inventory of expert ROLES for `create_expert`'
tier: 2
keywords: [mcp, tool, reference, list_experts]
---

# `list_experts`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Inventory of expert ROLES available to `create_expert` (architect, security, devex, etc.). Use this BEFORE create_expert to pick a role; returns role name and capability summary.

## Parameters

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `format` | enum: full \| names | no | Output format: full (with details) or names (just role names) |
