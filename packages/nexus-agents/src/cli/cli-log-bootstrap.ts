/**
 * cli-log-bootstrap — set the default log level for interactive CLI commands
 * before any subcommand handler emits its first info log.
 *
 * Source: Issue #2443 (round-14 onboarding audit). Running `nexus-agents vote`
 * (or any other interactive subcommand) used to flood the terminal with
 * info-level JSON logs from PreferenceRouter, LinUCB warm-up, and the config
 * loader before the human-readable output appeared. New users couldn't tell
 * what was an error and what was init noise.
 *
 * Mechanism:
 * - Calls `setGlobalLogLevel('warn')` on the logger module so every logger
 *   instance that hasn't been individually `setLevel`'d falls back to warn.
 *   Per-instance overrides (e.g. `--verbose` flow in cli-orchestrator.ts:97)
 *   still win.
 * - Imported FIRST in `cli.ts`. ESM imports execute their side-effects in
 *   source order; chunk-level `createLogger(...)` calls only construct
 *   logger objects (no `info()` calls fire until command execution), so
 *   the order of "chunk imports run" vs "bootstrap runs" doesn't matter as
 *   long as the bootstrap runs before the first `.info()` call.
 *
 * No-op when:
 *   - `NEXUS_LOG_LEVEL` is already set (operator override wins)
 *   - argv has no subcommand (MCP server stdio mode — Claude needs the JSON)
 *   - subcommand is in SERVER_COMMANDS (`server` synonym)
 *   - `--verbose` / `-v` / `--debug` is present (operator wants the noise)
 *
 * To turn the noise back on without `--verbose`, set `NEXUS_LOG_LEVEL=info`.
 */

import { argv, env } from 'node:process';
import { setGlobalLogLevel } from '../core/logger.js';

const SERVER_COMMANDS = new Set(['server']);
const VERBOSE_FLAGS = new Set(['--verbose', '-v', '--debug']);

function findSubcommand(args: readonly string[]): string | undefined {
  for (const a of args) {
    if (!a.startsWith('-')) return a;
  }
  return undefined;
}

function shouldQuiet(args: readonly string[]): boolean {
  // Operator override always wins.
  if (env['NEXUS_LOG_LEVEL'] !== undefined && env['NEXUS_LOG_LEVEL'] !== '') return false;

  const sub = findSubcommand(args);
  // No subcommand => MCP server stdio mode. Claude reads JSON; don't downgrade.
  if (sub === undefined) return false;
  if (SERVER_COMMANDS.has(sub)) return false;

  // --verbose / -v / --debug → user wants info-level logs back.
  for (const flag of args) {
    if (VERBOSE_FLAGS.has(flag)) return false;
  }

  return true;
}

/**
 * Apply the quiet default if applicable. Exported so unit tests can drive it
 * with synthetic argv without spawning a child process.
 */
export function applyCliLogDefault(args: readonly string[]): void {
  if (shouldQuiet(args)) {
    setGlobalLogLevel('warn');
  }
}

// Module-load side effect: cli.ts imports this FIRST.
applyCliLogDefault(argv.slice(2));
