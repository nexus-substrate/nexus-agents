---
title: 'MCP Tool: run_workflow'
description: 'Run a linear workflow template (use `run_graph_workflow` for DAGs)'
tier: 2
keywords: [mcp, tool, reference, run_workflow]
---

# `run_workflow`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Run a LINEAR (single-path) workflow template by name with typed inputs. For DAG-shaped workflows with branching or per-node checkpoints, use `run_graph_workflow` instead.

## Parameters

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `template` | string | yes | Workflow template name (e.g., code-review) or file path |
| `inputs` | record | yes | Workflow inputs as key-value pairs |
| `dryRun` | boolean | no | Validate workflow without executing |
| `timeoutMs` | number | no | Per-phase execution timeout in ms (overrides workflow.timeout) |
| `mode` | enum: sync \| async | no | Dispatch mode (default: sync). Use "async" for long-running workflows. |
| `idempotencyKey` | string | no | Replay-safe key for async-mode dispatch (#3042 Stage 1c). Same (key, inputs) returns existing jobId. |
