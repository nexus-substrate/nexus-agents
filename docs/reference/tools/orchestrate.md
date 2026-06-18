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

| Parameter | Type | Required | Constraints | Description |
| --------- | ---- | -------- | ----------- | ----------- |
| `task` | string | yes | minLength 1; maxLength 50000 | Task description to orchestrate |
| `context` | object | no | — | Additional context for the task |
| `maxIterations` | number | no | min 1; max 50; default 10 | Maximum iterations for orchestration |
| `timeout` | number | no | min 1000; max 600000 | Timeout in milliseconds for orchestration (default: 300000) |
| `mode` | enum | no | one of: sync \| async | Dispatch mode (default: sync). Use "async" for long-running orchestrations. |
| `idempotencyKey` | string | no | minLength 1; maxLength 256 | Replay-safe key for async-mode dispatch (#3042 Stage 1c). Same (key, inputs) returns existing jobId; same key + different inputs fails closed. |
