---
title: 'MCP Tool: repo_analyze'
description: 'Analyze GitHub repository structure'
tier: 2
keywords: [mcp, tool, reference, repo_analyze]
---

# `repo_analyze`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Analyze a GitHub repository structure. Returns language, framework, package manager, CI provider, security tooling, and gap identification.

## Parameters

| Parameter | Type | Required | Constraints | Description |
| --------- | ---- | -------- | ----------- | ----------- |
| `repo` | string | yes | minLength 1 | GitHub repository in "owner/name" format (e.g., "cloudfoundry/korifi") or full URL |
| `depth` | enum | no | one of: shallow \| deep; default shallow | Currently a no-op — the handler always runs the full analysis (both values identical) |
