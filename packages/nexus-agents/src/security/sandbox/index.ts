/* eslint-disable @typescript-eslint/no-deprecated -- Barrel re-exports for the
 * deprecated executor surface (#2499). Source-of-truth declarations carry
 * the @deprecated tag; this file just forwards them so external consumers
 * can still import. Per project memory rule, do NOT propagate @deprecated
 * to re-exports. */
/**
 * nexus-agents/security/sandbox - Module Exports
 *
 * Agent execution sandboxing and isolation.
 *
 * @module security/sandbox
 * (Source: Issue #162, Issue #175, Alignment Roadmap Phase 4)
 */

// Types
export type {
  SandboxMode,
  SecurityCapability,
  ResourceLimits,
  PathAccessRule,
  SandboxPolicy,
  PolicyEvaluation,
  PolicyViolation,
  SandboxResult,
  ResourceUsage,
  ISandboxExecutor,
  SandboxExecutionOptions,
  SandboxConfig,
} from './sandbox-types.js';

export { DEFAULT_RESOURCE_LIMITS } from './sandbox-types.js';

// Command allowlist
export {
  COMMAND_CATEGORIES,
  ALLOWED_COMMANDS,
  DENIED_COMMANDS,
  validateCommand,
  validateArgs,
  isCommandInCategory,
  getCommandCategory,
} from './command-allowlist.js';

// Environment sanitizer
export {
  SAFE_ENV_VARS,
  DENIED_ENV_PREFIXES,
  sanitizeEnvironment,
  validateEnvVar,
  createMinimalEnv,
  looksLikeSecret,
} from './env-sanitizer.js';
export type { SanitizedEnv } from './env-sanitizer.js';

// Default policies
export {
  RESTRICTIVE_POLICY,
  STANDARD_POLICY,
  DEVELOPMENT_POLICY,
  PERMISSIVE_POLICY,
  READONLY_POLICY,
  DEFAULT_POLICIES,
  getPolicy,
  getDefaultPolicyForContext,
} from './default-policies.js';

// Policy-based executor
export { PolicySandboxExecutor, createSandboxExecutor } from './sandbox-executor.js';

// Docker-based executor
export {
  DockerSandboxExecutor,
  createDockerSandboxExecutor,
  isDockerAvailable,
  resetDockerCache,
} from './docker-sandbox-executor.js';
export type { DockerSandboxConfig } from './docker-sandbox-executor.js';

// Deno-based executor (#1898)
export { DenoSandboxExecutor, isDenoAvailable, resetDenoCache } from './deno-sandbox-executor.js';
export { policyToDenoFlags } from './deno-sandbox-helpers.js';
export type { DenoSandboxConfig } from './deno-sandbox-executor.js';

// Factory
export { createSandbox, getRecommendedMode } from './sandbox-factory.js';
export type { SandboxFactoryOptions, SandboxCreationResult } from './sandbox-factory.js';

// Manager (global singleton)
export {
  initializeSandbox,
  getSandboxExecutor,
  getSandboxExecutorOrNull,
  isSandboxInitialized,
  getSandboxMode,
  resetSandboxManager,
} from './sandbox-manager.js';
export type { SandboxManagerConfig } from './sandbox-manager.js';
