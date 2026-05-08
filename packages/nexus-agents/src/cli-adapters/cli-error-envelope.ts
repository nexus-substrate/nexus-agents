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
];

function classifyMessage(message: string): { code: CliErrorCode; auth: boolean } {
  for (const re of NOT_AUTH_PATTERNS) {
    if (re.test(message)) return { code: 'NOT_AUTHENTICATED', auth: true };
  }
  return { code: 'EXECUTION_ERROR', auth: false };
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
