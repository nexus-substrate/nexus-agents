/** The model-free Codex read-only sandbox advisory (#6841). */
import type { CodexSandboxPreflightResult } from '../cli-adapters/codex-sandbox-preflight.js';
import { colors, symbols } from './ansi-output.js';

/**
 * Unknown is a warning, never a successful measurement. Seats proceed with
 * their configured read-only sandbox in that case; known failures stop them.
 * No measurement is emitted when Codex is disabled or missing.
 */
export function formatCodexSandboxLine(
  result: CodexSandboxPreflightResult | undefined
): string | undefined {
  if (result === undefined) return undefined;
  if (result.status === 'ok') {
    return `${colors.green}${symbols.check}${colors.reset} Codex read-only sandbox: available`;
  }
  const text =
    result.status === 'broken'
      ? `unavailable — ${result.reason}; a running MCP server keeps this verdict until restarted`
      : `unknown — ${result.reason}; read-only execution proceeds with the configured sandbox`;
  return `${colors.yellow}${symbols.warn}${colors.reset} Codex read-only sandbox: ${text}`;
}
