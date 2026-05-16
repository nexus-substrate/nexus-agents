---
description: 'Federated to AGENTS.md — single canonical surface for agent rules.'
alwaysApply: true
---

# Federated to AGENTS.md

This repo follows [option B of #2764](https://github.com/williamzujkowski/nexus-agents/issues/2764) — every harness-specific config file points at [AGENTS.md](../../AGENTS.md), the single source of truth for project conventions, rules, and agent guidance.

**For Continue:** load [AGENTS.md](../../AGENTS.md) as the primary rule source. Keyword-scoped per-topic rules live in [`.rules/`](../../.rules/) and are indexed from AGENTS.md.

See [docs/architecture/AGENT_COMPATIBILITY.md](../../docs/architecture/AGENT_COMPATIBILITY.md) for the federation rationale and per-harness compatibility matrix.
