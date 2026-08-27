/**
 * Access Constraint Deriver — Unbypassable denylist (#1977 condition 3).
 *
 * Hardcoded patterns that no LLM-derived policy may override. Applied FIRST
 * in the enforcer, before checking the per-task policy. If the LLM (or a
 * malicious user objective) produces a policy that would allow access to
 * `.env`, SSH keys, cloud credentials, or similar, the denylist still wins.
 *
 * This exists because the LLM deriver is the weakest link — a user objective
 * that says "I need to view my AWS credentials to debug" would otherwise
 * produce a policy allowing `~/.aws/**`. The denylist refuses regardless.
 *
 * REACH (#5022): "unbypassable" describes precedence WITHIN `checkAccess`, not
 * coverage of the process. `isToolDenied` / `isPathDenied` have exactly one
 * caller each — `checkAccess` — which is only entered when a derived policy is
 * in AsyncLocalStorage. That is not the case at inbound MCP dispatch, so these
 * patterns do not currently gate tool calls arriving over the MCP transport.
 * Which boundary they should gate is the open question in #5022.
 *
 * @module security/access-constraint-deriver/denylist
 */

/**
 * File-path patterns that are unconditionally denied. Glob-style wildcards.
 * All matching is case-insensitive to catch `~/.SSH` and similar.
 */
export const UNBYPASSABLE_PATH_PATTERNS: readonly string[] = [
  // Environment files
  '.env',
  '.env.*',
  '**/.env',
  '**/.env.*',

  // SSH credentials
  '~/.ssh/**',
  '**/ssh/id_*',
  '**/*_rsa',
  '**/*_ed25519',
  '**/*.pem',

  // Cloud credentials
  '~/.aws/**',
  '~/.azure/**',
  '~/.gcp/**',
  '~/.config/gcloud/**',
  '~/.kube/config',

  // Unix secret files
  '/etc/shadow',
  '/etc/sudoers',
  '/etc/sudoers.d/**',

  // Common secret file patterns
  '**/secrets.*',
  '**/credentials.*',
  '**/private_key.*',
  '**/id_rsa*',
];

/**
 * Tool names that are unconditionally denied regardless of derived policy.
 * These are tools that should never be callable during automated agent
 * dispatch — they require explicit human action.
 */
export const UNBYPASSABLE_TOOL_NAMES: readonly string[] = [
  // Destructive git operations
  'git_push_force',
  'git_reset_hard',
  'git_branch_delete_force',
  'git_clean_force',

  // Destructive filesystem
  'rm_recursive_force',
  'chmod_recursive',

  // Identity / auth mutations
  'ssh_add_key',
  'gpg_add_key',
  'npm_publish_force',

  // Remote destruction
  'github_repo_delete',
  'github_org_transfer',
  'aws_account_close',
];

/**
 * Compiles a glob pattern to a regex at module-load time.
 * Supports: `**` (any path segments), `*` (any non-separator chars),
 * `~/` (home-anchor prefix). All other regex metachars escaped.
 *
 * Regexes built here come from the hardcoded `UNBYPASSABLE_PATH_PATTERNS`
 * constant — never from user input — so they are ReDoS-safe by construction.
 */
function compileGlobToRegex(pattern: string): RegExp {
  const pat = pattern.toLowerCase();
  // Escape regex metacharacters INCLUDING backslash (per CodeQL — without
  // backslash in the class, a `\` in input would leak into the regex output
  // unescaped). Do NOT escape `*` here — it's a glob wildcard that the
  // subsequent replaces expand into regex wildcards.
  const escaped = pat
    .replace(/[\\.+^$()|[\]{}]/g, '\\$&')
    .replace(/\*\*/g, '__DOUBLESTAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__DOUBLESTAR__/g, '.*');
  const anchored = escaped.startsWith('~/')
    ? `(^|/)${escaped.slice(2)}$`
    : escaped.startsWith('/')
      ? `^${escaped}$`
      : `(^|/)${escaped}$`;
  return new RegExp(anchored);
}

/**
 * Precompiled regexes for every unbypassable path pattern, computed once
 * at module load. Static inputs → no ReDoS surface.
 */
const COMPILED_PATH_PATTERNS: ReadonlyArray<{
  readonly pattern: string;
  readonly regex: RegExp;
}> = UNBYPASSABLE_PATH_PATTERNS.map((pattern) => ({
  pattern,
  regex: compileGlobToRegex(pattern),
}));

/**
 * Returns true if a lowercased file path matches the given pattern.
 * Exported for tests; production code should use `isPathDenied`.
 */
export function matchDenyPattern(path: string, pattern: string): boolean {
  const normalized = path.toLowerCase();
  const compiled = COMPILED_PATH_PATTERNS.find((c) => c.pattern === pattern);
  if (compiled !== undefined) return compiled.regex.test(normalized);
  // Fallback for ad-hoc test patterns not in the static list.
  return compileGlobToRegex(pattern).test(normalized);
}

/** Returns true if the path hits any unbypassable pattern. */
export function isPathDenied(path: string): boolean {
  const normalized = path.toLowerCase();
  return COMPILED_PATH_PATTERNS.some((c) => c.regex.test(normalized));
}

/** Returns true if the tool name is unconditionally denied. */
export function isToolDenied(toolName: string): boolean {
  return UNBYPASSABLE_TOOL_NAMES.includes(toolName);
}
