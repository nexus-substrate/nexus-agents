---
title: 'MCP Tool: run'
description: 'Default entry point — give a goal, MetaOrchestrator picks the strategy; returns the routing decision (execute:false, read-only) or runs it inline (execute:true; dev-pipeline+pipeline+research+consensus wired) (#3548)'
tier: 2
keywords: [mcp, tool, reference, run]
---

# `run`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

DEFAULT ENTRY POINT (epic #3548): give a goal and nexus-agents selects the right strategy (single-shot / dev-pipeline / pipeline / graph-workflow / orchestrate / consensus / spec / research) via the MetaOrchestrator. Default (execute:false) is read-only — returns the routing decision plus the recommendedTool. With execute:true it runs the selected strategy inline (currently wired: dev-pipeline, pipeline, research, consensus; others fail closed with a typed error) and returns the engine result, recording the outcome. Use forceStrategy to override. Prefer this over hand-picking a pipeline tool; the specialized tools remain available as advanced force-strategy paths.

## Parameters

| Parameter | Type | Required | Constraints | Description |
| --------- | ---- | -------- | ----------- | ----------- |
| `goal` | string | yes | minLength 1 | Natural-language goal. nexus-agents selects how to execute it. |
| `forceStrategy` | enum | no | one of: single-shot \| dev-pipeline \| pipeline \| graph-workflow \| orchestrate \| consensus \| spec \| research | Power-user override: force a specific strategy instead of letting the router choose. |
| `requiresConsensus` | boolean | no | — | Hint: the task needs a multi-perspective consensus decision. |
| `dependencyStructure` | enum | no | one of: linear \| dag \| independent \| unknown | Hint: the dependency structure of the work. |
| `isNovel` | boolean | no | — | Hint: this kind of task has not been seen before. |
| `execute` | boolean | no | — | When true, actually run the selected strategy (if an executor is wired) and return its result; otherwise return the routing decision only (default false, read-only). |
| `dryRun` | boolean | no | — | Plan and vote only, no implementation (#4806). Requires the dev-pipeline strategy — refused (never silently executed) when the router selects another. |
| `dispatch` | enum | no | one of: sync \| async | Dispatch mode (#3732). 'sync' (default): run inline. 'async' (only with execute:true): return a jobId immediately + run in background (poll get_job_result). |
