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
 * Returns true if the given file path matches any unbypassable deny pattern.
 * Uses simple glob semantics: `**` matches any segment, `*` matches any
 * non-separator characters. Case-insensitive.
 *
 * Exported for testing; in production callers should use `isPathDenied`.
 */
export function matchDenyPattern(path: string, pattern: string): boolean {
  const normalized = path.toLowerCase();
  const pat = pattern.toLowerCase();

  // Expand glob to regex:
  //   **  → .*
  //   *   → [^/]*
  //   .   → escaped
  //   ~/  → anchor at home-prefix
  const escaped = pat
    .replace(/[.+^$()|[\]{}]/g, '\\$&')
    .replace(/\*\*/g, '__DOUBLESTAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__DOUBLESTAR__/g, '.*');
  const anchored = escaped.startsWith('~/')
    ? `(^|/)${escaped.slice(2)}$`
    : escaped.startsWith('/')
      ? `^${escaped}$`
      : `(^|/)${escaped}$`;

  const re = new RegExp(anchored);
  return re.test(normalized);
}

/** Returns true if the path hits any unbypassable pattern. */
export function isPathDenied(path: string): boolean {
  return UNBYPASSABLE_PATH_PATTERNS.some((p) => matchDenyPattern(path, p));
}

/** Returns true if the tool name is unconditionally denied. */
export function isToolDenied(toolName: string): boolean {
  return UNBYPASSABLE_TOOL_NAMES.includes(toolName);
}
