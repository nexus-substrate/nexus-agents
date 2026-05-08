/**
 * cli-auth-probe — real authentication probes for the four AI CLIs.
 *
 * The existing `adapter.healthCheck()` only confirms the CLI binary exists +
 * the version is supported. It does NOT probe whether the CLI can actually
 * authenticate. Result: doctor reports "✓ Auth: CLI auth" for installed-but-
 * unauthed CLIs, then downstream commands fail with unreadable errors.
 *
 * This module fixes that. Per-CLI probes use the cheapest reliable signal:
 *
 *   - claude    → presence + non-expired `~/.claude/.credentials.json`
 *                 (or env: ANTHROPIC_API_KEY)
 *   - codex     → `codex login status` (returns auth state)
 *                 (or env: OPENAI_API_KEY)
 *   - gemini    → presence + non-expired `~/.gemini/oauth_creds.json`
 *                 (or env: GOOGLE_AI_API_KEY)
 *   - opencode  → `opencode auth list` (parses credential count)
 *
 * No live API calls. Tokens are not decoded or sent anywhere — only their
 * presence/expiry is read locally.
 *
 * Source: Issue #2447. Replaces the binary-detection-only path in doctor.ts
 * (Issue #2439 follow-up).
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { CLI_SUBPROCESS_TIMEOUTS } from '../config/timeouts.js';
import type { CliName } from '../cli-adapters/types.js';

const execFileAsync = promisify(execFile);

/**
 * Result of probing a single CLI's authentication state. Discriminated so
 * callers can render auth | needs-login | not-installed | error states
 * without re-checking flags.
 */
export type AuthProbeResult =
  | {
      readonly cli: CliName;
      readonly state: 'authenticated';
      /** How auth was satisfied — informational, not load-bearing. */
      readonly via: 'env-var' | 'cli-credentials';
      /** Optional metadata (e.g. expiry timestamp) if cheap to extract. */
      readonly meta?: Readonly<Record<string, unknown>>;
    }
  | {
      readonly cli: CliName;
      readonly state: 'needs-login';
      /** Short, human-readable reason to surface to the operator. */
      readonly reason: string;
      /** Exact command the operator should run to fix this. */
      readonly fixCommand: string;
      /** Optional canonical URL for credentials/console. */
      readonly fixUrl?: string;
      /** Env-var alternative if applicable. */
      readonly envFallback?: string;
    }
  | {
      readonly cli: CliName;
      readonly state: 'not-installed';
      readonly reason: string;
    }
  | {
      readonly cli: CliName;
      readonly state: 'error';
      readonly reason: string;
    };

const HOME = homedir();

// ============================================================================
// Per-CLI probes
// ============================================================================

function claudeNeedsLogin(reason: string): AuthProbeResult {
  return {
    cli: 'claude',
    state: 'needs-login',
    reason,
    fixCommand: 'claude /login',
    envFallback: 'ANTHROPIC_API_KEY',
    fixUrl: 'https://console.anthropic.com/account/keys',
  };
}

function probeClaude(): AuthProbeResult {
  if (process.env['ANTHROPIC_API_KEY'] !== undefined && process.env['ANTHROPIC_API_KEY'] !== '') {
    return { cli: 'claude', state: 'authenticated', via: 'env-var' };
  }
  const credPath = join(HOME, '.claude', '.credentials.json');
  if (!existsSync(credPath)) {
    return claudeNeedsLogin(
      'No credentials at ~/.claude/.credentials.json and ANTHROPIC_API_KEY is not set'
    );
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(credPath, 'utf-8'));
    if (!isClaudeCredsShape(parsed)) {
      return claudeNeedsLogin(
        'Credentials file present but not in expected shape (missing claudeAiOauth.accessToken)'
      );
    }
    const expiresAt = parsed.claudeAiOauth.expiresAt;
    if (typeof expiresAt === 'number' && expiresAt < Date.now()) {
      return claudeNeedsLogin(`OAuth token expired ${new Date(expiresAt).toISOString()}`);
    }
    return {
      cli: 'claude',
      state: 'authenticated',
      via: 'cli-credentials',
      ...(typeof expiresAt === 'number' ? { meta: { expiresAt } } : {}),
    };
  } catch (e: unknown) {
    return {
      cli: 'claude',
      state: 'error',
      reason: `Failed to read claude credentials: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

function codexNeedsLogin(reason: string): AuthProbeResult {
  return {
    cli: 'codex',
    state: 'needs-login',
    reason,
    fixCommand: 'codex login',
    envFallback: 'OPENAI_API_KEY',
    fixUrl: 'https://platform.openai.com/api-keys',
  };
}

function classifyCodexStdout(stdout: string): AuthProbeResult {
  // Check 'not logged in' BEFORE 'logged in' — substring shadowing.
  if (/not logged/i.test(stdout) || /no.*token/i.test(stdout)) {
    return codexNeedsLogin(stdout.trim().split('\n')[0] ?? 'Not logged in');
  }
  // Probe succeeded; treat unrecognized output as authed (defensive default).
  return { cli: 'codex', state: 'authenticated', via: 'cli-credentials' };
}

async function probeCodex(): Promise<AuthProbeResult> {
  if (process.env['OPENAI_API_KEY'] !== undefined && process.env['OPENAI_API_KEY'] !== '') {
    return { cli: 'codex', state: 'authenticated', via: 'env-var' };
  }
  try {
    const { stdout } = await execFileAsync('codex', ['login', 'status'], {
      timeout: CLI_SUBPROCESS_TIMEOUTS.spawnMs,
    });
    return classifyCodexStdout(stdout);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/ENOENT|not found/i.test(msg)) {
      return { cli: 'codex', state: 'not-installed', reason: 'codex binary not on PATH' };
    }
    return codexNeedsLogin('Not logged in (codex login status returned non-zero)');
  }
}

function geminiNeedsLogin(reason: string): AuthProbeResult {
  return {
    cli: 'gemini',
    state: 'needs-login',
    reason,
    fixCommand: 'gemini',
    envFallback: 'GOOGLE_AI_API_KEY',
    fixUrl: 'https://aistudio.google.com/apikey',
  };
}

function classifyGeminiCreds(parsed: unknown): AuthProbeResult {
  if (!isGeminiCredsShape(parsed)) {
    return geminiNeedsLogin('OAuth credentials file present but not in expected shape');
  }
  if (typeof parsed.expiry_date === 'number' && parsed.expiry_date < Date.now()) {
    return geminiNeedsLogin(
      `OAuth access token expired ${new Date(parsed.expiry_date).toISOString()} (refresh may still work)`
    );
  }
  return {
    cli: 'gemini',
    state: 'authenticated',
    via: 'cli-credentials',
    ...(typeof parsed.expiry_date === 'number' ? { meta: { expiresAt: parsed.expiry_date } } : {}),
  };
}

function probeGemini(): AuthProbeResult {
  const env = process.env['GOOGLE_AI_API_KEY'] ?? process.env['GEMINI_API_KEY'];
  if (env !== undefined && env !== '') {
    return { cli: 'gemini', state: 'authenticated', via: 'env-var' };
  }
  const credPath = join(HOME, '.gemini', 'oauth_creds.json');
  if (!existsSync(credPath)) {
    return geminiNeedsLogin(
      'No OAuth credentials at ~/.gemini/oauth_creds.json and GOOGLE_AI_API_KEY/GEMINI_API_KEY are not set'
    );
  }
  try {
    return classifyGeminiCreds(JSON.parse(readFileSync(credPath, 'utf-8')));
  } catch (e: unknown) {
    return {
      cli: 'gemini',
      state: 'error',
      reason: `Failed to read gemini credentials: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

async function probeOpencode(): Promise<AuthProbeResult> {
  // OpenCode's auth is per-provider (anthropic/openai/etc) configured in
  // ~/.config/opencode/opencode.json or via env. Probe by listing credentials.
  try {
    const { stdout } = await execFileAsync('opencode', ['auth', 'list'], {
      timeout: CLI_SUBPROCESS_TIMEOUTS.spawnMs,
    });
    if (/0 credentials/i.test(stdout)) {
      return {
        cli: 'opencode',
        state: 'needs-login',
        reason: 'No providers configured in opencode',
        fixCommand: 'opencode auth login',
        fixUrl: 'https://opencode.ai/docs/config',
      };
    }
    return { cli: 'opencode', state: 'authenticated', via: 'cli-credentials' };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/ENOENT|not found/i.test(msg)) {
      return { cli: 'opencode', state: 'not-installed', reason: 'opencode binary not on PATH' };
    }
    return {
      cli: 'opencode',
      state: 'error',
      reason: msg.split('\n')[0] ?? 'opencode auth list failed',
    };
  }
}

// ============================================================================
// Type guards (no `any`, no untyped JSON)
// ============================================================================

interface ClaudeCreds {
  readonly claudeAiOauth: {
    readonly accessToken: string;
    readonly expiresAt?: number;
  };
}

function isClaudeCredsShape(v: unknown): v is ClaudeCreds {
  if (typeof v !== 'object' || v === null) return false;
  const oauth = (v as { claudeAiOauth?: unknown }).claudeAiOauth;
  if (typeof oauth !== 'object' || oauth === null) return false;
  return typeof (oauth as { accessToken?: unknown }).accessToken === 'string';
}

interface GeminiCreds {
  readonly access_token: string;
  readonly expiry_date?: number;
}

function isGeminiCredsShape(v: unknown): v is GeminiCreds {
  if (typeof v !== 'object' || v === null) return false;
  return typeof (v as { access_token?: unknown }).access_token === 'string';
}

// ============================================================================
// Public API
// ============================================================================

/** Probe a single CLI. */
export async function probeCli(cli: CliName): Promise<AuthProbeResult> {
  switch (cli) {
    case 'claude':
      return Promise.resolve(probeClaude());
    case 'codex':
      return probeCodex();
    case 'gemini':
      return Promise.resolve(probeGemini());
    case 'opencode':
      return probeOpencode();
  }
}

/** Probe all four CLIs in parallel. Order in returned array matches input. */
export async function probeAllClis(): Promise<readonly AuthProbeResult[]> {
  const clis: readonly CliName[] = ['claude', 'gemini', 'codex', 'opencode'];
  return Promise.all(clis.map((c) => probeCli(c)));
}
