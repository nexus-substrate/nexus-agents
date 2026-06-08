---
title: 'MCP Tool: compare_data_feeds'
description: 'Diff two YAML/JSON feeds: coverage + per-field axes'
tier: 2
keywords: [mcp, tool, reference, compare_data_feeds]
---

# `compare_data_feeds`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Diff two upstream data feeds (YAML or JSON files) along coverage and per-field axes. Returns which entries exist in A, B, both, plus optional field-level diffs across matched entries. v1 takes file paths only (no URL fetch — that needs an SSRF design pass).

## Parameters

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `feedAPath` | string | yes | Filesystem path to feed A (YAML or JSON, auto-detected by extension) |
| `feedBPath` | string | yes | Filesystem path to feed B |
| `keyPath` | string | yes | Dotted path to the entry key, e.g. "id" or "name". Each entry must have this field. |
| `compareFields` | array | no | Optional dotted field paths to compare across matched entries (e.g. ["license", "sha256"]) |
