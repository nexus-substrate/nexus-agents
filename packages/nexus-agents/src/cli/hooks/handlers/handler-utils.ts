/**
 * nexus-agents/cli/hooks/handlers - Handler Utilities
 *
 * Shared utilities for hook handlers.
 *
 * @module cli/hooks/handlers/handler-utils
 * (Source: Issue #413-#415 - Hook handlers implementation)
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Default database path for session storage.
 * Uses ~/.nexus-agents/sessions.db
 */
export function getDefaultDbPath(): string {
  return join(homedir(), '.nexus-agents', 'sessions.db');
}

/**
 * Gets the nexus-agents data directory path.
 * Creates ~/.nexus-agents if needed.
 */
export function getNexusDataDir(): string {
  return join(homedir(), '.nexus-agents');
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
  const value = process.env[envVar];
  return value === '1' || value === 'true';
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
  const value = process.env[HookEnvVars.NEXUS_HOOK_VERBOSE];
  return value === '1' || value === 'true';
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
