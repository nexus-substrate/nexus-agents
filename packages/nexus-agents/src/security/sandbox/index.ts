/**
 * nexus-agents/security/sandbox - Module Exports
 *
 * Agent execution sandboxing and isolation.
 *
 * @module security/sandbox
 * (Source: Issue #162, Alignment Roadmap Phase 4)
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

// Executor
export { PolicySandboxExecutor, createSandboxExecutor } from './sandbox-executor.js';
