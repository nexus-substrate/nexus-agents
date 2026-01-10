/**
 * nexus-agents/security/sandbox - Default Policies
 *
 * Pre-defined sandbox policies for common use cases.
 *
 * @module security/sandbox/default-policies
 * (Source: Issue #162, Alignment Roadmap Phase 4)
 */

import type { SandboxPolicy } from './sandbox-types.js';
import { DEFAULT_RESOURCE_LIMITS } from './sandbox-types.js';
import { ALLOWED_COMMANDS, COMMAND_CATEGORIES } from './command-allowlist.js';
import { SAFE_ENV_VARS } from './env-sanitizer.js';

/**
 * Restrictive policy - minimal permissions for untrusted code.
 * Use for: External code, user-provided scripts, untrusted sources.
 */
export const RESTRICTIVE_POLICY: SandboxPolicy = {
  id: 'restrictive',
  name: 'Restrictive',
  mode: 'policy',
  allowedCommands: [...COMMAND_CATEGORIES.shellUtils],
  allowedEnvVars: ['PATH', 'HOME', 'USER', 'TERM', 'LANG', 'NODE_ENV', 'NO_COLOR', 'CI'],
  pathRules: [
    { path: '/tmp', access: 'write' },
    { path: process.cwd(), access: 'read' },
  ],
  capabilities: [],
  limits: {
    ...DEFAULT_RESOURCE_LIMITS,
    maxMemoryBytes: 128 * 1024 * 1024, // 128MB
    maxWallTimeMs: 30 * 1000, // 30 seconds
    maxProcesses: 1,
  },
};

/**
 * Standard policy - balanced permissions for build/test operations.
 * Use for: Verification phases, CI/CD operations, trusted workflows.
 */
export const STANDARD_POLICY: SandboxPolicy = {
  id: 'standard',
  name: 'Standard',
  mode: 'policy',
  allowedCommands: [
    ...COMMAND_CATEGORIES.packageManagers,
    ...COMMAND_CATEGORIES.node,
    ...COMMAND_CATEGORIES.buildTools,
    ...COMMAND_CATEGORIES.testing,
    ...COMMAND_CATEGORIES.linting,
    ...COMMAND_CATEGORIES.shellUtils,
  ],
  allowedEnvVars: [...SAFE_ENV_VARS],
  pathRules: [
    { path: '/tmp', access: 'write' },
    { path: process.cwd(), access: 'write' },
    { path: 'node_modules', access: 'read' },
  ],
  capabilities: ['filesystem_read', 'filesystem_write', 'process_spawn'],
  limits: DEFAULT_RESOURCE_LIMITS,
};

/**
 * Development policy - broader permissions for self-development workflow.
 * Use for: Implementation phases, git operations, PR creation.
 */
export const DEVELOPMENT_POLICY: SandboxPolicy = {
  id: 'development',
  name: 'Development',
  mode: 'policy',
  allowedCommands: [...ALLOWED_COMMANDS],
  allowedEnvVars: [...SAFE_ENV_VARS],
  pathRules: [
    { path: '/tmp', access: 'write' },
    { path: process.cwd(), access: 'write' },
    { path: 'node_modules', access: 'write' },
    { path: '.git', access: 'write' },
  ],
  capabilities: ['filesystem_read', 'filesystem_write', 'process_spawn', 'env_access'],
  limits: {
    ...DEFAULT_RESOURCE_LIMITS,
    maxWallTimeMs: 10 * 60 * 1000, // 10 minutes
  },
};

/**
 * Permissive policy - minimal restrictions for trusted internal operations.
 * Use for: Admin operations, infrastructure tasks (use sparingly).
 */
export const PERMISSIVE_POLICY: SandboxPolicy = {
  id: 'permissive',
  name: 'Permissive',
  mode: 'policy',
  allowedCommands: [...ALLOWED_COMMANDS],
  allowedEnvVars: [...SAFE_ENV_VARS],
  pathRules: [
    { path: '/', access: 'read' },
    { path: process.cwd(), access: 'write' },
    { path: '/tmp', access: 'write' },
  ],
  capabilities: ['filesystem_read', 'filesystem_write', 'process_spawn', 'env_access'],
  limits: {
    ...DEFAULT_RESOURCE_LIMITS,
    maxWallTimeMs: 30 * 60 * 1000, // 30 minutes
    maxMemoryBytes: 2 * 1024 * 1024 * 1024, // 2GB
  },
};

/**
 * Read-only policy - no write operations allowed.
 * Use for: Analysis, inspection, read-only queries.
 */
export const READONLY_POLICY: SandboxPolicy = {
  id: 'readonly',
  name: 'Read-Only',
  mode: 'policy',
  allowedCommands: [
    ...COMMAND_CATEGORIES.shellUtils,
    'git', // Read-only git commands
    'gh', // Read-only GitHub queries
  ],
  allowedEnvVars: [...SAFE_ENV_VARS],
  pathRules: [
    { path: process.cwd(), access: 'read' },
    { path: 'node_modules', access: 'read' },
  ],
  capabilities: ['filesystem_read'],
  limits: {
    ...DEFAULT_RESOURCE_LIMITS,
    maxWallTimeMs: 60 * 1000, // 1 minute
    maxMemoryBytes: 256 * 1024 * 1024, // 256MB
  },
};

/**
 * All default policies keyed by ID.
 */
export const DEFAULT_POLICIES: Record<string, SandboxPolicy> = {
  restrictive: RESTRICTIVE_POLICY,
  standard: STANDARD_POLICY,
  development: DEVELOPMENT_POLICY,
  permissive: PERMISSIVE_POLICY,
  readonly: READONLY_POLICY,
};

/**
 * Get a policy by ID.
 */
export function getPolicy(id: string): SandboxPolicy | undefined {
  return DEFAULT_POLICIES[id];
}

/**
 * Context to policy mapping.
 */
const CONTEXT_POLICY_MAP: Record<string, SandboxPolicy> = {
  verification: STANDARD_POLICY,
  build: STANDARD_POLICY,
  test: STANDARD_POLICY,
  lint: STANDARD_POLICY,
  implementation: DEVELOPMENT_POLICY,
  development: DEVELOPMENT_POLICY,
  git: DEVELOPMENT_POLICY,
  analysis: READONLY_POLICY,
  query: READONLY_POLICY,
  read: READONLY_POLICY,
  admin: PERMISSIVE_POLICY,
  infrastructure: PERMISSIVE_POLICY,
};

/**
 * Get the default policy for a given context.
 */
export function getDefaultPolicyForContext(context: string): SandboxPolicy {
  return CONTEXT_POLICY_MAP[context] ?? RESTRICTIVE_POLICY;
}
