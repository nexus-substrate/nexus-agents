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
 *   - gemini    → presence of `agy` only, reported as `unknown` (#4391). The arm
 *                 runs Antigravity, which offers no non-interactive auth check
 *                 and does NOT use `~/.gemini/oauth_creds.json`.
 *   - opencode  → `opencode auth list` (parses credential count)
 *
 * No live API calls. Tokens are never decoded or sent anywhere — only their
 * presence/expiry is read locally. Where a CLI offers no signal we can read, the
 * probe reports `unknown` rather than guessing in either direction (#4391).
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
      /**
       * The CLI is installed, but it exposes NO way to verify authentication
       * that we can use (#4391). Not a failure — an honest absence of evidence.
       *
       * Callers must admit these optimistically. Asserting `needs-login` here
       * excluded a working `agy` arm from routing for exactly this reason
       * (#4346), and asserting `authenticated` is how the retired gemini CLI
       * stayed selectable while failing every call (#4318). Real invocation
       * failures — the circuit breaker — do the excluding instead.
       */
      readonly cli: CliName;
      readonly state: 'unknown';
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

/**
 * Probe the gemini arm, which runs `agy` (Antigravity) since Google retired the
 * standalone gemini CLI (#4389).
 *
 * There is no usable auth signal to read, and that is a measured conclusion
 * rather than an assumption:
 *
 *   - `agy models` HANGS when stdout is not a TTY — 90s and no output, confirmed
 *     from both a shell pipe and `execFile` (#4393). Unusable programmatically.
 *   - There is no `auth`, `login` or `whoami` subcommand.
 *   - agy does not use `~/.gemini/oauth_creds.json`. Verified experimentally:
 *     it served a completion while that file sat untouched with an expiry 5.5
 *     hours in the past. The previous probe read exactly that file and so
 *     reported `needs-login` for a working gateway.
 *
 * The only thing that proves agy works is a real completion, which costs ~17k
 * input tokens per call — far too expensive for a health check.
 *
 * So this reports `unknown`: the binary is there, and we decline to guess. Under
 * the admission policy that makes the arm selectable, and a genuinely broken
 * gateway is excluded by its own failures rather than by a check that cannot
 * see it.
 */
async function probeGemini(): Promise<AuthProbeResult> {
  try {
    // `--version` is local, instant, and TTY-independent — it establishes
    // presence without asserting anything about auth.
    await execFileAsync('agy', ['--version'], {
      timeout: CLI_SUBPROCESS_TIMEOUTS.spawnMs,
      maxBuffer: 64 * 1024,
    });
    return {
      cli: 'gemini',
      state: 'unknown',
      reason: 'agy exposes no non-interactive auth check; admitted unverified',
    };
  } catch (e: unknown) {
    const err = e as { code?: string | number };
    if (err.code === 'ENOENT') {
      return { cli: 'gemini', state: 'not-installed', reason: 'agy binary not found on PATH' };
    }
    // Deliberately does not echo stderr: gateway output can carry request
    // content or credential material.
    return { cli: 'gemini', state: 'error', reason: 'agy --version failed' };
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
      return probeGemini();
    case 'opencode':
      return probeOpencode();
  }
}

/** Probe all four CLIs in parallel. Order in returned array matches input. */
export async function probeAllClis(): Promise<readonly AuthProbeResult[]> {
  const clis: readonly CliName[] = ['claude', 'gemini', 'codex', 'opencode'];
  return Promise.all(clis.map((c) => probeCli(c)));
}
