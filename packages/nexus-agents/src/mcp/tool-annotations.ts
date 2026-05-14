/**
 * Central per-tool MCP annotations (#2648, Epic A).
 *
 * The MCP 2025-11-25 spec defines four boolean hints clients use to reason
 * about each tool's safety, retry semantics, and permission UX:
 *
 *   - `readOnlyHint`     — tool does not modify persistent state
 *   - `destructiveHint`  — tool can perform destructive operations
 *   - `idempotentHint`   — calling with the same input is safe to repeat
 *   - `openWorldHint`    — tool interacts with systems outside the server's control
 *
 * Per the MCP spec these are **hints**, not enforcement primitives — clients
 * should never trust them from an untrusted server. But for nexus-agents (a
 * governance substrate) the hints are load-bearing for:
 *
 *   - Programmatic prerequisite gates (Epic B / #2652) — uses
 *     `destructiveHint` and `openWorldHint` to decide what to gate.
 *   - Retry policy decisions in pipeline runners — only retry tools where
 *     `idempotentHint === true`.
 *   - Permission-prompt UX consistency across Claude / Codex / Gemini /
 *     OpenCode harnesses.
 *
 * The audit (#2648 / docs/research/nexus-agents-multi-harness-alignment-audit.md
 * §6 T14) requires **every** registered tool declare all four hints
 * explicitly — no defaults. This file is the single source of truth; each
 * tool's `registerTool()` call site reads its annotations via
 * `getToolAnnotations(name)`.
 *
 * @module mcp/tool-annotations
 */

import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

/**
 * Per-tool annotations for all 38 registered MCP tools. Adding a new tool
 * requires adding its entry here; `checkToolAnnotations` (governance CI gate)
 * enforces parity with `REGISTERED_TOOL_NAMES` in
 * `packages/nexus-agents/src/mcp/tools/index.ts`.
 */
export const TOOL_ANNOTATIONS: Record<string, ToolAnnotations> = {
  // ============================================================================
  // Orchestration & expert lifecycle
  // ============================================================================

  /** Orchestrator coordinates expert agents; spawns workers that may mutate state. */
  orchestrate: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  /** Creates an expert and adds it to the in-memory expert registry. */
  create_expert: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  /** Executes a previously created expert; invokes external CLIs. */
  execute_expert: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },

  // ============================================================================
  // Workflow / pipeline execution
  // ============================================================================

  /** Runs a workflow template; steps may write to the registry or filesystem. */
  run_workflow: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  /** Runs a graph-based workflow with checkpointing. */
  run_graph_workflow: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  /** Runs a pipeline plugin by name. */
  run_pipeline: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  /** Full dev pipeline: research → plan → vote → implement → QA. */
  run_dev_pipeline: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  /** Executes an AI-software-factory spec pipeline. */
  execute_spec: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },

  // ============================================================================
  // Voting / decision
  // ============================================================================

  /** Records vote outcomes to the audit log; doesn't write to repo state. */
  consensus_vote: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  /** Per-axis tradeoff vote; records outcome to the store. */
  supply_chain_tradeoff_panel: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  /** Multi-voter PR review; may write review comments. */
  pr_review: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },

  // ============================================================================
  // Routing & introspection (read-only)
  // ============================================================================

  /** Returns a routing recommendation; doesn't execute. */
  delegate_to_model: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  /** Lists registered expert types. */
  list_experts: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  /** Lists registered workflow templates. */
  list_workflows: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },

  // ============================================================================
  // Research registry — reads
  // ============================================================================

  /** Queries the research registry. */
  research_query: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  /** Analyzes registry for gaps, trends, coverage. */
  research_analyze: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  /** Synthesizes registry into topic clusters. */
  research_synthesize: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  /** Discovers research items via external APIs; doesn't mutate registry. */
  research_discover: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },

  // ============================================================================
  // Research registry — mutations
  // ============================================================================

  /** Adds an arXiv paper to the registry. Dedup-checked but first call has effects. */
  research_add: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  /** Adds a non-paper source to the registry. */
  research_add_source: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  /** Reviews auto-cataloged research references; may approve/dismiss. */
  research_catalog_review: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },

  // ============================================================================
  // Transient lookups (no registry persistence)
  // ============================================================================

  /** Transient OSS search via GitHub API; no persistence. */
  survey_oss_landscape: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  /** Static lookup against curated vendor seed data. */
  vendor_publishing_audit: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  /** Diffs two YAML/JSON files; local-only. */
  compare_data_feeds: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },

  // ============================================================================
  // Memory
  // ============================================================================

  /** Reads from memory backends. */
  memory_query: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  /** Returns memory statistics. */
  memory_stats: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  /** Writes to a memory backend. */
  memory_write: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },

  // ============================================================================
  // Observability
  // ============================================================================

  /** Multi-CLI performance weather report; reads outcome store. */
  weather_report: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  /** Queries execution traces from disk. */
  query_trace: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  /** Queries structured task-state log. */
  query_task_state: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  /** Verifies hash chain of audit log files. */
  verify_audit_chain: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  /** Threshold-gated observability loop; may file GitHub issues when fileIssues=true. */
  improvement_review: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },

  // ============================================================================
  // Repository analysis
  // ============================================================================

  /** Analyzes a GitHub repository structure; doesn't write. */
  repo_analyze: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  /** Generates a security-scanning pipeline plan; returns plan, doesn't write it. */
  repo_security_plan: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  /** Extracts code symbols from source files. */
  extract_symbols: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  /** Searches codebase for patterns or symbols. */
  search_codebase: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },

  // ============================================================================
  // Issue triage & registry imports
  // ============================================================================

  /** Triages a GitHub issue; may write labels/comments when authorized. */
  issue_triage: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  /** Generates a draft model-registry entry; doesn't write. */
  registry_import: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
};

/**
 * Look up the annotations for a registered MCP tool. Throws if the tool
 * name isn't in the central map — this enforces "every tool declares its
 * hints explicitly" rather than silently falling back to MCP's defaults
 * (which assume destructive + non-idempotent + open-world).
 */
export function getToolAnnotations(name: string): ToolAnnotations {
  const a = TOOL_ANNOTATIONS[name];
  if (a === undefined) {
    throw new Error(
      `getToolAnnotations: no entry for tool "${name}". Add it to TOOL_ANNOTATIONS in src/mcp/tool-annotations.ts (#2648).`
    );
  }
  return a;
}
