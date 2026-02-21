/**
 * nexus-agents/scm - Centralized Token Resolver
 *
 * Single source of truth for SCM token resolution. Priority:
 * 1. Explicit config (token passed directly)
 * 2. Environment variables (GITHUB_TOKEN, GH_TOKEN, GITLAB_TOKEN)
 * 3. CLI auth (gh auth token, glab auth token)
 *
 * @module scm/token-resolver
 * (Source: Issue #1136 — Centralized SCM Provider Module)
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Result } from '../core/index.js';
import { ok, err, createLogger } from '../core/index.js';
import type { ScmToken, ScmPlatform, TokenResolverConfig } from './types.js';

const execFileAsync = promisify(execFile);
const logger = createLogger({ component: 'TokenResolver' });

/** Environment variable names per platform. */
const ENV_VARS: Record<ScmPlatform, readonly string[]> = {
  github: ['GITHUB_TOKEN', 'GH_TOKEN'],
  gitlab: ['GITLAB_TOKEN', 'GL_TOKEN'],
  gitea: ['GITEA_TOKEN'],
} as const;

/** CLI commands to fetch auth tokens per platform. */
const CLI_AUTH_COMMANDS: Record<ScmPlatform, readonly string[]> = {
  github: ['gh', 'auth', 'token'],
  gitlab: ['glab', 'auth', 'token'],
  gitea: [],
} as const;

/** CLI auth timeout in ms. */
const CLI_AUTH_TIMEOUT_MS = 5_000;

/**
 * Resolves a token from environment variables.
 */
function resolveFromEnv(platform: ScmPlatform, customEnvVar?: string): ScmToken | undefined {
  // Custom env var takes priority
  if (customEnvVar !== undefined) {
    const val = process.env[customEnvVar];
    if (val !== undefined && val !== '') {
      return { value: val, strategy: 'env', platform };
    }
  }

  // Check platform-specific env vars
  for (const envVar of ENV_VARS[platform]) {
    const val = process.env[envVar];
    if (val !== undefined && val !== '') {
      return { value: val, strategy: 'env', platform };
    }
  }

  return undefined;
}

/**
 * Resolves a token from CLI auth.
 */
async function resolveFromCli(platform: ScmPlatform): Promise<ScmToken | undefined> {
  const cmd = CLI_AUTH_COMMANDS[platform];
  if (cmd.length === 0) return undefined;

  const [bin, ...args] = cmd;
  if (bin === undefined) return undefined;

  try {
    const { stdout } = await execFileAsync(bin, args, {
      timeout: CLI_AUTH_TIMEOUT_MS,
    });
    const token = stdout.trim();
    if (token !== '') {
      return { value: token, strategy: 'cli', platform };
    }
  } catch {
    logger.debug('CLI auth token resolution failed', { platform });
  }

  return undefined;
}

/**
 * Resolves an SCM token using the priority chain:
 * 1. Explicit config
 * 2. Environment variables
 * 3. CLI auth
 *
 * @param config - Token resolution configuration
 * @returns Resolved token or error
 */
export async function resolveToken(config?: TokenResolverConfig): Promise<Result<ScmToken, Error>> {
  const platform = config?.platform ?? 'github';

  // Priority 1: Explicit config
  if (config?.token !== undefined && config.token !== '') {
    return ok({ value: config.token, strategy: 'config' as const, platform });
  }

  // Priority 2: Environment variables
  const envToken = resolveFromEnv(platform, config?.envVar);
  if (envToken !== undefined) {
    logger.debug('Token resolved from environment', { platform, strategy: 'env' });
    return ok(envToken);
  }

  // Priority 3: CLI auth
  const cliToken = await resolveFromCli(platform);
  if (cliToken !== undefined) {
    logger.debug('Token resolved from CLI auth', { platform, strategy: 'cli' });
    return ok(cliToken);
  }

  const envVarList = ENV_VARS[platform].join(' or ');
  return err(
    new Error(
      `No ${platform} token found. Set ${envVarList} environment variable, ` +
        `or authenticate via CLI (${CLI_AUTH_COMMANDS[platform].join(' ')}).`
    )
  );
}

/**
 * Synchronous check: is any token available for the given platform?
 * Only checks environment variables (no CLI auth, which is async).
 */
export function hasToken(platform: ScmPlatform = 'github'): boolean {
  return resolveFromEnv(platform) !== undefined;
}

/**
 * Returns the list of environment variable names for a platform.
 * Useful for documentation and error messages.
 */
export function getTokenEnvVars(platform: ScmPlatform = 'github'): readonly string[] {
  return ENV_VARS[platform];
}
