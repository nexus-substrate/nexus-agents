---
title: 'MCP Tool: execute_spec'
description: 'Execute AI software factory spec pipeline'
tier: 2
keywords: [mcp, tool, reference, execute_spec]
---

# `execute_spec`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Execute an AI software factory spec through the full pipeline (parse, decompose, compile, execute, validate).

## Parameters

| Parameter | Type | Required | Constraints | Description |
| --------- | ---- | -------- | ----------- | ----------- |
| `spec` | string | yes | minLength 1; maxLength 50000 | Markdown specification to execute |
| `dryRun` | boolean | no | default false | Parse and decompose only |
| `dispatch` | enum | no | one of: sync \| async; default sync | Async dispatch (#4968). 'sync' (default): run inline and return the result. 'async': return { status: 'pending', jobId } immediately and run in the background; poll get_job_result({ jobId }). Ignored for dryRun. |
| `mode` | never | no | — | Not an input of this tool. The async switch is `dispatch`; `mode: 'async'` is rejected (#4968). |
