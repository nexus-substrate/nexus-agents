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
  gemini: { simple: 30_000, standard: 120_000, complex: 600_000 },
  codex: { simple: 10_000, standard: 60_000, complex: 300_000 },
  opencode: { simple: 30_000, standard: 120_000, complex: 600_000 },
  default: { simple: 30_000, standard: 120_000, complex: 600_000 },
} as const satisfies Record<KnownCliName, TimeoutProfile>;

/**
 * Consensus voting timeouts.
 * Increased from 90s to 120s per Issue #983 for slower CLIs.
 */
export const VOTE_TIMEOUTS = {
  /** Default per-agent vote timeout. */
  defaultMs: 180_000,
  /** Minimum allowed vote timeout (floor for env override). */
  minMs: 30_000,
  /** Maximum allowed vote timeout (cap for env override). */
  maxMs: 600_000,
  /** Default max retries per agent. */
  maxRetries: 2,
} as const;

/**
 * MCP tool handler timeouts.
 * Used by the tool middleware wrapper (CVE-2026-0621 mitigation).
 */
export const MCP_TIMEOUTS = {
  /** Default timeout for MCP tool handlers. */
  defaultMs: 60_000,
  /** Maximum allowed MCP tool timeout. */
  maxMs: 900_000,
  /** Per-tool timeout overrides for long-running tools. */
  perTool: {
    orchestrate: 900_000, // 15 min — multi-step agent orchestration
    consensus_vote: 600_000, // 10 min — 5-6 agents voting in parallel via Promise.all
    execute_expert: 900_000, // 15 min — complex expert reasoning tasks
    run_workflow: 900_000, // 15 min — multi-step workflow execution
  } as Readonly<Record<string, number>>,
} as const;

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
  /** Parallel exploration per-CLI timeout (shorter for quick scans). */
  explorationMs: 120_000,
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
  /** Categories considered complex (longer timeout). */
  complexCategories: [
    'architecture',
    'security_review',
    'planning',
    'research',
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
