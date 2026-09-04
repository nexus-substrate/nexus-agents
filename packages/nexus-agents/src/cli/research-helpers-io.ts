/**
 * Research Registry I/O Operations
 *
 * File operations for loading and saving research registry YAML files.
 * Includes path traversal protection per Issue #353.
 *
 * @see docs/research/RESEARCH_INDEX.md
 * @see Issue #237 (Epic #225)
 * @see Issue #353 (Security - Path traversal fix)
 * @see Issue #5053 (Registry root resolution — workspace/repo root, not cwd)
 */

import * as fs from 'node:fs/promises';
import { realpathSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { resolveInsideRoot } from '../security/safe-path.js';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { Result } from '../core/index.js';
import { SecurityError, createLogger, getErrorMessage } from '../core/index.js';
import { getActiveWorkspaceRoot } from '../config/nexus-data-dir.js';
import { findRepoRoot } from '../config/repo-root-detection.js';
import { ParseError } from '../core/types/workflow.js';
import type { TechniquesRegistry, PapersRegistry } from './research-types.js';
import { ensureRegistryFile } from './research-scaffold.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Path to research registry directory relative to project root */
export const REGISTRY_PATH = 'docs/research/registry';

/** Filename for techniques registry */
export const TECHNIQUES_FILE = 'techniques.yaml';

/** Filename for papers registry */
export const PAPERS_FILE = 'papers.yaml';

// =============================================================================
// PROJECT ROOT
// =============================================================================

const logger = createLogger({ component: 'research-registry-root' });

/**
 * Per-process memo of the discovered registry root (#5053). The MCP server
 * answers every `research_*` call from one process, so the discovery walk
 * runs once; the memo also bounds the cwd-fallback warning to one emission.
 */
let memoisedRegistryRoot: string | undefined;
let warnedCwdFallback = false;

/** Test helper — clears the registry-root memo and the one-shot warning. */
export function _resetRegistryRootForTests(): void {
  memoisedRegistryRoot = undefined;
  warnedCwdFallback = false;
}

/** True iff `<dir>/docs/research/registry` exists as a directory. */
function hasRegistryDir(dir: string): boolean {
  try {
    return statSync(join(dir, REGISTRY_PATH)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Walks upward from `start` looking for the nearest ancestor (inclusive) that
 * already contains `docs/research/registry`. Mirrors `findRepoRoot`'s
 * defenses: bounded depth, stops at the filesystem root, and refuses to cross
 * a mount point so a sandboxed workdir cannot pick up a host-side registry.
 */
function findRegistryAncestor(start: string): string | null {
  let current: string;
  let startDev: number;
  try {
    current = realpathSync(start);
    startDev = statSync(current).dev;
  } catch {
    return null;
  }
  for (let depth = 0; depth < 64; depth++) {
    if (hasRegistryDir(current)) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    try {
      if (statSync(parent).dev !== startDev) return null;
    } catch {
      return null;
    }
    current = parent;
  }
  return null;
}

/**
 * Resolves the directory that owns `docs/research/registry` (#5053).
 *
 * Resolution order:
 *  1. An explicit `rootDir` argument wins outright (resolved, never memoised).
 *  2. The nearest ancestor of the active workspace root (MCP `roots`, #3991)
 *     — or of `process.cwd()` when none is set — that already contains
 *     `docs/research/registry`.
 *  3. Otherwise the enclosing git repo root via `findRepoRoot`, so the
 *     first-run scaffold (#2470) lands at the repo root rather than below it.
 *  4. Otherwise cwd, with a warning emitted once per process: nothing above
 *     cwd identifies a project, so cwd is a guess rather than a discovery.
 *
 * Steps 2–4 are memoised per process. Before this resolver every helper
 * defaulted to cwd, so a server started inside `packages/nexus-agents` read
 * (and scaffolded) a shadow registry there instead of the repo's.
 */
export function resolveRegistryRoot(rootDir?: string): string {
  if (rootDir !== undefined) return resolve(rootDir);
  if (memoisedRegistryRoot !== undefined) return memoisedRegistryRoot;

  const origin = getActiveWorkspaceRoot() ?? process.cwd();
  const discovered = findRegistryAncestor(origin) ?? findRepoRoot(origin);
  if (discovered !== null) {
    memoisedRegistryRoot = discovered;
    return discovered;
  }

  let fallback: string;
  try {
    fallback = realpathSync(origin);
  } catch {
    fallback = resolve(origin);
  }
  if (!warnedCwdFallback) {
    warnedCwdFallback = true;
    logger.warn(
      'No research registry or git repo found above the working directory; using cwd as the research registry root',
      { cwd: fallback, registryPath: REGISTRY_PATH }
    );
  }
  memoisedRegistryRoot = fallback;
  return fallback;
}

/**
 * Get the project root directory that owns the research registry.
 * Delegates to {@link resolveRegistryRoot} — no longer bare `process.cwd()`.
 */
export function getProjectRoot(): string {
  return resolveRegistryRoot();
}

// =============================================================================
// PATH VALIDATION
// =============================================================================

/**
 * Validates that a constructed path stays within the allowed root directory.
 * Prevents path traversal attacks (e.g., ../../../etc/passwd).
 *
 * @param constructedPath - The full path to validate
 * @param allowedRoot - The root directory that paths must be within
 * @returns Result with validated absolute path or SecurityError
 */
function validatePath(constructedPath: string, allowedRoot: string): Result<string, SecurityError> {
  const resolved = resolveInsideRoot(constructedPath, allowedRoot);
  if (resolved === null) {
    return {
      ok: false,
      error: new SecurityError('Path traversal detected: path escapes allowed root directory', {
        context: { constructedPath, allowedRoot: resolve(allowedRoot) },
      }),
    };
  }
  return { ok: true, value: resolved };
}

// =============================================================================
// LOAD OPERATIONS
// =============================================================================

/**
 * Load techniques registry from YAML file.
 * Validates path to prevent directory traversal attacks.
 *
 * @param rootDir - Project root directory (defaults to the resolved registry root, see {@link resolveRegistryRoot})
 * @returns Result with TechniquesRegistry or SecurityError/ParseError
 */
export async function loadTechniquesRegistry(
  rootDir?: string
): Promise<Result<TechniquesRegistry, SecurityError | ParseError>> {
  const root = resolveRegistryRoot(rootDir);
  const filePath = join(root, REGISTRY_PATH, TECHNIQUES_FILE);

  const pathValidation = validatePath(filePath, root);
  if (!pathValidation.ok) {
    return pathValidation;
  }

  // #2470: try to scaffold an empty techniques.yaml on first run so research_*
  // workflows don't error on a fresh install. No-op when file exists.
  // When scaffold refuses (e.g. <rootDir>/docs/ doesn't exist, or
  // NEXUS_NO_SCAFFOLD=1), fall through and let readFile produce the original
  // ENOENT error — that's the existing contract.
  await ensureRegistryFile(root, TECHNIQUES_FILE);

  try {
    const content = await fs.readFile(pathValidation.value, 'utf-8');
    return { ok: true, value: parseYaml(content) as TechniquesRegistry };
  } catch (error) {
    const message = getErrorMessage(error);
    return { ok: false, error: new ParseError(`Failed to load techniques registry: ${message}`) };
  }
}

/**
 * Load papers registry from YAML file.
 * Validates path to prevent directory traversal attacks.
 *
 * @param rootDir - Project root directory (defaults to the resolved registry root, see {@link resolveRegistryRoot})
 * @returns Result with PapersRegistry or SecurityError/ParseError
 */
export async function loadPapersRegistry(
  rootDir?: string
): Promise<Result<PapersRegistry, SecurityError | ParseError>> {
  const root = resolveRegistryRoot(rootDir);
  const filePath = join(root, REGISTRY_PATH, PAPERS_FILE);

  const pathValidation = validatePath(filePath, root);
  if (!pathValidation.ok) {
    return pathValidation;
  }

  // #2470: try to scaffold an empty papers.yaml on first run so research_*
  // workflows don't error on a fresh install. No-op when file exists; falls
  // through silently when scaffold refuses (no docs/ root, or NEXUS_NO_SCAFFOLD).
  await ensureRegistryFile(root, PAPERS_FILE);

  try {
    const content = await fs.readFile(pathValidation.value, 'utf-8');
    return { ok: true, value: parseYaml(content) as PapersRegistry };
  } catch (error) {
    const message = getErrorMessage(error);
    return { ok: false, error: new ParseError(`Failed to load papers registry: ${message}`) };
  }
}

// =============================================================================
// SAVE OPERATIONS
// =============================================================================

/**
 * Save techniques registry to YAML file.
 * Validates path to prevent directory traversal attacks.
 *
 * @param registry - The techniques registry to save
 * @param rootDir - Project root directory (defaults to the resolved registry root, see {@link resolveRegistryRoot})
 * @returns Result with void on success or SecurityError/ParseError on failure
 */
export async function saveTechniquesRegistry(
  registry: TechniquesRegistry,
  rootDir?: string
): Promise<Result<void, SecurityError | ParseError>> {
  const root = resolveRegistryRoot(rootDir);
  const filePath = join(root, REGISTRY_PATH, TECHNIQUES_FILE);

  const pathValidation = validatePath(filePath, root);
  if (!pathValidation.ok) {
    return pathValidation;
  }

  try {
    const content = stringifyYaml(registry, { lineWidth: 100 });
    await fs.writeFile(pathValidation.value, content, 'utf-8');
    return { ok: true, value: undefined };
  } catch (error) {
    const message = getErrorMessage(error);
    return { ok: false, error: new ParseError(`Failed to save techniques registry: ${message}`) };
  }
}

/**
 * Save papers registry to YAML file.
 * Validates path to prevent directory traversal attacks.
 *
 * @param registry - The papers registry to save
 * @param rootDir - Project root directory (defaults to the resolved registry root, see {@link resolveRegistryRoot})
 * @returns Result with void on success or SecurityError/ParseError on failure
 */
export async function savePapersRegistry(
  registry: PapersRegistry,
  rootDir?: string
): Promise<Result<void, SecurityError | ParseError>> {
  const root = resolveRegistryRoot(rootDir);
  const filePath = join(root, REGISTRY_PATH, PAPERS_FILE);

  const pathValidation = validatePath(filePath, root);
  if (!pathValidation.ok) {
    return pathValidation;
  }

  try {
    const content = stringifyYaml(registry, { lineWidth: 100 });
    await fs.writeFile(pathValidation.value, content, 'utf-8');
    return { ok: true, value: undefined };
  } catch (error) {
    const message = getErrorMessage(error);
    return { ok: false, error: new ParseError(`Failed to save papers registry: ${message}`) };
  }
}
