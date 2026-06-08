/**
 * Centralized Timeout Configuration
 *
 * Single source of truth for ALL timeout values in nexus-agents.
 * Every timeout-related constant should be defined here and imported
 * by consumers — never hardcoded elsewhere.
 *
 * Taxonomy:
 * - **CLI**: Per-CLI subprocess execution timeouts by task complexity
 * - **Vote**: Consensus voting round timeouts
 * - **MCP**: MCP tool handler timeouts (default + per-tool overrides)
 * - **Workflow**: Workflow step and overall execution timeouts
 * - **Graph**: Graph workflow execution timeouts
 * - **API**: External API request timeouts
 * - **Internal**: Health checks, circuit breakers, wave scheduling
 *
 * Environment variable overrides: use `resolveTimeout()` for categories
 * that support runtime configuration.
 *
 * @module config/timeouts
 * (Source: Issue #984 — Centralize timeout configuration)
 */

import type { TaskComplexity, KnownCliName, TimeoutProfile } from './defaults-types.js';
import { isKnownCliName } from './defaults-types.js';
import { detectTaskCategory } from './task-specialization.js';

// Re-export types that consumers need
export type { TaskComplexity, KnownCliName, TimeoutProfile };
export { isKnownCliName };

// ============================================================================
// Central Timeout Constants
// ============================================================================

/**
 * Per-CLI timeout profiles by task complexity.
 *
 * Values based on real-world performance testing (Issues #357, #366, #983):
 * - Claude: Consistent 30-120s across complexity levels
 * - Gemini: 30-180s — complex tasks need extra buffer for large context
 * - Codex: 10-90s — optimized for code generation, increased per #983
 *
 * When both defaults-timeout-profiles.ts and cli-timeout-profiles.ts
 * had conflicting values, the Issue #366 values (from observed failures)
 * take precedence.
 */
export const CLI_TIMEOUTS = {
  claude: { simple: 30_000, standard: 120_000, complex: 600_000 },
  gemini: { simple: 30_000, standard: 180_000, complex: 600_000 },
  codex: { simple: 10_000, standard: 60_000, complex: 300_000 },
  opencode: { simple: 30_000, standard: 120_000, complex: 600_000 },
  default: { simple: 30_000, standard: 120_000, complex: 600_000 },
} as const satisfies Record<KnownCliName, TimeoutProfile>;

/**
 * Consensus voting timeouts.
 * Increased from 90s to 120s per Issue #983 for slower CLIs.
 */
export const VOTE_TIMEOUTS = {
  /** Default per-agent vote timeout.
   * Increased from 180s to 300s per Issue #1640 — architecture/security
   * experts regularly exceed 180s on complex proposals (avg 315s observed). */
  defaultMs: 300_000,
  /** Minimum allowed vote timeout (floor for env override). */
  minMs: 30_000,
  /** Maximum allowed vote timeout (cap for env override). */
  maxMs: 600_000,
  /** Default max retries per agent. */
  maxRetries: 2,
  /**
   * Slack buffer added to the overall wall-clock deadline in
   * `computeOverallConsensusDeadlineMs` (#1871). Acts as a safety net
   * above per-vote × (retries+1) + stagger. Centralized so the formula
   * can be tuned in one place.
   * (Issue #2636 — was hardcoded `60_000` in voter-agents.ts:93)
   */
  overallDeadlineBufferMs: 60_000,
} as const;

// ============================================================================
// Central Operation-Class Timeout Authority (#3734)
// ============================================================================
//
// PRINCIPLE: timeouts are RUNAWAY-GUARDS, not SLAs. Every class guard is a
// generous upper bound that only genuinely-stuck/runaway work should hit — it
// is NOT a deadline tuned to the median legitimate runtime. The historical 60s
// MCP default was accidental and punitive; multi-LLM / pipeline tools that
// legitimately run for minutes were being killed at 60s (#3726/#3729 audit).
//
// Each MCP tool maps to exactly one class via TOOL_CLASS; getToolTimeout
// (mcp/middleware/tool-wrapper.ts) resolves the class guard. Central tunability
// is via NEXUS_TIMEOUT_MULTIPLIER (scales every class) and the per-class
// NEXUS_TIMEOUT_CLASS_<CLASS>_MS overrides.

/** Operation classes, ordered loosest→tightest by typical work shape. */
export type OperationClassName =
  | 'interactive'
  | 'single-llm'
  | 'multi-llm-panel'
  | 'pipeline'
  | 'network-fetch'
  | 'async-job-body';

/** A single operation-class runaway-guard definition. */
export interface OperationClass {
  /** Generous upper-bound guard in milliseconds (runaway-guard, not SLA). */
  readonly guardMs: number;
  /** Human-readable class name (matches the {@link OperationClassName} key). */
  readonly name: OperationClassName;
}

/**
 * Operation-class runaway-guards. These are deliberately HIGH — they exist to
 * stop a wedged process, never to enforce a latency budget.
 *
 * - `interactive` (60s): fast local tools (memory/query/list/get) — a human
 *   waits on these, so a tight guard is acceptable.
 * - `single-llm` (300s): one model round-trip (single expert / delegate) AND
 *   CPU-heavy local tools (extract_symbols / search_codebase) that can exceed
 *   60s on a large repo. This is the DEFAULT for unclassified tools.
 * - `multi-llm-panel` (900s): N voters / reviewers in parallel.
 * - `pipeline` (1800s): multi-stage orchestration / spec / graph execution.
 * - `network-fetch` (120s): external discovery / catalog / repo fetches.
 * - `async-job-body` (3600s): the body of a backgrounded job, which has no
 *   request timeout but still needs a ceiling so a runaway job is reaped.
 */
export const OPERATION_CLASSES = {
  interactive: { guardMs: 60_000, name: 'interactive' },
  'single-llm': { guardMs: 300_000, name: 'single-llm' },
  'multi-llm-panel': { guardMs: 900_000, name: 'multi-llm-panel' },
  pipeline: { guardMs: 1_800_000, name: 'pipeline' },
  'network-fetch': { guardMs: 120_000, name: 'network-fetch' },
  'async-job-body': { guardMs: 3_600_000, name: 'async-job-body' },
} as const satisfies Record<OperationClassName, OperationClass>;

/**
 * The class an unclassified MCP tool falls back to. Resolves to the
 * `single-llm` guard (300s) — the non-punitive replacement for the historical
 * 60s default. A tool should NEVER ride this silently: a force-classify test
 * asserts every registered tool appears in {@link TOOL_CLASS}.
 */
export const DEFAULT_OPERATION_CLASS: OperationClassName = 'single-llm';

/**
 * Classification of EVERY registered MCP tool into an operation class.
 * Keyed by tool name (the `TOOL_MANIFEST` set — 46 tools). A failing test in
 * `config/timeouts.test.ts` asserts full coverage so no tool silently rides
 * {@link DEFAULT_OPERATION_CLASS}.
 *
 * Classification is by behavior, not by name:
 * - multi-voter panels → `multi-llm-panel`
 * - multi-stage pipelines / orchestration → `pipeline`
 * - single expert / delegate / CPU-heavy local → `single-llm`
 * - external network fetches → `network-fetch`
 * - fast local reads/writes → `interactive`
 *
 * `execute_expert` is `multi-llm-panel` (not `single-llm`): it historically
 * carried a 900s budget for deep multi-turn reasoning, so the tighter
 * single-llm guard would be a regression — keep its generous guard.
 */
export const TOOL_CLASS = {
  // --- pipelines / multi-stage orchestration (1800s) ---
  orchestrate: 'pipeline',
  run: 'pipeline',
  run_workflow: 'pipeline',
  run_graph_workflow: 'pipeline',
  run_pipeline: 'pipeline',
  run_dev_pipeline: 'pipeline',
  execute_spec: 'pipeline',
  // --- multi-LLM panels (900s) ---
  consensus_vote: 'multi-llm-panel',
  pr_review: 'multi-llm-panel',
  supply_chain_tradeoff_panel: 'multi-llm-panel',
  execute_expert: 'multi-llm-panel',
  improvement_review: 'multi-llm-panel',
  // --- single-LLM / single-expert (300s) ---
  create_expert: 'single-llm',
  delegate_to_model: 'single-llm',
  issue_triage: 'single-llm',
  research_analyze: 'single-llm',
  research_synthesize: 'single-llm',
  research_catalog_review: 'single-llm',
  suggest_research_tasks: 'single-llm',
  run_quality_gate: 'single-llm',
  // --- CPU-heavy local (300s — can exceed 60s on a big repo) ---
  extract_symbols: 'single-llm',
  search_codebase: 'single-llm',
  // --- external network fetches (120s) ---
  research_discover: 'network-fetch',
  research_add_source: 'network-fetch',
  survey_oss_landscape: 'network-fetch',
  vendor_publishing_audit: 'network-fetch',
  compare_data_feeds: 'network-fetch',
  repo_analyze: 'network-fetch',
  repo_security_plan: 'network-fetch',
  ci_health_check: 'network-fetch',
  weather_report: 'network-fetch',
  // --- fast local reads/writes (60s interactive) ---
  list_experts: 'interactive',
  list_workflows: 'interactive',
  list_jobs: 'interactive',
  list_available_models: 'interactive',
  get_job_result: 'interactive',
  cancel_job: 'interactive',
  query_trace: 'interactive',
  query_task_state: 'interactive',
  verify_audit_chain: 'interactive',
  registry_import: 'interactive',
  research_query: 'interactive',
  research_add: 'interactive',
  memory_query: 'interactive',
  memory_stats: 'interactive',
  memory_write: 'interactive',
} as const satisfies Record<string, OperationClassName>;

/**
 * Named central constants for non-MCP-tool callers that need a class guard but
 * do not flow through {@link TOOL_CLASS} (workflows, self-eval, network fetches).
 * Each derives from {@link OPERATION_CLASSES} so the operation-class taxonomy
 * (#3734) stays the single source of truth — no local literals.
 *
 * PRINCIPLE (#3734): these are non-punitive RUNAWAY-GUARDS. The old AFlow /
 * self-eval / mutation literals (30s/60s guarding an LLM evaluation) were
 * punitive and have been raised to the `single-llm` class guard (300s). Network
 * fetch literals (30s/10s) ride the `network-fetch` guard (120s).
 * (Source: Issue #3736 — sweep scattered literal timeouts into the authority)
 */

/**
 * Runaway-guard for a single LLM evaluation / mutation / self-eval round-trip.
 * Resolves to the `single-llm` class guard (300s). Replaces the punitive
 * 30s/60s literals in aflow / self-eval / mutation-operators.
 */
export const SINGLE_LLM_EVAL_TIMEOUT_MS = OPERATION_CLASSES['single-llm'].guardMs;

/**
 * Runaway-guard for an outbound HTTP fetch (registry/plan-compiler/github/osv/
 * v2-delegate). Resolves to the `network-fetch` class guard (120s) — generous
 * for any real fetch, replacing the scattered 30s/10s `AbortSignal.timeout`
 * literals.
 */
export const NETWORK_FETCH_TIMEOUT_MS = OPERATION_CLASSES['network-fetch'].guardMs;

/**
 * Generous upper bound for a multi-step search tree (LATTS) run. Resolves to the
 * `single-llm` class guard (300s) — the prior 5-minute literal happened to match
 * the class guard exactly, so this is pure centralization.
 */
export const SEARCH_TREE_MAX_TIME_MS = OPERATION_CLASSES['single-llm'].guardMs;

/** Env-var name for the global timeout multiplier. */
export const TIMEOUT_MULTIPLIER_ENV_VAR = 'NEXUS_TIMEOUT_MULTIPLIER';

/** Multiplier clamp bounds — keep operators from disabling or ballooning guards. */
export const TIMEOUT_MULTIPLIER_MIN = 0.25;
export const TIMEOUT_MULTIPLIER_MAX = 10;

/** Per-class clamp bounds for the env-override base, before the multiplier. */
const CLASS_OVERRIDE_MIN_MS = 1_000;
const CLASS_OVERRIDE_MAX_MS = 7_200_000;

/**
 * Resolves the global timeout multiplier from `NEXUS_TIMEOUT_MULTIPLIER`,
 * clamped to [{@link TIMEOUT_MULTIPLIER_MIN}, {@link TIMEOUT_MULTIPLIER_MAX}].
 * A missing/invalid value yields 1 (no scaling).
 */
export function resolveTimeoutMultiplier(): number {
  const raw = process.env[TIMEOUT_MULTIPLIER_ENV_VAR];
  if (raw === undefined) return 1;
  const parsed = Number(raw);
  if (Number.isNaN(parsed) || parsed <= 0) return 1;
  return Math.min(Math.max(parsed, TIMEOUT_MULTIPLIER_MIN), TIMEOUT_MULTIPLIER_MAX);
}

/** The per-class env-override variable name for a given class. */
export function classOverrideEnvVar(cls: OperationClassName): string {
  return `NEXUS_TIMEOUT_CLASS_${cls.replace(/-/g, '_').toUpperCase()}_MS`;
}

/**
 * Resolves the runaway-guard for an operation class.
 *
 * `resolve = clamp(envClassOverride ?? base, classMin, classMax) * multiplier`,
 * re-clamped to `MCP_TIMEOUTS.maxMs` so no class can silently exceed the MCP
 * wrapper ceiling.
 *
 * @param cls - The operation class to resolve.
 * @returns The resolved guard in milliseconds.
 */
export function resolveClassGuardMs(cls: OperationClassName): number {
  const base: number = OPERATION_CLASSES[cls].guardMs;
  const envRaw = process.env[classOverrideEnvVar(cls)];
  let chosen = base;
  if (envRaw !== undefined) {
    const parsed = Number(envRaw);
    if (!Number.isNaN(parsed) && parsed > 0) chosen = parsed;
  }
  const clampedBase = Math.min(Math.max(chosen, CLASS_OVERRIDE_MIN_MS), CLASS_OVERRIDE_MAX_MS);
  const scaled = Math.round(clampedBase * resolveTimeoutMultiplier());
  return Math.min(scaled, MCP_TIMEOUTS.maxMs);
}

/**
 * Resolves the runaway-guard for a specific tool via its {@link TOOL_CLASS}
 * classification, falling back to {@link DEFAULT_OPERATION_CLASS}. Honors the
 * multiplier + per-class env overrides through {@link resolveClassGuardMs}.
 */
export function resolveToolClassGuardMs(toolName: string): number {
  const cls: OperationClassName =
    (TOOL_CLASS as Record<string, OperationClassName>)[toolName] ?? DEFAULT_OPERATION_CLASS;
  return resolveClassGuardMs(cls);
}

/**
 * Generated per-tool timeout view (#3734). Replaces the hand-maintained
 * `perTool` literal table with a class-derived map. Built from {@link TOOL_CLASS}
 * so existing readers (`MCP_TIMEOUTS.perTool['orchestrate']`) keep working — the
 * additive step never SHORTENS a previously-overridden tool's budget (the 10
 * tools bumped in #3733/#3729 all map to classes ≥ their prior literal). Uses
 * static class guards (no env multiplier) so it stays a pure compile-time view;
 * runtime resolution that honors the multiplier goes through
 * {@link resolveToolClassGuardMs}.
 */
function generatePerToolView(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [tool, cls] of Object.entries(TOOL_CLASS)) {
    out[tool] = OPERATION_CLASSES[cls].guardMs;
  }
  return out;
}

/**
 * MCP tool handler timeouts.
 * Used by the tool middleware wrapper (CVE-2026-0621 mitigation).
 */
export const MCP_TIMEOUTS = {
  /**
   * Default timeout for MCP tool handlers. Raised 60_000 → 300_000 (#3734):
   * the 60s default was accidental + punitive. Resolves to the `single-llm`
   * class guard ({@link DEFAULT_OPERATION_CLASS}).
   */
  defaultMs: 300_000,
  /**
   * Maximum allowed MCP tool timeout. Raised 900_000 → 3_600_000 (#3734) so the
   * `pipeline` (1800s) and `async-job-body` (3600s) classes are not silently
   * clamped below their declared guard.
   */
  maxMs: 3_600_000,
  /**
   * Safety buffer between an internal wall-clock deadline (e.g. the consensus
   * overall deadline) and when the outer `wrapToolWithTimeout` middleware
   * would fire. Tools that race their own partial-result deadline MUST clamp
   * that deadline to `perTool[toolName] - perToolSafetyBufferMs` so the
   * internal timeout always fires first; otherwise the middleware kills the
   * promise chain before the tool can serialise its partial response and the
   * client sees a naked `Operation '<tool>' timed out after Nms` error.
   * (Source: Issue #2104 — MCP wrapper aborts before internal deadline)
   */
  perToolSafetyBufferMs: 10_000,
  /**
   * Per-tool timeout overrides. GENERATED from {@link TOOL_CLASS} (#3734) — no
   * longer a hand-maintained literal. Kept as a static view so existing readers
   * (`MCP_TIMEOUTS.perTool['orchestrate']`) keep working unchanged. Runtime
   * resolution that honors the env multiplier/overrides uses
   * {@link resolveToolClassGuardMs} instead.
   */
  perTool: generatePerToolView() as Readonly<Record<string, number>>,
  /**
   * Per-tool discoverability hint (#3726) appended to the timeout error
   * message. Lets a SYNC long-running tool that hits its perTool ceiling tell
   * the caller how to escape it — e.g. retry in async job-mode. Generic so
   * every async-migrated tool (#3729 children) can register one; absent →
   * no hint appended.
   */
  perToolTimeoutHint: {
    run_dev_pipeline:
      "Retry with `dispatch: 'async'` to get a jobId immediately, then poll get_job_result({ jobId }).",
  } as Readonly<Record<string, string>>,
} as const;

/**
 * Clamps a computed internal wall-clock deadline so it always fires before
 * the outer MCP tool-wrapper timeout. Returns the smaller of:
 *   - the caller's computed deadline,
 *   - `perTool[toolName] - perToolSafetyBufferMs`.
 *
 * Floored at `defaultMs / 2` so the tool remains minimally useful even if a
 * future change lowers the MCP cap far below what the tool's formula expects.
 *
 * @param computedMs - The tool's own wall-clock deadline (e.g. sum of per-vote
 *                     budgets plus stagger + response buffer).
 * @param toolName - Key into `MCP_TIMEOUTS.perTool`; falls back to `defaultMs`
 *                   for unknown tools.
 * @returns Clamped deadline in milliseconds.
 * (Source: Issue #2105 — consensus_vote overallDeadlineMs > MCP wrapper)
 */
export function getMcpSafeDeadlineMs(computedMs: number, toolName: string): number {
  const perToolCap = MCP_TIMEOUTS.perTool[toolName] ?? MCP_TIMEOUTS.defaultMs;
  const safeCap = perToolCap - MCP_TIMEOUTS.perToolSafetyBufferMs;
  const floor = Math.floor(MCP_TIMEOUTS.defaultMs / 2);
  // Never return less than the floor (keeps tools usable under tight caps).
  const capped = Math.min(computedMs, safeCap);
  return Math.max(capped, floor);
}

/**
 * Workflow execution timeouts.
 */
export const WORKFLOW_TIMEOUTS = {
  /** Per-step timeout. */
  stepMs: 300_000,
  /** Overall workflow timeout. */
  workflowMs: 300_000,
  /** Maximum workflow timeout. */
  workflowMaxMs: 1_800_000,
  /** Maximum retry delay between steps. */
  maxRetryDelayMs: 30_000,
} as const;

/**
 * Graph workflow execution timeouts.
 */
export const GRAPH_TIMEOUTS = {
  /** Default graph execution timeout. */
  defaultMs: 120_000,
  /** Maximum graph steps before abort. */
  maxSteps: 100,
} as const;

/**
 * Per-CLI task dispatch timeouts (consensus plans, triangulated review).
 * Used when dispatching tasks to multiple CLIs in parallel.
 */
export const PER_CLI_TASK_TIMEOUTS = {
  /** Default per-CLI timeout for parallel dispatch. */
  defaultMs: 300_000,
  /** Minimum per-CLI timeout. */
  minMs: 1_000,
  /** Maximum per-CLI timeout. */
  maxMs: 600_000,
  /** Parallel exploration per-CLI timeout (raised from 120s for reliability, Issue #1403). */
  explorationMs: 180_000,
} as const;

/**
 * External API request timeouts.
 */
export const API_TIMEOUTS = {
  /** Default API request timeout. */
  defaultMs: 30_000,
  /** Maximum API request timeout. */
  maxMs: 300_000,
  /** arXiv API timeout. */
  arxivMs: 30_000,
  /** Source discovery API timeout. */
  sourceMs: 30_000,
  /** V2 delegate pipeline timeout. */
  v2DelegateMs: 30_000,
  /** Provider API call timeout. */
  providerMs: 30_000,
  /** GitHub API request timeout. */
  githubApiMs: 10_000,
} as const;

/**
 * Worker dispatch timeouts (AOrchestra multi-worker execution).
 * (Source: Issue #1313 — Worker dispatch resilience)
 */
export const WORKER_TIMEOUTS = {
  /** Default per-worker execution timeout. */
  defaultMs: 60_000,
  /** Minimum allowed worker timeout (aligned with dispatcher floor, #1490). */
  minMs: 30_000,
  /** Maximum allowed worker timeout (aligned with dispatcher ceiling, #1490). */
  maxMs: 900_000,
} as const;

/**
 * Internal system timeouts (health checks, circuit breakers, etc.).
 */
export const INTERNAL_TIMEOUTS = {
  /** Health check timeout. */
  healthCheckMs: 5_000,
  /** Circuit breaker reset timeout. */
  circuitBreakerResetMs: 30_000,
  /** Self-evaluation command timeout. */
  selfEvalMs: 120_000,
  /** Wave scheduler per-task timeout. */
  waveTaskMs: 60_000,
  /** Puppeteer orchestration timeout. */
  puppeteerMs: 300_000,
  /**
   * Initial cooldown before a disabled worker role can attempt recovery
   * (Issue #1458). Used by `worker-dispatcher.ts` circuit-breaker logic.
   * (Issue #2636 — re-homed from worker-dispatcher.ts:57)
   */
  workerRecoveryCooldownMs: 30_000,
  /**
   * Maximum cooldown after exponential backoff (Issue #1458). Caps the
   * worker-dispatcher circuit-breaker backoff so a permanently-broken
   * role doesn't hold the slot indefinitely.
   * (Issue #2636 — re-homed from worker-dispatcher.ts:60)
   */
  workerMaxCooldownMs: 300_000,
  /**
   * Minimum spacing between requests to rate-limited worker roles
   * (Issue #1458).
   * (Issue #2636 — re-homed from worker-dispatcher.ts:63)
   */
  workerRateLimitSpacingMs: 2_000,
} as const;

/**
 * Expert execution timeouts by inferred task complexity.
 * Complex reasoning tasks (architecture, security, planning) need longer
 * timeouts than standard code generation or documentation tasks.
 * (Source: Issue #1028 — Dynamic expert timeout)
 * (Updated: Issue #1045 — E2E testing revealed 180s insufficient for
 *  architecture design tasks; consensus_vote proves 94s is normal for
 *  complex deliberation, so 300s gives adequate headroom)
 * (Updated: RCA — real model API calls take 30-60s/turn; even standard
 *  expert tasks need 2-3 turns minimum, so 90s caused universal timeouts)
 */
export const EXPERT_TIMEOUTS = {
  /** Complex reasoning tasks: architecture, security_review, planning. */
  complexMs: 600_000,
  /** Standard tasks: code_generation, testing, code_review, etc. */
  standardMs: 300_000,
  /** Minimum allowed expert timeout. */
  minMs: 30_000,
  /** Maximum allowed expert timeout. */
  maxMs: 900_000,
  /**
   * Stricter floor for `execute_expert` specifically — LLM inference takes
   * 20-90s minimum (#1163, #1330), so this caller-facing floor prevents
   * configuring a timeout that's guaranteed to fail. The global `minMs`
   * (30s) remains the absolute floor for non-execute paths.
   * (Issue #2636 — was hardcoded `EXPERT_TIMEOUT_FLOOR_MS = 120_000` in execute-expert.ts:68)
   */
  executeFloorMs: 120_000,
  /** Categories considered complex (longer timeout).
   * Updated: Issue #1675 — devops (avg 54s) and documentation (avg 64s on gemini)
   * regularly exceed the 120s standard CLI timeout. */
  complexCategories: [
    'architecture',
    'security_review',
    'planning',
    'research',
    'devops',
    'documentation',
  ] as readonly string[],
} as const;

/**
 * Agent heartbeat monitoring thresholds.
 * (Source: Issue #1046 — Centralize scattered timeouts)
 */
export const HEARTBEAT_TIMEOUTS = {
  /** Agent is considered slow after this duration without heartbeat. */
  slowThresholdMs: 60_000,
  /** Agent is considered stalled (no heartbeat) after this duration. */
  stalledThresholdMs: 120_000,
  /** Absolute maximum agent execution time (safety cap). */
  absoluteMaxMs: 900_000,
  /** Periodic heartbeat emission interval (Issue #1087). */
  heartbeatIntervalMs: 15_000,
} as const;

/**
 * MCP middleware timeout guard defaults.
 * (Source: Issue #1046 — Centralize scattered timeouts)
 */
export const TIMEOUT_GUARD = {
  /** Default operation timeout for the guard middleware. */
  defaultMs: 60_000,
  /** Maximum allowed timeout for any guarded operation. */
  maxMs: 900_000,
  /** Fraction of timeout at which to emit near-timeout warning. */
  nearTimeoutThreshold: 0.8,
} as const;

/**
 * Reflective memory retriever timeouts and cache settings.
 * (Source: Issue #1046 — Centralize scattered timeouts)
 */
export const REFLECTIVE_TIMEOUTS = {
  /** Timeout for reflection LLM call (aggressive — keeps retrieval fast). */
  reflectionMs: 2_000,
  /** Cache TTL in milliseconds. */
  cacheTtlMs: 300_000,
} as const;

/**
 * Workflow step executor defaults.
 * (Source: Issue #1046 — Centralize scattered timeouts)
 */
export const STEP_EXECUTOR_TIMEOUTS = {
  /** Default step timeout. */
  defaultMs: 300_000,
  /** Default retry delay between step attempts. */
  retryDelayMs: 1_000,
} as const;

/**
 * Cache TTL and rate limiter intervals.
 * (Source: Issue #1046 — Centralize scattered timeouts)
 */
export const CACHE_TIMEOUTS = {
  /** Reputation model cache TTL. */
  reputationTtlMs: 300_000,
  /** Rate limiter token refill interval. */
  rateLimitRefillMs: 1_000,
} as const;

/**
 * CLI subprocess spawn and command timeouts.
 * Used when spawning external processes (gh, docker, CLI adapters).
 * (Source: Timeout audit — centralize scattered hardcoded values)
 */
export const CLI_SUBPROCESS_TIMEOUTS = {
  /** CLI adapter spawn timeout (detect/startup). */
  spawnMs: 10_000,
  /** Docker version check timeout. */
  dockerCheckMs: 5_000,
  /** gh CLI command timeout. */
  ghCommandMs: 30_000,
  /** CLI status probe timeout. */
  statusProbeMs: 5_000,
  /** Environment setup timeout. */
  envSetupMs: 3_000,
  /** Release validation (long-running). */
  releaseValidateMs: 120_000,
  /** Release build (longest-running). */
  releaseBuildMs: 180_000,
  /** Graph workflow execution timeout. */
  graphWorkflowMs: 60_000,
  /** Self-development plan phase duration. */
  selfDevPlanMs: 300_000,
  /** Self-development refine phase duration. */
  selfDevRefineMs: 180_000,
  /** Self-development vote phase duration. */
  selfDevVoteMs: 120_000,
  /** Collaboration protocol session timeout. */
  collaborationMs: 60_000,
  /** Maximum wait time for CI checks (auto-merge). */
  ciWaitMaxMs: 300_000,
  /** CI check polling interval (auto-merge). */
  ciPollIntervalMs: 15_000,
} as const;

/**
 * Exponential backoff configuration for CLI adapter retries.
 * (Source: Issue #1220 — Centralize hardcoded values)
 */
export const BACKOFF_CONFIG = {
  /** Base delay multiplier in milliseconds. */
  baseDelayMs: 1_000,
  /** Exponent base for exponential backoff (delay = base^attempt * baseDelayMs). */
  exponentBase: 2,
} as const;

/**
 * Agent message router timeouts.
 * (Source: Issue #1220 — Centralize hardcoded values)
 */
export const AGENT_ROUTER_TIMEOUTS = {
  /** Default router timeout per message. */
  defaultMs: 30_000,
  /** Default max retries for message routing. */
  maxRetries: 3,
  /** Default delay between retries. */
  retryDelayMs: 1_000,
} as const;

/**
 * Codex MCP adapter execution defaults.
 * (Source: Issue #1220 — Centralize hardcoded values)
 */
export const CODEX_MCP_TIMEOUTS = {
  /** Default execution timeout. */
  defaultMs: 120_000,
  /** Default max retries. */
  maxRetries: 2,
} as const;

/**
 * Test framework timeouts (not for production code).
 */
export const TEST_TIMEOUTS = {
  /** Global test run timeout. */
  globalMs: 600_000,
  /** Per-task test timeout. */
  taskMs: 120_000,
} as const;

// ============================================================================
// Accessor Functions
// ============================================================================

/**
 * Gets the timeout profile for a specific CLI.
 *
 * @param cli - CLI name (claude, gemini, codex)
 * @returns TimeoutProfile for the CLI (or default for unknown CLIs)
 */
export function getCliTimeoutProfile(cli: string): TimeoutProfile {
  if (isKnownCliName(cli)) {
    return CLI_TIMEOUTS[cli];
  }
  return CLI_TIMEOUTS.default;
}

/**
 * Gets timeout for a task based on CLI and complexity.
 *
 * @param cli - CLI name
 * @param complexity - Task complexity level
 * @returns Timeout in milliseconds
 */
export function getCliTimeout(cli: string, complexity: TaskComplexity): number {
  return getCliTimeoutProfile(cli)[complexity];
}

/**
 * Gets the timeout for an expert task based on task description complexity.
 *
 * Uses `detectTaskCategory()` to infer category, then maps to timeout tier.
 * Supports `NEXUS_EXPERT_TIMEOUT_MS` env override.
 *
 * @param taskDescription - Task text to analyze for complexity
 * @returns Timeout in milliseconds
 * (Source: Issue #1028 — Dynamic expert timeout)
 */
export function getExpertTaskTimeout(taskDescription: string): number {
  const envOverride = resolveEnvTimeout(
    'NEXUS_EXPERT_TIMEOUT_MS',
    0,
    EXPERT_TIMEOUTS.minMs,
    EXPERT_TIMEOUTS.maxMs
  );
  if (envOverride > 0) return envOverride;

  const match = detectTaskCategory(taskDescription);
  const category = match?.category ?? 'exploration';
  const isComplex = EXPERT_TIMEOUTS.complexCategories.includes(category);
  return isComplex ? EXPERT_TIMEOUTS.complexMs : EXPERT_TIMEOUTS.standardMs;
}

// ============================================================================
// Environment Variable Resolution
// ============================================================================

/** Environment variable names for timeout overrides. */
export const TIMEOUT_ENV_VARS = {
  vote: 'NEXUS_VOTE_TIMEOUT_MS',
  mcp: 'NEXUS_MCP_TIMEOUT_MS',
  workflow: 'NEXUS_WORKFLOW_TIMEOUT_MS',
  graph: 'NEXUS_GRAPH_TIMEOUT_MS',
  expert: 'NEXUS_EXPERT_TIMEOUT_MS',
  worker: 'NEXUS_WORKER_TIMEOUT_MS',
} as const;

/**
 * Resolves vote timeout with environment variable override.
 * Clamps to [VOTE_TIMEOUTS.minMs, VOTE_TIMEOUTS.maxMs].
 *
 * @returns Resolved vote timeout in milliseconds
 */
export function resolveVoteTimeout(): number {
  return resolveEnvTimeout(
    TIMEOUT_ENV_VARS.vote,
    VOTE_TIMEOUTS.defaultMs,
    VOTE_TIMEOUTS.minMs,
    VOTE_TIMEOUTS.maxMs
  );
}

/**
 * Resolves worker dispatch timeout with environment variable override.
 * Clamps to [WORKER_TIMEOUTS.minMs, WORKER_TIMEOUTS.maxMs].
 *
 * @returns Resolved worker timeout in milliseconds
 * (Source: Issue #1313 — Worker dispatch resilience)
 */
export function resolveWorkerTimeout(): number {
  return resolveEnvTimeout(
    TIMEOUT_ENV_VARS.worker,
    WORKER_TIMEOUTS.defaultMs,
    WORKER_TIMEOUTS.minMs,
    WORKER_TIMEOUTS.maxMs
  );
}

/**
 * Resolves a timeout from an environment variable with min/max clamping.
 *
 * @param envVar - Environment variable name
 * @param defaultMs - Default timeout if env var is not set
 * @param minMs - Minimum allowed value (floor)
 * @param maxMs - Maximum allowed value (cap)
 * @returns Resolved timeout in milliseconds
 */
export function resolveEnvTimeout(
  envVar: string,
  defaultMs: number,
  minMs: number,
  maxMs: number
): number {
  const envVal = process.env[envVar];
  if (envVal !== undefined) {
    const parsed = Number(envVal);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return Math.min(Math.max(parsed, minMs), maxMs);
    }
  }
  return defaultMs;
}

/**
 * Validates and clamps a requested timeout to safe bounds.
 *
 * @param requestedMs - Requested timeout in milliseconds
 * @param minMs - Minimum allowed (default: VOTE_TIMEOUTS.minMs)
 * @param maxMs - Maximum allowed (default: VOTE_TIMEOUTS.maxMs)
 * @returns Object with clamped value and whether it was modified
 */
export function validateTimeout(
  requestedMs: number,
  minMs: number = VOTE_TIMEOUTS.minMs,
  maxMs: number = VOTE_TIMEOUTS.maxMs
): { value: number; clamped: boolean } {
  const clamped = Math.min(Math.max(requestedMs, minMs), maxMs);
  return { value: clamped, clamped: clamped !== requestedMs };
}
