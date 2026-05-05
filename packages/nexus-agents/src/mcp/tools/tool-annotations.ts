/**
 * MCP Tool Annotations Registry
 *
 * Centralized side effect and behavior annotations for all MCP tools.
 * Uses MCP protocol-standard ToolAnnotations (readOnlyHint, destructiveHint,
 * idempotentHint, openWorldHint) plus custom side effect metadata.
 *
 * @module mcp/tools/tool-annotations
 * (Source: Issue #993 — Document MCP tool side effects in schema metadata)
 */

/**
 * Side effect category per Issue #993 proposal.
 * - explicit: Intended, documented state changes
 * - implicit: System-level effects (rate limits, token consumption)
 * - coupling: Modifies state that another tool depends on
 */
export type SideEffectCategory = 'explicit' | 'implicit' | 'coupling';

/**
 * A single side effect declaration.
 */
export interface SideEffect {
  readonly category: SideEffectCategory;
  readonly description: string;
}

/**
 * MCP protocol-standard tool annotations.
 * Maps to ToolAnnotationsSchema from @modelcontextprotocol/sdk.
 */
export interface ToolAnnotations {
  /** Human-readable title for the tool */
  readonly title?: string;
  /** If true, the tool does not modify state */
  readonly readOnlyHint?: boolean;
  /** If true, the tool may perform destructive operations */
  readonly destructiveHint?: boolean;
  /** If true, calling with same args yields same result */
  readonly idempotentHint?: boolean;
  /** If true, the tool interacts with external systems */
  readonly openWorldHint?: boolean;
}

/**
 * Combined tool metadata: MCP annotations + custom side effects.
 */
export interface ToolSideEffectsEntry {
  readonly annotations: ToolAnnotations;
  readonly sideEffects: readonly SideEffect[];
}

/**
 * Canonical registry of tool annotations and side effects.
 * One entry per registered MCP tool.
 */
export const TOOL_ANNOTATIONS: Readonly<Record<string, ToolSideEffectsEntry>> = {
  delegate_to_model: {
    annotations: {
      title: 'Delegate to Model',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    sideEffects: [{ category: 'implicit', description: 'Consumes rate limit quota' }],
  },
  orchestrate: {
    annotations: {
      title: 'Orchestrate Task',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    sideEffects: [
      { category: 'explicit', description: 'Creates and executes expert agents' },
      { category: 'implicit', description: 'Consumes API tokens from configured provider' },
      { category: 'coupling', description: 'May trigger rate limiting on model adapter' },
      { category: 'coupling', description: 'Records task outcome in OutcomeFeedbackCollector' },
    ],
  },
  create_expert: {
    annotations: {
      title: 'Create Expert',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    sideEffects: [
      { category: 'explicit', description: 'Creates expert agent in shared registry' },
      { category: 'coupling', description: 'Expert ID required by execute_expert' },
    ],
  },
  execute_expert: {
    annotations: {
      title: 'Execute Expert',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    sideEffects: [
      { category: 'explicit', description: 'Executes expert agent task via model adapter' },
      { category: 'implicit', description: 'Consumes API tokens from configured provider' },
      { category: 'coupling', description: 'Requires expert created by create_expert' },
      { category: 'coupling', description: 'May trigger rate limiting on model adapter' },
    ],
  },
  run_workflow: {
    annotations: {
      title: 'Run Workflow',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    sideEffects: [
      { category: 'explicit', description: 'Executes multi-step workflow template' },
      { category: 'implicit', description: 'Consumes API tokens if workflow uses model adapter' },
      { category: 'coupling', description: 'May trigger rate limiting on model adapter' },
    ],
  },
  list_experts: {
    annotations: {
      title: 'List Experts',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    sideEffects: [{ category: 'implicit', description: 'Consumes rate limit quota' }],
  },
  list_workflows: {
    annotations: {
      title: 'List Workflows',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    sideEffects: [{ category: 'implicit', description: 'Consumes rate limit quota' }],
  },
  consensus_vote: {
    annotations: {
      title: 'Consensus Vote',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    sideEffects: [
      { category: 'explicit', description: 'Executes multi-agent voting across CLIs' },
      { category: 'implicit', description: 'Consumes API tokens from multiple providers' },
      { category: 'coupling', description: 'Records vote outcomes for weather report' },
    ],
  },
  research_query: {
    annotations: {
      title: 'Research Query',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    sideEffects: [{ category: 'implicit', description: 'Consumes rate limit quota' }],
  },
  research_add: {
    annotations: {
      title: 'Research Add',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    sideEffects: [
      { category: 'explicit', description: 'Adds paper to research registry on disk' },
      { category: 'implicit', description: 'Fetches metadata from arXiv API' },
    ],
  },
  research_discover: {
    annotations: {
      title: 'Research Discover',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    sideEffects: [
      { category: 'implicit', description: 'Queries external APIs (arXiv, GitHub, etc.)' },
      { category: 'coupling', description: 'Auto-catalogs discovered references' },
    ],
  },
  survey_oss_landscape: {
    annotations: {
      title: 'Survey OSS Landscape',
      readOnlyHint: true,
      destructiveHint: false,
      // Same query may return different results day-to-day as star counts
      // and last-commit dates evolve; idempotentHint=false matches reality.
      idempotentHint: false,
      openWorldHint: true,
    },
    sideEffects: [{ category: 'implicit', description: 'Queries the GitHub search API' }],
  },
  vendor_publishing_audit: {
    annotations: {
      title: 'Vendor Publishing Audit',
      readOnlyHint: true,
      destructiveHint: false,
      // Pure static lookup against the in-process seed dataset.
      idempotentHint: true,
      openWorldHint: false,
    },
    sideEffects: [{ category: 'implicit', description: 'Consumes rate limit quota' }],
  },
  compare_data_feeds: {
    annotations: {
      title: 'Compare Data Feeds',
      readOnlyHint: true,
      destructiveHint: false,
      // Same input → same output; pure file diff with no external calls.
      idempotentHint: true,
      openWorldHint: false,
    },
    sideEffects: [{ category: 'implicit', description: 'Reads two files from the workspace' }],
  },
  research_analyze: {
    annotations: {
      title: 'Research Analyze',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    sideEffects: [{ category: 'implicit', description: 'Consumes rate limit quota' }],
  },
  research_catalog_review: {
    annotations: {
      title: 'Research Catalog Review',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    sideEffects: [
      { category: 'explicit', description: 'Approves or dismisses cataloged references' },
      { category: 'coupling', description: 'Approved items added to research registry' },
    ],
  },
  memory_query: {
    annotations: {
      title: 'Memory Query',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    sideEffects: [
      { category: 'implicit', description: 'Consumes rate limit quota' },
      { category: 'implicit', description: 'May trigger reflective retrieval (MemR3)' },
    ],
  },
  memory_stats: {
    annotations: {
      title: 'Memory Stats',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    sideEffects: [{ category: 'implicit', description: 'Consumes rate limit quota' }],
  },
  memory_write: {
    annotations: {
      title: 'Memory Write',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    sideEffects: [
      { category: 'explicit', description: 'Writes data to memory backend' },
      { category: 'implicit', description: 'Consumes rate limit quota' },
    ],
  },
  weather_report: {
    annotations: {
      title: 'Weather Report',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    sideEffects: [{ category: 'implicit', description: 'Consumes rate limit quota' }],
  },
  improvement_review: {
    annotations: {
      title: 'Improvement Review',
      readOnlyHint: false,
      destructiveHint: false,
      // When fileIssues=true, creates GitHub issues — not idempotent.
      idempotentHint: false,
      openWorldHint: true,
    },
    sideEffects: [
      { category: 'implicit', description: 'Reads OutcomeStore and runs fitness audit' },
      {
        category: 'explicit',
        description: 'When fileIssues=true, files candidate GitHub issues via gh CLI',
      },
      { category: 'implicit', description: 'Consumes rate limit quota' },
    ],
  },
  issue_triage: {
    annotations: {
      title: 'Issue Triage',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    sideEffects: [
      { category: 'implicit', description: 'Fetches issue data from GitHub API' },
      { category: 'implicit', description: 'Consumes rate limit quota' },
    ],
  },
  run_graph_workflow: {
    annotations: {
      title: 'Run Graph Workflow',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    sideEffects: [
      { category: 'explicit', description: 'Executes graph-based workflow with checkpointing' },
      { category: 'implicit', description: 'Writes checkpoint files to disk' },
      { category: 'coupling', description: 'May trigger rate limiting on model adapters' },
    ],
  },
  execute_spec: {
    annotations: {
      title: 'Execute Spec',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    sideEffects: [
      { category: 'explicit', description: 'Parses and executes markdown specification' },
      { category: 'implicit', description: 'Consumes API tokens from configured provider' },
      { category: 'implicit', description: 'Writes execution trace to disk' },
    ],
  },
  registry_import: {
    annotations: {
      title: 'Registry Import',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    sideEffects: [{ category: 'explicit', description: 'Generates draft model registry entry' }],
  },
  query_trace: {
    annotations: {
      title: 'Query Trace',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    sideEffects: [
      { category: 'implicit', description: 'Reads execution trace JSONL files from disk' },
    ],
  },
  repo_analyze: {
    annotations: {
      title: 'Repo Analyze',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    sideEffects: [
      {
        category: 'implicit',
        description: 'Fetches repository metadata from GitHub API via gh CLI',
      },
      { category: 'implicit', description: 'Consumes rate limit quota' },
    ],
  },
  repo_security_plan: {
    annotations: {
      title: 'Repo Security Plan',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    sideEffects: [
      {
        category: 'implicit',
        description: 'Fetches repository metadata from GitHub API via gh CLI',
      },
      { category: 'implicit', description: 'Consumes rate limit quota' },
    ],
  },
};

/**
 * Returns the annotations for a given tool, or undefined if not found.
 */
export function getToolAnnotations(toolName: string): ToolSideEffectsEntry | undefined {
  return TOOL_ANNOTATIONS[toolName];
}

/**
 * Returns only the MCP protocol annotations for a tool (for registerTool config).
 */
export function getMcpAnnotations(toolName: string): ToolAnnotations | undefined {
  return TOOL_ANNOTATIONS[toolName]?.annotations;
}

/**
 * Returns side effects for a tool filtered by category.
 */
export function getSideEffectsByCategory(
  toolName: string,
  category: SideEffectCategory
): readonly SideEffect[] {
  const entry = TOOL_ANNOTATIONS[toolName];
  if (entry === undefined) return [];
  return entry.sideEffects.filter((se) => se.category === category);
}
