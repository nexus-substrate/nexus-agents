/**
 * nexus-agents/cli - Review Demo Helpers
 *
 * Helper functions for the PR review demo workflow.
 * Uses centralized SCM token resolver for GitHub authentication.
 *
 * @module cli/review-demo-helpers
 * (Source: Issue #258 - PR Review Demo Workflow)
 * (Source: Issue #1136 — SCM token consolidation)
 */

import type {
  SetupStatus,
  ProgressStep,
  PreflightResult,
  PreflightCheck,
} from './review-demo-types.js';
import { safeExecSandboxed } from './sandbox-exec.js';
import { API_TIMEOUTS } from '../config/timeouts.js';
import { resolveToken } from '../scm/token-resolver.js';

/** Timeout for GitHub API requests in milliseconds. */
const GITHUB_API_TIMEOUT_MS = API_TIMEOUTS.githubApiMs;

/**
 * Checks setup status for the review command.
 */
export async function checkSetupStatus(): Promise<SetupStatus> {
  const tokenResult = await resolveToken({ platform: 'github' });
  const token = tokenResult.ok ? tokenResult.value.value : undefined;
  const hasGitHubToken = token !== undefined && token.length > 0;

  // Check if gh CLI is available using sandbox-aware execution
  const ghVersionOutput = safeExecSandboxed('gh --version', { context: 'gh' });
  const hasGhCli = ghVersionOutput !== null;

  let tokenValid = false;
  let tokenScopes: string[] = [];
  let username: string | undefined;

  if (hasGitHubToken) {
    const result = await validateToken(token);
    tokenValid = result.valid;
    tokenScopes = result.scopes;
    username = result.username;
  }

  return {
    hasGitHubToken,
    hasGhCli,
    tokenScopes,
    tokenValid,
    ...(username !== undefined && { username }),
  };
}

/**
 * Validates a GitHub token and returns its scopes.
 */
async function validateToken(
  token: string
): Promise<{ valid: boolean; scopes: string[]; username?: string }> {
  try {
    // Issue #546: Add timeout to prevent indefinite hangs
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(GITHUB_API_TIMEOUT_MS),
    });

    if (!response.ok) {
      return { valid: false, scopes: [] };
    }

    const scopes = response.headers.get('x-oauth-scopes')?.split(', ') ?? [];
    const user = (await response.json()) as { login?: string };

    return {
      valid: true,
      scopes,
      ...(user.login !== undefined && { username: user.login }),
    };
  } catch {
    return { valid: false, scopes: [] };
  }
}

/**
 * Runs pre-flight checks before starting the review.
 */
export async function runPreflightChecks(prUrl: string): Promise<PreflightResult> {
  const checks: PreflightCheck[] = [];

  // Check 1: GitHub token
  const tokenCheck = await checkToken();
  checks.push(tokenCheck);

  // Check 2: PR URL format
  const urlCheck = checkPrUrl(prUrl);
  checks.push(urlCheck);

  // Check 3: Token has required scopes
  if (tokenCheck.passed) {
    const scopeCheck = await checkTokenScopes();
    checks.push(scopeCheck);
  }

  const passed = checks.every((c) => c.passed);

  return { passed, checks };
}

/**
 * Checks if GitHub token is present.
 */
async function checkToken(): Promise<PreflightCheck> {
  const tokenResult = await resolveToken({ platform: 'github' });
  const token = tokenResult.ok ? tokenResult.value.value : undefined;

  if (token === undefined || token.length === 0) {
    return {
      name: 'GitHub Token',
      passed: false,
      message: 'GITHUB_TOKEN or GH_TOKEN environment variable not set',
      suggestion: `Set your token with:

  export GITHUB_TOKEN="ghp_your_token_here"

Or use gh CLI to authenticate:

  gh auth login
  export GITHUB_TOKEN=$(gh auth token)

Create a token at: https://github.com/settings/tokens
Required scopes: repo (for private repos) or public_repo (for public repos)`,
    };
  }

  const result = await validateToken(token);

  if (!result.valid) {
    return {
      name: 'GitHub Token',
      passed: false,
      message: 'Token is invalid or expired',
      suggestion: 'Create a new token at: https://github.com/settings/tokens',
    };
  }

  return {
    name: 'GitHub Token',
    passed: true,
    message: `Authenticated as @${result.username ?? 'unknown'}`,
  };
}

/**
 * Checks if PR URL is valid.
 */
function checkPrUrl(url: string): PreflightCheck {
  if (url.length === 0) {
    return {
      name: 'PR URL',
      passed: false,
      message: 'No PR URL provided',
      suggestion: `Usage: nexus-agents review <url>

Examples:
  nexus-agents review https://github.com/owner/repo/pull/123
  nexus-agents review owner/repo#123`,
    };
  }

  const httpPattern = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/;
  const shortPattern = /^([^/]+)\/([^/#]+)(?:#|\/pull\/)(\d+)$/;

  const match = httpPattern.exec(url) ?? shortPattern.exec(url);

  if (match === null) {
    return {
      name: 'PR URL',
      passed: false,
      message: `Invalid PR URL format: ${url}`,
      suggestion: `Valid formats:
  https://github.com/owner/repo/pull/123
  owner/repo#123
  owner/repo/pull/123`,
    };
  }

  return {
    name: 'PR URL',
    passed: true,
    message: `Valid: ${match[1] ?? 'unknown'}/${match[2] ?? 'unknown'}#${match[3] ?? '?'}`,
  };
}

/**
 * Checks if token has required scopes.
 */
async function checkTokenScopes(): Promise<PreflightCheck> {
  const tokenResult = await resolveToken({ platform: 'github' });
  const token = tokenResult.ok ? tokenResult.value.value : undefined;

  if (token === undefined) {
    return {
      name: 'Token Scopes',
      passed: false,
      message: 'No token to check',
    };
  }

  const result = await validateToken(token);

  if (!result.valid) {
    return {
      name: 'Token Scopes',
      passed: false,
      message: 'Could not validate token scopes',
    };
  }

  const hasRepoScope =
    result.scopes.includes('repo') ||
    result.scopes.includes('public_repo') ||
    result.scopes.length === 0; // Fine-grained tokens don't report scopes

  if (!hasRepoScope) {
    return {
      name: 'Token Scopes',
      passed: false,
      message: `Missing required scope. Current: ${result.scopes.join(', ') || 'none'}`,
      suggestion: 'Token needs "repo" or "public_repo" scope to create reviews',
    };
  }

  return {
    name: 'Token Scopes',
    passed: true,
    message:
      result.scopes.length > 0 ? `Scopes: ${result.scopes.join(', ')}` : 'Fine-grained token',
  };
}

/**
 * Formats setup status for display.
 */
export function formatSetupStatus(status: SetupStatus): string {
  const lines: string[] = [];

  lines.push('Setup Status:');
  lines.push('');

  const tokenIcon = status.hasGitHubToken ? (status.tokenValid ? '[OK]' : '[!!]') : '[  ]';
  const tokenMsg = status.hasGitHubToken
    ? status.tokenValid
      ? `Authenticated as @${status.username ?? 'unknown'}`
      : 'Token invalid or expired'
    : 'Not configured';
  lines.push(`  ${tokenIcon} GitHub Token: ${tokenMsg}`);

  const cliIcon = status.hasGhCli ? '[OK]' : '[  ]';
  const cliMsg = status.hasGhCli ? 'Installed' : 'Not found (optional)';
  lines.push(`  ${cliIcon} GitHub CLI:   ${cliMsg}`);

  if (status.tokenValid && status.tokenScopes.length > 0) {
    lines.push(`  [OK] Token Scopes: ${status.tokenScopes.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Formats pre-flight results for display.
 */
export function formatPreflightResults(results: PreflightResult): string {
  const lines: string[] = [];

  lines.push('Pre-flight Checks:');
  lines.push('');

  for (const check of results.checks) {
    const icon = check.passed ? '[OK]' : '[!!]';
    lines.push(`  ${icon} ${check.name}: ${check.message}`);

    if (!check.passed && check.suggestion !== undefined) {
      lines.push('');
      for (const line of check.suggestion.split('\n')) {
        lines.push(`      ${line}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Formats a progress step for display.
 */
export function formatProgressStep(step: ProgressStep, index: number, total: number): string {
  const icons: Record<ProgressStep['status'], string> = {
    pending: '[ ]',
    in_progress: '[>]',
    completed: '[OK]',
    failed: '[!!]',
  };

  const icon = icons[step.status];
  const progress = `(${String(index + 1)}/${String(total)})`;
  const duration = step.durationMs !== undefined ? ` (${String(step.durationMs)}ms)` : '';
  const message = step.message !== undefined ? ` - ${step.message}` : '';

  return `${progress} ${icon} ${step.name}${duration}${message}`;
}

/**
 * Creates progress steps for the review workflow.
 */
export function createProgressSteps(): ProgressStep[] {
  return [
    { name: 'Validating credentials', status: 'pending' },
    { name: 'Fetching PR metadata', status: 'pending' },
    { name: 'Running security review', status: 'pending' },
    { name: 'Running code quality review', status: 'pending' },
    { name: 'Running test coverage review', status: 'pending' },
    { name: 'Aggregating results', status: 'pending' },
    { name: 'Posting review', status: 'pending' },
  ];
}

/**
 * Updates a progress step.
 */
export function updateProgress(
  steps: ProgressStep[],
  index: number,
  update: Partial<ProgressStep>
): ProgressStep[] {
  return steps.map((step, i) => (i === index ? { ...step, ...update } : step));
}

/**
 * Prints the setup wizard instructions.
 */
export function getSetupInstructions(): string {
  return `
=== nexus-agents review Setup Wizard ===

This command reviews GitHub pull requests using AI-powered multi-agent analysis.

STEP 1: Configure GitHub Authentication
----------------------------------------
You need a GitHub token with 'repo' scope. Choose one method:

Option A: Use gh CLI (Recommended)
  $ gh auth login
  $ export GITHUB_TOKEN=$(gh auth token)

Option B: Create a Personal Access Token
  1. Go to: https://github.com/settings/tokens
  2. Click "Generate new token (classic)"
  3. Select scope: "repo" (or "public_repo" for public repos only)
  4. Copy the token and set:
     $ export GITHUB_TOKEN="ghp_your_token_here"

Option C: Add to shell profile for persistence
  $ echo 'export GITHUB_TOKEN="ghp_your_token_here"' >> ~/.bashrc
  $ source ~/.bashrc

STEP 2: Run Your First Review
-----------------------------
  $ nexus-agents review https://github.com/owner/repo/pull/123

Options:
  --dry-run     Review without posting to GitHub
  --verbose     Show detailed output

STEP 3: Verify It Works
-----------------------
  $ nexus-agents review owner/repo#123 --dry-run

This will run a review without posting, so you can verify the output first.
`.trim();
}
