/**
 * Access Constraint Deriver — Top-level policy derivation (#1977).
 *
 * Orchestrates the full derivation pipeline:
 * 1. Cache lookup (condition 5) — return cached policy if present
 * 2. Mode check — off mode returns bypass, no derivation
 * 3. Trust-tier gate (condition 4) — Tier 3/4 input goes straight to fallback
 * 4. LLM derivation (condition 1) — if available + trust-tier allows
 * 5. Regex fallback — on LLM failure, empty objective, or trust-gate rejection
 * 6. Cache write — store policy for future same-objective calls
 *
 * Enforcer denylist (condition 3, in enforcer.ts) still wins regardless
 * of what any derived policy says.
 *
 * @module security/access-constraint-deriver/deriver
 */

import { createHash } from 'node:crypto';
import type { IModelAdapter } from '../../core/types/model.js';
import type { TrustTier } from '../trust-types.js';
import { getPolicyCache } from './cache.js';
import { resolveAccessPolicyMode } from './config.js';
import { deriveFallbackPolicy } from './fallback-regex.js';
import { deriveViaLlm, DEFAULT_LLM_TIMEOUT_MS } from './llm-deriver.js';
import { gateTrust } from './trust-gate.js';
import type { TaskAccessPolicy, AccessPolicyMode } from './types.js';

/** Optional inputs to `deriveAccessPolicy` beyond the raw user objective. */
export interface DerivationOptions {
  /** Trust tier of the objective source. Missing → safe-default to fallback-only. */
  readonly trustTier?: TrustTier;
  /** LLM adapter for the derivation. If missing, regex fallback is used. */
  readonly adapter?: IModelAdapter;
  /** Override LLM timeout in milliseconds. */
  readonly timeoutMs?: number;
  /** Override operating mode (else read from env). */
  readonly mode?: AccessPolicyMode;
}

/** Diagnostic fields appended to the policy by the telemetry-aware path. */
export interface DerivationTelemetry {
  readonly latencyMs: number;
  readonly source: TaskAccessPolicy['source'];
  readonly trustDecision: 'llm' | 'fallback-only' | 'cache-hit';
  readonly fallbackReason?: string;
}

/**
 * Derive an access policy for the user objective.
 *
 * Backwards-compatible with the prior skeleton signature — callers that
 * pass only a string get a bypass policy in `off` mode and a fallback-
 * derived policy in `audit`/`enforce` mode.
 *
 * Full callers provide `adapter` + `trustTier` to get LLM-backed derivation.
 */
export async function deriveAccessPolicy(
  userObjective: string,
  opts: DerivationOptions = {}
): Promise<TaskAccessPolicy> {
  const result = await deriveWithTelemetry(userObjective, opts);
  return result.policy;
}

/**
 * Full-detail derivation that also returns timing/source telemetry.
 *
 * Useful for the post-wiring <500ms p95 validation (condition 6) and
 * for audit-mode telemetry emission.
 */
export async function deriveWithTelemetry(
  userObjective: string,
  opts: DerivationOptions = {}
): Promise<{ readonly policy: TaskAccessPolicy; readonly telemetry: DerivationTelemetry }> {
  const started = Date.now();
  const mode = opts.mode ?? resolveAccessPolicyMode();
  const hash = hashObjective(userObjective);
  const cache = getPolicyCache();

  const cached = cache.get(hash);
  if (cached !== undefined) {
    return {
      policy: cached,
      telemetry: {
        latencyMs: Date.now() - started,
        source: cached.source,
        trustDecision: 'cache-hit',
      },
    };
  }
  if (mode === 'off') return cacheAndReturnBypass(cache, mode, hash, started);

  const gate = gateTrust(opts.trustTier);
  const ctx: PathCtx = { userObjective, mode, hash, started, cache };
  if (gate.allow === 'llm' && opts.adapter !== undefined) {
    return runLlmPath(ctx, opts);
  }
  return runFallbackPath(ctx, gate);
}

interface PathCtx {
  readonly userObjective: string;
  readonly mode: AccessPolicyMode;
  readonly hash: string;
  readonly started: number;
  readonly cache: ReturnType<typeof getPolicyCache>;
}

/** Off-mode: store and return a bypass policy. */
function cacheAndReturnBypass(
  cache: ReturnType<typeof getPolicyCache>,
  mode: AccessPolicyMode,
  hash: string,
  started: number
): { readonly policy: TaskAccessPolicy; readonly telemetry: DerivationTelemetry } {
  const policy = buildBypassPolicy(mode, hash);
  cache.set(hash, policy);
  return {
    policy,
    telemetry: {
      latencyMs: Date.now() - started,
      source: 'bypass',
      trustDecision: 'fallback-only',
    },
  };
}

/** LLM path: call LLM, use policy on success, fall through to regex on failure. */
async function runLlmPath(
  ctx: PathCtx,
  opts: DerivationOptions
): Promise<{ readonly policy: TaskAccessPolicy; readonly telemetry: DerivationTelemetry }> {
  const adapter = opts.adapter as NonNullable<DerivationOptions['adapter']>;
  const llmResult = await deriveViaLlm(
    adapter,
    ctx.userObjective,
    ctx.mode,
    ctx.hash,
    opts.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS
  );
  if (llmResult.ok) {
    ctx.cache.set(ctx.hash, llmResult.policy);
    return {
      policy: llmResult.policy,
      telemetry: { latencyMs: Date.now() - ctx.started, source: 'llm', trustDecision: 'llm' },
    };
  }
  const policy = deriveFallbackPolicy(ctx.userObjective, ctx.mode, ctx.hash);
  ctx.cache.set(ctx.hash, policy);
  return {
    policy,
    telemetry: {
      latencyMs: Date.now() - ctx.started,
      source: 'fallback-keyword',
      trustDecision: 'llm',
      fallbackReason: llmResult.reason,
    },
  };
}

/** Fallback path: trust gate refused, or no adapter supplied. */
function runFallbackPath(
  ctx: PathCtx,
  gate: ReturnType<typeof gateTrust>
): { readonly policy: TaskAccessPolicy; readonly telemetry: DerivationTelemetry } {
  const policy = deriveFallbackPolicy(ctx.userObjective, ctx.mode, ctx.hash);
  ctx.cache.set(ctx.hash, policy);
  return {
    policy,
    telemetry: {
      latencyMs: Date.now() - ctx.started,
      source: 'fallback-keyword',
      trustDecision: 'fallback-only',
      ...(gate.allow === 'fallback-only' ? { fallbackReason: gate.reason } : {}),
    },
  };
}

/** Builds an unrestricted (bypass) policy — used only in `off` mode. */
function buildBypassPolicy(mode: AccessPolicyMode, hash: string): TaskAccessPolicy {
  return {
    allowedTools: '*',
    allowedPathPatterns: [],
    allowedOperations: '*',
    objectiveHash: hash,
    derivedAt: new Date().toISOString(),
    source: 'bypass',
    mode,
  };
}

/** Stable SHA-256 hash of a user objective for audit + policy caching. */
export function hashObjective(userObjective: string): string {
  return createHash('sha256').update(userObjective, 'utf8').digest('hex').slice(0, 16);
}
