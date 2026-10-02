/**
 * Disable every opencode MCP server for a read-only analysis run (#6970).
 *
 * `OPENCODE_PERMISSION` denies opencode's own edit, bash and webfetch tools,
 * but MCP servers from opencode's config start outside those rules. Measured
 * live on opencode 1.15.13: the nexus-agents server in
 * `~/.config/opencode/opencode.json` wrote `.gitignore` into the tree.
 * `OPENCODE_CONFIG_CONTENT={"mcp":{"<name>":{"enabled":false}}}` per server
 * made the run clean; `{"mcp":{}}` did not.
 *
 * Config sources read, each confirmed with `opencode debug config` on 1.15.13:
 * - global: `$XDG_CONFIG_HOME/opencode/` (default `~/.config/opencode/`)
 *   `config.json`, `opencode.json`, `opencode.jsonc`; and `~/.opencode/`
 *   `opencode.json`, `opencode.jsonc`
 * - `$OPENCODE_CONFIG` (a file) and `$OPENCODE_CONFIG_DIR/opencode.json{,c}`
 * - project: `opencode.json{,c}` and `.opencode/opencode.json{,c}` in each
 *   directory from the cwd up to the git root
 * - managed: `/etc/opencode/opencode.json{,c}`
 * - inline: `$OPENCODE_CONFIG_CONTENT`
 *
 * opencode accepts `{"enabled": false}` for a name no other source defines,
 * so listing a file opencode would skip is harmless.
 *
 * Refused rather than listed (the scan fails closed):
 * - a key containing `{env:` or `{file:`. opencode substitutes both in the
 *   raw config text BEFORE parsing, keys included, and resolves a relative
 *   `{file:}` against the config file's own directory for a file but against
 *   the cwd inside `OPENCODE_CONFIG_CONTENT`. The name this scan would read
 *   is not the name opencode loads, so the disable would miss the server.
 * - a `wellknown` credential in opencode's auth store (`OPENCODE_AUTH_CONTENT`,
 *   or `auth.json` / `account.json` under `$XDG_DATA_HOME/opencode/`, default
 *   `~/.local/share/opencode/`). opencode fetches config, MCP servers
 *   included, from that provider's remote `.well-known/opencode` on startup,
 *   which this module cannot read.
 */

import { join } from 'node:path';
import { parse as parseJsonc, printParseErrorCode, type ParseError } from 'jsonc-parser';

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

/** The env var opencode reads inline config from. */
export const OPENCODE_CONFIG_CONTENT_ENV = 'OPENCODE_CONFIG_CONTENT';

/** Managed (system) config files. */
export const OPENCODE_MANAGED_CONFIG_FILES: readonly string[] = [
  '/etc/opencode/opencode.json',
  '/etc/opencode/opencode.jsonc',
];

const CONFIG_NAMES = ['opencode.json', 'opencode.jsonc'] as const;

/** Every config file path opencode could load for a run in `ctx`. */
export function openCodeConfigPaths(
  ctx: McpScanContext,
  managedFiles: readonly string[] = OPENCODE_MANAGED_CONFIG_FILES
): readonly string[] {
  const home = childHome(ctx.env);
  const globalDir = join(envValue(ctx.env, 'XDG_CONFIG_HOME') ?? join(home, '.config'), 'opencode');
  const configFile = envValue(ctx.env, 'OPENCODE_CONFIG');
  const configDir = envValue(ctx.env, 'OPENCODE_CONFIG_DIR');
  const project = projectDirs(ctx.cwd, ['.git']).flatMap((dir) =>
    CONFIG_NAMES.flatMap((name) => [join(dir, name), join(dir, '.opencode', name)])
  );
  return [
    join(globalDir, 'config.json'),
    ...CONFIG_NAMES.map((name) => join(globalDir, name)),
    ...CONFIG_NAMES.map((name) => join(home, '.opencode', name)),
    ...(configFile !== undefined ? [configFile] : []),
    ...(configDir !== undefined ? CONFIG_NAMES.map((name) => join(configDir, name)) : []),
    ...project,
    ...managedFiles,
  ];
}

/** Parse opencode config text (JSON with comments and trailing commas). */
function parseConfig(source: string, text: string): Result<Record<string, unknown>, string> {
  const errors: ParseError[] = [];
  const doc: unknown = parseJsonc(text, errors, { allowTrailingComma: true });
  const first = errors[0];
  if (first !== undefined) {
    return err(
      `cannot parse ${source}: ${printParseErrorCode(first.error)} at offset ${String(first.offset)}`
    );
  }
  if (!isRecord(doc)) return err(`${source} is not a JSON object`);
  return ok(doc);
}

/** The text opencode replaces before parsing: `{env:NAME}` and `{file:path}`. */
const SUBSTITUTION = /\{(?:env|file):/i;

/**
 * The first object key anywhere in `value` that opencode would rewrite by
 * substitution, or `undefined`. Walks every depth: a substituted key can
 * rename a server, or produce the `mcp` key itself.
 */
function substitutedKey(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = substitutedKey(item);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  for (const [key, child] of Object.entries(value)) {
    if (SUBSTITUTION.test(key)) return key;
    const found = substitutedKey(child);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** The MCP server names one config document defines. */
function serverNames(source: string, doc: Record<string, unknown>): Result<string[], string> {
  const substituted = substitutedKey(doc);
  if (substituted !== undefined) {
    return err(
      `${source}: key ${JSON.stringify(substituted)} uses {env:} or {file:} substitution, ` +
        'so the name opencode loads cannot be known'
    );
  }
  const mcp = doc['mcp'];
  if (mcp === undefined) return ok([]);
  if (!isRecord(mcp)) return err(`${source}: "mcp" is not an object`);
  return ok(Object.keys(mcp));
}

function namesFromText(source: string, text: string): Result<string[], string> {
  const doc = parseConfig(source, text);
  return doc.ok ? serverNames(source, doc.value) : doc;
}

/** opencode's auth files, in its data directory. */
export function openCodeAuthPaths(env: McpScanContext['env']): readonly string[] {
  const dataDir = join(
    envValue(env, 'XDG_DATA_HOME') ?? join(childHome(env), '.local', 'share'),
    'opencode'
  );
  return [join(dataDir, 'auth.json'), join(dataDir, 'account.json')];
}

/** Whether any object at any depth of `value` is a `wellknown` credential. */
function hasWellKnown(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasWellKnown);
  if (!isRecord(value)) return false;
  if (value['type'] === 'wellknown') return true;
  return Object.values(value).some(hasWellKnown);
}

/**
 * An error when opencode's auth store holds a `wellknown` credential, whose
 * remote config this scan cannot read; also when a store that exists cannot
 * be read or parsed, since a credential in it cannot be ruled out.
 */
function wellKnownRefusal(env: McpScanContext['env']): Result<undefined, string> {
  const inline = envValue(env, 'OPENCODE_AUTH_CONTENT');
  const sources: [string, Result<string | undefined, string>][] =
    inline !== undefined
      ? [['OPENCODE_AUTH_CONTENT', ok(inline)]]
      : openCodeAuthPaths(env).map((path) => [path, readConfigIfPresent(path)]);
  for (const [source, text] of sources) {
    if (!text.ok) return text;
    if (text.value === undefined) continue;
    const doc = parseConfig(source, text.value);
    if (!doc.ok) return doc;
    if (hasWellKnown(doc.value)) {
      return err(
        `${source} holds a wellknown provider credential; opencode loads that provider's ` +
          'remote .well-known/opencode config, whose MCP servers cannot be listed'
      );
    }
  }
  return ok(undefined);
}

/**
 * Every MCP server name opencode could load for a run in `ctx`, or an error
 * when a config source that exists cannot be read or parsed, or when a
 * source this scan cannot read is in use.
 */
export function scanOpenCodeMcpServers(
  ctx: McpScanContext,
  managedFiles?: readonly string[]
): Result<readonly string[], string> {
  const remote = wellKnownRefusal(ctx.env);
  if (!remote.ok) return remote;
  const names = new Set<string>();
  for (const path of openCodeConfigPaths(ctx, managedFiles)) {
    const text = readConfigIfPresent(path);
    if (!text.ok) return text;
    if (text.value === undefined) continue;
    const found = namesFromText(path, text.value);
    if (!found.ok) return found;
    found.value.forEach((n) => names.add(n));
  }
  const inline = envValue(ctx.env, OPENCODE_CONFIG_CONTENT_ENV);
  if (inline !== undefined) {
    const found = namesFromText(OPENCODE_CONFIG_CONTENT_ENV, inline);
    if (!found.ok) return found;
    found.value.forEach((n) => names.add(n));
  }
  return ok([...names]);
}

/**
 * `OPENCODE_CONFIG_CONTENT` for a read-only run: `existing` (the value the
 * child would otherwise inherit, if any) with every server in `names` set to
 * `enabled: false`. The command's env replaces the inherited value, so the
 * inherited one is merged in rather than dropped.
 */
export function openCodeReadOnlyConfigContent(
  names: readonly string[],
  existing: string | undefined
): Result<string, string> {
  let base: Record<string, unknown> = {};
  if (existing !== undefined && existing !== '') {
    const parsed = parseConfig(OPENCODE_CONFIG_CONTENT_ENV, existing);
    if (!parsed.ok) return parsed;
    base = parsed.value;
  }
  const mcp: Record<string, unknown> = isRecord(base['mcp']) ? { ...base['mcp'] } : {};
  for (const name of names) {
    const entry = mcp[name];
    mcp[name] = { ...(isRecord(entry) ? entry : {}), enabled: false };
  }
  return ok(JSON.stringify({ ...base, mcp }));
}
