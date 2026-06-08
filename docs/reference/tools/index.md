---
title: 'MCP Tool Reference'
description: 'Per-tool reference for all 46 registered nexus-agents MCP tools, generated from the tool manifest and input schemas.'
tier: 1
keywords: [mcp, tools, reference, api]
---

# MCP Tool Reference

> Auto-generated from the registered MCP tool descriptions and input
> schemas (`pnpm docs:tools`). Do not edit by hand.

nexus-agents exposes **46 MCP tools** via stdio. Each tool below links to its full parameter reference.

| Tool | Summary |
| ---- | ------- |
| [`orchestrate`](./orchestrate.md) | Task orchestration with Orchestrator coordination |
| [`create_expert`](./create_expert.md) | Create a specialized expert agent |
| [`execute_expert`](./execute_expert.md) | Run a task through a previously-created expert (by expertId) |
| [`run_workflow`](./run_workflow.md) | Run a linear workflow template (use `run_graph_workflow` for DAGs) |
| [`delegate_to_model`](./delegate_to_model.md) | Pick the best-fit existing model for a task (no registry change) |
| [`list_experts`](./list_experts.md) | Inventory of expert ROLES for `create_expert` |
| [`list_workflows`](./list_workflows.md) | Inventory of multi-step TEMPLATES for `run_workflow` |
| [`consensus_vote`](./consensus_vote.md) | Multi-model consensus voting on proposals |
| [`research_query`](./research_query.md) | Query research registry (status, overlap, stats, search) |
| [`research_add`](./research_add.md) | Add an arXiv PAPER to the registry (for non-paper sources use `research_add_source`) |
| [`research_add_source`](./research_add_source.md) | Add a NON-PAPER source (repo/tool/blog) — for arXiv papers use `research_add` |
| [`research_discover`](./research_discover.md) | Discover papers/repos from external sources |
| [`research_analyze`](./research_analyze.md) | Analyze registry for gaps, trends, coverage |
| [`research_catalog_review`](./research_catalog_review.md) | Review auto-cataloged research references |
| [`research_synthesize`](./research_synthesize.md) | Synthesize registry into topic clusters with themes |
| [`survey_oss_landscape`](./survey_oss_landscape.md) | Transient OSS project search (license, stars, last-commit) via GitHub |
| [`vendor_publishing_audit`](./vendor_publishing_audit.md) | Look up a vendor's signing infrastructure (GPG keys, URL patterns, signature shape) |
| [`compare_data_feeds`](./compare_data_feeds.md) | Diff two YAML/JSON feeds: coverage + per-field axes |
| [`memory_query`](./memory_query.md) | Query across all memory backends |
| [`memory_stats`](./memory_stats.md) | Memory system statistics dashboard |
| [`memory_write`](./memory_write.md) | Write to typed memory backends |
| [`weather_report`](./weather_report.md) | Multi-CLI performance weather report |
| [`issue_triage`](./issue_triage.md) | Triage GitHub issues with trust classification |
| [`run_graph_workflow`](./run_graph_workflow.md) | Run a DAG workflow with per-node checkpoints + audit trail (linear → `run_workflow`) |
| [`execute_spec`](./execute_spec.md) | Execute AI software factory spec pipeline |
| [`registry_import`](./registry_import.md) | Draft YAML for a NEW model entry (for picking existing models use `delegate_to_model`) |
| [`query_trace`](./query_trace.md) | Query execution traces for observability |
| [`query_task_state`](./query_task_state.md) | Query the structured task-state log for a task ID |
| [`get_job_result`](./get_job_result.md) | Read result of an async-mode dispatch by jobId (#3042 / #2631) |
| [`list_jobs`](./list_jobs.md) | List async-mode jobs across all tools — cross-session discovery (#3046 / #2631) |
| [`cancel_job`](./cancel_job.md) | Mark an async-mode job as cancelled — idempotent (#3042 Stage 1b) |
| [`ci_health_check`](./ci_health_check.md) | CI infrastructure health — composes GitHub status + recent-runs activity (#3076) |
| [`verify_audit_chain`](./verify_audit_chain.md) | Verify hash chain of a FileAuditStorage audit log directory |
| [`repo_analyze`](./repo_analyze.md) | Analyze GitHub repository structure |
| [`repo_security_plan`](./repo_security_plan.md) | Generate security scanning pipeline for a repo |
| [`extract_symbols`](./extract_symbols.md) | Tree-sitter AST symbols from a SINGLE file (functions/classes/types) |
| [`search_codebase`](./search_codebase.md) | Cross-file ripgrep search for patterns or text (not an AST parser) |
| [`run_dev_pipeline`](./run_dev_pipeline.md) | Full dev pipeline: research, plan, vote, implement, QA |
| [`run_pipeline`](./run_pipeline.md) | Execute a pipeline plugin by name with typed input |
| [`pr_review`](./pr_review.md) | Multi-voter PR review with verification gate (experimental) |
| [`supply_chain_tradeoff_panel`](./supply_chain_tradeoff_panel.md) | Per-axis tradeoff vote for build-vs-buy / supply-chain decisions |
| [`improvement_review`](./improvement_review.md) | Threshold-gated observability loop — surfaces routing/tech-debt/bug/security signals from outcome+fitness data; files candidate issues |
| [`run_quality_gate`](./run_quality_gate.md) | Run the QA quality gate (typecheck/lint/tests/build/security) over a project dir; returns structured pass/fail verdict + feedback |
| [`suggest_research_tasks`](./suggest_research_tasks.md) | SUGGEST-ONLY: candidate pipeline tasks from research_discover findings for review — files/executes nothing (#1715) |
| [`list_available_models`](./list_available_models.md) | Probe all model-discovery transports (OpenRouter API + opencode/claude/codex/gemini CLIs) and report per-transport health — validates the CLIs/APIs are reachable (#3406) |
| [`run`](./run.md) | Default entry point — give a goal, MetaOrchestrator picks the strategy; returns the routing decision (execute:false, read-only) or runs it inline (execute:true; dev-pipeline+pipeline+research+consensus wired) (#3548) |
