---
title: 'MCP Tool: cancel_job'
description: 'Cancel an async-mode job; aborts in-flight voters and workers — idempotent (#3042)'
tier: 2
keywords: [mcp, tool, reference, cancel_job]
---

# `cancel_job`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Cancel an async-mode job and abort its in-flight work. Marks the record cancelled (#3042 / epic #2631), then the same-process body unwinds via AbortSignal: it aborts in-flight voter calls (#6729) and orchestrate worker dispatch (#6692); not every dev-pipeline stage forwards it yet (#6747). A cancelled consensus_vote reaches no decision and writes nothing to the vote ledger; the votes already cast are attached to the cancelled record as a partial (#6735). Cross-process workers observe the cancel via get_job_result. Idempotent — cancel-after-complete is a no-op (preserves the terminal record); second cancel returns already_cancelled. Returns outcome envelope discriminating cancelled / already_complete / already_cancelled / unknown_job.

## Parameters

| Parameter | Type | Required | Constraints | Description |
| --------- | ---- | -------- | ----------- | ----------- |
| `jobId` | string | yes | minLength 1; maxLength 128; pattern `^[A-Za-z0-9_-]{1,128}$` | Job ID returned by orchestrate / run_workflow / consensus_vote in async mode |
| `reason` | string | no | maxLength 1000 | Optional human-readable note (e.g. "user clicked cancel"). |
