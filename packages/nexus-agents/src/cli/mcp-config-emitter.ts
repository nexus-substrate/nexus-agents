/**
 * MCP config emitter for `init --portable --mcp-config` (#2308, child of #2301).
 *
 * Emits a Claude Code repo-local `.mcp.json` at the workspace root that
 * registers a workspace-scoped nexus-agents MCP server. The server entry
 * pins `NEXUS_DATA_DIR` to the absolute path of the workspace's
 * `.nexus-agents/` directory so the harness uses workspace-local state.
 *
 * Why per-machine, not committable: the env var holds an absolute path
 * that won't survive the workspace being cloned to a different machine
 * or directory. The emitter ALWAYS appends `.mcp.json` to `.gitignore`
 * (when a `.git` dir is present) per the contrarian-narrowed scope
 * (#2308 vote) so the file stays per-machine even if the user later
 * forgets to gitignore it manually.
 *
 * Idempotency:
 * - File missing → write fresh.
 * - File present, no `nexus-agents` server entry → merge in.
 * - File present, matching `nexus-agents` entry → no-op.
 * - File present, differing `nexus-agents` entry → refuse unless `force`.
 *
 * @module cli/mcp-config-emitter
 */

import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

/** Filename of the Claude Code repo-local MCP config. */
export const MCP_CONFIG_FILENAME = '.mcp.json';
/** Server name registered by this emitter. */
export const NEXUS_SERVER_KEY = 'nexus-agents';

/** Shape of a single MCP server entry that this emitter produces/recognizes. */
export interface NexusMcpServerEntry {
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: Record<string, string>;
}

/** Top-level shape of `.mcp.json` (subset — preserves unknown keys on round-trip). */
interface McpConfigFile {
  mcpServers?: Record<string, NexusMcpServerEntry>;
  [key: string]: unknown;
}

/** Options accepted by {@link emitMcpConfig}. */
export interface EmitMcpConfigOptions {
  /** Workspace root where `.mcp.json` lives. */
  readonly workspaceDir: string;
  /** Absolute path of the workspace's nexus-agents data dir. */
  readonly dataDir: string;
  /**
   * Optional absolute path to a portable bin shim. When provided, the
   * emitted server entry's `command` field uses this path instead of the
   * bare `nexus-agents` (which depends on PATH). Pairs with
   * `init --portable --install` (#2311).
   */
  readonly commandPath?: string;
  /** Allow replacing a non-matching `nexus-agents` entry. Default false. */
  readonly force?: boolean;
  /** Report what would be done without writing. Default false. */
  readonly dryRun?: boolean;
}

/** Outcome of an emitMcpConfig invocation. */
export interface EmitMcpConfigResult {
  readonly success: boolean;
  readonly mcpConfigPath: string;
  /** True when this run actually wrote the file or merged into it. */
  readonly written: boolean;
  /** True when no change was needed (matching entry already present). */
  readonly alreadyMatched: boolean;
  /** True when the emitter appended an entry to .gitignore. */
  readonly gitignoreUpdated: boolean;
  readonly error: string | null;
}

/** Builds the canonical nexus-agents server entry. */
export function buildNexusServerEntry(dataDir: string, commandPath?: string): NexusMcpServerEntry {
  return {
    command: commandPath ?? 'nexus-agents',
    args: ['--mode=server'],
    env: { NEXUS_DATA_DIR: dataDir },
  };
}

/** Deep-equals comparator scoped to the shape this emitter produces. */
export function entriesEqual(a: NexusMcpServerEntry, b: NexusMcpServerEntry): boolean {
  if (a.command !== b.command) return false;
  if (a.args.length !== b.args.length) return false;
  for (let i = 0; i < a.args.length; i++) if (a.args[i] !== b.args[i]) return false;
  const aEnv = a.env ?? {};
  const bEnv = b.env ?? {};
  const aKeys = Object.keys(aEnv);
  const bKeys = Object.keys(bEnv);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) if (aEnv[k] !== bEnv[k]) return false;
  return true;
}

type LoadResult = { ok: true; value: McpConfigFile | undefined } | { ok: false; error: string };

/** Loads + parses .mcp.json. Returns ok:true with undefined when the file does not exist. */
function loadExistingConfig(path: string): LoadResult {
  if (!existsSync(path)) return { ok: true, value: undefined };
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, error: `${path}: top-level JSON must be an object` };
    }
    return { ok: true, value: parsed as McpConfigFile };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `${path}: invalid JSON — ${msg}` };
  }
}

/** Decides whether to write, no-op, or refuse based on existing state. */
type Decision =
  | { kind: 'write'; nextConfig: McpConfigFile }
  | { kind: 'noop' }
  | { kind: 'refuse'; reason: string };

function decideEmission(
  existing: McpConfigFile | undefined,
  desired: NexusMcpServerEntry,
  force: boolean
): Decision {
  if (existing === undefined) {
    return { kind: 'write', nextConfig: { mcpServers: { [NEXUS_SERVER_KEY]: desired } } };
  }
  const servers = existing.mcpServers ?? {};
  const current = servers[NEXUS_SERVER_KEY];
  if (current !== undefined && entriesEqual(current, desired)) {
    return { kind: 'noop' };
  }
  if (current !== undefined && !force) {
    return {
      kind: 'refuse',
      reason: `existing ${NEXUS_SERVER_KEY} entry differs; pass --force to overwrite`,
    };
  }
  const nextServers = { ...servers, [NEXUS_SERVER_KEY]: desired };
  return { kind: 'write', nextConfig: { ...existing, mcpServers: nextServers } };
}

/** Appends `.mcp.json` to the workspace's .gitignore (creating it if needed). */
function autoGitignoreMcpConfig(workspaceDir: string, dryRun: boolean): boolean {
  const gitDir = join(workspaceDir, '.git');
  if (!existsSync(gitDir)) return false;
  const gitignorePath = join(workspaceDir, '.gitignore');
  let existing = '';
  if (existsSync(gitignorePath)) {
    existing = readFileSync(gitignorePath, 'utf-8');
    const already = existing
      .split('\n')
      .some((l) => l.trim() === MCP_CONFIG_FILENAME || l.trim() === `/${MCP_CONFIG_FILENAME}`);
    if (already) return false;
  }
  if (!dryRun) {
    const sep = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
    appendFileSync(gitignorePath, `${sep}${MCP_CONFIG_FILENAME}\n`, 'utf-8');
  }
  return true;
}

/** Emits a workspace-local `.mcp.json` with the nexus-agents server entry. */
export function emitMcpConfig(options: EmitMcpConfigOptions): EmitMcpConfigResult {
  const mcpConfigPath = join(options.workspaceDir, MCP_CONFIG_FILENAME);
  const dryRun = options.dryRun === true;
  const force = options.force === true;
  const desired = buildNexusServerEntry(options.dataDir, options.commandPath);

  const loaded = loadExistingConfig(mcpConfigPath);
  if (!loaded.ok) return makeFailure(mcpConfigPath, loaded.error);

  const decision = decideEmission(loaded.value, desired, force);
  if (decision.kind === 'refuse') return makeFailure(mcpConfigPath, decision.reason);

  if (decision.kind === 'noop') {
    return makeSuccess({
      mcpConfigPath,
      written: false,
      alreadyMatched: true,
      gitignoreUpdated: false,
    });
  }

  if (!dryRun) {
    writeFileSync(mcpConfigPath, JSON.stringify(decision.nextConfig, null, 2) + '\n', 'utf-8');
  }
  const gitignoreUpdated = autoGitignoreMcpConfig(options.workspaceDir, dryRun);
  return makeSuccess({ mcpConfigPath, written: true, alreadyMatched: false, gitignoreUpdated });
}

function makeSuccess(opts: {
  mcpConfigPath: string;
  written: boolean;
  alreadyMatched: boolean;
  gitignoreUpdated: boolean;
}): EmitMcpConfigResult {
  return { success: true, error: null, ...opts };
}

function makeFailure(mcpConfigPath: string, error: string): EmitMcpConfigResult {
  return {
    success: false,
    mcpConfigPath,
    written: false,
    alreadyMatched: false,
    gitignoreUpdated: false,
    error,
  };
}
