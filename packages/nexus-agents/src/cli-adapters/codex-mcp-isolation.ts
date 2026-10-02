/**
 * Disable every codex MCP server for a read-only analysis run (#6970).
 *
 * `codex exec -s read-only` sandboxes the model's own tools, but MCP servers
 * from codex's config start outside that sandbox. Measured live on codex-cli
 * 0.160.0: the nexus-agents server registered in `~/.codex/config.toml` wrote
 * `.gitignore` and `.nexus-agents/` into the tree on every read-only run.
 * `-c mcp_servers.<name>.enabled=false` per server made the run clean;
 * `-c mcp_servers={}` did not.
 *
 * Config layers read, as codex-cli 0.160.0 names them:
 * - system: `/etc/codex/config.toml` and the legacy `/etc/codex/managed_config.toml`
 * - user: `$CODEX_HOME/config.toml`, default `~/.codex/config.toml`
 * - project: `.codex/config.toml` in each directory from the cwd up to the
 *   project root (the first directory holding a `project_root_markers` entry,
 *   default `.git`). codex loads these only for a trusted project; this module
 *   does not decide trust, see {@link CodexMcpServer.transport}.
 *
 * NOT covered: MCP servers contributed by codex plugins and by cloud-managed
 * config. Neither is a file this module can read.
 */

import { join } from 'node:path';
import { parse as parseToml } from 'smol-toml';

import type { Result } from '../core/index.js';
import { ok, err } from '../core/index.js';
import { isRecord } from '../utils/type-coercion.js';
import {
  type McpScanContext,
  childHome,
  envValue,
  projectDirs,
  readConfigIfPresent,
} from './mcp-config-scan.js';

/** One MCP server codex's config registers. */
export interface CodexMcpServer {
  readonly name: string;
  /**
   * The transport key (`command` or `url`) and value, set only for a server
   * that no system or user config defines. codex rejects a `-c` override for
   * a server no loaded layer defines (`invalid transport`), and an untrusted
   * project's layer is not loaded; repeating the transport key makes the
   * override a complete, disabled definition either way.
   */
  readonly transport?: { readonly key: 'command' | 'url'; readonly value: unknown };
}

/** System config files, lowest precedence first. */
export const CODEX_SYSTEM_CONFIG_FILES: readonly string[] = [
  '/etc/codex/config.toml',
  '/etc/codex/managed_config.toml',
];

/** codex's default `project_root_markers`. */
const DEFAULT_PROJECT_ROOT_MARKERS: readonly string[] = ['.git'];

/**
 * A server name codex's `-c` key parser accepts as one dotted segment. codex
 * splits the key on `.`, so a name outside this set cannot be addressed and
 * the scan fails closed.
 */
const ADDRESSABLE_NAME = /^[A-Za-z0-9_-]+$/;

interface ParsedLayer {
  readonly servers: ReadonlyMap<string, CodexMcpServer['transport']>;
  readonly projectRootMarkers?: readonly string[];
}

function transportOf(name: string, entry: unknown): Result<CodexMcpServer['transport'], string> {
  if (!isRecord(entry)) return err(`mcp_servers.${name} is not a table`);
  if ('command' in entry) return ok({ key: 'command', value: entry['command'] });
  if ('url' in entry) return ok({ key: 'url', value: entry['url'] });
  return ok(undefined);
}

function parseServers(
  path: string,
  table: unknown
): Result<Map<string, CodexMcpServer['transport']>, string> {
  const servers = new Map<string, CodexMcpServer['transport']>();
  if (table === undefined) return ok(servers);
  if (!isRecord(table)) return err(`${path}: mcp_servers is not a table`);
  for (const [name, entry] of Object.entries(table)) {
    if (!ADDRESSABLE_NAME.test(name)) {
      return err(`${path}: MCP server name ${JSON.stringify(name)} cannot be addressed by -c`);
    }
    const transport = transportOf(name, entry);
    if (!transport.ok) return err(`${path}: ${transport.error}`);
    servers.set(name, transport.value);
  }
  return ok(servers);
}

function readMarkers(path: string, value: unknown): Result<readonly string[] | undefined, string> {
  if (value === undefined) return ok(undefined);
  if (Array.isArray(value) && value.every((m): m is string => typeof m === 'string')) {
    return ok(value);
  }
  return err(`${path}: project_root_markers is not an array of strings`);
}

/** One config file's servers; a missing file is an empty layer. */
function readLayer(path: string): Result<ParsedLayer, string> {
  const text = readConfigIfPresent(path);
  if (!text.ok) return text;
  if (text.value === undefined) return ok({ servers: new Map() });
  let doc: Record<string, unknown>;
  try {
    doc = parseToml(text.value);
  } catch (error: unknown) {
    return err(`cannot parse ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const servers = parseServers(path, doc['mcp_servers']);
  if (!servers.ok) return servers;
  const markers = readMarkers(path, doc['project_root_markers']);
  if (!markers.ok) return markers;
  return ok({
    servers: servers.value,
    ...(markers.value !== undefined && { projectRootMarkers: markers.value }),
  });
}

/** Read every layer in `paths`, stopping at the first failure. */
function readLayers(paths: readonly string[]): Result<ParsedLayer[], string> {
  const layers: ParsedLayer[] = [];
  for (const path of paths) {
    const layer = readLayer(path);
    if (!layer.ok) return layer;
    layers.push(layer.value);
  }
  return ok(layers);
}

/** The user config path the child would read. */
export function codexUserConfigPath(env: McpScanContext['env']): string {
  return join(envValue(env, 'CODEX_HOME') ?? join(childHome(env), '.codex'), 'config.toml');
}

/**
 * Every MCP server codex would load for a run in `ctx`, or an error when a
 * config file that exists cannot be read or parsed.
 */
export function scanCodexMcpServers(
  ctx: McpScanContext,
  systemFiles: readonly string[] = CODEX_SYSTEM_CONFIG_FILES
): Result<readonly CodexMcpServer[], string> {
  const always = readLayers([...systemFiles, codexUserConfigPath(ctx.env)]);
  if (!always.ok) return always;
  const markers =
    always.value.findLast((l) => l.projectRootMarkers !== undefined)?.projectRootMarkers ??
    DEFAULT_PROJECT_ROOT_MARKERS;
  // Nearest directory first, so the first definition seen wins below.
  const project = readLayers(
    projectDirs(ctx.cwd, markers).map((dir) => join(dir, '.codex', 'config.toml'))
  );
  if (!project.ok) return project;

  const baseNames = new Set(always.value.flatMap((l) => [...l.servers.keys()]));
  const projectOnly = new Map<string, CodexMcpServer['transport']>();
  for (const layer of project.value) {
    for (const [name, transport] of layer.servers) {
      if (!baseNames.has(name) && !projectOnly.has(name)) projectOnly.set(name, transport);
    }
  }
  return ok([
    ...[...baseNames].map((name) => ({ name })),
    ...[...projectOnly].map(([name, transport]) =>
      transport === undefined ? { name } : { name, transport }
    ),
  ]);
}

/** The `-c` overrides that disable `servers`, as `key → value`. */
export function codexMcpDisableConfig(
  servers: readonly CodexMcpServer[]
): Readonly<Record<string, unknown>> {
  const config: Record<string, unknown> = {};
  for (const server of servers) {
    config[`mcp_servers.${server.name}.enabled`] = false;
    if (server.transport !== undefined) {
      config[`mcp_servers.${server.name}.${server.transport.key}`] = server.transport.value;
    }
  }
  return config;
}

/**
 * `codex exec` argv that disables `servers`: one `-c key=value` pair per
 * override. Values are written as JSON, which codex parses as TOML (a JSON
 * string or array is a valid TOML basic string or array).
 */
export function codexMcpDisableArgs(servers: readonly CodexMcpServer[]): readonly string[] {
  return Object.entries(codexMcpDisableConfig(servers)).flatMap(([key, value]) => [
    '-c',
    `${key}=${JSON.stringify(value)}`,
  ]);
}
