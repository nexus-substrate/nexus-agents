---
title: 'MCP Tool: get_job_result'
description: 'Read result of an async-mode dispatch by jobId (#3042 / #2631)'
diataxis: reference
audience: user
tier: 2
keywords: [mcp, tool, reference, get_job_result]
---

# `get_job_result`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Read the result of an async-mode tool invocation by jobId (#3042 / epic #2631). Returns the structured record (status, result | error, timestamps, and on a pending record lastProgressAt — the job body's last heartbeat, so slow can be told from stuck; #6162). Poll until status !== "pending". Failed development-plan jobs may carry failureEvidence (diagnostics, never approval or a resumable checkpoint). Each plan/proposal retains at most 32768 UTF-8 bytes. coverage is complete, redacted, truncated or invalid; redacted and truncated flags distinguish combined transformations. rawSha256 binds original bytes, sanitizedSha256 binds all delivery-sanitized bytes, and retainedSha256 binds returned text. Evidence is made stable under both leaf and serialized JSON redaction before hashing. For example, coverage=redacted with truncated=false means all sanitized text survived, but the raw artifact cannot be reconstructed. Absent evidence or proposal means unmeasured, not complete. Terminal task state takes precedence over the sidecar.

## Parameters

| Parameter | Type | Required | Constraints | Description |
| --------- | ---- | -------- | ----------- | ----------- |
| `jobId` | string | yes | minLength 1; maxLength 128; pattern `^[A-Za-z0-9_-]{1,128}$` | Job ID returned by any tool called with dispatch: "async" (e.g. orchestrate) |
