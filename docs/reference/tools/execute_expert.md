---
title: 'MCP Tool: execute_expert'
description: 'Run a task through a previously-created expert (by expertId)'
tier: 2
keywords: [mcp, tool, reference, execute_expert]
---

# `execute_expert`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Run a task through an expert YOU PREVIOUSLY CREATED via `create_expert`. Requires the expertId returned by create_expert; not for ad-hoc execution.

## Parameters

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `expertId` | string | yes | Expert ID from create_expert tool |
| `task` | string | yes | Task description for the expert to execute |
| `context` | record | no | Additional context metadata for the task |
| `timeoutMs` | number | no | Optional timeout in ms (120s-900s). Overrides auto-detected timeout. |
| `previousExpertSummary` | string | no | Summary from a previous expert in the chain. Injected into prompt for context continuity. |
