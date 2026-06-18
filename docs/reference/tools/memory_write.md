---
title: 'MCP Tool: memory_write'
description: 'Write to typed memory backends'
tier: 2
keywords: [mcp, tool, reference, memory_write]
---

# `memory_write`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Write a memory entry to a specific backend. Supports session, belief, agentic, adaptive, and typed backends.

## Parameters

| Parameter | Type | Required | Constraints | Description |
| --------- | ---- | -------- | ----------- | ----------- |
| `key` | string | yes | minLength 1; maxLength 200 | Memory identifier or subject |
| `content` | string | yes | minLength 1; maxLength 5000 | Memory content to store |
| `backend` | enum | yes | one of: session \| belief \| agentic \| adaptive \| typed | Target memory backend: session (learnings), belief (triples), agentic (knowledge), adaptive (priority-scored), typed (MIRIX-style semantic) |
| `confidence` | enum | no | one of: high \| medium \| low; default medium | Confidence level (default: medium) |
| `metadata` | object | no | — | Optional key-value metadata tags |
