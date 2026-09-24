---
title: 'MCP Tool: run_graph_workflow'
description: 'Run a DAG workflow with per-node checkpoints + audit trail (linear → `run_workflow`)'
tier: 2
keywords: [mcp, tool, reference, run_graph_workflow]
---

# `run_graph_workflow`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Run a DAG-shaped workflow with per-node checkpoints, event streaming, and an audit trail. Checkpoints drive the executor in-process recovery (crash-resume + selective node retry) and inspection — the MCP call is fire-and-forget with NO caller resume input, and the checkpoint store is in-memory (not durable across process restarts). For straight linear templates, use `run_workflow` instead. The security-audit, test-generation and documentation templates run local heuristic keyword checks and call no model. Their steps are labelled `[heuristic]` (#6676). Supports dispatch: 'async' — returns a jobId immediately; poll get_job_result.

## Parameters

| Parameter | Type | Required | Constraints | Description |
| --------- | ---- | -------- | ----------- | ----------- |
| `workflow` | string | yes | minLength 1; maxLength 100 | Name of the predefined graph workflow to execute |
| `inputs` | object | no | default {} | Input values for the workflow |
| `enableCheckpointing` | boolean | no | default true | Enable checkpoint saving between steps |
| `enableAuditTrail` | boolean | no | default false | Enable audit trail event logging |
| `dispatch` | enum | no | one of: sync \| async; default sync | Async dispatch (#4968). 'sync' (default): run inline and return the result. 'async': return { status: 'pending', jobId } immediately and run in the background; poll get_job_result({ jobId }). Ignored for the `list` sentinel. |
| `mode` | never | no | — | Not an input of this tool. The async switch is `dispatch`; `mode: 'async'` is rejected (#4968). |
