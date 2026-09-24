/**
 * nexus-agents/mcp - Policy Firewall Helpers
 *
 * Utility functions for path validation and argument extraction.
 *
 * (Source: OWASP ASVS 4.0, Authorization Controls)
 */

import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, sep } from 'node:path';
import { resolveInsideRoot } from '../../security/safe-path.js';

// =============================================================================
// Path Utility Functions
// =============================================================================

/**
 * Validates a path against allowed roots.
 *
 * @param targetPath - The path to validate
 * @param allowedPaths - Array of allowed root paths
 * @returns True if the path is within an allowed root
 */
export function isPathSafe(targetPath: string, allowedPaths: readonly string[]): boolean {
  // #5025: this used `normalizePath`, which collapses the DEFAULT allowlist
  // entry `'./'` to `'/'` — so `startsWith` was true for every absolute path
  // and the rule admitted `/etc/shadow` and `~/.ssh/id_ed25519`. A raw string
  // prefix also has no separator boundary, so a root of `/work` admitted
  // `/work-secrets`. Resolve both sides against cwd and require either an
  // exact match or a path-separator boundary. The containment check follows
  // symlinks, so a link inside a root whose target is outside it is refused.
  const resolvedTarget = resolve(targetPath);
  return allowedPaths.some((allowed) => resolveInsideRoot(resolvedTarget, allowed) !== null);
}

// Common path field names in priority order
const KNOWN_PATH_FIELDS: readonly string[] = [
  'path',
  'filePath',
  'file_path',
  'targetPath',
  'target_path',
  'targetFile',
  'target_file',
  'sourcePath',
  'source_path',
  'sourceFile',
  'source_file',
  'destinationPath',
  'destination_path',
  'destPath',
  'dest_path',
  'destFile',
  'dest_file',
  'outputPath',
  'output_path',
  'outputFile',
  'output_file',
  'outputDir',
  'output_dir',
  'inputPath',
  'input_path',
  'inputFile',
  'input_file',
  'inputDir',
  'input_dir',
  'planFile',
  'plan_file',
  'specFile',
  'spec_file',
  'feedAPath',
  'feedBPath',
  'projectDir',
  'project_dir',
  'workingDir',
  'working_dir',
  'workingDirectory',
  'working_directory',
  'baseDir',
  'base_dir',
  'rootDir',
  'root_dir',
  'relPath',
  'rel_path',
  'directory',
  'dir',
  'folder',
  'file',
  'filename',
  'fileName',
  'target',
  'paths',
  'files',
  'targetFiles',
];

/** Non-filesystem keys that end with path/file/dir but represent data models or other concepts. */
const NON_FS_PATH_KEYS = new Set([
  'keyPath',
  'key_path',
  'urlPath',
  'url_path',
  'jsonPath',
  'json_path',
  'xpath',
  'actionPath',
  'action_path',
]);

/** Pattern matching argument keys that indicate filesystem paths. */
const PATH_KEY_PATTERN = /(?:[pP]ath|[fF]ile|[dD]ir(?:ectory)?)$/;

function appendPathsFromValue(value: unknown, result: string[], seen: Set<string>): void {
  if (typeof value === 'string' && value.length > 0) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  } else if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string' && item.length > 0 && !seen.has(item)) {
        seen.add(item);
        result.push(item);
      }
    }
  }
}

/**
 * Extracts all filesystem paths from tool arguments.
 *
 * Checks known path field names in priority order as well as any argument
 * keys matching path/file/directory naming conventions.
 */
export function extractPathsFromArgs(args: unknown): string[] {
  if (args === null || typeof args !== 'object') {
    return [];
  }

  const argsObj = args as Record<string, unknown>;
  const result: string[] = [];
  const seen = new Set<string>();

  // Check known fields in priority order first
  for (const field of KNOWN_PATH_FIELDS) {
    if (field in argsObj) {
      appendPathsFromValue(argsObj[field], result, seen);
    }
  }

  // Also discover any additional path-like keys on the argument object
  for (const key of Object.keys(argsObj)) {
    if (!NON_FS_PATH_KEYS.has(key) && PATH_KEY_PATTERN.test(key)) {
      appendPathsFromValue(argsObj[key], result, seen);
    }
  }

  return result;
}

/**
 * Extracts path from tool arguments if present.
 * Returns the first extracted path in priority order, or undefined.
 */
export function extractPathFromArgs(args: unknown): string | undefined {
  const paths = extractPathsFromArgs(args);
  return paths.length > 0 ? paths[0] : undefined;
}

// =============================================================================
// Secret paths (#5108)
// =============================================================================

/**
 * File-path globs that are denied regardless of `allowedPaths`. Moved
 * verbatim from the access-constraint deriver's `UNBYPASSABLE_PATH_PATTERNS`
 * (#5108, panel option B): there they sat behind `checkAccess`, which had no
 * production caller, so none of them ever gated a real tool call.
 *
 * Glob-style: `**` spans path segments, `*` stays within one, `~/` is a
 * home-anchor prefix. Matching is case-insensitive to catch `~/.SSH`.
 */
const SECRET_PATH_PATTERNS: readonly string[] = [
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
 * Compiles one secret-path glob to an anchored regex at module load.
 *
 * `~/` and bare relative globs anchor at a segment boundary `(^|/)`, so
 * `~/.ssh/**` names ANY `.ssh/` directory, not only the current user's —
 * the deriver's semantics, kept on purpose: broader is the fail-closed side.
 * Absolute globs anchor at `^`. Inputs are this module's constants, never
 * user text, so the regexes are ReDoS-safe by construction.
 */
function compileSecretGlob(pattern: string): RegExp {
  const escaped = pattern
    .toLowerCase()
    .replace(/[\\.+^$()|[\]{}]/g, '\\$&')
    .replace(/\*\*/g, '__DOUBLESTAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__DOUBLESTAR__/g, '.*');
  if (escaped.startsWith('~/')) return new RegExp(`(^|/)${escaped.slice(2)}$`);
  if (escaped.startsWith('/')) return new RegExp(`^${escaped}$`);
  return new RegExp(`(^|/)${escaped}$`);
}

const COMPILED_SECRET_PATTERNS: ReadonlyArray<{
  readonly pattern: string;
  readonly regex: RegExp;
}> = SECRET_PATH_PATTERNS.map((pattern) => ({ pattern, regex: compileSecretGlob(pattern) }));

/**
 * Canonicalizes a tool-argument path before it is matched (#5108, contrarian
 * amendment): `~` → the home directory, `path.resolve` against cwd (collapses
 * `..`), then `realpath` when the file exists so a symlink is judged by where
 * it points. A missing file cannot be realpath'd; the resolved spelling is
 * matched instead — "cannot canonicalize" is never read as "allow".
 */
export function canonicalizeToolPath(raw: string): string {
  const expanded =
    raw === '~' ? homedir() : raw.startsWith('~/') ? homedir() + sep + raw.slice(2) : raw;
  const resolved = resolve(expanded);
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}

/**
 * The first secret-path glob a CANONICAL path matches, or `undefined`.
 * Callers canonicalize first ({@link canonicalizeToolPath}); matching a raw
 * spelling here is the defect the #5108 amendment exists to prevent.
 */
export function findSecretPathPattern(canonicalPath: string): string | undefined {
  const lowered = canonicalPath.toLowerCase();
  return COMPILED_SECRET_PATTERNS.find((c) => c.regex.test(lowered))?.pattern;
}
