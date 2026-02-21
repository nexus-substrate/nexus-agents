/**
 * nexus-agents/scm - Provider Factory
 *
 * Creates IScmProvider instances based on platform and configuration.
 * Handles token resolution automatically.
 *
 * @module scm/factory
 * (Source: Issue #1136 — Centralized SCM Provider Module)
 */

import type { Result } from '../core/index.js';
import { ok, err } from '../core/index.js';
import type { IScmProvider, ScmPlatform, TokenResolverConfig } from './types.js';
import { ScmError } from './types.js';
import { GitHubProvider } from './github-provider.js';
import { resolveToken } from './token-resolver.js';

/** Configuration for creating an SCM provider. */
export interface CreateScmProviderConfig {
  /** Repository in owner/repo format */
  readonly repo: string;
  /** SCM platform (default: github) */
  readonly platform?: ScmPlatform;
  /** Token configuration (env vars checked automatically if omitted) */
  readonly token?: TokenResolverConfig;
}

/**
 * Creates an SCM provider for the specified repository.
 *
 * Token resolution is automatic — checks env vars and CLI auth.
 * Currently supports GitHub (gh CLI). GitLab/Gitea planned.
 *
 * @param config - Provider configuration
 * @returns SCM provider instance or error
 *
 * @example
 * ```typescript
 * const result = await createScmProvider({ repo: 'owner/repo' });
 * if (!result.ok) { console.error(result.error); return; }
 * const issues = await result.value.listIssues();
 * ```
 */
export async function createScmProvider(
  config: CreateScmProviderConfig
): Promise<Result<IScmProvider, ScmError>> {
  const platform = config.platform ?? 'github';

  // Validate token availability (best-effort — gh CLI may work without explicit token)
  const explicitToken = config.token?.token;
  const explicitEnvVar = config.token?.envVar;
  const tokenResult = await resolveToken({
    platform,
    ...(explicitToken !== undefined ? { token: explicitToken } : {}),
    ...(explicitEnvVar !== undefined ? { envVar: explicitEnvVar } : {}),
  });

  if (!tokenResult.ok) {
    // gh CLI may work without explicit token (uses stored auth)
    // Log warning but don't fail — the provider will fail on first use if auth is missing
    // This allows gh CLI users who haven't set GITHUB_TOKEN to still work
  }

  switch (platform) {
    case 'github':
      return ok(new GitHubProvider(config.repo));
    case 'gitlab':
      return err(new ScmError('GitLab provider not yet implemented', 'gitlab'));
    case 'gitea':
      return err(new ScmError('Gitea provider not yet implemented', 'gitea'));
    default:
      return err(new ScmError(`Unsupported platform: ${String(platform)}`, platform));
  }
}

/**
 * Creates a GitHub provider directly (convenience shortcut).
 *
 * @param repo - Repository in owner/repo format
 * @returns GitHub provider instance
 */
export function createGitHubProvider(repo: string): IScmProvider {
  return new GitHubProvider(repo);
}
