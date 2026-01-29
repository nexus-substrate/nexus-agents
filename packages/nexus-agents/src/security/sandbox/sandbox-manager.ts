/**
 * nexus-agents/security/sandbox - Sandbox Manager
 *
 * Global sandbox manager for agent execution isolation.
 * Provides singleton access to the configured sandbox executor.
 *
 * @module security/sandbox/sandbox-manager
 * (Source: Issue #175, ALIGNMENT_ROADMAP Phase 4)
 */

import { createLogger } from '../../core/index.js';
import type { ISandboxExecutor, SandboxMode } from './sandbox-types.js';
import { createSandbox, type SandboxCreationResult } from './sandbox-factory.js';

const logger = createLogger({ component: 'sandbox-manager' });

/**
 * Sandbox manager configuration.
 */
export interface SandboxManagerConfig {
  /** Sandbox execution mode. */
  readonly mode: SandboxMode;
  /** Fall back to policy mode if container unavailable. */
  readonly fallbackToPolicy: boolean;
  /** Docker image for container mode. */
  readonly dockerImage?: string | undefined;
  /** Enable network access in container mode. */
  readonly networkEnabled: boolean;
}

/**
 * Default sandbox configuration.
 */
const DEFAULT_CONFIG: SandboxManagerConfig = {
  mode: 'policy',
  fallbackToPolicy: true,
  networkEnabled: false,
};

/** Global sandbox executor instance. */
let globalSandbox: ISandboxExecutor | null = null;

/** Global sandbox mode (actual mode being used). */
let actualMode: SandboxMode = 'policy';

/** Whether sandbox has been initialized. */
let isInitialized = false;

/** Warning message if fallback was used. */
let initWarning: string | undefined;

/**
 * Initialize the global sandbox executor.
 *
 * Should be called during server startup before any tool execution.
 * Subsequent calls are no-ops unless reset() is called first.
 *
 * @param config - Sandbox configuration
 * @returns Promise resolving to initialization result
 */
export async function initializeSandbox(
  config?: Partial<SandboxManagerConfig>
): Promise<SandboxCreationResult> {
  if (isInitialized && globalSandbox !== null) {
    logger.debug('Sandbox already initialized, skipping');
    const baseResult = {
      executor: globalSandbox,
      actualMode,
      usedFallback: initWarning !== undefined,
    };
    if (initWarning !== undefined) {
      return { ...baseResult, warning: initWarning };
    }
    return baseResult;
  }

  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  logger.info('Initializing sandbox', {
    mode: finalConfig.mode,
    fallbackToPolicy: finalConfig.fallbackToPolicy,
  });

  const dockerConfig = {
    networkEnabled: finalConfig.networkEnabled,
    ...(finalConfig.dockerImage !== undefined && { image: finalConfig.dockerImage }),
  };

  const result = await createSandbox({
    mode: finalConfig.mode,
    fallbackToPolicy: finalConfig.fallbackToPolicy,
    dockerConfig,
  });

  globalSandbox = result.executor;
  actualMode = result.actualMode;
  isInitialized = true;
  initWarning = result.warning;

  if (result.usedFallback) {
    logger.warn('Sandbox initialized with fallback', {
      requestedMode: finalConfig.mode,
      actualMode: result.actualMode,
      warning: result.warning,
    });
  } else {
    logger.info('Sandbox initialized', {
      mode: result.actualMode,
      executor: result.executor.name,
    });
  }

  return result;
}

/**
 * Get the global sandbox executor.
 *
 * Throws if sandbox has not been initialized.
 *
 * @returns The global sandbox executor
 */
export function getSandboxExecutor(): ISandboxExecutor {
  if (globalSandbox === null) {
    throw new Error('Sandbox not initialized. Call initializeSandbox() during server startup.');
  }
  return globalSandbox;
}

/**
 * Get the global sandbox executor if initialized.
 *
 * @returns The global sandbox executor or null if not initialized
 */
export function getSandboxExecutorOrNull(): ISandboxExecutor | null {
  return globalSandbox;
}

/**
 * Check if sandbox has been initialized.
 */
export function isSandboxInitialized(): boolean {
  return isInitialized;
}

/**
 * Get the actual sandbox mode being used.
 */
export function getSandboxMode(): SandboxMode {
  return actualMode;
}

/**
 * Reset the sandbox manager (for testing).
 */
export function resetSandboxManager(): void {
  globalSandbox = null;
  actualMode = 'policy';
  isInitialized = false;
  initWarning = undefined;
  logger.debug('Sandbox manager reset');
}
