---
title: Self-Development Workflow (historical)
description: Original engine deleted 2026-05-05; replaced by observability-driven `improvement_review` (#2402). Pointer doc only.
tier: 3
keywords: [self-development, history, improvement-review, deprecated]
---

# Self-Development Workflow (historical)

> **Status: Replaced.** The original `src/workflows/self-development/` engine was deleted on 2026-05-05 in epic #2402. It never wired up to consume observability data — it was an issue-implementer pipeline, not the reinforcement loop the name suggested.

## What replaced it

The reinforcement-loop intent — "consume outcome / fitness / weather data, propose improvements" — is now served by the **`improvement_review` MCP tool** (built in PR 2 of epic #2402). It reads:

- `OutcomeStore` (typed outcomes per call)
- `weather_report` (per-CLI per-category success rates)
- `fitness-audit` JSON
- `verify_audit_chain` integrity summary

Threshold-gated signals fire candidate GitHub issues for human / `consensus_vote` review. Never auto-merges.

See [`improvement_review` MCP tool docs](../../CLAUDE.md#mcp-tools-reference) and the [`system-review` skill](../../skills/system-review/SKILL.md).

## What replaced the manual issue-implementation flow

The "process open issues" workflow that the engine was supposed to automate is now the manual [`dogfooding-issues` skill](../../skills/dogfooding-issues/SKILL.md). Same conceptual flow (analyze → research → vote → implement) but executed by an agent + human checkpoint, not by an unwired engine.

## Why this happened

The original engine (~7,700 LOC) was authored before the observability primitives (`OutcomeStore`, `weather_report`, `LinUCB`, `fitness-audit`) existed. By the time those landed, the engine had drifted out of the active path — no `package.json` / CI / CLI dispatch was invoking its runner. Per the `deprecation-and-migration` skill, six months of unwired existence + an in-place replacement = clean removal.

## References

- **Epic**: [#2402](https://github.com/williamzujkowski/nexus-agents/issues/2402)
- **Deletion PR**: filed under #2402
- **`improvement_review` build PR**: filed under #2402
- **Manual replacement**: `skills/dogfooding-issues/SKILL.md`
