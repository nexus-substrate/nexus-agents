---
title: 'MCP Tool: run_workflow'
description: 'Run a linear workflow template (use `run_graph_workflow` for DAGs)'
tier: 2
keywords: [mcp, tool, reference, run_workflow]
---

# `run_workflow`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Run a LINEAR (single-path) workflow template by name with typed inputs. For DAG-shaped workflows with branching or per-node checkpoints, use `run_graph_workflow` instead. Supports dispatch: 'async' (non-dryRun runs; `mode` is a deprecated alias) — returns a jobId immediately; poll get_job_result.

## Parameters

| Parameter | Type | Required | Constraints | Description |
| --------- | ---- | -------- | ----------- | ----------- |
| `template` | string | yes | minLength 1 | Workflow template name (e.g., code-review) or file path |
| `inputs` | object | yes | — | Workflow inputs as key-value pairs |
| `dryRun` | boolean | no | default false | Validate workflow without executing |
| `timeoutMs` | integer | no | min 1000; max 1800000 | Per-phase execution timeout in ms (overrides workflow.timeout) |
| `maxTokens` | integer | no | max 9007199254740991; > 0 | Token ceiling for the whole run. The ONLY source of a run_workflow cap: enforced when NEXUS_BUDGET_ENFORCE is on and this is set (no estimated default). Checked before each phase and before each step is dispatched; steps already running are not halted. |
| `dispatch` | enum | no | one of: sync \| async | Async dispatch (#4968). 'sync' (default): run inline and return the result. 'async': return { status: 'pending', jobId } immediately and run in the background; poll get_job_result({ jobId }). |
| `mode` | enum | no | one of: sync \| async | DEPRECATED alias of `dispatch` (removed in the next major, #6225). Send `dispatch` instead; a call that sends only `mode` still works and returns a deprecation warning. |
| `idempotencyKey` | string | no | minLength 1; maxLength 256 | Replay-safe key for async-mode dispatch (#3042 Stage 1c). Same (key, inputs) returns existing jobId. |
