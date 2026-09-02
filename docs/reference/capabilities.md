# Repository Capabilities Index

**Generated:** 2026-09-02T19:31:09.072Z
**Package Version:** 6.3.16
**Generator:** `scripts/generate-repo-index.ts`

> This file is auto-generated. Do not edit manually.
> Run `npx tsx scripts/generate-repo-index.ts` to regenerate.

---

## CLI Commands (52)

Binary: `nexus-agents`

| Command | Type | Handler | Source File |
| --------- | ------ | --------- | ------------- |
| `atbench` | async | `handleAtbenchCommand` | `src/cli-commands-handlers.ts` |
| `auth` | async | `handleAuthCommand` | `src/cli-commands-handlers.ts` |
| `auto-remediate` | async | `handleAutoRemediateCommand` | `src/cli-commands-handlers.ts` |
| `capabilities` | sync | `handleCapabilitiesCommand` | `src/cli-commands-handlers.ts` |
| `config` | async | `handleConfigCommand` | `src/cli-commands-handlers.ts` |
| `demo` | async | `handleDemoCommand` | `src/cli-commands-handlers.ts` |
| `doctor` | async | `handleDoctorCommand` | `src/cli-commands-handlers.ts` |
| `e2e-eval` | sync | `handleE2EEvalCommand` | `src/cli-commands-handlers.ts` |
| `evaluate` | async | `handleEvaluateCommand` | `src/cli-commands-handlers.ts` |
| `expert` | sync | `handleExpertCommand` | `src/cli-commands-handlers.ts` |
| `fitness-audit` | sync | `handleFitnessAuditCommand` | `src/cli-commands-handlers.ts` |
| `health` | sync | `handleHealthCommand` | `src/cli-commands-handlers.ts` |
| `hello` | sync | `handleHelloCommand` | `src/cli-commands-handlers.ts` |
| `hooks` | async | `handleHooksCommand` | `src/cli-commands-handlers.ts` |
| `improvement-review` | async | `handleImprovementReviewCommand` | `src/cli-commands-handlers.ts` |
| `index` | async | `handleIndexCommand` | `src/cli-commands-handlers.ts` |
| `init` | async | `handleInitCommand` | `src/cli-commands-handlers.ts` |
| `issue` | sync | `handleIssueCommand` | `src/cli-commands-handlers.ts` |
| `learning-metrics` | sync | `handleLearningMetricsCommand` | `src/cli-commands-handlers.ts` |
| `login` | async | `handleLoginCommand` | `src/cli-commands-handlers.ts` |
| `memory-benchmark` | async | `handleMemoryBenchmarkCommand` | `src/cli-commands-handlers.ts` |
| `memory-eval` | sync | `handleMemoryEvalCommand` | `src/cli-commands-handlers.ts` |
| `migrate` | async | `handleMigrateCommand` | `src/cli-commands-handlers.ts` |
| `mode` | sync | `handleModeCommand` | `src/cli-commands-handlers.ts` |
| `orchestrate` | async | `handleOrchestrateCommand` | `src/cli-commands-handlers.ts` |
| `registry` | async | `handleRegistryCommand` | `src/cli-commands-handlers.ts` |
| `release-announce` | async | `handleReleaseAnnounceCommand` | `src/cli-commands-handlers.ts` |
| `release-notes` | async | `handleReleaseNotesCommand` | `src/cli-commands-handlers.ts` |
| `release-validate` | async | `handleReleaseValidateCommand` | `src/cli-commands-handlers.ts` |
| `remediation-review` | async | `handleRemediationReviewCommand` | `src/cli-commands-handlers.ts` |
| `research` | async | `handleResearchCommand` | `src/cli-commands-handlers.ts` |
| `review` | async | `handleReviewCommand` | `src/cli-commands-handlers.ts` |
| `routing-ab` | sync | `handleRoutingABCommand` | `src/cli-commands-handlers.ts` |
| `routing-audit` | sync | `handleRoutingAuditCommand` | `src/cli-commands-handlers.ts` |
| `scaffold` | sync | `handleScaffoldCommand` | `src/cli-commands-handlers.ts` |
| `scenario` | async | `handleScenarioCommand` | `src/cli-commands-handlers.ts` |
| `server` | async | `handleServerCommand` | `src/cli-commands-handlers.ts` |
| `session` | async | `handleSessionCommand` | `src/cli-commands-handlers.ts` |
| `setup` | async | `handleSetupCommandAsync` | `src/cli-commands-handlers.ts` |
| `sprint` | async | `handleSprintCommand` | `src/cli-commands-handlers.ts` |
| `status` | sync | `handleStatusCommand` | `src/cli-commands-handlers.ts` |
| `swe-bench` | async | `handleSweBenchCommand` | `src/cli-commands-handlers.ts` |
| `system-review` | sync | `handleSystemReviewCommand` | `src/cli-commands-handlers.ts` |
| `tour` | async | `handleTourCommand` | `src/cli-commands-handlers.ts` |
| `usage` | async | `handleUsageCommand` | `src/cli-commands-handlers.ts` |
| `validate` | async | `handleValidateCommand` | `src/cli-commands-handlers.ts` |
| `validation` | sync | `handleValidationCommand` | `src/cli-commands-handlers.ts` |
| `verify` | async | `handleVerifyCommand` | `src/cli-commands-handlers.ts` |
| `visualize` | async | `handleVisualizeCommand` | `src/cli-commands-handlers.ts` |
| `vote` | async | `handleVoteCommand` | `src/cli-commands-handlers.ts` |
| `warm-up` | sync | `handleWarmUpCommand` | `src/cli-commands-handlers.ts` |
| `workflow` | async | `handleWorkflowCommand` | `src/cli-commands-handlers.ts` |

---

## MCP Tools (47)

| Tool | Source File |
| ------ | ------------- |
| `cancel_job` | `src/mcp/tools/cancel-job.ts` |
| `ci_health_check` | `src/mcp/tools/ci-health-check.ts` |
| `compare_data_feeds` | `src/mcp/tools/compare-data-feeds.ts` |
| `consensus_vote` | `src/mcp/tools/consensus-vote.ts` |
| `create_expert` | `src/mcp/tools/create-expert.ts` |
| `delegate_to_model` | `src/mcp/tools/delegate-to-model.ts` |
| `execute_expert` | `src/mcp/tools/execute-expert.ts` |
| `execute_spec` | `src/mcp/tools/execute-spec.ts` |
| `extract_symbols` | `src/mcp/tools/extract-symbols.ts` |
| `get_job_result` | `src/mcp/tools/get-job-result.ts` |
| `improvement_review` | `src/mcp/tools/improvement-review.ts` |
| `issue_triage` | `src/mcp/tools/issue-triage.ts` |
| `list_available_models` | `src/mcp/tools/list-available-models.ts` |
| `list_experts` | `src/mcp/tools/list-experts.ts` |
| `list_jobs` | `src/mcp/tools/list-jobs.ts` |
| `list_workflows` | `src/mcp/tools/list-workflows.ts` |
| `memory_query` | `src/mcp/tools/memory-query.ts` |
| `memory_stats` | `src/mcp/tools/memory-stats.ts` |
| `memory_write` | `src/mcp/tools/memory-write.ts` |
| `orchestrate` | `src/mcp/tools/orchestrate.ts` |
| `pr_review` | `src/mcp/tools/pr-review.ts` |
| `query_task_state` | `src/mcp/tools/query-task-state.ts` |
| `query_trace` | `src/mcp/tools/query-trace.ts` |
| `registry_import` | `src/mcp/tools/registry-import.ts` |
| `repo_analyze` | `src/mcp/tools/repo-analyze.ts` |
| `repo_security_plan` | `src/mcp/tools/repo-security-plan.ts` |
| `research_add` | `src/mcp/tools/research-add.ts` |
| `research_add_source` | `src/mcp/tools/research-add-source.ts` |
| `research_analyze` | `src/mcp/tools/research-analyze.ts` |
| `research_catalog_review` | `src/mcp/tools/research-catalog-review.ts` |
| `research_discover` | `src/mcp/tools/research-discover.ts` |
| `research_query` | `src/mcp/tools/research-query.ts` |
| `research_synthesize` | `src/mcp/tools/research-synthesize.ts` |
| `run` | `src/mcp/tools/run.ts` |
| `run_dev_pipeline` | `src/mcp/tools/run-dev-pipeline.ts` |
| `run_graph_workflow` | `src/mcp/tools/run-graph-workflow.ts` |
| `run_pipeline` | `src/mcp/tools/run-pipeline.ts` |
| `run_quality_gate` | `src/mcp/tools/run-quality-gate.ts` |
| `run_workflow` | `src/mcp/tools/run-workflow.ts` |
| `search_codebase` | `src/mcp/tools/search-codebase.ts` |
| `search_usages` | `src/mcp/tools/search-usages.ts` |
| `suggest_research_tasks` | `src/mcp/tools/suggest-research-tasks.ts` |
| `supply_chain_tradeoff_panel` | `src/mcp/tools/supply-chain-tradeoff-panel.ts` |
| `survey_oss_landscape` | `src/mcp/tools/survey-oss-landscape.ts` |
| `vendor_publishing_audit` | `src/mcp/tools/vendor-publishing-audit.ts` |
| `verify_audit_chain` | `src/mcp/tools/verify-audit-chain.ts` |
| `weather_report` | `src/mcp/tools/weather-report.ts` |

---

## Workflow Templates (11)

| Template | Source File |
| ---------- | ------------- |
| `bug-fix` | `src/workflows/templates/bug-fix.yaml` |
| `code-review` | `src/workflows/templates/code-review.yaml` |
| `docs-audit` | `src/workflows/templates/docs-audit.yaml` |
| `documentation-update` | `src/workflows/templates/documentation-update.yaml` |
| `feature-implementation` | `src/workflows/templates/feature-implementation.yaml` |
| `infrastructure-audit` | `src/workflows/templates/infrastructure-audit.yaml` |
| `refactoring` | `src/workflows/templates/refactoring.yaml` |
| `research-review` | `src/workflows/templates/research-review.yaml` |
| `security-audit` | `src/workflows/templates/security-audit.yaml` |
| `standards-review` | `src/workflows/templates/standards-review.yaml` |
| `test-generation` | `src/workflows/templates/test-generation.yaml` |

---

## Machine-Readable Index

For programmatic access, see `artifacts/repo-index.json`.

---

_This index is deterministic: same input produces same output._
