/**
 * nexus-tui — Input/output sanitization
 *
 * Protects against ANSI escape injection, control character injection,
 * and other terminal-based attacks. All user-provided strings should
 * pass through sanitizeOutput() before being rendered to the terminal.
 *
 * @module sanitize
 * (Source: Issue #875 — TUI security hardening)
 */

const ANSI_ESCAPE_RE = /\x1b\[[0-9;]*[A-Za-z]/g;

const CONTROL_CHAR_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

/**
 * Strips ANSI escape sequences and dangerous control characters
 * from a string. Safe characters (tab \x09, newline \x0a, CR \x0d)
 * are preserved.
 */
export function sanitizeOutput(input: string): string {
  return input.replace(ANSI_ESCAPE_RE, '').replace(CONTROL_CHAR_RE, '');
}

/**
 * Safely parses an integer from a string flag value.
 * Returns undefined if the value is not a valid integer or out of range.
 */
export function safeParseInt(
  value: string | undefined,
  min: number = 1,
  max: number = 10_000
): number | undefined {
  if (value === undefined) return undefined;
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n < min || n > max) return undefined;
  return n;
}

/**
 * Safely parses JSON from a user-provided string.
 * Returns undefined with an error message if parsing fails.
 */
export function safeParseJson(
  input: string
): { value: Record<string, unknown> } | { error: string } {
  try {
    const parsed: unknown = JSON.parse(input);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { error: 'Expected a JSON object' };
    }
    return { value: parsed as Record<string, unknown> };
  } catch {
    return { error: 'Invalid JSON' };
  }
}

/** Redacts API key values from a string (replaces all but last 4 chars). */
export function redactSecrets(input: string): string {
  // Match common API key patterns
  return input.replace(/((?:sk-|key-|api[_-]?key[=: ]+)[\w-]{8,})/gi, (match) => {
    if (match.length <= 8) return '***';
    return `***${match.slice(-4)}`;
  });
}
