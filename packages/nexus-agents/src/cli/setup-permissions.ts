/**
 * Claude Code permissions snippet generator (#1945).
 *
 * In "don't ask" permission mode, Claude Code hard-rejects MCP tool calls
 * that aren't in the allowlist. For nexus-agents to be usable for agentic
 * dogfooding (orchestrate, create_expert, consensus_vote), the tools must
 * be pre-approved in ~/.claude/settings.json.
 *
 * This module generates a recommended snippet for users to paste into
 * their settings.json. We do NOT auto-write permissions — that would be
 * a security footgun.
 *
 * @module cli/setup-permissions
 */

/** MCP tool names that are safe to pre-approve (read-only or idempotent). */
const SAFE_READONLY_TOOLS = [
  'list_experts',
  'list_workflows',
  'weather_report',
  'memory_query',
  'memory_stats',
  'query_trace',
  'research_query',
  'research_analyze',
  'research_discover',
  'research_synthesize',
  'repo_analyze',
  'repo_security_plan',
  'extract_symbols',
  'search_codebase',
] as const;

/** MCP tools that execute tasks but are commonly used for dogfooding. */
const SAFE_EXECUTION_TOOLS = [
  'orchestrate',
  'create_expert',
  'execute_expert',
  'consensus_vote',
  'delegate_to_model',
  'run_workflow',
  'issue_triage',
  'registry_import',
] as const;

export type PermissionLevel = 'readonly' | 'all';

/**
 * Generate a JSON snippet of recommended permissions for Claude Code's
 * `~/.claude/settings.json` to pre-approve nexus-agents MCP tools.
 *
 * Users paste this into the `permissions.allow` array.
 */
export function generatePermissionsSnippet(level: PermissionLevel = 'all'): string {
  const tools =
    level === 'readonly'
      ? [...SAFE_READONLY_TOOLS]
      : [...SAFE_READONLY_TOOLS, ...SAFE_EXECUTION_TOOLS];

  const permissions = tools.map((t) => `mcp__nexus-agents__${t}`).sort();
  return JSON.stringify(permissions, null, 2);
}

/**
 * Return a human-readable banner explaining the permissions snippet,
 * for inclusion in `nexus-agents setup` output.
 */
export function buildPermissionsBanner(snippet: string): string {
  return [
    '',
    '--- Claude Code Permissions (optional) ---',
    '',
    "To use nexus-agents MCP tools in 'don't ask' mode (autonomous/headless",
    'Claude Code sessions), add these entries to the `permissions.allow` array',
    'in your `~/.claude/settings.json`:',
    '',
    snippet,
    '',
    'Without these, each MCP tool call will prompt for approval in interactive',
    'mode, or be rejected outright in `dangerously-skip-permissions` mode.',
    '',
    'Reference: https://github.com/williamzujkowski/nexus-agents/issues/1945',
    '',
  ].join('\n');
}
