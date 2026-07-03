/**
 * Centralized Zod schema for NEXUS_* environment variables (Issue #1016)
 *
 * Validates all known NEXUS_* env vars at startup (warn-only, never blocks).
 * Detects typos via Levenshtein distance and suggests corrections.
 *
 * Does NOT replace per-module parsing (parseIntEnv, resolveV2Config, etc.).
 * This is an additional safety net run once at startup.
 *
 * @module config/env-schema
 */

import { z } from 'zod';
import type { ILogger } from '../core/index.js';
import { levenshtein } from '../string-distance.js';

// ============================================================================
// Helper Zod types for string-encoded values
// ============================================================================

/** String that parses to a positive integer. */
const positiveIntStr = z.string().regex(/^\d+$/, 'Must be a positive integer string');

/** String "true" or "false". */
const boolStr = z.enum(['true', 'false']);

/** String that parses to a non-negative float. */
const floatStr = z.string().regex(/^\d+(\.\d+)?$/, 'Must be a non-negative number string');

// ============================================================================
// Known NEXUS_* environment variables schema
// ============================================================================

/**
 * Schema for all known NEXUS_* environment variables.
 * Each field is optional (env vars may not be set).
 * Values are validated as strings matching expected patterns.
 */
const NexusEnvSchema = z.object({
  // --- Timeouts ---
  NEXUS_TIMEOUT_CLI: positiveIntStr.optional(),
  NEXUS_TIMEOUT_CLISIMPLE: positiveIntStr.optional(),
  NEXUS_TIMEOUT_CLICOMPLEX: positiveIntStr.optional(),
  NEXUS_TIMEOUT_API: positiveIntStr.optional(),
  NEXUS_TIMEOUT_WORKFLOW: positiveIntStr.optional(),
  NEXUS_TIMEOUT_MCP: positiveIntStr.optional(),
  NEXUS_VOTE_TIMEOUT_MS: positiveIntStr.optional(),
  NEXUS_MCP_TIMEOUT_MS: positiveIntStr.optional(),
  NEXUS_WORKFLOW_TIMEOUT_MS: positiveIntStr.optional(),
  NEXUS_GRAPH_TIMEOUT_MS: positiveIntStr.optional(),
  NEXUS_TEST_TIMEOUT_MS: positiveIntStr.optional(),
  NEXUS_EXPERT_TIMEOUT_MS: positiveIntStr.optional(),
  NEXUS_WORKER_TIMEOUT_MS: positiveIntStr.optional(),

  // --- Central timeout authority (#3734) ---
  // Global scale applied to every operation-class runaway-guard (clamped 0.25–10).
  NEXUS_TIMEOUT_MULTIPLIER: floatStr.optional(),
  // Per-operation-class guard overrides (ms). One per OperationClassName; env-schema
  // can't match dynamic names, so the six are registered explicitly.
  NEXUS_TIMEOUT_CLASS_INTERACTIVE_MS: positiveIntStr.optional(),
  NEXUS_TIMEOUT_CLASS_SINGLE_LLM_MS: positiveIntStr.optional(),
  NEXUS_TIMEOUT_CLASS_MULTI_LLM_PANEL_MS: positiveIntStr.optional(),
  NEXUS_TIMEOUT_CLASS_PIPELINE_MS: positiveIntStr.optional(),
  NEXUS_TIMEOUT_CLASS_NETWORK_FETCH_MS: positiveIntStr.optional(),
  NEXUS_TIMEOUT_CLASS_ASYNC_JOB_BODY_MS: positiveIntStr.optional(),

  // --- Retry ---
  NEXUS_RETRY_MAX_RETRIES: positiveIntStr.optional(),
  NEXUS_RETRY_BASE_DELAY: positiveIntStr.optional(),
  NEXUS_RETRY_MAX_DELAY: positiveIntStr.optional(),
  NEXUS_RETRY_JITTER: floatStr.optional(),

  // --- Rate Limit ---
  NEXUS_RATE_LIMIT_ENABLED: boolStr.optional(),
  NEXUS_RATE_LIMIT_RPM: positiveIntStr.optional(),
  NEXUS_RATE_LIMIT_MAX_CONCURRENT: positiveIntStr.optional(),
  NEXUS_RATE_LIMIT_CAPACITY: positiveIntStr.optional(),
  NEXUS_RATE_LIMIT_REFILL_RATE: positiveIntStr.optional(),
  NEXUS_RATE_LIMIT_REFILL_INTERVAL: positiveIntStr.optional(),

  // --- Workers & Concurrency ---
  NEXUS_MAX_CONCURRENT_EXPERTS: positiveIntStr.optional(),
  // NEXUS_WORKERS_* + NEXUS_WORKFLOW_MAX_PARALLEL + NEXUS_TEST_PARALLELISM +
  // NEXUS_EVALUATION_MAX_WORKERS + NEXUS_SWARM_OBSERVER_MAX_EVENTS removed in
  // #2977 — these had zero production consumers (silent no-ops).

  // --- Circuit Breaker ---
  NEXUS_CIRCUIT_BREAKER_THRESHOLD: positiveIntStr.optional(),
  NEXUS_CIRCUIT_BREAKER_RESET_TIMEOUT: positiveIntStr.optional(),

  // --- V2 Pipeline ---
  NEXUS_V2_MODE: z.enum(['off', 'partial', 'full']).optional(),
  NEXUS_V2_DELEGATE: boolStr.optional(),
  NEXUS_V2_ORCHESTRATE: boolStr.optional(),
  NEXUS_V2_POLICY_MODE: z.enum(['off', 'warn', 'block']).optional(),
  NEXUS_AORCHESTRA: boolStr.optional(),
  NEXUS_AORCHESTRA_DISPATCH: boolStr.optional(),
  NEXUS_WORKER_MAX_CALLS: positiveIntStr.optional(),

  // --- Server ---
  NEXUS_AUTH_ENABLED: boolStr.optional(),
  NEXUS_AUTH_METHOD: z.string().optional(),

  // --- Logging ---
  NEXUS_LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
    .optional(),

  // --- Features ---
  NEXUS_PERSIST_LEARNING: boolStr.optional(),
  NEXUS_REFLECTIVE_MEMORY: z.enum(['true', 'false', 'shadow']).optional(),
  NEXUS_EVENTBUS_ENABLED: boolStr.optional(),
  // NEXUS_EVENTBUS_MAX_HISTORY removed in #2977 — silent no-op (no production reader).
  NEXUS_BILLING_MODE: z.enum(['plan', 'api']).optional(),
  NEXUS_CONFIG_PATH: z.string().optional(),
  NEXUS_ALLOW_MOCK_ORCHESTRATION: boolStr.optional(),
  // Explicit opt-in for simulateVotes outside test runners (#4170) — read by
  // checkSimulationAllowed (mcp/tools/simulation-guard.ts). Unset = fail closed.
  NEXUS_ALLOW_SIMULATE: z.enum(['0', '1']).optional(),

  // --- Autonomous remediation & policy (#3540 / #3653) ---
  // Drives the auto-remediation cycle (resolveAutoRemediateMode); default audit
  // (zero-write soak, #3769) when unset, explicit `off` disables.
  NEXUS_AUTO_REMEDIATE: z.enum(['off', 'audit', 'enforce']).optional(),
  // Stage-boundary policy gate enforcement mode (getGateEnforcementMode); warn by default.
  NEXUS_POLICY_GATE_MODE: z.enum(['off', 'warn', 'block']).optional(),
  // Path to a model-registry overlay manifest (buildDefaultRegistry / #3185 hot-reload).
  NEXUS_MODELS_OVERLAY_PATH: z.string().optional(),
  // Render the unified cross-ranked memory prefix instead of per-backend sections (#3236); off by default.
  NEXUS_CONTEXT_RANKED: z.enum(['0', '1']).optional(),
  // Feed live dispatch outcomes into the MetaOrchestrator shadow selector + persist them (#3593); off by default.
  NEXUS_META_SHADOW_TRAIN: z.enum(['0', '1']).optional(),
  // Async job-result reader source (#3090/#3693): `task_state` prefers/unions the
  // Stage-2 task-state log; default (unset) is sidecar-only. Reader half of the
  // sidecar→Stage-2 migration (epic #2631).
  NEXUS_JOB_RESULT_SOURCE: z.enum(['sidecar', 'task_state']).optional(),

  // --- Hooks & Sessions ---
  NEXUS_HOOK_VERBOSE: boolStr.optional(),
  NEXUS_SESSIONS_DB: z.string().optional(),
  NEXUS_DISABLE_SESSIONS: boolStr.optional(),
  NEXUS_DISABLE_METRICS: boolStr.optional(),
});

// ============================================================================
// Known variable names (derived from schema)
// ============================================================================

const KNOWN_NAMES: readonly string[] = Object.keys(NexusEnvSchema.shape);

// ============================================================================
// Levenshtein distance
// ============================================================================

/** Returns the closest known var name if edit distance <= 3, or null. */
function suggestSimilar(name: string, known: readonly string[]): string | null {
  let best: string | null = null;
  let bestDist = 4; // threshold: must be strictly less than 4

  for (const candidate of known) {
    const dist = levenshtein(name, candidate);
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }

  return best;
}

// ============================================================================
// Validation result types
// ============================================================================

/** An unknown NEXUS_* env var with optional typo suggestion. */
export interface UnknownVar {
  readonly name: string;
  readonly suggestion: string | null;
}

/** An invalid NEXUS_* env var with error message. */
export interface InvalidVar {
  readonly name: string;
  readonly value: string;
  readonly error: string;
}

/** Result of validating NEXUS_* environment variables. */
export interface EnvValidationResult {
  readonly unknownVars: readonly UnknownVar[];
  readonly invalidVars: readonly InvalidVar[];
}

// ============================================================================
// Internal helpers
// ============================================================================

/** Classifies NEXUS_* keys into known (with values) and unknown. */
function classifyEnvKeys(
  nexusKeys: readonly string[],
  env: NodeJS.ProcessEnv
): { knownRecord: Record<string, string>; unknownVars: UnknownVar[] } {
  const knownRecord: Record<string, string> = {};
  const unknownVars: UnknownVar[] = [];

  for (const key of nexusKeys) {
    if (KNOWN_NAMES.includes(key)) {
      const value = env[key];
      if (value !== undefined) {
        knownRecord[key] = value;
      }
    } else {
      unknownVars.push({
        name: key,
        suggestion: suggestSimilar(key, KNOWN_NAMES),
      });
    }
  }

  return { knownRecord, unknownVars };
}

/** Logs validation warnings via the provided logger. */
function logValidationWarnings(
  logger: ILogger,
  unknownVars: readonly UnknownVar[],
  invalidVars: readonly InvalidVar[]
): void {
  for (const u of unknownVars) {
    const hint = u.suggestion !== null ? ` (did you mean ${u.suggestion}?)` : '';
    logger.warn(`Unknown environment variable: ${u.name}${hint}`);
  }
  for (const inv of invalidVars) {
    logger.warn(`Invalid environment variable ${inv.name}="${inv.value}": ${inv.error}`);
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Validates all NEXUS_* environment variables.
 *
 * - Detects unknown vars (potential typos) with Levenshtein suggestions
 * - Detects invalid values for known vars
 * - Warn-only: never throws, never blocks startup
 *
 * @param logger - Optional logger for direct warning output
 * @returns Validation result with unknown and invalid var lists
 */
export function validateNexusEnv(logger?: ILogger): EnvValidationResult {
  const nexusKeys = Object.keys(process.env).filter((k) => k.startsWith('NEXUS_'));
  const { knownRecord, unknownVars } = classifyEnvKeys(nexusKeys, process.env);

  // Validate known vars against the schema
  const invalidVars: InvalidVar[] = [];
  const result = NexusEnvSchema.safeParse(knownRecord);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const varName = String(issue.path[0]);
      invalidVars.push({
        name: varName,
        value: knownRecord[varName] ?? '',
        error: issue.message,
      });
    }
  }

  if (logger !== undefined) {
    logValidationWarnings(logger, unknownVars, invalidVars);
  }

  return { unknownVars, invalidVars };
}

/**
 * Returns all known NEXUS_* variable names from the schema.
 */
export function getKnownNexusVarNames(): readonly string[] {
  return KNOWN_NAMES;
}
