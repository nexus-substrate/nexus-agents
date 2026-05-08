/**
 * nexus-agents/security/sandbox - Sandbox Factory
 *
 * Factory for creating sandbox executors based on mode and availability.
 *
 * @module security/sandbox/sandbox-factory
 * (Source: Issue #175, Alignment Roadmap Phase 4)
 */

import { createLogger } from '../../core/index.js';
import type { ISandboxExecutor, SandboxConfig, SandboxMode } from './sandbox-types.js';
import { PolicySandboxExecutor } from './sandbox-executor.js';
import {
  DockerSandboxExecutor,
  isDockerAvailable,
  type DockerSandboxConfig,
} from './docker-sandbox-executor.js';
import {
  DenoSandboxExecutor,
  isDenoAvailable,
  type DenoSandboxConfig,
} from './deno-sandbox-executor.js';
import { STANDARD_POLICY } from './default-policies.js';

const logger = createLogger({ component: 'sandbox-factory' });

/**
 * Options for creating a sandbox executor.
 */
export interface SandboxFactoryOptions {
  /** Desired sandbox mode. */
  readonly mode: SandboxMode;
  /** Whether to fall back to policy mode if container not available. */
  readonly fallbackToPolicy?: boolean;
  /**
   * Whether to fall back to the Deno permission sandbox when Docker is
   * unavailable (#1898). Inserts Deno between container and policy in the
   * fallback chain when both `fallbackToDeno` and `fallbackToPolicy` are
   * true. Default: `true` — Deno gives meaningful process-level isolation
   * vs policy mode which is enforcement-only.
   */
  readonly fallbackToDeno?: boolean;
  /** Policy sandbox configuration. */
  readonly policyConfig?: Partial<SandboxConfig>;
  /** Docker sandbox configuration. */
  readonly dockerConfig?: DockerSandboxConfig;
  /** Deno sandbox configuration (#1898). */
  readonly denoConfig?: DenoSandboxConfig;
}

/**
 * Result of sandbox creation.
 */
export interface SandboxCreationResult {
  /** The created executor. */
  readonly executor: ISandboxExecutor;
  /** Actual mode being used (may differ from requested if fallback occurred). */
  readonly actualMode: SandboxMode;
  /** Whether a fallback occurred. */
  readonly usedFallback: boolean;
  /** Warning message if fallback was used. */
  readonly warning?: string;
}

/**
 * Default factory options.
 */
const DEFAULT_OPTIONS: SandboxFactoryOptions = {
  mode: 'policy',
  fallbackToPolicy: true,
  fallbackToDeno: true,
};

/**
 * Create a sandbox executor based on the specified mode.
 *
 * If mode is 'container' but Docker is not available, will fall back
 * to 'policy' mode (unless fallbackToPolicy is false).
 */
export async function createSandbox(
  options?: Partial<SandboxFactoryOptions>
): Promise<SandboxCreationResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  switch (opts.mode) {
    case 'none':
      return createNoneMode();

    case 'policy':
      return createPolicyMode(opts.policyConfig);

    case 'container':
      return createContainerMode(opts);

    case 'deno':
      return createDenoMode(opts);

    default: {
      // TypeScript exhaustiveness check
      const exhaustiveCheck: never = opts.mode;
      throw new Error(`Unknown sandbox mode: ${String(exhaustiveCheck)}`);
    }
  }
}

/**
 * Create a no-op executor (for development/testing only).
 */
function createNoneMode(): SandboxCreationResult {
  logger.warn('Creating sandbox in "none" mode - NO ISOLATION');

  // Return policy executor with enforcement disabled
  const executor = new PolicySandboxExecutor({
    defaultPolicy: STANDARD_POLICY,
    enforce: false,
    logViolations: true,
  });

  return {
    executor,
    actualMode: 'none',
    usedFallback: false,
    warning: 'Sandbox mode "none" provides no isolation. Use only for development.',
  };
}

/**
 * Create a policy-based executor.
 */
function createPolicyMode(config?: Partial<SandboxConfig>): SandboxCreationResult {
  logger.info('Creating sandbox in "policy" mode');

  const executor = new PolicySandboxExecutor(config);

  return {
    executor,
    actualMode: 'policy',
    usedFallback: false,
  };
}

/**
 * Create a container-based executor with optional fallback chain
 * Docker → Deno → Policy. Both fallback toggles default to true.
 */
async function createContainerMode(opts: SandboxFactoryOptions): Promise<SandboxCreationResult> {
  const dockerAvailable = await isDockerAvailable();

  if (dockerAvailable) {
    logger.info('Creating sandbox in "container" mode (Docker)');

    const executor = new DockerSandboxExecutor(opts.dockerConfig);

    return {
      executor,
      actualMode: 'container',
      usedFallback: false,
    };
  }

  // Docker not available — try Deno before falling all the way to policy. (#1898)
  if (opts.fallbackToDeno !== false) {
    const denoAvailable = await isDenoAvailable();
    if (denoAvailable) {
      logger.warn('Docker not available, falling back to "deno" mode');
      const executor = new DenoSandboxExecutor(opts.denoConfig);
      return {
        executor,
        actualMode: 'deno',
        usedFallback: true,
        warning:
          'Docker not available. Using Deno permission sandbox (process-level isolation, not container-level).',
      };
    }
  }

  // Neither Docker nor Deno — last resort is policy enforcement.
  if (opts.fallbackToPolicy === true) {
    logger.warn('Docker and Deno unavailable, falling back to "policy" mode');

    const executor = new PolicySandboxExecutor(opts.policyConfig);

    return {
      executor,
      actualMode: 'policy',
      usedFallback: true,
      warning:
        'Neither Docker nor Deno available. Using policy-based sandbox with limited isolation.',
    };
  }

  // No fallback allowed, throw error
  throw new Error(
    'Container sandbox mode requested but neither Docker nor Deno is available. ' +
      'Install Docker (for container isolation) or Deno (for process-level isolation), ' +
      'or set fallbackToPolicy: true.'
  );
}

/**
 * Create a Deno-based executor (#1898). Falls back to policy if Deno is
 * unavailable AND fallbackToPolicy is true; otherwise throws.
 */
async function createDenoMode(opts: SandboxFactoryOptions): Promise<SandboxCreationResult> {
  const denoAvailable = await isDenoAvailable();
  if (denoAvailable) {
    logger.info('Creating sandbox in "deno" mode');
    const executor = new DenoSandboxExecutor(opts.denoConfig);
    return {
      executor,
      actualMode: 'deno',
      usedFallback: false,
    };
  }
  if (opts.fallbackToPolicy === true) {
    logger.warn('Deno not available, falling back to "policy" mode');
    const executor = new PolicySandboxExecutor(opts.policyConfig);
    return {
      executor,
      actualMode: 'policy',
      usedFallback: true,
      warning: 'Deno not available. Using policy-based sandbox with limited isolation.',
    };
  }
  throw new Error(
    'Deno sandbox mode requested but Deno is not available. ' +
      'Install Deno (>=2.0) or set fallbackToPolicy: true.'
  );
}

/**
 * Get the recommended sandbox mode for the current environment.
 *
 * Preference order: container > deno > policy. (#1898)
 */
export async function getRecommendedMode(): Promise<SandboxMode> {
  const dockerAvailable = await isDockerAvailable();
  if (dockerAvailable) {
    return 'container';
  }
  const denoAvailable = await isDenoAvailable();
  if (denoAvailable) {
    logger.info('Docker not available; recommending deno mode (process-level isolation)');
    return 'deno';
  }
  logger.info('Neither Docker nor Deno available; recommending policy mode');
  return 'policy';
}
