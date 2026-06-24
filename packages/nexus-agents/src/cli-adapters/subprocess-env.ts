/**
 * Environment-variable allowlist for spawned CLI subprocesses (#2865).
 *
 * `spawnSubprocess` previously passed the entire `process.env` to every
 * spawned CLI (claude / gemini / codex / opencode) — only `CLAUDECODE`
 * was stripped. That leaked cross-vendor API keys: the gemini CLI
 * received `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`, the codex CLI
 * received `GOOGLE_AI_API_KEY`, and so on. A buggy or malicious CLI
 * could exfiltrate keys it has no business seeing.
 *
 * `buildChildEnv()` constructs a curated child environment instead:
 * base infrastructure vars that every CLI needs, plus ONLY the spawned
 * CLI's own vendor credential(s).
 *
 * @module cli-adapters/subprocess-env
 */

import type { CliName } from './types.js';

/**
 * Marker stamped on EVERY spawned-CLI child env (#4033): how deep we are in the
 * nexus → CLI subprocess nesting. A child CLI (e.g. `opencode run`) that is
 * itself configured to auto-start a `nexus-agents --mode=server` MCP server
 * would otherwise deadlock the voter — the nested server attaches to the child's
 * stdio and blocks the child's MCP handshake, so the voter never returns its
 * JSON. The server bootstrap reads this marker and refuses to start when nested
 * (see `cli-server.ts`). Distinct from the codex-only `NEXUS_MCP_DEPTH` guard so
 * the two cannot interfere. `NEXUS_`-prefixed, so it survives the allowlist (and
 * the `=0` full-passthrough hatch) and reaches the grandchild MCP server.
 */
export const NEXUS_SUBPROCESS_DEPTH_ENV = 'NEXUS_SUBPROCESS_DEPTH';

/** Read the subprocess nesting depth from an env bag; clamps missing/junk to 0. */
export function readSubprocessDepth(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number.parseInt(env[NEXUS_SUBPROCESS_DEPTH_ENV] ?? '0', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

/** Exact-match infrastructure vars every spawned CLI legitimately needs. */
const BASE_ENV_EXACT: readonly string[] = [
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'LANG',
  'TERM',
  'TZ',
  'TMPDIR',
  'TEMP',
  'TMP',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'all_proxy',
  'NODE_OPTIONS',
  'NODE_PATH',
  'NODE_ENV',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
];

/** Prefix-match infrastructure var families. */
const BASE_ENV_PREFIXES: readonly string[] = [
  'LC_', // locale: LC_ALL, LC_CTYPE, …
  'NEXUS_', // nexus-agents config + nested-run credentials (a child may be a nested nexus-agents)
  'npm_config_', // npm/node resolution config: registry, proxy, …
];

/**
 * Per-CLI vendor credentials. The spawned CLI gets ONLY its own
 * vendor's key(s) — not every vendor's. `opencode` can route to any
 * provider via its config, so it gets the full set.
 */
const CLI_VENDOR_KEYS: Record<CliName, readonly string[]> = {
  claude: ['ANTHROPIC_API_KEY'],
  gemini: ['GOOGLE_AI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  codex: ['OPENAI_API_KEY'],
  opencode: [
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'GOOGLE_AI_API_KEY',
    'GEMINI_API_KEY',
    'GOOGLE_API_KEY',
    'OPENROUTER_API_KEY',
  ],
};

/**
 * Env var naming ADDITIONAL var names to forward to spawned CLIs
 * (comma/whitespace-separated). The granular alternative to the
 * `NEXUS_SUBPROCESS_ENV_ALLOWLIST=0` hammer: for a custom gateway whose auth key
 * is neither `NEXUS_`-prefixed nor a known vendor key (#4037), name it here to
 * forward ONLY that var while keeping full cross-vendor isolation for everything
 * else. `NEXUS_`-prefixed itself, so it also reaches nested runs.
 */
export const NEXUS_SUBPROCESS_EXTRA_ENV = 'NEXUS_SUBPROCESS_EXTRA_ENV';

/** Parse the operator-configured extra-forward var names (empty when unset). */
function readExtraEnvNames(env: NodeJS.ProcessEnv): readonly string[] {
  const raw = env[NEXUS_SUBPROCESS_EXTRA_ENV];
  if (raw === undefined || raw.trim() === '') return [];
  return raw
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * True if `key` is permitted for a CLI whose vendor keys are `vendorKeys`, plus
 * any operator-allowlisted `extraEnv` names (#4037).
 */
function isAllowed(
  key: string,
  vendorKeys: readonly string[],
  extraEnv: readonly string[]
): boolean {
  if (BASE_ENV_EXACT.includes(key)) return true;
  if (vendorKeys.includes(key)) return true;
  if (extraEnv.includes(key)) return true;
  return BASE_ENV_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/**
 * Builds the environment for a spawned CLI subprocess: base
 * infrastructure vars plus only `cliName`'s own vendor credentials.
 * Cross-vendor API keys are dropped (#2865).
 *
 * `CLAUDECODE` is never forwarded — a nested CLI seeing it would
 * believe it's already inside Claude Code, breaking nested sessions
 * (the pre-#2865 behavior also stripped it explicitly).
 *
 * Granular extension: {@link NEXUS_SUBPROCESS_EXTRA_ENV} forwards named extra
 * vars (e.g. a custom gateway key) while keeping cross-vendor isolation — prefer
 * it over the blunt `=0` hatch (#4037).
 *
 * Escape hatch: `NEXUS_SUBPROCESS_ENV_ALLOWLIST=0` restores the
 * pre-#2865 full-passthrough behavior (minus `CLAUDECODE`) — a
 * field un-break if the allowlist ever drops a var a CLI needs.
 */
export function buildChildEnv(cliName: CliName): NodeJS.ProcessEnv {
  const source = process.env;
  const childEnv: NodeJS.ProcessEnv = {};
  // Stamp the incremented nesting depth (#4033) LAST in both branches so it
  // overrides any inherited value rather than copying the parent's depth.
  const nextDepth = String(readSubprocessDepth(source) + 1);

  if (source['NEXUS_SUBPROCESS_ENV_ALLOWLIST'] === '0') {
    for (const [key, value] of Object.entries(source)) {
      if (value !== undefined && key !== 'CLAUDECODE') childEnv[key] = value;
    }
    childEnv[NEXUS_SUBPROCESS_DEPTH_ENV] = nextDepth;
    return childEnv;
  }

  const vendorKeys = CLI_VENDOR_KEYS[cliName];
  const extraEnv = readExtraEnvNames(source);
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (key === 'CLAUDECODE') continue;
    if (isAllowed(key, vendorKeys, extraEnv)) childEnv[key] = value;
  }
  childEnv[NEXUS_SUBPROCESS_DEPTH_ENV] = nextDepth;
  return childEnv;
}

/** Test/introspection accessor for the per-CLI vendor-key map. */
export function getCliVendorKeys(): Readonly<Record<CliName, readonly string[]>> {
  return CLI_VENDOR_KEYS;
}
