/**
 * nexus-agents/cli-adapters - `codex mcp-server` transport probe (#6119)
 *
 * codex-cli 0.154.0 removed the `mcp-server` subcommand: `codex --help` lists
 * only `mcp` (manage external MCP servers), and `codex mcp-server` forwards to
 * the interactive CLI, which dies with `stdin is not a terminal` under a pipe.
 * The MCP transport (`CodexMcpAdapter`) spawns exactly that, so every codex
 * voter seat errored while `doctor` still printed "Ready (Codex mcp-server)"
 * — a verdict inferred from the install, not measured.
 *
 * This probe measures. It runs `codex mcp-server --help` with stdin CLOSED
 * (`stdio: ['ignore', 'pipe', 'pipe']`) so a codex that forwards to the
 * interactive CLI cannot block on a terminal, and reports the subcommand
 * available only when the process exits 0 AND its stdout names `mcp-server`.
 * On 0.154.0 the forwarded `--help` exits 0 with the TOP-LEVEL help, which
 * lists `mcp` but never `mcp-server` — hence both conditions.
 *
 * The default exec's verdict is cached per process: the binary does not
 * change under a running server, and the factory is synchronous and called on
 * every adapter construction.
 *
 * @module cli-adapters/codex-mcp-server-probe
 */

import { execFileSync } from 'node:child_process';
import { CLI_SUBPROCESS_TIMEOUTS } from '../config/timeouts.js';

/** What the probe needs back from running a command: exit status and stdout. */
export interface CodexMcpServerProbeResult {
  /** Exit code, or `null` when the process could not be spawned or was killed. */
  readonly exitCode: number | null;
  readonly stdout: string;
}

/**
 * Synchronous command runner the probe is written against. Injectable so the
 * verdict can be tested against recorded help texts without a codex binary.
 */
export type CodexMcpServerProbeExec = (
  command: string,
  args: readonly string[]
) => CodexMcpServerProbeResult;

/** One-line cause, shared by the doctor line and the typed error. */
export const CODEX_MCP_SERVER_UNAVAILABLE_REASON = 'codex-cli ≥0.154 has no mcp-server subcommand';

/**
 * Thrown when a caller demands the `mcp` codex transport explicitly and the
 * installed codex cannot serve it. Named so the cause is readable at the
 * throw site instead of surfacing later as a `stdin is not a terminal` exit
 * from a doomed `codex mcp-server` spawn.
 */
export class CodexMcpServerUnavailableError extends Error {
  constructor() {
    super(
      `Codex transport 'mcp' was requested but ${CODEX_MCP_SERVER_UNAVAILABLE_REASON}; ` +
        "use transport 'subprocess' (codex exec) or leave the transport unset to auto-select"
    );
    this.name = 'CodexMcpServerUnavailableError';
  }
}

const PROBE_ARGS: readonly string[] = ['mcp-server', '--help'];
/** Word-bounded so the sibling `mcp` subcommand in the top-level help cannot match. */
const SUBCOMMAND_PATTERN = /\bmcp-server\b/;

/** Run the probe command synchronously; a spawn failure or a timeout is `exitCode: null`. */
const defaultExec: CodexMcpServerProbeExec = (command, args) => {
  try {
    const stdout = execFileSync(command, [...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: CLI_SUBPROCESS_TIMEOUTS.statusProbeMs,
    });
    return { exitCode: 0, stdout };
  } catch (error: unknown) {
    const status = (error as { status?: unknown }).status;
    const stdout = (error as { stdout?: unknown }).stdout;
    return {
      exitCode: typeof status === 'number' ? status : null,
      stdout: typeof stdout === 'string' ? stdout : '',
    };
  }
};

let cachedDefaultVerdict: boolean | undefined;

/**
 * Whether the installed codex serves the `mcp-server` subcommand.
 *
 * With no argument the default exec runs once per process and the verdict is
 * cached. An injected exec is run on every call and never cached — the caller
 * owns it.
 */
export function codexMcpServerAvailable(exec?: CodexMcpServerProbeExec): boolean {
  if (exec !== undefined) return probe(exec);
  cachedDefaultVerdict ??= probe(defaultExec);
  return cachedDefaultVerdict;
}

function probe(exec: CodexMcpServerProbeExec): boolean {
  const { exitCode, stdout } = exec('codex', PROBE_ARGS);
  return exitCode === 0 && SUBCOMMAND_PATTERN.test(stdout);
}
