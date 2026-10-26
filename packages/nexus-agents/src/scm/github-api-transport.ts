/** Shared canonical GitHub CLI transport; minimal imports, with subprocess IO and a process-wide token cache. */
import type { Result } from '../core/result.js';
import { ok, err } from '../core/result.js';
import { CLI_SUBPROCESS_TIMEOUTS } from '../config/subprocess-timeouts.js';
import { ScmError } from './types.js';

/**
 * Resolves a GitHub token from env vars or `gh auth token`.
 * Caches the result to avoid repeated subprocess calls.
 */
let cachedGhToken: string | undefined | null = null;
let ghTokenPromise: Promise<string | undefined> | undefined;

/** Reset the cached token (for testing). */
export function resetGhTokenCache(): void {
  cachedGhToken = null;
  ghTokenPromise = undefined;
}

async function resolveGhToken(): Promise<string | undefined> {
  if (cachedGhToken !== null) return cachedGhToken;

  ghTokenPromise ??= resolveGhTokenImpl().finally(() => {
    ghTokenPromise = undefined;
  });
  return ghTokenPromise;
}

async function resolveGhTokenImpl(): Promise<string | undefined> {
  const envToken = process.env['GITHUB_TOKEN'] ?? process.env['GH_TOKEN'];
  if (envToken !== undefined && envToken.length > 0) {
    cachedGhToken = envToken;
    return envToken;
  }

  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const exec = promisify(execFile);
    const { stdout } = await exec('gh', ['auth', 'token'], { timeout: 5_000 });
    const token = stdout.trim();
    cachedGhToken = token.length > 0 ? token : undefined;
  } catch {
    cachedGhToken = undefined;
  }
  return cachedGhToken;
}

type GitHubApiAuthentication = 'resolved-token' | 'inherit-cli-environment';

export async function execGhApiRaw(
  args: readonly string[],
  authentication: GitHubApiAuthentication = 'resolved-token'
): Promise<Result<string, ScmError>> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const exec = promisify(execFile);

  // Inject token into subprocess environment to prevent keyring access failures
  // Legacy unbound reviews delegate authentication to gh, including its native
  // environment precedence/keyring behavior, without reading or filling our cache.
  const token = authentication === 'resolved-token' ? await resolveGhToken() : undefined;
  const env = token !== undefined ? { ...process.env, GH_TOKEN: token } : undefined;

  try {
    const { stdout } = await exec('gh', [...args], {
      maxBuffer: 10 * 1024 * 1024,
      timeout: CLI_SUBPROCESS_TIMEOUTS.ghCommandMs,
      ...(env !== undefined ? { env } : {}),
    });
    return ok(stdout.trim());
  } catch (error) {
    const execError = error as { message: string; stderr?: string };
    return err(
      new ScmError(`gh api failed: ${execError.message}`, 'github', undefined, {
        endpoint: args[1] ?? '',
        stderr: execError.stderr,
      })
    );
  }
}
