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
/** Minimal router interface for the bridge. */
interface RouterLike {
  executeTask(task: {
    content: string;
    options?: Record<string, unknown> | undefined;
  }): Promise<{ ok: boolean; value: { text: string }; error: { message: string } }>;
}

// Cached router — lazily initialized, reused across calls within a session
let cachedRouter: RouterLike | null = null;

// Cached MCP config — generated once, reused across expert calls (#1708)
let cachedMcpConfigPath: string | null = null;

/** Get or create cached MCP config path for expert CLI sessions (#1708). */
async function getMcpConfigPath(): Promise<string | null> {
  if (cachedMcpConfigPath !== null) return cachedMcpConfigPath;
  try {
    const { generateMcpConfig } = await import('../cli-adapters/child-mcp-config.js');
    const config = await generateMcpConfig();
    cachedMcpConfigPath = config.configPath;
    return cachedMcpConfigPath;
  } catch {
    return null; // MCP config not available — experts run without tools
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
function adaptCompositeRouter(
  compositeRouter: import('../cli-adapters/composite-router.js').ICompositeRouter
): RouterLike {
  return {
    async executeTask(task): Promise<{
      ok: boolean;
      value: { text: string };
      error: { message: string };
    }> {
      const cliTask: import('../cli-adapters/types.js').CliTask = {
        content: task.content,
        ...(task.options !== undefined ? { options: task.options } : {}),
      };
      const result = await compositeRouter.executeTask(cliTask);
      if (result.ok) {
        return { ok: true, value: { text: result.value.text }, error: { message: '' } };
      }
      return { ok: false, value: { text: '' }, error: { message: result.error.message } };
    },
  };
}

/** Get or create a cached CompositeRouter with circuit breaker monitoring. */
async function getRouter(): Promise<RouterLike | null> {
  if (cachedRouter !== null) return cachedRouter;
  const { createAllAdapters } = await import('../cli-adapters/factory.js');
  const { createCompositeRouter } = await import('../cli-adapters/composite-router.js');
  const adapters = createAllAdapters();
  if (adapters.size === 0) return null;
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
      logger.info('Expert executed successfully', { expertType, durationMs });
      return { success: true, text: result.value.text, expertType, durationMs };
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
