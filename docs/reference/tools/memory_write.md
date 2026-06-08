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

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `key` | string | yes | Memory identifier or subject |
| `content` | string | yes | Memory content to store |
| `backend` | enum: session \| belief \| agentic \| adaptive \| typed | yes | Target memory backend: session (learnings), belief (triples), agentic (knowledge), adaptive (priority-scored), typed (MIRIX-style semantic) |
| `confidence` | enum: high \| medium \| low | no | Confidence level (default: medium) |
| `metadata` | record | no | Optional key-value metadata tags |
