---
title: 'Strategy Reference (force-strategy escape hatches)'
description: 'Manifest-generated reference for all 8 routable execution strategies: entrypoint tool, when to force, maturity/authority tier, executor availability.'
tier: 1
keywords: [mcp, strategies, force-strategy, run, orchestration, reference]
---

# Strategy Reference

> Auto-generated from the strategy-manifest registry
> (`src/orchestration/strategy-manifest-registry.ts`, the single source of
> truth the router reads). Do not edit by hand — run `pnpm docs:strategies`
> to regenerate.

[`run`](./../tools/run.md) is the canonical entry point: give it a goal and the
MetaOrchestrator routes to one of these strategies for you. You rarely need to
pick a strategy by hand. The specialized tools below remain available as
**force-strategy escape hatches** — pass `forceStrategy` to `run`, or call the
strategy's entrypoint tool directly — for when you already know exactly which
engine the work needs. Each row tells you when forcing is the right call.

nexus-agents has **8 routable execution strategies**.

| Strategy | Entrypoint tool | When to force | Maturity | Authority | Executor |
| -------- | --------------- | ------------- | -------- | --------- | -------- |
| `consensus` | `consensus_vote` | Force when a decision needs N independent voters rather than one model. | stable | advisory | wired |
| `dev-pipeline` | `run_dev_pipeline` | Force when the goal is a code change that must pass the dev quality gate before it counts as done. | stable | suggest | wired |
| `graph-workflow` | `run_graph_workflow` | Force when the work is an explicit dependency graph with conditional edges (a predefined workflow template). | beta | suggest | fail-closed |
| `orchestrate` | `orchestrate` | Force when the work needs multi-agent orchestration patterns rather than a single linear pipeline. | beta | suggest | fail-closed |
| `pipeline` | `run_pipeline` | Force when the work fits a templated multi-stage pipeline rather than a single model call. | stable | suggest | wired |
| `research` | `run_pipeline` | Force when the goal is research-led (gather, synthesize, compare) rather than a code change or decision. | stable | suggest | wired |
| `single-shot` | `delegate_to_model` | Force when the goal is a one-shot ask that needs no pipeline, gate, or multi-step plan. | stable | suggest | fail-closed |
| `spec` | `execute_spec` | Force when building a greenfield project from a written spec, not a plain goal string. | beta | suggest | fail-closed |

## Per-strategy detail

### `consensus`

Multi-perspective decision routed to a consensus vote.

- **Entrypoint tool:** `consensus_vote`
- **When to force:** Force when a decision needs N independent voters rather than one model.
- **Maturity tier:** stable
- **Authority tier:** advisory
- **Executor:** wired (runs inline with `execute:true`)

### `dev-pipeline`

Code change run through the dev gate (test / lint / typecheck).

- **Entrypoint tool:** `run_dev_pipeline`
- **When to force:** Force when the goal is a code change that must pass the dev quality gate before it counts as done.
- **Maturity tier:** stable
- **Authority tier:** suggest
- **Executor:** wired (runs inline with `execute:true`)

### `graph-workflow`

DAG / conditional-edge workflow execution.

- **Entrypoint tool:** `run_graph_workflow`
- **When to force:** Force when the work is an explicit dependency graph with conditional edges (a predefined workflow template).
- **Maturity tier:** beta
- **Authority tier:** suggest
- **Executor:** fail-closed (no inline executor wired yet; routing never auto-selects it)

### `orchestrate`

Pattern-based multi-agent orchestration (wave / aflow / puppeteer).

- **Entrypoint tool:** `orchestrate`
- **When to force:** Force when the work needs multi-agent orchestration patterns rather than a single linear pipeline.
- **Maturity tier:** beta
- **Authority tier:** suggest
- **Executor:** fail-closed (no inline executor wired yet; routing never auto-selects it)

### `pipeline`

Multi-stage templated work (audit / general) via the pipeline engine.

- **Entrypoint tool:** `run_pipeline`
- **When to force:** Force when the work fits a templated multi-stage pipeline rather than a single model call.
- **Maturity tier:** stable
- **Authority tier:** suggest
- **Executor:** wired (runs inline with `execute:true`)

### `research`

Research-heavy work routed through the research pipeline.

- **Entrypoint tool:** `run_pipeline`
- **When to force:** Force when the goal is research-led (gather, synthesize, compare) rather than a code change or decision.
- **Maturity tier:** stable
- **Authority tier:** suggest
- **Executor:** wired (runs inline with `execute:true`)

### `single-shot`

Trivial single-step task delegated to one model.

- **Entrypoint tool:** `delegate_to_model`
- **When to force:** Force when the goal is a one-shot ask that needs no pipeline, gate, or multi-step plan.
- **Maturity tier:** stable
- **Authority tier:** suggest
- **Executor:** fail-closed (no inline executor wired yet; routing never auto-selects it)

### `spec`

Greenfield project built from a markdown spec document.

- **Entrypoint tool:** `execute_spec`
- **When to force:** Force when building a greenfield project from a written spec, not a plain goal string.
- **Maturity tier:** beta
- **Authority tier:** suggest
- **Executor:** fail-closed (no inline executor wired yet; routing never auto-selects it)
