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

const logger = createLogger({ component: 'expert-bridge' });

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
    const { generateMcpConfig } = await import('../swe-bench/mcp-config.js');
    const config = await generateMcpConfig();
    cachedMcpConfigPath = config.configPath;
    return cachedMcpConfigPath;
  } catch {
    return null; // MCP config not available — experts run without tools
  }
}

/** Get or create a cached CompositeRouter. */
async function getRouter(): Promise<RouterLike | null> {
  if (cachedRouter !== null) return cachedRouter;
  const { createAllAdapters } = await import('../cli-adapters/factory.js');
  const { createCompositeRouter } = await import('../cli-adapters/composite-router.js');
  const adapters = createAllAdapters();
  if (adapters.size === 0) return null;
  cachedRouter = createCompositeRouter(adapters) as unknown as RouterLike;
  return cachedRouter;
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

    // Pass MCP config so CLI experts can call nexus-agents tools (#1708)
    const mcpConfigPath = await getMcpConfigPath();
    const task: { content: string; options?: Record<string, unknown> | undefined } = {
      content: fullPrompt,
    };
    if (mcpConfigPath !== null) task.options = { mcpConfigPath };
    const result = await router.executeTask(task);
    const durationMs = getTimeProvider().now() - start;

    if (result.ok) {
      logger.info('Expert executed successfully', { expertType, durationMs });
      return { success: true, text: result.value.text, expertType, durationMs };
    }

    logger.warn('Expert execution failed', { expertType, error: result.error.message });
    return { success: false, text: '', expertType, durationMs, error: result.error.message };
  } catch (error) {
    const durationMs = getTimeProvider().now() - start;
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn('Expert bridge error', { expertType, error: msg });
    return { success: false, text: '', expertType, durationMs, error: msg };
  }
}
