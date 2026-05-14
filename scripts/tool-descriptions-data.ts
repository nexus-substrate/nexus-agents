/**
 * Curated MCP tool descriptions — shared data module.
 *
 * Single source of truth for the long-form and README-form tool
 * descriptions. Consumed by `inject-governance.ts` (generates the CLAUDE.md
 * + README tool tables) and `check-tool-distinctness.ts` (the #2650
 * pairwise-similarity lint). Extracted into its own module so both scripts
 * import the same data — `inject-governance.ts` runs a CLI dispatch at
 * module top level, so it cannot be imported safely.
 *
 * @module scripts/tool-descriptions-data
 * (Source: Issues #569, #761, #2269, #2650)
 */

/**
 * Curated long-form descriptions for MCP tools.
 * Updated when tools change. `extractMcpTools()` in `inject-governance.ts`
 * validates this map against the canonical tools array in index.ts.
 */
export const TOOL_DESCRIPTIONS: Record<string, string> = {
  orchestrate:
    'Orchestrate a task by analyzing it, breaking it into subtasks if needed, and coordinating expert agents',
  create_expert:
    'Create a specialized expert agent for code, architecture, security, documentation, testing, devops, research, product management, or UX tasks',
  execute_expert:
    'Execute a task using a previously created expert agent. Returns the expert analysis including output, confidence, and token usage.',
  run_workflow:
    'Execute workflow templates with provided inputs, supporting built-in templates and custom paths',
  consensus_vote:
    'Execute multi-model consensus voting on a proposal. Uses specialized agent roles to vote with configurable strategies.',
  delegate_to_model:
    'Route a task to the optimal model based on capability matching. Returns model recommendation with reasoning.',
  list_experts:
    'List available expert types that can be created with create_expert. Returns role names, descriptions, and capabilities.',
  list_workflows:
    'List available workflow templates that can be executed with run_workflow. Returns template names and descriptions.',
  research_query:
    'Query the research registry for technique status, overlaps, statistics, or text search.',
  research_add:
    'Add an arXiv paper to the research registry. Fetches metadata from the arXiv API and persists to the registry.',
  research_discover:
    'Discover new research papers and repositories from external sources. Searches arXiv, GitHub, and other sources.',
  research_analyze:
    'Analyze the research registry for gaps, trends, priorities, stale entries, or coverage.',
  research_catalog_review: 'Review auto-cataloged research references found during tool execution.',
  research_synthesize:
    'Synthesize the research registry by grouping papers into topic clusters with themes, insights, and implementation opportunities.',
  survey_oss_landscape:
    'Transient OSS project search via the GitHub search API. Returns a ranked list of repositories with license (SPDX), last-commit, star-count, and one-line description. Does NOT persist to the research registry — for one-off engineering decisions like "what tools exist in this space?".',
  vendor_publishing_audit:
    "Look up a vendor's published-artifact signing infrastructure: GPG key fingerprints, SHA256SUMS URL pattern, signature shape (clearsigned / detached / detached-on-iso), release cadence, key rotation notes, and the vendor doc citation. Static lookup against a curated seed dataset. v1 covers ubuntu, debian, fedora.",
  compare_data_feeds:
    'Diff two upstream data feeds (YAML or JSON files) along coverage and per-field axes. Returns which entries exist in A, B, both, plus optional field-level diffs across matched entries. v1 takes file paths only (no URL fetch — that needs an SSRF design pass).',
  memory_query: 'Query across all memory backends with unified results and relevance scoring.',
  memory_stats: 'Get memory system statistics dashboard showing backend availability and metrics.',
  weather_report:
    'Get multi-CLI performance weather report with per-CLI success rates and adaptive routing bonuses.',
  issue_triage: 'Triage GitHub issues with trust classification and typed action recommendations.',
  run_graph_workflow:
    'Execute graph-based workflow templates with checkpoint and rollback support.',
  execute_spec:
    'Execute an AI software factory spec through the full pipeline (parse, decompose, compile, execute, validate).',
  registry_import:
    'Generate a draft model registry entry for a new AI model. Returns a template with conservative defaults for human review.',
  query_trace:
    'Query execution trace JSONL files from disk for a given run ID. Supports filtering by event type and pagination.',
  memory_write:
    'Write a memory entry to a specific backend. Supports session, belief, agentic, adaptive, and typed backends.',
  repo_analyze:
    'Analyze a GitHub repository structure. Returns language, framework, package manager, CI provider, security tooling, and gap identification.',
  repo_security_plan:
    'Generate a security scanning pipeline recommendation for a GitHub repository based on detected tech stack.',
  research_add_source:
    'Add a non-paper source (GitHub repo, tool, blog) to the research registry with auto quality scoring.',
  extract_symbols:
    'Extract code symbols (functions, classes, types) from source files for analysis.',
  search_codebase:
    'Search the codebase for code patterns, symbols, or text across all source files.',
  query_task_state:
    'Read the structured task-state log for a task ID and return the current snapshot. Requires NEXUS_TASK_STATE_ENABLED=1 during the originating orchestrate call.',
  run_dev_pipeline:
    'Run the multi-agent development pipeline. Accepts direct task instructions, a plan file, or a spec file. Supports dry-run (plan+vote only).',
  run_pipeline:
    'Single unified entry point for all pipeline templates (dev/research/audit/greenfield). Auto-detects template from task content or accepts an explicit override.',
  pr_review:
    'Run multi-voter consensus review on a PR diff (#2233). 5 voters (architect, security, devex, catfish, scope_steward) each emit approve/request_changes/abstain with reasoning and citations. Reuses consensus_vote infra; experimental.',
  supply_chain_tradeoff_panel:
    'Run a structured per-axis tradeoff vote on an engineering proposal (#2294, child of #2293). Default axes: build_time_determinism / supply_chain_risk / update_cadence; custom axes accepted. Voters answer EACH axis independently and the aggregator surfaces per-axis verdicts so legitimate tradeoffs are not masked by a single approve/reject. Use for build-vs-buy, dependency adoption, and supply-chain decisions.',
  verify_audit_chain:
    'Verify the hash chain of a persisted FileAuditStorage audit log directory (#2281 follow-up). Reads all audit-*.jsonl files, parses events, runs verifyChain() to detect tampering. Returns eventCount, fileCount, and one of three tamper signals (hash_mismatch, previous_hash_mismatch, missing_hash) if detected. Read-only.',
  improvement_review:
    'Periodic threshold-gated observability-driven improvement loop (#2402). Reads OutcomeStore, fitness-audit, and recent failure patterns; surfaces signals that cross documented thresholds (CLI success rate < 60% with ≥5 samples, fitness score below floor, failure-category concentration > 50%). When fileIssues=true, files candidate GitHub issues via gh CLI (rate-limited to 5 per run, deduped against open issues). Never auto-merges. Replaces the deleted self-development engine.',
};

/**
 * Short, scannable descriptions for the README MCP tools table. The README
 * audience is "I'm skimming the surface" — long form belongs in CLAUDE.md.
 *
 * Tools missing here fall back to the long `TOOL_DESCRIPTIONS` entry; the
 * inject script warns so the maintainer can write a short variant in the
 * same PR that adds the tool.
 */
export const README_TOOL_DESCRIPTIONS: Record<string, string> = {
  orchestrate: 'Task orchestration with Orchestrator coordination',
  create_expert: 'Create a specialized expert agent',
  execute_expert: 'Execute a task using a created expert',
  run_workflow: 'Execute a workflow template',
  delegate_to_model: 'Route task to optimal model',
  consensus_vote: 'Multi-model consensus voting on proposals',
  list_experts: 'List available expert types',
  list_workflows: 'List available workflow templates',
  research_query: 'Query research registry (status, overlap, stats, search)',
  research_add: 'Add paper to registry by arXiv ID',
  research_discover: 'Discover papers/repos from external sources',
  research_analyze: 'Analyze registry for gaps, trends, coverage',
  research_catalog_review: 'Review auto-cataloged research references',
  memory_query: 'Query across all memory backends',
  memory_stats: 'Memory system statistics dashboard',
  memory_write: 'Write to typed memory backends',
  weather_report: 'Multi-CLI performance weather report',
  issue_triage: 'Triage GitHub issues with trust classification',
  run_graph_workflow: 'Execute graph-based workflows with checkpointing',
  execute_spec: 'Execute AI software factory spec pipeline',
  registry_import: 'Generate draft model registry entry',
  query_trace: 'Query execution traces for observability',
  query_task_state: 'Query the structured task-state log for a task ID',
  repo_analyze: 'Analyze GitHub repository structure',
  repo_security_plan: 'Generate security scanning pipeline for a repo',
  research_add_source: 'Add non-paper source (GitHub repo, tool, blog)',
  research_synthesize: 'Synthesize registry into topic clusters with themes',
  survey_oss_landscape: 'Transient OSS project search (license, stars, last-commit) via GitHub',
  vendor_publishing_audit:
    "Look up a vendor's signing infrastructure (GPG keys, URL patterns, signature shape)",
  compare_data_feeds: 'Diff two YAML/JSON feeds: coverage + per-field axes',
  extract_symbols: 'Extract code symbols from source files for analysis',
  search_codebase: 'Search codebase for patterns, symbols, or text',
  run_dev_pipeline: 'Full dev pipeline: research, plan, vote, implement, QA',
  run_pipeline: 'Execute a pipeline plugin by name with typed input',
  pr_review: 'Multi-voter PR review with verification gate (experimental)',
  supply_chain_tradeoff_panel: 'Per-axis tradeoff vote for build-vs-buy / supply-chain decisions',
  verify_audit_chain: 'Verify hash chain of a FileAuditStorage audit log directory',
  improvement_review:
    'Threshold-gated observability loop — surfaces routing/tech-debt/bug/security signals from outcome+fitness data; files candidate issues',
};
