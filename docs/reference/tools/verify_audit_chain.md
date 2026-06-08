---
title: 'MCP Tool: verify_audit_chain'
description: 'Verify hash chain of a FileAuditStorage audit log directory'
tier: 2
keywords: [mcp, tool, reference, verify_audit_chain]
---

# `verify_audit_chain`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Verify the hash chain of a persisted FileAuditStorage audit log directory (#2281 follow-up). Reads all audit-*.jsonl files, parses events, runs verifyChain() to detect tampering. Returns eventCount, fileCount, and one of three tamper signals (hash_mismatch, previous_hash_mismatch, missing_hash) if detected. Read-only.

## Parameters

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `logDir` | string | yes | Filesystem path to the FileAuditStorage log directory. Tool reads all `audit-*.jsonl` files in lexicographic order and verifies the combined chain. |
