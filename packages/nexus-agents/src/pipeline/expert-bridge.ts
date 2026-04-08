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
export async function executeExpert(
  expertType: BuiltInExpertType,
  prompt: string
): Promise<ExpertBridgeResult> {
  const start = getTimeProvider().now();
  try {
    // Use CompositeRouter for intelligent multi-CLI routing
    const { createAllAdapters } = await import('../cli-adapters/factory.js');
    const { createCompositeRouter } = await import('../cli-adapters/composite-router.js');
    const { BUILT_IN_EXPERTS } = await import('../agents/experts/expert-config.js');

    const config = BUILT_IN_EXPERTS[expertType];
    const fullPrompt = `${config.systemPrompt}\n\n${prompt}`;

    const adapters = createAllAdapters();
    if (adapters.size === 0) {
      return {
        success: false,
        text: `[No adapters] ${prompt}`,
        expertType,
        durationMs: getTimeProvider().now() - start,
        error: 'No CLI adapters available',
      };
    }

    const router = createCompositeRouter(adapters);
    const result = await router.executeTask({ content: fullPrompt });
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
