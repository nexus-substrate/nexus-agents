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
 * Refused rather than listed (the scan fails closed), since this module
 * cannot name the servers they add:
 * - plugins. A `plugins` table in any config layer with an entry not set
 *   `enabled = false`, or an installed plugin under `$CODEX_HOME/plugins/`
 *   that declares MCP servers (a `.mcp.json`, or `mcpServers` in its
 *   `.codex-plugin/`, `.claude-plugin/` or `.cursor-plugin/` `plugin.json`).
 * - cloud-managed config: a `cloud-config-bundle-cache.json` in `$CODEX_HOME`,
 *   which codex 0.160.0 writes for a workspace whose admin pushes config.
 *   A workspace account's FIRST run, before that cache exists, is not
 *   detectable from disk.
 */

import { readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
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
  /** Names in the layer's `plugins` table not explicitly disabled. */
  readonly enabledPlugins: readonly string[];
}

/** Plugin entries in a `plugins` table that are not `enabled = false`. */
function enabledPlugins(path: string, table: unknown): Result<readonly string[], string> {
  if (table === undefined) return ok([]);
  if (!isRecord(table)) return err(`${path}: plugins is not a table`);
  return ok(
    Object.entries(table)
      .filter(([, entry]) => !(isRecord(entry) && entry['enabled'] === false))
      .map(([name]) => name)
  );
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
  if (text.value === undefined) return ok({ servers: new Map(), enabledPlugins: [] });
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
  const plugins = enabledPlugins(path, doc['plugins']);
  if (!plugins.ok) return plugins;
  return ok({
    servers: servers.value,
    enabledPlugins: plugins.value,
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

/** The `CODEX_HOME` the child would use. */
function codexHome(env: McpScanContext['env']): string {
  return envValue(env, 'CODEX_HOME') ?? join(childHome(env), '.codex');
}

/** The user config path the child would read. */
export function codexUserConfigPath(env: McpScanContext['env']): string {
  return join(codexHome(env), 'config.toml');
}

/** The cloud-managed config cache codex 0.160.0 keeps in `CODEX_HOME`. */
export const CODEX_CLOUD_CONFIG_CACHE = 'cloud-config-bundle-cache.json';

/** Manifest directories codex reads a plugin's `plugin.json` from. */
const PLUGIN_MANIFEST_DIRS: ReadonlySet<string> = new Set([
  '.codex-plugin',
  '.claude-plugin',
  '.cursor-plugin',
]);

/** How deep the plugin walk goes: `cache/<marketplace>/<plugin>/<version>/<manifest dir>/`. */
const PLUGIN_WALK_DEPTH = 6;

/** Whether one plugin manifest declares MCP servers; an unreadable one counts. */
function manifestDeclaresMcp(path: string): Result<boolean, string> {
  const text = readConfigIfPresent(path);
  if (!text.ok) return text;
  if (text.value === undefined) return ok(false);
  let doc: unknown;
  try {
    doc = JSON.parse(text.value);
  } catch {
    return err(`cannot parse plugin manifest ${path}`);
  }
  return ok(isRecord(doc) && doc['mcpServers'] !== undefined);
}

/** Whether `path`, a directory entry, is a directory once symlinks resolve. */
function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** `dir`'s entry names; a missing directory has none. */
function listDir(dir: string): Result<readonly string[], string> {
  try {
    return ok(readdirSync(dir));
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return ok([]);
    return err(`cannot list ${dir}: ${code ?? String(error)}`);
  }
}

/** One entry of the plugin walk: the declaring file, or `undefined`. */
function pluginEntryMcp(
  dir: string,
  name: string,
  depth: number
): Result<string | undefined, string> {
  const path = join(dir, name);
  if (name === '.mcp.json') return ok(path);
  if (name === 'plugin.json' && PLUGIN_MANIFEST_DIRS.has(basename(dir))) {
    const declares = manifestDeclaresMcp(path);
    return declares.ok ? ok(declares.value ? path : undefined) : declares;
  }
  if (name === 'node_modules' || !isDirectory(path)) return ok(undefined);
  return findPluginMcp(path, depth + 1);
}

/**
 * The first installed plugin file under `dir` that declares MCP servers, or
 * `undefined`. Symlinked directories are followed (codex may follow them);
 * the depth bound keeps a symlink loop finite.
 */
function findPluginMcp(dir: string, depth: number): Result<string | undefined, string> {
  if (depth > PLUGIN_WALK_DEPTH) return ok(undefined);
  const entries = listDir(dir);
  if (!entries.ok) return entries;
  for (const name of entries.value) {
    const found = pluginEntryMcp(dir, name, depth);
    if (!found.ok || found.value !== undefined) return found;
  }
  return ok(undefined);
}

/**
 * An error when codex would load MCP servers from a source this module
 * cannot list: an enabled plugin entry, an installed plugin declaring MCP
 * servers, or cloud-managed config.
 */
function unlistableSourceRefusal(
  env: McpScanContext['env'],
  layers: readonly ParsedLayer[]
): Result<undefined, string> {
  const plugin = layers.flatMap((l) => l.enabledPlugins)[0];
  if (plugin !== undefined) {
    return err(`plugin ${JSON.stringify(plugin)} is enabled; its MCP servers cannot be listed`);
  }
  const home = codexHome(env);
  const declared = findPluginMcp(join(home, 'plugins'), 0);
  if (!declared.ok) return declared;
  if (declared.value !== undefined) {
    return err(`installed plugin declares MCP servers (${declared.value}); they cannot be listed`);
  }
  const cache = join(home, CODEX_CLOUD_CONFIG_CACHE);
  try {
    statSync(cache);
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return ok(undefined);
    return err(`cannot stat ${cache}: ${code ?? String(error)}`);
  }
  return err(`cloud-managed config is cached at ${cache}; its MCP servers cannot be listed`);
}

/**
 * Every MCP server codex would load for a run in `ctx`, or an error when a
 * config file that exists cannot be read or parsed, or when codex would load
 * servers from a source this module cannot list (plugins, cloud config).
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
  // Nearest directory first, so the first definition seen wins.
  const project = readLayers(
    projectDirs(ctx.cwd, markers).map((dir) => join(dir, '.codex', 'config.toml'))
  );
  if (!project.ok) return project;
  const unlistable = unlistableSourceRefusal(ctx.env, [...always.value, ...project.value]);
  if (!unlistable.ok) return unlistable;

  return ok(mergeServers(always.value, project.value));
}

/**
 * The servers of the always-loaded layers, then those only a project layer
 * defines (nearest first, so the first definition seen wins), with the
 * transport repeated for the latter.
 */
function mergeServers(
  always: readonly ParsedLayer[],
  project: readonly ParsedLayer[]
): readonly CodexMcpServer[] {
  const baseNames = new Set(always.flatMap((l) => [...l.servers.keys()]));
  const projectOnly = new Map<string, CodexMcpServer['transport']>();
  for (const layer of project) {
    for (const [name, transport] of layer.servers) {
      if (!baseNames.has(name) && !projectOnly.has(name)) projectOnly.set(name, transport);
    }
  }
  return [
    ...[...baseNames].map((name) => ({ name })),
    ...[...projectOnly].map(([name, transport]) =>
      transport === undefined ? { name } : { name, transport }
    ),
  ];
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
