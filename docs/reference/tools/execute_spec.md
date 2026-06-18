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
| `dispatch` | enum | no | one of: sync \| async; default sync | Dispatch mode (#3732). 'sync' (default): run inline. 'async': return a jobId immediately + run in background (poll get_job_result). Ignored for dryRun. |
