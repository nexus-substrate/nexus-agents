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
import { VOTER_ROLES } from '../cli/vote-types.js';

// ============================================================================
// Helper Zod types for string-encoded values
// ============================================================================

/** String that parses to a positive integer. */
const positiveIntStr = z.string().regex(/^\d+$/, 'Must be a positive integer string');

/** String "true" or "false". */
const boolStr = z.enum(['true', 'false']);

/** String that parses to a non-negative float. */
const floatStr = z.string().regex(/^\d+(\.\d+)?$/, 'Must be a non-negative number string');

/**
 * The exact accept-set of `parseBoolEnv` (config/defaults-env.ts): `true`, `1`,
 * `false`, `0`, case-insensitively. Deliberately narrower than a general
 * boolean: `yes`/`no`/`on`/`off` are silently discarded by that helper, so
 * accepting them here would report a working setting for one that does nothing.
 */
const boolLooseStr = z
  .string()
  .refine((v) => ['true', '1', 'false', '0'].includes(v.toLowerCase()), {
    message: 'Must be one of: true, false, 1, 0',
  });

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
  // NEXUS_TIMEOUT_CLISIMPLE + NEXUS_TIMEOUT_CLICOMPLEX removed in #4180 — silent
  // no-ops (#2977 class). Their only possible reader, getTimeout('cliSimpleMs' /
  // 'cliComplexMs'), had zero production call sites; per-complexity CLI timeouts
  // flow through getTimeoutForCli/TIMEOUT_PROFILES instead.
  NEXUS_TIMEOUT_API: positiveIntStr.optional(),
  NEXUS_TIMEOUT_WORKFLOW: positiveIntStr.optional(),
  NEXUS_TIMEOUT_MCP: positiveIntStr.optional(),
  NEXUS_VOTE_TIMEOUT_MS: positiveIntStr.optional(),
  NEXUS_MCP_TIMEOUT_MS: positiveIntStr.optional(),
  NEXUS_WORKFLOW_TIMEOUT_MS: positiveIntStr.optional(),
  NEXUS_GRAPH_TIMEOUT_MS: positiveIntStr.optional(),
  // NEXUS_TEST_TIMEOUT_MS removed in #4180 — silent no-op (#2977 class). No
  // production reader ever constructed this name; TEST_TIMEOUTS takes no env
  // override. Re-register only alongside a real consumer.
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
  // Explicit runtime data root; overrides the per-repo/cross-repo split. In
  // CLAUDE.md's most-used table since it shipped, and absent from this schema
  // until #4722 — so setting the documented variable made `validateNexusEnv`
  // report it as an UNKNOWN NEXUS_* var, typo suggestion and all.
  NEXUS_DATA_DIR: z.string().optional(),
  // `0` opts out of the per-repo data dir (epic #2872; default ON).
  NEXUS_REPO_PREFERRED: z.enum(['0', '1']).optional(),
  // Scratch root for short-lived working files (#4412, getNexusTmpDir). Unset
  // resolves to `<dataDir>/tmp`; set it to relocate scratch off the repo.
  NEXUS_TMPDIR: z.string().optional(),
  // ClawGuard access-policy mode.
  NEXUS_ACCESS_POLICY_MODE: z.enum(['off', 'audit', 'confirm_risky', 'enforce']).optional(),
  // Sandbox mode (epic #2500).
  NEXUS_SANDBOX: boolStr.optional(),
  NEXUS_SANDBOX_ROOT: z.string().optional(),
  NEXUS_ALLOW_MOCK_ORCHESTRATION: boolStr.optional(),
  // Explicit opt-in for simulateVotes outside test runners (#4170) — read by
  // checkSimulationAllowed (mcp/tools/simulation-guard.ts). Unset = fail closed.
  NEXUS_ALLOW_SIMULATE: z.enum(['0', '1']).optional(),

  // --- Autonomous remediation & policy (#3540 / #3653) ---
  // Drives the auto-remediation cycle (resolveAutoRemediateMode); default audit
  // (zero-write soak, #3769) when unset, explicit `off` disables.
  NEXUS_AUTO_REMEDIATE: z.enum(['off', 'audit', 'enforce']).optional(),
  // Stage-boundary policy gate enforcement mode (getGateEnforcementMode); warn by
  // default. Read by dev-pipeline's consensus→execute gate, and by any compiled
  // gate node whose caller supplies a `policyEnforcement` bundle without a mode
  // (no in-tree caller supplies a bundle today). The V2 delegate graph declares
  // no gate (#4657); v2-orchestrate's execute check reads NEXUS_V2_POLICY_MODE.
  NEXUS_POLICY_GATE_MODE: z.enum(['off', 'warn', 'block']).optional(),
  // Path to a model-registry overlay manifest (buildDefaultRegistry / #3185 hot-reload).
  NEXUS_MODELS_OVERLAY_PATH: z.string().optional(),
  // Render the unified cross-ranked memory prefix instead of per-backend sections (#3236); off by default.
  NEXUS_CONTEXT_RANKED: z.enum(['0', '1']).optional(),
  // Attach a ranked, budgeted repo-map (module import graph, PageRank-centrality)
  // to context for structural tasks (#4254, getRepoMapForTask); pull-shaped +
  // rank-gated, off by default.
  NEXUS_REPO_MAP: z.enum(['0', '1']).optional(),
  // Allow LLM-based pipeline classification when keyword scoring finds no
  // evidence (#4677). Off by default: fixing the confidence floor made the
  // enrichment gate reachable for the first time, and measurement put that at
  // ~60% of realistic goals — one LLM call each. Opt in deliberately.
  NEXUS_LLM_CLASSIFICATION: z.enum(['0', '1']).optional(),
  // Feed live dispatch outcomes into the MetaOrchestrator shadow selector + persist them (#3593); off by default.
  NEXUS_META_SHADOW_TRAIN: z.enum(['0', '1']).optional(),
  // Resolve a concrete model from the difficulty tier at route time (#3394,
  // isRouteModelSelectionEnabled); off by default. Registered here in #4197 —
  // the reader predates this schema entry.
  NEXUS_ROUTE_MODEL_SELECTION: boolStr.optional(),
  // Record would-be tier model selections (shadow) + join them with outcomes for
  // the offline flip eval (#4197, isRouteModelShadowEnabled); off by default.
  NEXUS_ROUTE_MODEL_SHADOW: z.enum(['0', '1']).optional(),
  // Async job-result reader source (#3090/#3693): `task_state` prefers/unions the
  // Stage-2 task-state log; default (unset) is sidecar-only. Reader half of the
  // sidecar→Stage-2 migration (epic #2631).
  NEXUS_JOB_RESULT_SOURCE: z.enum(['sidecar', 'task_state']).optional(),

  // --- Hooks & Sessions ---
  NEXUS_HOOK_VERBOSE: boolStr.optional(),
  NEXUS_SESSIONS_DB: z.string().optional(),
  NEXUS_DISABLE_SESSIONS: boolStr.optional(),
  NEXUS_DISABLE_METRICS: boolStr.optional(),

  // --- Read by production code but previously unregistered (#5142) ---
  // Each type below was verified against the consuming call site, not inferred
  // from the name. Registering with a wrong type would replace "unknown
  // variable" with "invalid value" on a value that actually works — trading one
  // misreport for a worse one. Variables whose accepted set needed a judgement
  // call are tracked in docs/ops/env-schema-coverage-baseline.json instead.

  // Paths, URLs, tokens and term lists: any non-empty string is legal, so
  // z.string() is the accurate type rather than a permissive stand-in.
  NEXUS_CODEPR_TOKEN: z.string().optional(),
  NEXUS_CUSTOM_API_BASE_URL: z.string().optional(),
  NEXUS_CUSTOM_API_KEY: z.string().optional(),
  NEXUS_CUSTOM_MODEL: z.string().optional(),
  NEXUS_MODEL_REGISTRY_OVERLAY: z.string().optional(),
  NEXUS_OPENAI_COMPAT_KEY: z.string().optional(),
  NEXUS_OPENAI_COMPAT_URL: z.string().optional(),
  NEXUS_OPENCODE_CONFIG: z.string().optional(),
  NEXUS_PR_REVIEW_RECORDS_PATH: z.string().optional(),
  NEXUS_SENSITIVE_REFS: z.string().optional(),
  NEXUS_SUBPROCESS_EXTRA_ENV: z.string().optional(),
  NEXUS_VOTE_RECORDS_PATH: z.string().optional(),

  // parseIntEnv / parseInt consumers: a non-integer is discarded in favour of
  // the default, so reporting it as invalid tells the user their setting was
  // ignored rather than letting it fail silently.
  NEXUS_CI_HEALTH_MAX_BYTES: positiveIntStr.optional(),
  NEXUS_IMPROVEMENT_REVIEW_INTERVAL_MS: positiveIntStr.optional(),
  NEXUS_MCP_DEPTH: positiveIntStr.optional(),
  NEXUS_SUBPROCESS_DEPTH: positiveIntStr.optional(),
  // `0` is meaningful here — it disables async job dispatch entirely — so this
  // is non-negative, not positive (job-concurrency.ts:106 accepts `>= 0`).
  NEXUS_JOB_MAX_CONCURRENT_TOTAL: z
    .string()
    .regex(/^\d+$/, 'Must be a non-negative integer string')
    .optional(),

  // parseBoolEnv consumers (config/defaults-env.ts:50). The helper accepts
  // exactly true|1|false|0, case-insensitively — NOT yes/no/on/off, which fall
  // through to the default. Accepting a wider set here would tell the user
  // `yes` works when the code silently ignores it.
  NEXUS_IMPROVEMENT_REVIEW_FILE_ISSUES: boolLooseStr.optional(),
  NEXUS_NO_SCAFFOLD: boolLooseStr.optional(),
  NEXUS_TUNE_ENFORCE: boolLooseStr.optional(),
  NEXUS_VERSION_CHECK: boolLooseStr.optional(),

  // Lowercased before parsing, so mixed case is genuinely accepted.
  NEXUS_REPUTATION_GATING: z
    .string()
    .refine((v) => ['off', 'audit', 'enforce'].includes(v.toLowerCase()), {
      message: 'Must be one of: off, audit, enforce',
    })
    .optional(),

  // #5382: rollout gate for HostileInputFirewall behaviour changes. Defaults to
  // `off` — unlike NEXUS_REPUTATION_GATING, which defaults to `enforce` — because
  // the firewall is a PUBLISHED API with external callers, so a stricter default
  // would be a silent breaking change. Same tri-state and same coercion as its
  // two sibling flags; see security/firewall/firewall-policy-mode.ts.
  NEXUS_FIREWALL_POLICY: z
    .string()
    .refine((v) => ['off', 'audit', 'enforce'].includes(v.toLowerCase()), {
      message: 'Must be one of: off, audit, enforce',
    })
    .optional(),
});

// ============================================================================
// Known variable names (derived from schema)
// ============================================================================

const KNOWN_NAMES: readonly string[] = Object.keys(NexusEnvSchema.shape);

// ============================================================================
// Dynamic variable families (#5142)
// ============================================================================

/**
 * Variables whose NAME is built at runtime by string concatenation, so they can
 * never appear as fixed schema keys.
 *
 * Verified live before this existed: `NEXUS_VOTER_MODEL_ARCHITECT=claude-opus`
 * — a documented, working per-role routing override — was reported as an
 * unknown variable, i.e. the typo detector accused the user of a typo they did
 * not make.
 *
 * The voter-model suffixes are derived from `VOTER_ROLES`, the canonical role
 * list, rather than re-listed here: a second hand-maintained copy would
 * reintroduce exactly the schema-vs-code drift this is fixing, one level up.
 */
const DYNAMIC_FAMILIES: readonly {
  readonly prefix: string;
  readonly suffixes: readonly string[] | 'any-identifier';
}[] = [
  {
    // cli/voter-model-overrides.ts:24 — `NEXUS_VOTER_MODEL_${role.toUpperCase()}`
    prefix: 'NEXUS_VOTER_MODEL_',
    suffixes: Object.keys(VOTER_ROLES).map((r) => r.toUpperCase()),
  },
  {
    // mcp/jobs/job-concurrency.ts:85 — `NEXUS_JOB_MAX_CONCURRENT_${tool.toUpperCase()}`
    // The suffix is an arbitrary MCP tool name. Importing the tool registry here
    // would couple config to MCP and risk an import cycle, so the suffix is
    // matched structurally. The cost is honest and bounded: a misspelt TOOL name
    // in this one family is not flagged. The alternative — leaving the whole
    // family unregistered — misreports every CORRECT use, which is worse.
    prefix: 'NEXUS_JOB_MAX_CONCURRENT_',
    suffixes: 'any-identifier',
  },
];

/** True when `name` is a valid member of a runtime-constructed family. */
function isDynamicFamilyMember(name: string): boolean {
  return DYNAMIC_FAMILIES.some((family) => {
    if (!name.startsWith(family.prefix)) return false;
    const suffix = name.slice(family.prefix.length);
    if (suffix === '') return false;
    if (family.suffixes === 'any-identifier') return /^[A-Z][A-Z0-9_]*$/.test(suffix);
    return family.suffixes.includes(suffix);
  });
}

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
    if (isDynamicFamilyMember(key)) {
      // Name is valid but has no fixed schema entry, so there is nothing to
      // value-check against; recording it as known is what stops the false
      // unknown-variable report.
      continue;
    }
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
