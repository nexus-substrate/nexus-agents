/**
 * Shared pieces for listing the MCP servers a spawned CLI would load (#6970).
 *
 * Why: a read-only analysis run of codex or opencode still starts every MCP
 * server the CLI's own config registers. Those servers run OUTSIDE the CLI's
 * sandbox and permission rules, so one that writes on startup (nexus-agents
 * itself writes `.gitignore` and `.nexus-agents/`) or exposes write-capable
 * tools defeats the read-only guarantee. Measured live on 2026-10-02: codex
 * `-s read-only` and opencode `OPENCODE_PERMISSION` both left `.gitignore` in
 * the tree. The fix disables each configured server by name for the run, so
 * the adapter has to know every name the CLI would load.
 *
 * Fail-closed contract: a config file that exists but cannot be read or
 * parsed is an error, never "no servers". The caller refuses the read-only
 * task rather than running it with servers it could not see.
 */

import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import type { Result } from '../core/index.js';
import { ok, err } from '../core/index.js';
import type { CliError, CliName, CliTask } from './types.js';
import { accessModeConflict } from './access-mode.js';
import { buildChildEnv } from './subprocess-env.js';
import { spawnCwd } from './subprocess-adapter.js';

/** Where a CLI would run: the child's environment and working directory. */
export interface McpScanContext {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly cwd: string;
}

/**
 * The text of `path`, `undefined` when no such file exists, or an error for
 * any other failure (permission denied, a directory in its place, ...).
 */
export function readConfigIfPresent(path: string): Result<string | undefined, string> {
  try {
    return ok(readFileSync(path, 'utf8'));
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return ok(undefined);
    return err(`cannot read ${path}: ${code ?? String(error)}`);
  }
}

/** Whether `dir` contains any of `markers` (a file or a directory). */
function hasMarker(dir: string, markers: readonly string[]): boolean {
  return markers.some((marker) => {
    try {
      statSync(join(dir, marker));
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * `cwd` and its ancestors, nearest first, up to and including the first one
 * that holds a project-root marker. With no marker anywhere the walk reaches
 * the filesystem root: listing a directory the CLI would skip only adds names
 * to disable, while missing one the CLI loads would leave a server running.
 */
export function projectDirs(cwd: string, markers: readonly string[]): readonly string[] {
  const dirs: string[] = [];
  let dir = resolve(cwd);
  for (;;) {
    dirs.push(dir);
    if (hasMarker(dir, markers)) return dirs;
    const parent = dirname(dir);
    if (parent === dir) return dirs;
    dir = parent;
  }
}

/** The child's home directory: its `HOME`, else this process's. */
export function childHome(env: McpScanContext['env']): string {
  const home = env['HOME'];
  return home !== undefined && home !== '' ? home : homedir();
}

/** A non-empty env value, or `undefined`. */
export function envValue(env: McpScanContext['env'], name: string): string | undefined {
  const value = env[name];
  return value !== undefined && value !== '' ? value : undefined;
}

/**
 * The scan context for a subprocess CLI task: the env the child is spawned
 * with and the directory it runs in, so the scan reads the same files the
 * CLI will.
 */
export function subprocessScanContext(
  cli: CliName,
  task: Pick<CliTask, 'options'>
): McpScanContext {
  return {
    env: buildChildEnv(cli),
    cwd: spawnCwd(task.options?.['workDir']) ?? process.cwd(),
  };
}

/** The refusal for a read-only task whose MCP config could not be listed. */
export function mcpScanRefusal(cli: CliName, reason: string): CliError {
  return accessModeConflict(
    cli,
    'read-only-analysis',
    `cannot list the MCP servers ${cli} would load, so they cannot be disabled (${reason})`
  );
}

/**
 * The scan's value, or a throw carrying the refusal message. For a command
 * builder, which runs after the refusal check passed: a config that broke in
 * between must still stop the spawn.
 */
export function scanOrThrow<T>(cli: CliName, scan: Result<T, string>): T {
  if (!scan.ok) throw new Error(mcpScanRefusal(cli, scan.error).message);
  return scan.value;
}
