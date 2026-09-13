/**
 * Tests for the `codex mcp-server` transport probe (#6119).
 *
 * Fixtures are the two help texts a real codex prints: 0.154.0 forwards
 * `mcp-server --help` to the top-level help (exit 0, lists only `mcp`), while
 * a codex that still ships the subcommand prints its own usage line.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  codexMcpServerAvailable,
  CodexMcpServerUnavailableError,
  CODEX_MCP_SERVER_UNAVAILABLE_REASON,
  type CodexMcpServerProbeExec,
} from './codex-mcp-server-probe.js';

/** What codex-cli 0.154.0 prints for `codex mcp-server --help` (measured). */
const HELP_0_154 = [
  'Codex CLI',
  '',
  'If no subcommand is specified, options will be forwarded to the interactive CLI.',
  '',
  'Usage: codex [OPTIONS] [PROMPT]',
  '',
  'Commands:',
  '  exec              Run Codex non-interactively [aliases: e]',
  '  mcp               Manage external MCP servers for Codex',
].join('\n');

/** What a codex that still ships the subcommand prints. */
const HELP_WITH_SUBCOMMAND = [
  '[experimental] Run the Codex MCP server',
  '',
  'Usage: codex mcp-server [OPTIONS]',
].join('\n');

function stubExec(result: { exitCode: number | null; stdout: string }): CodexMcpServerProbeExec {
  return vi.fn(() => result);
}

describe('codexMcpServerAvailable (#6119)', () => {
  it('runs `codex mcp-server --help` through the supplied exec', () => {
    const exec = stubExec({ exitCode: 0, stdout: HELP_WITH_SUBCOMMAND });
    codexMcpServerAvailable(exec);
    expect(exec).toHaveBeenCalledWith('codex', ['mcp-server', '--help']);
  });

  it('is unavailable when --help exits 0 but lists no mcp-server subcommand (codex 0.154)', () => {
    expect(codexMcpServerAvailable(stubExec({ exitCode: 0, stdout: HELP_0_154 }))).toBe(false);
  });

  it('is unavailable when the probe exits non-zero even if the text mentions the subcommand', () => {
    expect(codexMcpServerAvailable(stubExec({ exitCode: 2, stdout: HELP_WITH_SUBCOMMAND }))).toBe(
      false
    );
  });

  it('is unavailable when the binary cannot be spawned (exit code null)', () => {
    expect(codexMcpServerAvailable(stubExec({ exitCode: null, stdout: '' }))).toBe(false);
  });

  it('is available when --help exits 0 and prints the mcp-server usage', () => {
    expect(codexMcpServerAvailable(stubExec({ exitCode: 0, stdout: HELP_WITH_SUBCOMMAND }))).toBe(
      true
    );
  });

  it('does not treat the bare `mcp` subcommand as `mcp-server`', () => {
    // A word-boundary match is required: "mcp " must not satisfy "mcp-server".
    const stdout = 'Usage: codex [OPTIONS]\n  mcp    Manage external MCP servers\n  mcp-serve  x';
    expect(codexMcpServerAvailable(stubExec({ exitCode: 0, stdout }))).toBe(false);
  });

  it('re-runs an injected exec on every call (the per-process cache is for the default exec)', () => {
    const exec = stubExec({ exitCode: 0, stdout: HELP_WITH_SUBCOMMAND });
    codexMcpServerAvailable(exec);
    codexMcpServerAvailable(exec);
    expect(exec).toHaveBeenCalledTimes(2);
  });
});

describe('CodexMcpServerUnavailableError', () => {
  it('names the cause and the working alternative', () => {
    const error = new CodexMcpServerUnavailableError();
    expect(error.name).toBe('CodexMcpServerUnavailableError');
    expect(error.message).toContain(CODEX_MCP_SERVER_UNAVAILABLE_REASON);
    expect(error.message).toContain('codex exec');
  });
});
