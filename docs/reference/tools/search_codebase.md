---
title: 'MCP Tool: search_codebase'
description: 'Cross-file ripgrep search for patterns or text (not an AST parser)'
tier: 2
keywords: [mcp, tool, reference, search_codebase]
---

# `search_codebase`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Cross-file ripgrep-style search over the working directory for code patterns, symbols, or text. Use when you need usages of a symbol across MANY files. Not an AST parser — for single-file structure use `extract_symbols`.

## Parameters

| Parameter | Type | Required | Constraints | Description |
| --------- | ---- | -------- | ----------- | ----------- |
| `query` | string | yes | minLength 1; maxLength 200 | Search query (symbol name, keyword, or pattern) |
| `directory` | string | no | minLength 1; maxLength 500 | Directory to search (default: current working directory) |
| `limit` | number | no | min 1; max 50 | Max results (default: 20) |
| `mode` | enum | no | one of: search \| summary \| list | search: find symbols. summary: file overview. list: list indexed files. |
