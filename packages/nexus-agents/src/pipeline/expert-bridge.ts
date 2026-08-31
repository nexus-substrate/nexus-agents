/**
 * Expert Bridge — Programmatic access to the execute_expert pipeline (#1693)
 *
 * Provides a clean wrapper for calling experts with the full pipeline:
 * timeout, fallback cascade, degradation detection, heartbeat, outcome recording.
 *
 * DRY: reuses createBuiltInExpert + CompositeRouter instead of reimplementing.
 *
 * @module pipeline/expert-bridge
 */

import { createLogger, getTimeProvider } from '../core/index.js';
import type { BuiltInExpertType } from '../agents/experts/expert-config.js';
import { isRateLimitText } from '../adapters/rate-limit-detector.js';
import { resolveCliSlot } from '../config/model-availability.js';
import type { CliNameLiteral } from '../config/model-capabilities-types.js';

/**
 * Resolves a CLI slot from the model string a (CLI or API) adapter returned.
 * Known models resolve to their exact slot; **unknown** models — new releases
 * or API/openrouter models not in the curated registry — fall back to the
 * vendor-derived slot (#3317 / #3293) so the outcome is recorded against a real
 * slot instead of being dropped with an undefined cli (the api-mode gap).
 * Returns undefined only when no model is present (the bridge failed before
 * dispatch — no execution to attribute).
 */
function resolveCliFromModelString(model: string | undefined): CliNameLiteral | undefined {
  return resolveCliSlot(model);
}

const logger = createLogger({ component: 'expert-bridge' });

/** Base delay for rate limit retry backoff (ms). Scales linearly: 3s, 6s, 9s. */
const RATE_LIMIT_BASE_DELAY_MS = 3000;

/** Result of an expert execution. */
export interface ExpertBridgeResult {
  readonly success: boolean;
  readonly text: string;
  readonly expertType: BuiltInExpertType;
  readonly durationMs: number;
  readonly error?: string;
  /**
   * CLI that actually executed the task, resolved from the underlying
   * `CliResponse.model` via `getCliForModelId`. Undefined when the bridge
   * failed before dispatch (no adapters / circuit-open / rate-limit cap).
   * Callers writing to OutcomeStore should use this rather than hardcoding
   * a cli — see #2823 (#1154 regression).
   */
  readonly cli?: CliNameLiteral;
  /**
   * Total tokens (input + output) the underlying CLI/adapter reported for this
   * call, when available (#3396). Best-effort: `CliResponse.usage` is optional
   * — CLI-subprocess paths whose `extractUsage` returns null leave this
   * undefined. Consumers (budget enforcement #3395, model.called attribution
   * #3387, routing-experience metrics) must tolerate `undefined`.
   */
  readonly tokensUsed?: number;
  /**
   * Concrete model id the underlying adapter reported (`CliResponse.model`),
   * when present (#3387). Distinct from {@link cli} (the slot): one CLI can run
   * several models. Undefined when the adapter didn't report a model or the
   * bridge failed before dispatch. Required to emit a `model.called` event.
   */
  readonly model?: string;
  /**
   * Input/output token split from the adapter's `CliResponse.usage` (#3387),
   * when reported. Best-effort like {@link tokensUsed}; both undefined together
   * when no usage was available. `tokensIn + tokensOut` reconciles with
   * `tokensUsed` (single source of truth — both derive from the same record).
   */
  readonly tokensIn?: number;
  readonly tokensOut?: number;
}

/** Minimal router interface for the bridge. */
interface RouterLike {
  executeTask(task: { content: string; options?: Record<string, unknown> | undefined }): Promise<{
    ok: boolean;
    value: {
      text: string;
      cli?: CliNameLiteral;
      tokensUsed?: number;
      model?: string;
      tokensIn?: number;
      tokensOut?: number;
    };
    error: { message: string };
  }>;
}

// Cached router — lazily initialized, reused across calls within a session
let cachedRouter: RouterLike | null = null;

// Cached MCP config — generated once, reused across expert calls (#1708)
let cachedMcpConfigPath: string | null = null;
// Cached cleanup for the cached config's tempdir (closes #2946). Previously
// the cleanup returned by `generateMcpConfig` was thrown away, so
// `/tmp/nexus-mcp-XXXXXX/` accumulated one entry per MCP server lifetime.
// Stored here + invoked by `shutdownExpertBridge()` from the server's
// graceful-shutdown path.
let cachedMcpConfigCleanup: (() => Promise<void>) | null = null;
// Coalesces concurrent init under voter fan-out (closes #2969). consensus_vote
// fans out N=7 callers on cold start; without this each one ran the full init
// including a mkdtemp() that the loser N-1 instances never cleaned up.
let mcpConfigInitPromise: Promise<string | null> | null = null;

/** Get or create cached MCP config path for expert CLI sessions (#1708). */
async function getMcpConfigPath(): Promise<string | null> {
  if (cachedMcpConfigPath !== null) return cachedMcpConfigPath;
  mcpConfigInitPromise ??= (async (): Promise<string | null> => {
    try {
      const { generateMcpConfig } = await import('../cli-adapters/child-mcp-config.js');
      const config = await generateMcpConfig();
      cachedMcpConfigPath = config.configPath;
      cachedMcpConfigCleanup = config.cleanup;
      return cachedMcpConfigPath;
    } catch {
      mcpConfigInitPromise = null; // allow retry on next call
      return null; // MCP config not available — experts run without tools
    }
  })();
  return mcpConfigInitPromise;
}

/**
 * Removes the cached MCP-config tempdir (closes #2946). Invoke from the
 * server's graceful-shutdown path so stale nexus-mcp-* tempdirs (under
 * the OS tmpdir, see child-mcp-config.ts) don't accumulate across daemon
 * restarts. Idempotent; safe to call multiple times. Never throws —
 * cleanup failures are logged and swallowed.
 */
export async function shutdownExpertBridge(): Promise<void> {
  const cleanup = cachedMcpConfigCleanup;
  if (cleanup === null) return;
  cachedMcpConfigCleanup = null;
  cachedMcpConfigPath = null;
  mcpConfigInitPromise = null;
  try {
    await cleanup();
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.debug('Expert-bridge MCP-config cleanup failed', { error: msg });
  }
}

/** Cached circuit breaker for health monitoring (#1766). */
let cachedCircuitBreaker: {
  getHealthStatus(): {
    systemHealthy: boolean;
    healthyCount: number;
    clis: ReadonlyArray<{ name: string; healthy: boolean }>;
  };
} | null = null;

/**
 * Adapt a CompositeRouter to the narrower RouterLike interface used by this
 * bridge. Previously did `as unknown as RouterLike` which hid any structural
 * mismatch between CompositeRouter's `Result<CliResponse, CliError>` and
 * RouterLike's flat `{ ok, value: { text }, error: { message } }` shape.
 * If CliResponse renames `.text` → `.output` (or similar), this adapter
 * breaks at compile time instead of silently returning wrong data (#1921).
 */
/**
 * Total tokens from a best-effort `CliResponse.usage` record (#3396). Prefers
 * the reported `totalTokens`; falls back to input+output; returns undefined
 * when no usage was reported (so callers can distinguish "0 tokens" — which
 * never happens for a real call — from "unknown").
 */
export function totalTokensFromUsage(
  usage: { totalTokens?: number; inputTokens?: number; outputTokens?: number } | undefined
): number | undefined {
  if (usage === undefined) return undefined;
  if (typeof usage.totalTokens === 'number') return usage.totalTokens;
  const total = (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
  return total > 0 ? total : undefined;
}

/**
 * Per-direction token split from a best-effort `CliResponse.usage` record
 * (#3387). Unlike {@link totalTokensFromUsage} this keeps `tokensIn`/`tokensOut`
 * separate — the granularity `ModelCalledEvent` requires for attribution.
 * Returns undefined when no usage was reported or both directions are zero (no
 * real call), so callers skip emitting a noise event instead of recording
 * zeros. Reconciles with the total: `tokensIn + tokensOut === totalTokensFromUsage`.
 */
export function tokenSplitFromUsage(
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined
): { tokensIn: number; tokensOut: number } | undefined {
  if (usage === undefined) return undefined;
  const tokensIn = usage.inputTokens ?? 0;
  const tokensOut = usage.outputTokens ?? 0;
  if (tokensIn + tokensOut === 0) return undefined;
  return { tokensIn, tokensOut };
}

function adaptCompositeRouter(
  compositeRouter: import('../cli-adapters/composite-router.js').ICompositeRouter
): RouterLike {
  return {
    async executeTask(task): Promise<{
      ok: boolean;
      value: {
        text: string;
        cli?: CliNameLiteral;
        tokensUsed?: number;
        model?: string;
        tokensIn?: number;
        tokensOut?: number;
      };
      error: { message: string };
    }> {
      const cliTask: import('../cli-adapters/types.js').CliTask = {
        content: task.content,
        ...(task.options !== undefined ? { options: task.options } : {}),
      };
      const result = await compositeRouter.executeTask(cliTask);
      if (result.ok) {
        // #2823: surface which CLI actually executed so callers writing to
        // OutcomeStore don't have to hardcode 'claude' (the bug #1154 fixed
        // and that regressed into the pipeline/ tree). Derive via the
        // canonical model→cli mapping in the registry — if the underlying
        // adapter didn't set `model` or the model isn't in the registry,
        // cli stays undefined and downstream code can skip the record
        // rather than lie.
        const cli = resolveCliFromModelString(result.value.model);
        // #3396: surface token usage (best-effort) so budget enforcement,
        // attribution, and routing-experience metrics get real numbers instead
        // of zeros. `usage` is optional and `totalTokens` may be absent — fall
        // back to input+output, and leave undefined when no usage was reported.
        const tokensUsed = totalTokensFromUsage(result.value.usage);
        // #3387: also surface the concrete model + per-direction token split so
        // a meaningful `model.called` event can be emitted. Both derive from the
        // same CliResponse, so tokensIn+tokensOut reconciles with tokensUsed.
        const model = result.value.model;
        const split = tokenSplitFromUsage(result.value.usage);
        return {
          ok: true,
          value: {
            text: result.value.text,
            ...(cli !== undefined && { cli }),
            ...(tokensUsed !== undefined && { tokensUsed }),
            ...(model !== undefined && { model }),
            ...(split !== undefined && { tokensIn: split.tokensIn, tokensOut: split.tokensOut }),
          },
          error: { message: '' },
        };
      }
      return { ok: false, value: { text: '' }, error: { message: result.error.message } };
    },
  };
}

// Coalesces concurrent router init the same way mcpConfigInitPromise does
// (closes #2969). N=7 voter fan-out previously ran createAllAdapters() N times
// — N sets of CLI probe subprocesses, all but one discarded.
let routerInitPromise: Promise<RouterLike | null> | null = null;

/** Get or create a cached CompositeRouter with circuit breaker monitoring. */
async function getRouter(): Promise<RouterLike | null> {
  if (cachedRouter !== null) return cachedRouter;
  routerInitPromise ??= (async (): Promise<RouterLike | null> => {
    // ROUTER CONSTRUCTION, a distinct operation from adapter acquisition
    // (#5191, ratified 5/6). `createCompositeRouter` needs
    // `Map<RoutingArmId, ICliAdapter>`; `getGlobalRegistry()` returns
    // `IResilientAdapter` (extends `IModelAdapter`) one CLI at a time, so the
    // canonical path cannot type-check here.
    //
    // It also should not be used: the router IS the selection/failover layer,
    // so resilient-wrapped arms would nest two failover mechanisms, and the
    // shared circuit breaker would make an arm report unavailable without the
    // router ever testing it. That is the doctor-probe defect (#5209) applied
    // to routing — and this map is the LinUCB arm space, so a coupled arm
    // availability would distort exploration signals.
    //
    // Pinned by `router-operation.test.ts`.
    const { createAllAdapters } = await import('../cli-adapters/factory.js');
    const { createCompositeRouter } = await import('../cli-adapters/composite-router.js');
    const adapters = createAllAdapters();
    if (adapters.size === 0) {
      routerInitPromise = null; // allow retry once adapters become available
      return null;
    }
    cachedRouter = adaptCompositeRouter(createCompositeRouter(adapters));

    // Initialize circuit breaker monitoring (#1766)
    try {
      const { createCliCircuitBreakerIntegration } =
        await import('../cli-adapters/cli-circuit-breaker.js');
      cachedCircuitBreaker = createCliCircuitBreakerIntegration([...adapters.values()]);
    } catch (error: unknown) {
      // Circuit breaker not available — continue without it. Log so we can
      // notice if initialization silently stops working (#1913 Class B).
      const msg = error instanceof Error ? error.message : String(error);
      logger.debug('Circuit breaker init failed; continuing without it', { error: msg });
    }

    return cachedRouter;
  })();
  return routerInitPromise;
}

/** Check CLI health before dispatch (#1766). */
function checkCircuitHealth(): { healthy: boolean; message: string } {
  if (cachedCircuitBreaker === null) return { healthy: true, message: '' };
  const status = cachedCircuitBreaker.getHealthStatus();
  if (!status.systemHealthy) {
    return {
      healthy: false,
      message: `All CLI circuits open (${String(status.healthyCount)}/${String(status.clis.length)} healthy)`,
    };
  }
  return { healthy: true, message: '' };
}

/** Dispatch task to router with rate limit retry (#1802). */
async function dispatchWithRateLimitRetry(
  router: RouterLike,
  task: { content: string; options?: Record<string, unknown> | undefined },
  expertType: BuiltInExpertType,
  start: number
): Promise<ExpertBridgeResult> {
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await router.executeTask(task);
    const durationMs = getTimeProvider().now() - start;

    if (result.ok) {
      logger.info('Expert executed successfully', {
        expertType,
        durationMs,
        cli: result.value.cli,
      });
      return {
        success: true,
        text: result.value.text,
        expertType,
        durationMs,
        ...(result.value.cli !== undefined && { cli: result.value.cli }),
        ...(result.value.tokensUsed !== undefined && { tokensUsed: result.value.tokensUsed }),
        ...(result.value.model !== undefined && { model: result.value.model }),
        ...(result.value.tokensIn !== undefined && { tokensIn: result.value.tokensIn }),
        ...(result.value.tokensOut !== undefined && { tokensOut: result.value.tokensOut }),
      };
    }

    const isRateLimit = isRateLimitText(result.error.message);
    if (isRateLimit && attempt < maxAttempts - 1) {
      const backoffMs = RATE_LIMIT_BASE_DELAY_MS * (attempt + 1);
      logger.warn('Expert rate limited, retrying', { expertType, attempt: attempt + 1, backoffMs });
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      continue;
    }

    logger.warn('Expert execution failed', { expertType, error: result.error.message });
    return { success: false, text: '', expertType, durationMs, error: result.error.message };
  }

  return {
    success: false,
    text: '',
    expertType,
    durationMs: getTimeProvider().now() - start,
    error: 'Max retry attempts exceeded',
  };
}

/**
 * Execute an expert task with the full nexus-agents expert pipeline.
 *
 * Creates a built-in expert, executes via CompositeRouter (for intelligent
 * CLI routing), and records outcomes. Falls back gracefully on failure.
 *
 * @param expertType - Built-in expert type (code, architecture, security, qa, etc.)
 * @param prompt - Task prompt for the expert
 * @returns Expert result with text output
 */
export async function executeExpert(
  expertType: BuiltInExpertType,
  prompt: string
): Promise<ExpertBridgeResult> {
  const start = getTimeProvider().now();
  try {
    const { BUILT_IN_EXPERTS } = await import('../agents/experts/expert-config.js');
    const config = BUILT_IN_EXPERTS[expertType];
    const fullPrompt = `${config.systemPrompt}\n\n${prompt}`;

    const router = await getRouter();
    if (router === null) {
      return {
        success: false,
        text: `[No adapters] ${prompt}`,
        expertType,
        durationMs: getTimeProvider().now() - start,
        error: 'No CLI adapters available',
      };
    }

    // Check circuit breaker health before dispatch (#1766)
    const health = checkCircuitHealth();
    if (!health.healthy) {
      logger.warn('Circuit breaker: all CLIs unavailable', { expertType, reason: health.message });
      return {
        success: false,
        text: '',
        expertType,
        durationMs: getTimeProvider().now() - start,
        error: health.message,
      };
    }

    // Pass MCP config so CLI experts can call nexus-agents tools (#1708)
    const mcpConfigPath = await getMcpConfigPath();
    const task: { content: string; options?: Record<string, unknown> | undefined } = {
      content: fullPrompt,
    };
    if (mcpConfigPath !== null) task.options = { mcpConfigPath };

    return await dispatchWithRateLimitRetry(router, task, expertType, start);
  } catch (error) {
    const durationMs = getTimeProvider().now() - start;
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn('Expert bridge error', { expertType, error: msg });
    return { success: false, text: '', expertType, durationMs, error: msg };
  }
}
