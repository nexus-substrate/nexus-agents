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

/** True if `key` is permitted for a CLI whose vendor keys are `vendorKeys`. */
function isAllowed(key: string, vendorKeys: readonly string[]): boolean {
  if (BASE_ENV_EXACT.includes(key)) return true;
  if (vendorKeys.includes(key)) return true;
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
 * Escape hatch: `NEXUS_SUBPROCESS_ENV_ALLOWLIST=0` restores the
 * pre-#2865 full-passthrough behavior (minus `CLAUDECODE`) — a
 * field un-break if the allowlist ever drops a var a CLI needs.
 */
export function buildChildEnv(cliName: CliName): NodeJS.ProcessEnv {
  const source = process.env;
  const childEnv: NodeJS.ProcessEnv = {};

  if (source['NEXUS_SUBPROCESS_ENV_ALLOWLIST'] === '0') {
    for (const [key, value] of Object.entries(source)) {
      if (value !== undefined && key !== 'CLAUDECODE') childEnv[key] = value;
    }
    return childEnv;
  }

  const vendorKeys = CLI_VENDOR_KEYS[cliName];
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (key === 'CLAUDECODE') continue;
    if (isAllowed(key, vendorKeys)) childEnv[key] = value;
  }
  return childEnv;
}

/** Test/introspection accessor for the per-CLI vendor-key map. */
export function getCliVendorKeys(): Readonly<Record<CliName, readonly string[]>> {
  return CLI_VENDOR_KEYS;
}
