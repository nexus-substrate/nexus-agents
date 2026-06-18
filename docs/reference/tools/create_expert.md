---
title: 'MCP Tool: create_expert'
description: 'Create a specialized expert agent'
tier: 2
keywords: [mcp, tool, reference, create_expert]
---

# `create_expert`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Create a specialized expert agent for code, architecture, security, documentation, testing, devops, research, product management, or UX tasks

## Parameters

| Parameter | Type | Required | Constraints | Description |
| --------- | ---- | -------- | ----------- | ----------- |
| `role` | enum | yes | one of: code_expert \| architecture_expert \| security_expert \| documentation_expert \| testing_expert \| devops_expert \| research_expert \| pm_expert \| ux_expert \| infrastructure_expert \| data_visualization_expert | Expert role to create |
| `modelPreference` | string | no | maxLength 100 | Preferred model (e.g., claude-sonnet-4) |
