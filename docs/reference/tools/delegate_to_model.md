---
title: 'MCP Tool: delegate_to_model'
description: 'Pick the best-fit existing model for a task (no registry change)'
tier: 2
keywords: [mcp, tool, reference, delegate_to_model]
---

# `delegate_to_model`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Pick which existing model should HANDLE a task. Inspects task complexity and returns the best-fit model from the routing registry — does NOT add a new model. Read-only.

## Parameters

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `task` | string | yes | Task to execute or analyze |
| `preferred_capability` | enum: reasoning \| context \| speed \| code | no | Preferred capability for routing: reasoning, context, speed, or code |
| `model_hint` | string | no | Explicit model preference (e.g., claude-opus, gemini-pro) |
| `billing_mode` | enum: plan \| api | no | Billing mode: plan (monthly subscription, ignore cost) or api (pay-per-token) |
