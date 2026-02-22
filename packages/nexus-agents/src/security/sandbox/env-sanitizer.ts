/**
 * nexus-agents/security/sandbox - Environment Sanitizer
 *
 * Filters environment variables to prevent secret leakage.
 *
 * @module security/sandbox/env-sanitizer
 * (Source: Issue #162, Alignment Roadmap Phase 4)
 * (Source: Issue #1136 — SCM token name linkage)
 */

import type { PolicyViolation } from './sandbox-types.js';
import { getTokenEnvVars } from '../../scm/token-resolver.js';

/**
 * Environment variables that are always safe to pass.
 */
export const SAFE_ENV_VARS: readonly string[] = [
  // System essentials
  'PATH',
  'HOME',
  'USER',
  'SHELL',
  'TERM',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TZ',
  'PWD',
  'OLDPWD',
  'LOGNAME',
  'HOSTNAME',

  // Node.js
  'NODE_ENV',
  'NODE_OPTIONS',
  'NODE_PATH',
  'NODE_NO_WARNINGS',
  'NO_COLOR',
  'FORCE_COLOR',

  // Package managers
  'npm_config_registry',
  'npm_config_cache',
  'PNPM_HOME',
  'YARN_CACHE_FOLDER',

  // Build tools
  'CI',
  'CONTINUOUS_INTEGRATION',
  'DEBUG',

  // Editor/IDE
  'EDITOR',
  'VISUAL',
  'COLORTERM',

  // Terminal
  'COLUMNS',
  'LINES',
  'DISPLAY',
];

/**
 * Environment variable prefixes that are always denied.
 */
export const DENIED_ENV_PREFIXES: readonly string[] = [
  // API keys and tokens
  'API_',
  'AUTH_',
  'TOKEN_',
  'SECRET_',
  'KEY_',
  'PASSWORD_',
  'CREDENTIAL_',

  // Cloud providers
  'AWS_',
  'AZURE_',
  'GCP_',
  'GOOGLE_',
  'DIGITALOCEAN_',
  'CLOUDFLARE_',

  // AI/ML services
  'ANTHROPIC_',
  'OPENAI_',
  'HUGGINGFACE_',
  'COHERE_',
  'REPLICATE_',

  // Database connections
  'DATABASE_',
  'DB_',
  'REDIS_',
  'MONGO_',
  'POSTGRES_',
  'MYSQL_',

  // VCS — token var names derived from SCM module (Issue #1136)
  ...getTokenEnvVars('github'),
  ...getTokenEnvVars('gitlab'),
  ...getTokenEnvVars('gitea'),
  'GITLAB_',
  'BITBUCKET_',

  // Private
  'PRIVATE_',
  'INTERNAL_',
];

/**
 * Environment variable patterns that are always denied.
 */
export const DENIED_ENV_PATTERNS: readonly RegExp[] = [
  /TOKEN$/i,
  /SECRET$/i,
  /PASSWORD$/i,
  /KEY$/i,
  /CREDENTIAL$/i,
  /AUTH$/i,
  /API_KEY$/i,
  /ACCESS_KEY$/i,
  /PRIVATE_KEY$/i,
];

/**
 * Result of environment sanitization.
 */
export interface SanitizedEnv {
  /** Filtered environment variables. */
  readonly env: Record<string, string>;
  /** Variables that were blocked. */
  readonly blocked: readonly string[];
  /** Any violations found. */
  readonly violations: readonly PolicyViolation[];
}

/**
 * Sanitizes environment variables based on policy.
 */
export function sanitizeEnvironment(
  sourceEnv: Record<string, string | undefined>,
  allowedVars: readonly string[],
  additionalEnv?: Record<string, string>
): SanitizedEnv {
  const result: Record<string, string> = {};
  const blocked: string[] = [];
  const violations: PolicyViolation[] = [];

  // Determine effective allowlist
  const effectiveAllowlist = allowedVars.length > 0 ? allowedVars : SAFE_ENV_VARS;

  // Process source environment
  for (const [key, value] of Object.entries(sourceEnv)) {
    if (value === undefined) continue;

    const validation = validateEnvVar(key, effectiveAllowlist);
    if (validation !== null) {
      blocked.push(key);
      violations.push(validation);
      continue;
    }

    result[key] = value;
  }

  // Add additional env (these bypass allowlist but still check deny list)
  if (additionalEnv !== undefined) {
    for (const [key, value] of Object.entries(additionalEnv)) {
      const denyCheck = isDeniedEnvVar(key);
      if (denyCheck !== null) {
        blocked.push(key);
        violations.push(denyCheck);
        continue;
      }

      result[key] = value;
    }
  }

  return { env: result, blocked, violations };
}

/**
 * Validates a single environment variable.
 */
export function validateEnvVar(
  name: string,
  allowedVars: readonly string[]
): PolicyViolation | null {
  // Check deny list first
  const denyCheck = isDeniedEnvVar(name);
  if (denyCheck !== null) {
    return denyCheck;
  }

  // Check allowlist
  if (!allowedVars.includes(name)) {
    return {
      type: 'env',
      denied: name,
      reason: `Environment variable '${name}' is not in the allowlist`,
    };
  }

  return null;
}

/**
 * Checks if an env var is in the deny list.
 */
function isDeniedEnvVar(name: string): PolicyViolation | null {
  // Check prefixes
  for (const prefix of DENIED_ENV_PREFIXES) {
    if (name.startsWith(prefix)) {
      return {
        type: 'env',
        denied: name,
        reason: `Environment variable with prefix '${prefix}' is denied (potential secret)`,
      };
    }
  }

  // Check patterns
  for (const pattern of DENIED_ENV_PATTERNS) {
    if (pattern.test(name)) {
      return {
        type: 'env',
        denied: name,
        reason: `Environment variable matches denied pattern (potential secret)`,
      };
    }
  }

  return null;
}

/**
 * Creates a minimal safe environment for sandboxed execution.
 */
export function createMinimalEnv(cwd?: string): Record<string, string> {
  return {
    PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    HOME: process.env.HOME ?? '/tmp',
    USER: process.env.USER ?? 'sandbox',
    SHELL: '/bin/sh',
    TERM: 'xterm-256color',
    LANG: 'en_US.UTF-8',
    LC_ALL: 'en_US.UTF-8',
    NODE_ENV: 'production',
    NO_COLOR: '1',
    CI: 'true',
    PWD: cwd ?? process.cwd(),
  };
}

/**
 * Checks if an env var contains a potential secret value.
 */
export function looksLikeSecret(value: string): boolean {
  // Common secret patterns
  const secretPatterns = [
    // Base64-encoded data (>20 chars)
    /^[A-Za-z0-9+/]{20,}={0,2}$/,
    // Hex strings (>32 chars)
    /^[a-fA-F0-9]{32,}$/,
    // JWT tokens
    /^ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
    // AWS keys
    /^AKIA[0-9A-Z]{16}$/,
    // GitHub tokens
    /^gh[ps]_[A-Za-z0-9]{36,}$/,
    // Generic long random strings
    /^[A-Za-z0-9_-]{40,}$/,
  ];

  return secretPatterns.some((pattern) => pattern.test(value));
}
