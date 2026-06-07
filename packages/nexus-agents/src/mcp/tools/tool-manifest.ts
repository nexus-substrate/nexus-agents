/**
 * Canonical MCP tool manifest (#3566, Phase 3 of #3563).
 *
 * THE single source of truth for *which* MCP tools exist and their registration
 * order. Everything that needs the tool-name list derives from this one array:
 * - `REGISTERED_TOOL_NAMES` (re-exported from `tools/index.ts`),
 * - the capability-gap detector's `AVAILABLE_TOOLS` (derives directly — see below),
 * - `scripts/inject-governance.ts` (parses this file to sync `server.json`, docs,
 *   and the MCP-tool-count guard).
 *
 * **Pure-data leaf — DO NOT add imports.** This module imports nothing so any
 * layer can derive from it without pulling in the MCP tool dependency graph.
 * That is what lets `core/task-analysis/capability-gap-detector.ts` import the
 * list directly (one-way edge, no cycle) instead of keeping a hand-maintained
 * copy guarded by a freshness test (#3553). Keep it import-free or that property
 * breaks.
 *
 * Per-tool annotation/side-effect data lives in `tool-annotations.ts`, keyed by
 * these names; a parity test asserts its keys match this manifest so the two
 * cannot drift. Folding that annotation data into manifest entries (so
 * `TOOL_ANNOTATIONS` derives too) is tracked as the next increment.
 *
 * Adding/removing a tool: edit THIS array. The drift guards and `inject-governance`
 * follow automatically.
 *
 * @module mcp/tools/tool-manifest
 */

/**
 * Registered MCP tools, in registration order. The order is significant — it is
 * written to `server.json` so the MCP-spec registry stays in lockstep.
 */
export const TOOL_MANIFEST = [
  'orchestrate',
  'create_expert',
  'execute_expert',
  'run_workflow',
  'delegate_to_model',
  'list_experts',
  'list_workflows',
  'consensus_vote',
  'research_query',
  'research_add',
  'research_add_source',
  'research_discover',
  'research_analyze',
  'research_catalog_review',
  'research_synthesize',
  'survey_oss_landscape',
  'vendor_publishing_audit',
  'compare_data_feeds',
  'memory_query',
  'memory_stats',
  'memory_write',
  'weather_report',
  'issue_triage',
  'run_graph_workflow',
  'execute_spec',
  'registry_import',
  'query_trace',
  'query_task_state',
  'get_job_result',
  'list_jobs',
  'cancel_job',
  'ci_health_check',
  'verify_audit_chain',
  'repo_analyze',
  'repo_security_plan',
  'extract_symbols',
  'search_codebase',
  'run_dev_pipeline',
  'run_pipeline',
  'pr_review',
  'supply_chain_tradeoff_panel',
  'improvement_review',
  'run_quality_gate',
  'suggest_research_tasks',
  'list_available_models',
  'run',
] as const;

/** A registered MCP tool name, derived from {@link TOOL_MANIFEST}. */
export type RegisteredToolName = (typeof TOOL_MANIFEST)[number];
