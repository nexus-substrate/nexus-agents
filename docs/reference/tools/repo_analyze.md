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

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `repo` | string | yes | GitHub repository in "owner/name" format (e.g., "cloudfoundry/korifi") or full URL |
| `depth` | enum: shallow \| deep | no | Analysis depth: shallow (tree + README) or deep (full analysis) |
