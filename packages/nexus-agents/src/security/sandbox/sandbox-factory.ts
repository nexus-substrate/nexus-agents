/**
 * nexus-agents/security/sandbox - Sandbox Factory
 *
 * Factory for creating sandbox executors. Per #2499 / #2551, the
 * Docker- and Deno-based executors were deleted; the policy-based
 * executor is the only remaining concrete implementation. `container`
 * and `deno` modes are kept in `SandboxMode` for config-schema
 * compatibility but resolve to `policy` mode at runtime with a warning.
 *
 * @module security/sandbox/sandbox-factory
 * (Source: Issue #175, Alignment Roadmap Phase 4)
 */

import { createLogger } from '../../core/index.js';
import type { ISandboxExecutor, SandboxConfig, SandboxMode } from './sandbox-types.js';
import { PolicySandboxExecutor } from './sandbox-executor.js';
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
  /** Policy sandbox configuration. */
  readonly policyConfig?: Partial<SandboxConfig>;
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
};

/**
 * Create a sandbox executor based on the specified mode.
 *
 * Post-#2551, `container` and `deno` modes are accepted for config
 * compatibility but resolve to `policy` mode with a warning. The
 * supported isolation surface is now external (OpenCode sandbox
 * bootstrap, #2500) rather than in-process executors.
 */
export function createSandbox(
  options?: Partial<SandboxFactoryOptions>
): Promise<SandboxCreationResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  switch (opts.mode) {
    case 'none':
      return Promise.resolve(createNoneMode());

    case 'policy':
      return Promise.resolve(createPolicyMode(opts.policyConfig));

    case 'container':
    case 'deno':
      return Promise.resolve(createDeprecatedModeFallback(opts.mode, opts.policyConfig));

    default: {
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
 * Handle deprecated `container` / `deno` modes by falling back to
 * policy mode. The Docker and Deno executors were deleted in #2551
 * because they were unused in production — real isolation is
 * provided by the OpenCode sandbox bootstrap (#2500) instead.
 */
function createDeprecatedModeFallback(
  requestedMode: 'container' | 'deno',
  policyConfig: Partial<SandboxConfig> | undefined
): SandboxCreationResult {
  logger.warn(`Sandbox mode "${requestedMode}" is no longer supported; using "policy" mode`, {
    requestedMode,
    actualMode: 'policy',
    reason:
      'In-process Docker/Deno executors were deleted in #2551. Use the OpenCode sandbox bootstrap for real isolation (NEXUS_SANDBOX environment variable, see docs/guides/SANDBOXED-USAGE.md).',
  });

  const executor = new PolicySandboxExecutor(policyConfig);

  return {
    executor,
    actualMode: 'policy',
    usedFallback: true,
    warning: `Sandbox mode "${requestedMode}" is no longer supported; using "policy" mode. For real isolation, use the NEXUS_SANDBOX bootstrap.`,
  };
}

/**
 * Get the recommended sandbox mode. Post-#2551, the only in-process
 * mode is `policy`; container-level isolation is handled out-of-process
 * by the OpenCode sandbox bootstrap (#2500).
 */
export function getRecommendedMode(): SandboxMode {
  return 'policy';
}
