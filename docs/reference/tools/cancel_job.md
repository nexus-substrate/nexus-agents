---
title: 'MCP Tool: cancel_job'
description: 'Mark an async-mode job as cancelled — idempotent (#3042 Stage 1b)'
tier: 2
keywords: [mcp, tool, reference, cancel_job]
---

# `cancel_job`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Mark an async-mode job as cancelled (#3042 Stage 1b / epic #2631). Same-process dispatcher unwinds via AbortSignal (#3035/#3038); cross-process workers observe via get_job_result. Idempotent — cancel-after-complete is a no-op (preserves the terminal record); second cancel returns already_cancelled. Returns outcome envelope discriminating cancelled / already_complete / already_cancelled / unknown_job.

## Parameters

| Parameter | Type | Required | Constraints | Description |
| --------- | ---- | -------- | ----------- | ----------- |
| `jobId` | string | yes | minLength 1; maxLength 128 | Job ID returned by orchestrate / run_workflow / consensus_vote in async mode |
| `reason` | string | no | maxLength 1000 | Optional human-readable note (e.g. "user clicked cancel"). |
