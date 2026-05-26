/**
 * Tool risk classification for `confirm_risky` access-policy mode (#2279).
 *
 * Classifies each registered MCP tool as `read-only` (safe — log-and-allow
 * under confirm_risky) or `risky` (write/exec/network — block under
 * confirm_risky). Used by the policy enforcer to differentiate which
 * violations a human would have wanted to review.
 *
 * Classification policy:
 *
 * - **Read-only**: tool exclusively reads existing state — no file writes,
 *   no subprocess execution, no network requests beyond a single bounded
 *   read of project-internal data. `query_*`, `list_*`, `search_*`,
 *   `*_query`, `*_analyze` patterns by default.
 * - **Risky**: tool writes files, runs subprocesses, posts to external
 *   services, calls LLM APIs, or has any side effect that a human reviewer
 *   would want to see before approving in confirm_risky mode.
 *
 * If a tool is unknown, it is treated as risky (default-deny) — same
 * principle as the unbypassable denylist: the security layer fails closed
 * on a misclassification.
 *
 * Update path: when adding a new MCP tool, classify it explicitly here.
 * The `inject-governance.ts check` CI gate ensures the registry list is
 * still the source of truth; this file is the risk overlay.
 *
 * @module security/access-constraint-deriver/tool-risk
 */

/**
 * Tools that exclusively read state. Violations on these are log-and-allow
 * under `confirm_risky` mode — same as `audit` mode.
 */
export const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  // Discovery / listing
  'list_experts',
  'list_workflows',
  // Research reads
  'research_query',
  'research_analyze',
  'research_catalog_review',
  'research_synthesize',
  // Memory reads
  'memory_query',
  'memory_stats',
  // Observability
  'weather_report',
  'query_trace',
  'query_task_state',
  // Async-mode result polling (#3042 / epic #2631)
  'get_job_result',
  // Async-mode job discovery (#3046 / epic #2631 Stage 5)
  'list_jobs',
  // Codebase intelligence (read-only over local files)
  'search_codebase',
  'extract_symbols',
  // Repo analysis (read-only)
  'repo_analyze',
  'repo_security_plan',
  // Routing recommendation (no side effects — returns recommendation)
  'delegate_to_model',
  // Registry import (returns a draft template — does not write)
  'registry_import',
]);

/**
 * Returns true if the tool is risky under confirm_risky mode (default-deny
 * for unknown tools — security layer fails closed).
 */
export function isRiskyTool(toolName: string): boolean {
  return !READ_ONLY_TOOLS.has(toolName);
}
