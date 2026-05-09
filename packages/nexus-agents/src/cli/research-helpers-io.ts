/**
 * Research Registry I/O Operations
 *
 * File operations for loading and saving research registry YAML files.
 * Includes path traversal protection per Issue #353.
 *
 * @see docs/research/RESEARCH_INDEX.md
 * @see Issue #237 (Epic #225)
 * @see Issue #353 (Security - Path traversal fix)
 */

import * as fs from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { resolveInsideRoot } from '../security/safe-path.js';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { Result } from '../core/index.js';
import { SecurityError, getErrorMessage } from '../core/index.js';
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

/**
 * Get the project root directory.
 * Note: Returns cwd since registry operations use explicit rootDir parameter
 */
export function getProjectRoot(): string {
  return process.cwd();
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
 * @param rootDir - Project root directory (defaults to cwd)
 * @returns Result with TechniquesRegistry or SecurityError/ParseError
 */
export async function loadTechniquesRegistry(
  rootDir?: string
): Promise<Result<TechniquesRegistry, SecurityError | ParseError>> {
  const root = rootDir ?? process.cwd();
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
 * @param rootDir - Project root directory (defaults to cwd)
 * @returns Result with PapersRegistry or SecurityError/ParseError
 */
export async function loadPapersRegistry(
  rootDir?: string
): Promise<Result<PapersRegistry, SecurityError | ParseError>> {
  const root = rootDir ?? process.cwd();
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
 * @param rootDir - Project root directory (defaults to cwd)
 * @returns Result with void on success or SecurityError/ParseError on failure
 */
export async function saveTechniquesRegistry(
  registry: TechniquesRegistry,
  rootDir?: string
): Promise<Result<void, SecurityError | ParseError>> {
  const root = rootDir ?? process.cwd();
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
 * @param rootDir - Project root directory (defaults to cwd)
 * @returns Result with void on success or SecurityError/ParseError on failure
 */
export async function savePapersRegistry(
  registry: PapersRegistry,
  rootDir?: string
): Promise<Result<void, SecurityError | ParseError>> {
  const root = rootDir ?? process.cwd();
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
