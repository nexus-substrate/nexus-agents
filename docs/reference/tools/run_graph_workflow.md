---
title: 'MCP Tool: run_graph_workflow'
description: 'Run a DAG workflow with per-node checkpoints + audit trail (linear → `run_workflow`)'
tier: 2
keywords: [mcp, tool, reference, run_graph_workflow]
---

# `run_graph_workflow`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Run a DAG-shaped workflow with per-node checkpoints, event streaming, and an audit trail. Use for multi-step pipelines where intermediate state must survive failures (checkpoints persist per node for inspection/restart). For straight linear templates, use `run_workflow` instead.

## Parameters

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `workflow` | string | yes | Name of the predefined graph workflow to execute |
| `inputs` | record | no | Input values for the workflow |
| `enableCheckpointing` | boolean | no | Enable checkpoint saving between steps |
| `enableAuditTrail` | boolean | no | Enable audit trail event logging |
| `dispatch` | enum: sync \| async | no | Dispatch mode (#3732). 'sync' (default): run inline. 'async': return a jobId immediately + run in background (poll get_job_result). |
