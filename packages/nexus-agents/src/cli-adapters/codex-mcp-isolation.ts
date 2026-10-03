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
 *   does not decide trust, see {@link CodexMcpServer.transportKey}.
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

import { readdirSync, realpathSync, statSync } from 'node:fs';
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

/** The key that selects an MCP server's transport in codex config. */
type TransportKey = 'command' | 'url';

/** One MCP server codex's config registers. */
export interface CodexMcpServer {
  readonly name: string;
  /**
   * The transport key (`command` or `url`), set only for a server that no
   * system or user config defines. codex rejects a `-c` override for a server
   * no loaded layer defines (`invalid transport`), and an untrusted project's
   * layer is not loaded; repeating the transport key makes the override a
   * complete, disabled definition either way.
   *
   * Only the key is kept: the override repeats it with
   * {@link CODEX_DISABLED_TRANSPORT_PLACEHOLDER}, never the configured value
   * (#6978). A configured url or command can embed a credential, and `-c`
   * values sit in the child's argv, readable via `ps` and `/proc`. Measured
   * live on codex-cli 0.160.0: a placeholder value with `enabled=false`
   * passes validation and starts nothing, for a trusted project (whose own
   * definition it overrides) and an untrusted one alike.
   */
  readonly transportKey?: TransportKey;
}

/**
 * The value a disabled project-only server's transport key is repeated with
 * (#6978). Never started: the same override sets `enabled = false`. `.invalid`
 * is a reserved TLD (RFC 2606), so the url cannot resolve even if it were.
 */
export const CODEX_DISABLED_TRANSPORT_PLACEHOLDER: Readonly<Record<TransportKey, string>> = {
  command: 'nexus-agents-disabled-mcp-server',
  url: 'http://disabled.invalid/',
};

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
  readonly servers: ReadonlyMap<string, TransportKey | undefined>;
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

/** The server's transport key; its value is deliberately not read (#6978). */
function transportOf(name: string, entry: unknown): Result<TransportKey | undefined, string> {
  if (!isRecord(entry)) return err(`mcp_servers.${name} is not a table`);
  if ('command' in entry) return ok('command');
  if ('url' in entry) return ok('url');
  return ok(undefined);
}

function parseServers(
  path: string,
  table: unknown
): Result<Map<string, TransportKey | undefined>, string> {
  const servers = new Map<string, TransportKey | undefined>();
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

/**
 * How deep the plugin walk goes before it refuses: plugin roots sit at
 * `cache/<marketplace>/<plugin>/<version>/`, depth 4 below `plugins/`.
 */
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

/**
 * The declaring file in a plugin root (a directory holding `.mcp.json` or a
 * manifest directory), or `undefined`. The root's other content (skills,
 * assets, scripts) is not walked: codex reads declarations only from here.
 */
function pluginRootMcp(dir: string, names: readonly string[]): Result<string | undefined, string> {
  if (names.includes('.mcp.json')) return ok(join(dir, '.mcp.json'));
  for (const name of names.filter((n) => PLUGIN_MANIFEST_DIRS.has(n))) {
    const path = join(dir, name, 'plugin.json');
    const declares = manifestDeclaresMcp(path);
    if (!declares.ok) return declares;
    if (declares.value) return ok(path);
  }
  return ok(undefined);
}

/**
 * The first installed plugin file under `dir` that declares MCP servers, or
 * `undefined`. Symlinked directories are followed (codex may follow them).
 * Fails closed: a directory deeper than {@link PLUGIN_WALK_DEPTH} without a
 * plugin root, or a symlink loop, is an error rather than "no MCP", since a
 * declaration past it would go unseen. `ancestors` holds the real paths on
 * the current branch.
 */
function findPluginMcp(
  dir: string,
  depth: number,
  ancestors: ReadonlySet<string> = new Set()
): Result<string | undefined, string> {
  const entries = listDir(dir);
  if (!entries.ok) return entries;
  if (entries.value.length === 0) return ok(undefined);
  if (entries.value.some((n) => n === '.mcp.json' || PLUGIN_MANIFEST_DIRS.has(n))) {
    return pluginRootMcp(dir, entries.value);
  }
  const branch = descendBranch(dir, depth, ancestors);
  if (!branch.ok) return branch;
  for (const name of entries.value) {
    const path = join(dir, name);
    if (!isDirectory(path)) continue;
    const found = findPluginMcp(path, depth + 1, branch.value);
    if (!found.ok || found.value !== undefined) return found;
  }
  return ok(undefined);
}

/**
 * The ancestor set for walking below `dir`, or an error when the walk must
 * not go further: `dir` repeats an ancestor (a symlink loop) or lies past
 * {@link PLUGIN_WALK_DEPTH}.
 */
function descendBranch(
  dir: string,
  depth: number,
  ancestors: ReadonlySet<string>
): Result<ReadonlySet<string>, string> {
  let real: string;
  try {
    real = realpathSync(dir);
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code;
    return err(`cannot resolve ${dir}: ${code ?? String(error)}`);
  }
  if (ancestors.has(real)) return err(`symlink loop in the plugin tree at ${dir}`);
  if (depth > PLUGIN_WALK_DEPTH) {
    return err(`plugin tree deeper than ${String(PLUGIN_WALK_DEPTH)} levels at ${dir}`);
  }
  return ok(new Set(ancestors).add(real));
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
 * transport key kept for the latter.
 */
function mergeServers(
  always: readonly ParsedLayer[],
  project: readonly ParsedLayer[]
): readonly CodexMcpServer[] {
  const baseNames = new Set(always.flatMap((l) => [...l.servers.keys()]));
  const projectOnly = new Map<string, TransportKey | undefined>();
  for (const layer of project) {
    for (const [name, transport] of layer.servers) {
      if (!baseNames.has(name) && !projectOnly.has(name)) projectOnly.set(name, transport);
    }
  }
  return [
    ...[...baseNames].map((name) => ({ name })),
    ...[...projectOnly].map(([name, transportKey]) =>
      transportKey === undefined ? { name } : { name, transportKey }
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
    if (server.transportKey !== undefined) {
      config[`mcp_servers.${server.name}.${server.transportKey}`] =
        CODEX_DISABLED_TRANSPORT_PLACEHOLDER[server.transportKey];
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
