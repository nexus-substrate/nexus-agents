---
title: 'CLI Reference'
description: 'Generated reference for every nexus-agents CLI command, audience, and description.'
diataxis: reference
audience: user
tier: 1
keywords: [cli, commands, catalog, reference]
related_files: [docs/ENTRYPOINTS.md, docs/reference/environment.md]
---

# CLI Reference

> Generated from packages/nexus-agents/src/cli-command-catalog.ts — do not edit by hand

Regenerate with `pnpm exec tsx scripts/generate-cli-reference.ts`.

The catalog includes the no-argument `(default)` invocation and internal commands.
Run `nexus-agents <command> --help` for command options.

| Command | Audience | Description |
| ------- | -------- | ----------- |
| `(default)` | essential | Start MCP server with stdio transport |
| `auth` | essential | Manage authentication: init/show/rotate MCP tokens; status shows per-CLI auth state |
| `auto-remediate` | maintainer | Run one auto-remediation cycle (#3540). OFF unless NEXUS_AUTO_REMEDIATE=audit\|enforce; never auto-merges. |
| `capabilities` | advanced | Show model capabilities matrix |
| `config` | essential | Manage configuration (init, get, set, list, export, import) |
| `demo` | maintainer | API-free exploration mode (marketing/demo flow) |
| `doctor` | essential | Detailed health check; no model completions by default; --live probes models |
| `e2e-eval` | internal | E2E evaluation scenario runner (dev loop) |
| `evaluate` | maintainer | Self-evaluation of codebase components |
| `expert` | essential | Manage expert agents (list, create, execute) |
| `fitness-audit` | maintainer | Run CLI orchestration fitness score audit |
| `health` | maintainer | Swarm health metrics dashboard |
| `hello` | essential | Show welcome message and quick start (no API keys needed) |
| `hooks` | maintainer | Claude CLI hook integration commands |
| `improvement-review` | advanced | Observability-driven improvement loop (#2402). Surfaces threshold breaches; --file-issues opt-in. |
| `index` | advanced | Generate and manage codebase index |
| `init` | advanced | Initialize portable nexus-agents config in a repo. Flags: --portable (#2305/#2308/#2311), --install / --uninstall (#2311), --gitignore, --mcp-config, --opencode &lt;path&gt; (#2504), --force, --dry-run. |
| `issue` | maintainer | Issue template validation and management |
| `jobs` | advanced | Async job-record maintenance (#6224): `prune` deletes terminal records past the 7-day retention window and marks abandoned pending records failed; --dry-run prints the counts only. |
| `learning-metrics` | maintainer | Aggregated learning metrics dashboard |
| `login` | maintainer | [deprecated alias] Soft alias of "auth status"; renamed in #2449 |
| `memory-benchmark` | internal | Memory-system benchmark runner (dev loop) |
| `memory-eval` | internal | Comparative memory evaluation benchmark (dev loop) |
| `migrate` | advanced | Relocate homedir state (sessions, checkpoints, traces, runs, audit, pipeline, tasks) into &lt;repo&gt;/.nexus-agents/ for users adopting NEXUS_REPO_PREFERRED=1. Cross-repo state stays homedir. --dry-run for a no-op plan. Epic #2872. |
| `mode` | advanced | Inspect detected mode (server/orchestrator) + signals + reasoning (#3214) |
| `model-drift` | maintainer | Report models the registry does not know and registry models no source lists (#6625). --json; --file-issue opt-in. |
| `orchestrate` | essential | Execute a task via CLI tools (standalone mode) |
| `registry` | advanced | Inspect + refresh the dynamic model registry (doctor / refresh) |
| `release-announce` | maintainer | Generate release announcements (blog, social) |
| `release-notes` | maintainer | Generate release notes from git commits |
| `release-validate` | maintainer | Run expert swarm validation for releases |
| `remediation-review` | maintainer | Review audit-mode selections: list · panel-judge --batch N [--quick] · sample --n 10 [--seed S] · mark --evaluator --sound\|--unsound [--sample id] · sign-off --owner · readiness (human, panel and owner-sample judgments + soak-store alarm). |
| `research` | essential | Manage research registry (status, add, stats, refresh) |
| `review` | advanced | Review a GitHub PR (dogfooding helper) |
| `routing-ab` | internal | A/B comparison of routing strategies (dev loop) |
| `routing-audit` | maintainer | Debug model routing decisions |
| `scaffold` | advanced | Generate project files from templates |
| `scenario` | internal | Execute a named scenario from the testing framework |
| `server` | internal | Start MCP server with stdio transport (explicit form) |
| `session` | advanced | Manage session persistence (list, show, export, delete) |
| `setup` | essential | Configure CLI integration (MCP + .rules + data dirs) |
| `sprint` | maintainer | Automated sprint planning from open issues |
| `status` | advanced | At-a-glance project health dashboard |
| `system-review` | maintainer | Automated system review (5-phase checklist) |
| `tour` | advanced | Guided walkthrough of the four headline tools — no API keys, no quota (#2851). --non-interactive runs straight through. |
| `usage` | advanced | Cost / usage / quality dashboard from per-call telemetry (#2469). --format=json for scripting. |
| `validate` | advanced | Run unified validation (doctor + fitness + config) |
| `validation` | maintainer | Learning validation dashboard |
| `verify` | essential | Check install health (sqlite, adapters, config) |
| `visualize` | maintainer | Generate Mermaid diagrams and ASCII dashboards |
| `vote` | essential | Run consensus vote on a proposal (7 agents; --quick uses 3) |
| `warm-up` | internal | Warm the model/adapter caches before a run |
| `workflow` | essential | Manage and run workflow templates (list, run) |
