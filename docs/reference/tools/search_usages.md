---
title: 'MCP Tool: search_usages'
description: 'Structural usage/call-site search for a symbol via ast-grep (calls, member calls, new, imports, references) — the "where is X used" gap `search_codebase` cannot fill'
tier: 2
keywords: [mcp, tool, reference, search_usages]
---

# `search_usages`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Structural USAGE / call-site search for a symbol via ast-grep (tree-sitter). Answers "where is X used or called" — finds calls foo(), member calls obj.foo(), new Foo(), imports, and bare references with file:line:column + snippet. The gap `search_codebase` CANNOT fill (that indexes declared NAMES only). Excludes the declaration itself. Syntactic, not type-aware. Read-only; results capped (default 50) with overflow reported.

## Parameters

| Parameter | Type | Required | Constraints | Description |
| --------- | ---- | -------- | ----------- | ----------- |
| `symbol` | string | yes | minLength 1; maxLength 200; pattern `^[A-Za-z_$][A-Za-z0-9_$]*$` | Identifier to find usages/call-sites of (a single JS identifier) |
| `path` | string | no | minLength 1; maxLength 500 | Restrict to a single source file (takes precedence over dir) |
| `dir` | string | no | minLength 1; maxLength 500 | Directory to search recursively (default: current working directory) |
| `lang` | enum | no | one of: typescript \| tsx \| javascript | Language override (default: inferred from each file extension, fallback typescript) |
| `limit` | integer | no | min 1; max 500 | Max usage matches emitted (default 50). Excess is reported. |
| `maxDepth` | integer | no | min 1; max 64 | Directory walk depth for dir scope (default 24). |
