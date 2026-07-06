---
title: 'MCP Tool: extract_symbols'
description: 'TypeScript-compiler-API AST symbols from a SINGLE file (functions/classes/types)'
tier: 2
keywords: [mcp, tool, reference, extract_symbols]
---

# `extract_symbols`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Parse a SINGLE source file with the TypeScript compiler API and return its structural symbols (functions, classes, types). Use when you need the AST shape of one file. Not a cross-file search.

## Parameters

| Parameter | Type | Required | Constraints | Description |
| --------- | ---- | -------- | ----------- | ----------- |
| `filePath` | string | yes | minLength 1; maxLength 500 | Path to TypeScript/JavaScript file to extract symbols from |
| `mode` | enum | no | one of: index \| full | index: names+lines only (minimal tokens). full: includes source text. |
| `maxChars` | integer | no | max 1000000; > 0 | full mode only: cap on total emitted symbol source chars (default 20000). Excess is truncated and reported, never silently dropped. |
| `maxSymbols` | integer | no | max 10000; > 0 | full mode only: cap on number of symbols emitted (default 200). |
