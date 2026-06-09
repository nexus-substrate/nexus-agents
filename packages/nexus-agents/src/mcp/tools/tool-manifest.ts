/* eslint-disable max-lines -- Cohesive single-source data leaf: one entry per MCP tool (name + annotations + side-effects). Grows with the tool count; governance: 400-700 OK if cohesive (same waiver the former tool-annotations.ts carried). */
/**
 * Canonical MCP tool manifest (#3566 Phase 3 / #3597 increment 2, of #3563).
 *
 * THE single source of truth for *which* MCP tools exist, their registration
 * order, AND their per-tool MCP annotations + side-effect metadata (#993). Each
 * entry is `{ name, annotations, sideEffects }`; everything that needs the
 * tool list or its annotations derives from this one array:
 * - `REGISTERED_TOOL_NAMES` (re-exported from `tools/index.ts`, derives names),
 * - `TOOL_ANNOTATIONS` + `getToolAnnotations`/`getMcpAnnotations` (derive in
 *   `tool-annotations.ts`),
 * - the capability-gap detector's `AVAILABLE_TOOLS` (derives names directly),
 * - `scripts/inject-governance.ts` (parses this file via AST to sync `server.json`,
 *   docs, and the MCP-tool-count guard).
 *
 * **Pure-data leaf — DO NOT add imports.** This module imports nothing (the
 * annotation/side-effect TYPES are defined here, not imported) so any layer can
 * derive from it without pulling in the MCP tool dependency graph. That is what
 * lets `core/task-analysis/capability-gap-detector.ts` and `tool-annotations.ts`
 * import the data directly (one-way edge, no cycle). Keep it import-free or that
 * property breaks.
 *
 * Adding/removing a tool: edit THIS array (name + annotations + sideEffects). The
 * drift guards, `TOOL_ANNOTATIONS`, and `inject-governance` follow automatically.
 *
 * @module mcp/tools/tool-manifest
 */

/**
 * Side effect category per Issue #993 proposal.
 * - explicit: Intended, documented state changes
 * - implicit: System-level effects (rate limits, token consumption)
 * - coupling: Modifies state that another tool depends on
 */
export type SideEffectCategory = 'explicit' | 'implicit' | 'coupling';

/** A single side effect declaration. */
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

/** Combined tool metadata: MCP annotations + custom side effects. */
export interface ToolSideEffectsEntry {
  readonly annotations: ToolAnnotations;
  readonly sideEffects: readonly SideEffect[];
}

/**
 * A single manifest entry: the tool name plus its annotation/side-effect data.
 */
export interface ToolManifestEntry extends ToolSideEffectsEntry {
  readonly name: string;
}

/**
 * Registered MCP tools, in registration order. The order is significant — it is
 * written to `server.json` so the MCP-spec registry stays in lockstep.
 */
export const TOOL_MANIFEST = [
  {
    name: 'orchestrate',
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
  {
    name: 'create_expert',
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
  {
    name: 'execute_expert',
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
  {
    name: 'run_workflow',
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
  {
    name: 'delegate_to_model',
    annotations: {
      title: 'Delegate to Model',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    sideEffects: [{ category: 'implicit', description: 'Consumes rate limit quota' }],
  },
  {
    name: 'list_experts',
    annotations: {
      title: 'List Experts',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    sideEffects: [{ category: 'implicit', description: 'Consumes rate limit quota' }],
  },
  {
    name: 'list_workflows',
    annotations: {
      title: 'List Workflows',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    sideEffects: [{ category: 'implicit', description: 'Consumes rate limit quota' }],
  },
  {
    name: 'consensus_vote',
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
  {
    name: 'research_query',
    annotations: {
      title: 'Research Query',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    sideEffects: [{ category: 'implicit', description: 'Consumes rate limit quota' }],
  },
  {
    name: 'research_add',
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
  {
    name: 'research_add_source',
    annotations: {
      title: 'Research Add Source',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    sideEffects: [
      { category: 'explicit', description: 'Adds a non-paper source to the research registry' },
      { category: 'coupling', description: 'New entries affect research_discover/research_query' },
    ],
  },
  {
    name: 'research_discover',
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
  {
    name: 'research_analyze',
    annotations: {
      title: 'Research Analyze',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    sideEffects: [{ category: 'implicit', description: 'Consumes rate limit quota' }],
  },
  {
    name: 'research_catalog_review',
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
  {
    name: 'research_synthesize',
    annotations: {
      title: 'Research Synthesize',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    sideEffects: [{ category: 'implicit', description: 'Reads research catalog + alignment map' }],
  },
  {
    name: 'survey_oss_landscape',
    annotations: {
      title: 'Survey OSS Landscape',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    sideEffects: [{ category: 'implicit', description: 'Queries the GitHub search API' }],
  },
  {
    name: 'vendor_publishing_audit',
    annotations: {
      title: 'Vendor Publishing Audit',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    sideEffects: [{ category: 'implicit', description: 'Consumes rate limit quota' }],
  },
  {
    name: 'compare_data_feeds',
    annotations: {
      title: 'Compare Data Feeds',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    sideEffects: [{ category: 'implicit', description: 'Reads two files from the workspace' }],
  },
  {
    name: 'memory_query',
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
  {
    name: 'memory_stats',
    annotations: {
      title: 'Memory Stats',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    sideEffects: [{ category: 'implicit', description: 'Consumes rate limit quota' }],
  },
  {
    name: 'memory_write',
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
  {
    name: 'weather_report',
    annotations: {
      title: 'Weather Report',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    sideEffects: [{ category: 'implicit', description: 'Consumes rate limit quota' }],
  },
  {
    name: 'issue_triage',
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
  {
    name: 'run_graph_workflow',
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
  {
    name: 'execute_spec',
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
  {
    name: 'registry_import',
    annotations: {
      title: 'Registry Import',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    sideEffects: [{ category: 'explicit', description: 'Generates draft model registry entry' }],
  },
  {
    name: 'query_trace',
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
  {
    name: 'query_task_state',
    annotations: {
      title: 'Query Task State',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    sideEffects: [
      { category: 'implicit', description: 'Reads the structured task-state log (#2278)' },
    ],
  },
  {
    name: 'get_job_result',
    annotations: {
      title: 'Get Job Result',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    sideEffects: [
      {
        category: 'implicit',
        description: 'Reads the async-mode job-result sidecar (#3042 / epic #2631)',
      },
    ],
  },
  {
    name: 'list_jobs',
    annotations: {
      title: 'List Jobs',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    sideEffects: [
      {
        category: 'implicit',
        description:
          'Lists async-mode job summaries from the sidecar dir (#3046 / epic #2631 Stage 5)',
      },
    ],
  },
  {
    name: 'cancel_job',
    annotations: {
      title: 'Cancel Job',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    sideEffects: [
      {
        category: 'explicit',
        description: 'Writes cancellation record to the async-mode sidecar (#3042 Stage 1b)',
      },
      {
        category: 'coupling',
        description:
          'Triggers AbortSignal unwind in same-process dispatcher (cross-process workers must poll)',
      },
    ],
  },
  {
    name: 'ci_health_check',
    annotations: {
      title: 'CI Health Check',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    sideEffects: [
      {
        category: 'implicit',
        description:
          'Fetches GitHub status-page + repo actions/runs to assess CI infrastructure health (#3076)',
      },
      {
        category: 'implicit',
        description: 'Appends a local CI-health telemetry event per call for observability (#3530)',
      },
    ],
  },
  {
    name: 'verify_audit_chain',
    annotations: {
      title: 'Verify Audit Chain',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    sideEffects: [
      {
        category: 'implicit',
        description: 'Reads the immutable audit log and verifies the hash chain',
      },
    ],
  },
  {
    name: 'repo_analyze',
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
  {
    name: 'repo_security_plan',
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
  {
    name: 'extract_symbols',
    annotations: {
      title: 'Extract Symbols',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    sideEffects: [{ category: 'implicit', description: 'Reads source files and walks their ASTs' }],
  },
  {
    name: 'search_codebase',
    annotations: {
      title: 'Search Codebase',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    sideEffects: [
      {
        category: 'implicit',
        description: 'Reads source files and builds an in-memory symbol index',
      },
    ],
  },
  {
    name: 'run_dev_pipeline',
    annotations: {
      title: 'Run Dev Pipeline',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    sideEffects: [
      {
        category: 'explicit',
        description: 'Executes the V2 dev pipeline (delegates to CLI adapters)',
      },
      {
        category: 'implicit',
        description: 'Consumes API tokens; persists outcomes and checkpoints',
      },
      {
        category: 'coupling',
        description: 'Writes routing/learning state consumed by future runs',
      },
    ],
  },
  {
    name: 'run_pipeline',
    annotations: {
      title: 'Run Pipeline',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    sideEffects: [
      { category: 'explicit', description: 'Executes a generic V2 pipeline TaskContract' },
      { category: 'implicit', description: 'Consumes API tokens; emits pipeline events' },
      { category: 'coupling', description: 'Writes policy/audit state consumed by other tools' },
    ],
  },
  {
    name: 'pr_review',
    annotations: {
      title: 'PR Review',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    sideEffects: [
      {
        category: 'explicit',
        description: 'Runs multi-voter PR review with verification gate (#2233)',
      },
      { category: 'implicit', description: 'Consumes API tokens across voter CLIs' },
      { category: 'coupling', description: 'Records voter outcomes for weather report' },
    ],
  },
  {
    name: 'supply_chain_tradeoff_panel',
    annotations: {
      title: 'Supply-chain Tradeoff Panel',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    sideEffects: [
      {
        category: 'explicit',
        description:
          'Runs per-axis tradeoff vote (build_time_determinism / supply_chain_risk / update_cadence) (#2294)',
      },
      { category: 'implicit', description: 'Consumes API tokens across voter CLIs' },
      { category: 'coupling', description: 'Records voter outcomes for weather report' },
    ],
  },
  {
    name: 'improvement_review',
    annotations: {
      title: 'Improvement Review',
      readOnlyHint: false,
      destructiveHint: false,
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
  {
    name: 'run_quality_gate',
    annotations: {
      title: 'Run Quality Gate',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    sideEffects: [
      {
        category: 'implicit',
        description:
          'Spawns local toolchain processes (tsc/eslint/vitest/build) in the target project dir',
      },
      {
        category: 'implicit',
        description: 'build/test checks may write build artifacts and coverage output to disk',
      },
    ],
  },
  {
    name: 'suggest_research_tasks',
    annotations: {
      title: 'Suggest Research Tasks',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    sideEffects: [
      {
        category: 'implicit',
        description: 'Queries research_discover / external research APIs; consumes tokens',
      },
    ],
  },
  {
    name: 'list_available_models',
    annotations: {
      title: 'List Available Models',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    sideEffects: [
      {
        category: 'implicit',
        description: 'Fetches the OpenRouter catalog + probes CLI adapters (network/subprocess)',
      },
    ],
  },
  {
    name: 'run',
    annotations: {
      title: 'Run (Adaptive Entry Point)',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    sideEffects: [
      { category: 'implicit', description: 'Records a routing decision for observability' },
    ],
  },
] as const;

/** A registered MCP tool name, derived from {@link TOOL_MANIFEST}. */
export type RegisteredToolName = (typeof TOOL_MANIFEST)[number]['name'];
