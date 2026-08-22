---
title: 'MCP Tool: run_quality_gate'
description: 'Run the QA quality gate (typecheck/lint/tests/build/security) over a project dir; returns structured pass/fail verdict + feedback'
tier: 2
keywords: [mcp, tool, reference, run_quality_gate]
---

# `run_quality_gate`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

MCP surface over the runQualityGate QA engine (#1684, #3356). Runs an allowlisted set of checks (typecheck | lint | tests | build | security; default ['typecheck','lint','tests']) against a project directory and returns the structured { stage, verdict, checks[], summary, feedback } verdict. projectDir is resolved inside the repo root (path-traversal rejected); check selection is a fixed enum→factory map so no arbitrary command reaches a shell. Each check runs the REPOSITORY'S own declared package script through the lockfile-selected package manager (#4355) — never a downloaded tool — and reports skip when no such script is declared; a run in which nothing executed reports verdict 'skip', never 'pass'. Per-check output is capped at 500 chars. Read-only, idempotent.

## Parameters

| Parameter | Type | Required | Constraints | Description |
| --------- | ---- | -------- | ----------- | ----------- |
| `projectDir` | string | no | — | Project directory to run checks against (default: cwd). Must stay inside the repo root. |
| `checks` | array of enum | no | default ["typecheck","lint","tests"] | Allowlisted checks to run (default: ['typecheck','lint','tests']). |
| `iteration` | integer | no | min 1; max 9007199254740991; default 1 | 1-based iteration number (default 1). |
