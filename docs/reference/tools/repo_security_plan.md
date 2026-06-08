---
title: 'MCP Tool: repo_security_plan'
description: 'Generate security scanning pipeline for a repo'
tier: 2
keywords: [mcp, tool, reference, repo_security_plan]
---

# `repo_security_plan`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Generate a security scanning pipeline recommendation for a GitHub repository based on detected tech stack.

## Parameters

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `repo` | string | yes | GitHub repository in "owner/name" format or full URL |
| `categories` | array | no | Filter to specific categories (e.g., ["sast", "sca", "secrets"]) |
| `maxScanners` | number | no | Maximum scanners to recommend (default: 10) |
