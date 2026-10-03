/**
 * Shared pieces for listing the MCP servers a spawned CLI would load (#6970).
 *
 * Why: a read-only analysis run of codex still starts every MCP server the
 * CLI's own config registers. Those servers run OUTSIDE the CLI's sandbox, so
 * one that writes on startup (nexus-agents itself writes `.gitignore` and
 * `.nexus-agents/`) or exposes write-capable tools defeats the read-only
 * guarantee. Measured live on 2026-10-02: codex `-s read-only` left
 * `.gitignore` in the tree. The fix disables each configured server by name
 * for the run, so the adapter has to know every name the CLI would load.
 * (opencode showed the same defect and more; it refuses read-only analysis
 * instead, #6979.)
 *
 * Fail-closed contract: a config file that exists but cannot be read or
 * parsed is an error, never "no servers". The caller refuses the read-only
 * task rather than running it with servers it could not see.
 */

import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  openSync,
  readSync,
  statSync,
} from 'node:fs';
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
 * The largest config file the scan reads. Real CLI configs are a few KiB; the
 * cap keeps a hostile project file from exhausting memory in this process.
 */
export const MAX_CONFIG_BYTES = 1024 * 1024;

/**
 * Open flags: read-only, and non-blocking so a FIFO cannot stall the open.
 * `O_NONBLOCK` is absent on Windows, where `| undefined` contributes 0.
 */
const OPEN_FLAGS = fsConstants.O_RDONLY | fsConstants.O_NONBLOCK;

/** Up to `MAX_CONFIG_BYTES + 1` bytes of `fd`, so an oversized file is detectable. */
function readCapped(fd: number): Buffer {
  const buffer = Buffer.alloc(MAX_CONFIG_BYTES + 1);
  let total = 0;
  for (;;) {
    const n = readSync(fd, buffer, total, buffer.length - total, null);
    if (n === 0) return buffer.subarray(0, total);
    total += n;
    if (total === buffer.length) return buffer;
  }
}

/**
 * The text of `path`, `undefined` when no such file exists, or an error for
 * any other failure (permission denied, a directory in its place, ...).
 *
 * The scan runs on untrusted project trees, so the path must resolve (after
 * symlinks) to a regular file of at most {@link MAX_CONFIG_BYTES}. A symlink
 * to `/dev/zero`, a FIFO or a device would otherwise hang or exhaust memory
 * synchronously in this process. The type is checked on the opened
 * descriptor, so the file checked is the file read.
 */
export function readConfigIfPresent(path: string): Result<string | undefined, string> {
  let fd: number;
  try {
    fd = openSync(path, OPEN_FLAGS);
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return ok(undefined);
    return err(`cannot read ${path}: ${code ?? String(error)}`);
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) return err(`cannot read ${path}: not a regular file`);
    if (stat.size > MAX_CONFIG_BYTES) {
      return err(`cannot read ${path}: larger than ${String(MAX_CONFIG_BYTES)} bytes`);
    }
    const bytes = readCapped(fd);
    if (bytes.length > MAX_CONFIG_BYTES) {
      return err(`cannot read ${path}: larger than ${String(MAX_CONFIG_BYTES)} bytes`);
    }
    return ok(bytes.toString('utf8'));
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code;
    return err(`cannot read ${path}: ${code ?? String(error)}`);
  } finally {
    closeSync(fd);
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
