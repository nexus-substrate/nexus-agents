---
title: 'MCP Tool: orchestrate'
description: 'Task orchestration with Orchestrator coordination'
tier: 2
keywords: [mcp, tool, reference, orchestrate]
---

# `orchestrate`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Orchestrate a task by analyzing it, breaking it into subtasks if needed, and coordinating expert agents

## Parameters

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `task` | string | yes | Task description to orchestrate |
| `context` | record | no | Additional context for the task |
| `maxIterations` | number | no | Maximum iterations for orchestration |
| `timeout` | number | no | Timeout in milliseconds for orchestration (default: 300000) |
| `mode` | enum: sync \| async | no | Dispatch mode (default: sync). Use "async" for long-running orchestrations. |
| `idempotencyKey` | string | no | Replay-safe key for async-mode dispatch (#3042 Stage 1c). Same (key, inputs) returns existing jobId; same key + different inputs fails closed. |
