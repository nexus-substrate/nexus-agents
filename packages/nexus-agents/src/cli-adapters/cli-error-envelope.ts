/**
 * cli-error-envelope — extract the actionable message from a CLI's
 * structured error envelope.
 *
 * When `claude`, `codex`, etc. return a JSON envelope with `is_error: true`,
 * the response parser correctly fails to find a usable assistant message
 * and falls through to the generic PARSE_ERROR path in `subprocess-adapter`.
 * That path stuffs the first 500 chars of the envelope into the error
 * message, producing the unreadable wall of escaped JSON described in #2440.
 *
 * This module unwraps known envelope shapes so the operator sees:
 *
 *   ✗ Claude CLI: Not logged in
 *     → claude /login, then retry
 *
 * instead of 600 characters of `{"timestamp":"...","level":"warn",...}`.
 *
 * Source: Issue #2440 (round-14 onboarding audit, ask 1 + ask 2).
 */

import type { CliErrorCode, CliName } from './types.js';
import { isRateLimitText } from '../adapters/rate-limit-detector.js';

/**
 * Result of unwrapping a CLI's structured error envelope. `null` when the
 * stdout doesn't match a known shape — caller falls back to the existing
 * snippet behavior.
 */
export interface ParsedCliError {
  /** Short, user-facing message — the unwrapped CLI error string. */
  readonly message: string;
  /** Classified code so the retry/fail-closed logic can do the right thing. */
  readonly code: CliErrorCode;
  /** Optional one-line hint with the canonical fix for this CLI. */
  readonly hint?: string;
}

/**
 * Claude CLI structured envelope shape:
 *   {"type":"result","is_error":true,"result":"<reason>","session_id":"...",...}
 *
 * Use a structural type guard rather than parsing into a strict schema —
 * upstream may add fields and we only care about three of them.
 */
interface ClaudeErrorEnvelope {
  readonly type: 'result';
  readonly is_error: true;
  readonly result?: string;
}

function isClaudeErrorEnvelope(v: unknown): v is ClaudeErrorEnvelope {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as { type?: unknown; is_error?: unknown };
  return obj.type === 'result' && obj.is_error === true;
}

/**
 * Codex CLI envelope shape (best-effort — codex CLI's error shape is
 * less stable than Claude's):
 *   {"error":"<reason>"}  or  {"is_error":true,"message":"<reason>"}
 */
function unwrapCodexEnvelope(parsed: unknown): string | null {
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as { error?: unknown; message?: unknown; is_error?: unknown };
  if (typeof obj.error === 'string' && obj.error !== '') return obj.error;
  if (obj.is_error === true && typeof obj.message === 'string' && obj.message !== '') {
    return obj.message;
  }
  return null;
}

/** Login hint matched against the parsed message text, per CLI. */
const LOGIN_HINTS: Record<CliName, string> = {
  claude: 'claude /login',
  codex: 'codex login',
  gemini: 'gemini',
  opencode: 'opencode auth login',
};

const NOT_AUTH_PATTERNS: readonly RegExp[] = [
  /not logged in/i,
  /please run \/?login/i,
  /authentication (?:required|expired|failed)/i,
  /invalid (?:api ?key|credentials)/i,
  /unauthorized/i,
  // #2455 ask 1: catch "API key expired" / "API key revoked" / "API key
  // missing" — the bare /invalid api key/ pattern misses these. Architects
  // explicitly ruled OUT `permission denied` (that's authz, not authn —
  // routing to /login is the wrong fix).
  /api[- ]?key (?:expired|revoked|missing)/i,
  // Token expiry/revocation as a standalone signal, not co-occurring with
  // "unauthorized" — some upstreams emit "Token expired. Please re-auth."
  // without the unauthorized keyword.
  /token (?:expired|revoked)/i,
  // #3350: OAuth refresh-token rotation. The codex CLI emits "Your access
  // token could not be refreshed because your refresh token was already used.
  // Please log out and sign in again." This previously fell through to a raw
  // fail-closed voter error with no `<cli> login` signal for the operator.
  /refresh token .*already used/i,
  /could not be refreshed/i,
  /log ?out and sign in/i,
  /sign in again/i,
];

function classifyMessage(message: string): { code: CliErrorCode; auth: boolean } {
  for (const re of NOT_AUTH_PATTERNS) {
    if (re.test(message)) return { code: 'NOT_AUTHENTICATED', auth: true };
  }
  return { code: 'EXECUTION_ERROR', auth: false };
}

/**
 * Resolve a bare CLI name from a possibly-prefixed identifier. `IModelAdapter`
 * exposes `providerId` as `cli-codex`/`cli-claude` (see `CliToModelAdapter`),
 * so callers can pass either form. Returns `null` when the name is not a known
 * CLI — the remediation map can't produce a hint we'd vouch for.
 */
function resolveCliName(cliName: string): CliName | null {
  const bare = cliName.startsWith('cli-') ? cliName.slice('cli-'.length) : cliName;
  return bare in LOGIN_HINTS ? (bare as CliName) : null;
}

/**
 * #3350: one-line operator remediation for a stale-auth voter failure.
 *
 * Returns `null` when `message` is not an authentication error (callers leave
 * the error text untouched), or when `cliName` is not a recognized CLI.
 * Otherwise returns a single line reusing {@link LOGIN_HINTS}, e.g.
 *
 *   Re-authenticate: run `codex login` (the codex CLI's stored OAuth token is stale).
 *
 * Reuses {@link classifyMessage} + {@link LOGIN_HINTS} — does not duplicate the
 * pattern list or the per-CLI command map (DRY).
 */
export function authRemediation(message: string, cliName: string): string | null {
  if (!classifyMessage(message).auth) return null;
  const cli = resolveCliName(cliName);
  if (cli === null) return null;
  return `Re-authenticate: run \`${LOGIN_HINTS[cli]}\` (the ${cli} CLI's stored OAuth token is stale).`;
}

/**
 * Classify an error message a CLI's response parser already extracted from an
 * error-only stream (e.g. OpenCode's NDJSON `{"type":"error",...}` event,
 * surfaced via `ICliResponseParser.extractErrorMessage`). Unlike
 * {@link parseCliErrorEnvelope} this takes the *already-unwrapped* message — the
 * parser did the format-specific extraction — and only classifies it, mirroring
 * the recovery order in `subprocess-adapter.handleUnparseableOutput`:
 * rate-limit → auth → generic execution error. `cliName` may be prefixed
 * (`cli-opencode`) — resolved internally for the remediation hint.
 */
export function classifyExtractedError(message: string, cliName: string): ParsedCliError {
  const trimmed = message.trim();
  if (isRateLimitText(trimmed)) {
    return { message: trimmed, code: 'RATE_LIMITED' };
  }
  const { code, auth } = classifyMessage(trimmed);
  if (auth) {
    const hint = authRemediation(trimmed, cliName);
    return hint !== null ? { message: trimmed, code, hint } : { message: trimmed, code };
  }
  return { message: trimmed, code };
}

/**
 * Try to find the actionable error string inside a CLI's stdout. Returns
 * `null` if the stdout doesn't look like a structured error envelope (the
 * caller then falls back to the existing snippet truncation).
 */
export function parseCliErrorEnvelope(stdout: string, cliName: CliName): ParsedCliError | null {
  const trimmed = stdout.trim();
  if (trimmed === '' || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Whole-blob parse failed — could be NDJSON (one JSON object per line).
    // Try the last line, which is where Claude/Codex emit the terminal
    // envelope.
    return tryLastLine(trimmed, cliName);
  }

  let message: string | undefined;
  if (isClaudeErrorEnvelope(parsed) && typeof parsed.result === 'string') {
    message = parsed.result;
  } else {
    const codex = unwrapCodexEnvelope(parsed);
    if (codex !== null) message = codex;
  }

  if (message === undefined || message === '') return null;

  return buildParsedError(message, cliName);
}

function tryLastLine(stdout: string, cliName: CliName): ParsedCliError | null {
  const lines = stdout.split('\n').filter((l) => l.trim() !== '');
  if (lines.length < 2) return null;
  const last = lines.at(-1);
  if (last === undefined) return null;
  if (!last.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(last) as unknown;
    if (isClaudeErrorEnvelope(parsed) && typeof parsed.result === 'string') {
      return buildParsedError(parsed.result, cliName);
    }
  } catch {
    /* ignore — fall through to null */
  }
  return null;
}

function buildParsedError(message: string, cliName: CliName): ParsedCliError {
  // Trim to first line + cap length — operators don't need 500 chars of envelope.
  const firstLine = (message.split('\n')[0] ?? message).trim().slice(0, 240);
  const { code, auth } = classifyMessage(firstLine);
  if (auth) {
    return {
      message: firstLine,
      code,
      hint: `Run \`${LOGIN_HINTS[cliName]}\` to authenticate, then retry.`,
    };
  }
  return { message: firstLine, code };
}
