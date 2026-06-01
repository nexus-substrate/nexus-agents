/**
 * nexus-agents/cli/hooks/handlers - Handler Utilities
 *
 * Shared utilities for hook handlers.
 *
 * @module cli/hooks/handlers/handler-utils
 * (Source: Issue #413-#415 - Hook handlers implementation)
 */

import {
  getNexusDataDir as resolveNexusDataDir,
  sessionsDbPath,
} from '../../../config/nexus-data-dir.js';
import { parseBoolEnv } from '../../../config/defaults-env.js';

/**
 * Default database path for session storage.
 *
 * Resolves to the per-repo `sessions/sessions.db` (#2902) and performs
 * the one-time legacy-DB relocation — see `sessionsDbPath`.
 */
export function getDefaultDbPath(): string {
  return sessionsDbPath();
}

/**
 * Gets the nexus-agents data directory path (#2302).
 * Re-exported for hook handlers; canonical source is `config/nexus-data-dir.ts`.
 */
export function getNexusDataDir(): string {
  return resolveNexusDataDir();
}

/**
 * Environment variable names used by hook handlers.
 */
export const HookEnvVars = {
  /** Override the default database path */
  NEXUS_SESSIONS_DB: 'NEXUS_SESSIONS_DB',
  /** Enable verbose logging for hooks */
  NEXUS_HOOK_VERBOSE: 'NEXUS_HOOK_VERBOSE',
  /** Disable session tracking */
  NEXUS_DISABLE_SESSIONS: 'NEXUS_DISABLE_SESSIONS',
  /** Disable metrics tracking */
  NEXUS_DISABLE_METRICS: 'NEXUS_DISABLE_METRICS',
} as const;

/**
 * Checks if a feature is disabled via environment variable.
 */
export function isFeatureDisabled(envVar: string): boolean {
  return parseBoolEnv(envVar, false);
}

/**
 * Gets database path from environment or default.
 */
export function getDbPathFromEnv(): string {
  return process.env[HookEnvVars.NEXUS_SESSIONS_DB] ?? getDefaultDbPath();
}

/**
 * Checks if verbose logging is enabled.
 */
export function isVerboseLogging(): boolean {
  return parseBoolEnv(HookEnvVars.NEXUS_HOOK_VERBOSE, false);
}

/**
 * Safely extracts a string from unknown input.
 */
export function safeString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  // For objects, return empty string to avoid [object Object]
  return '';
}

/**
 * Safely extracts a number from unknown input.
 */
export function safeNumber(value: unknown, defaultValue: number = 0): number {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return defaultValue;
}
