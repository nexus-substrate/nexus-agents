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

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `query` | string | yes | Search query (symbol name, keyword, or pattern) |
| `directory` | string | no | Directory to search (default: current working directory) |
| `limit` | number | no | Max results (default: 20) |
| `mode` | enum: search \| summary \| list | no | search: find symbols. summary: file overview. list: list indexed files. |
