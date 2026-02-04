/**
 * Research Sources Registry I/O
 *
 * Functions for loading, saving, and querying the sources.yaml registry.
 *
 * @module cli/research-helpers-sources-io
 * (Source: Research System Enhancement - Phase 3)
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { Result } from '../core/result.js';
import { REGISTRY_PATH, getProjectRoot } from './research-helpers-io.js';

// =============================================================================
// TYPES
// =============================================================================

/** Sources registry file name. */
const SOURCES_FILE = 'sources.yaml';

/** Source entry in sources.yaml. */
export interface SourceEntry {
  readonly name: string;
  readonly type: 'paper' | 'repository' | 'blog' | 'documentation';
  readonly url: string;
  readonly description: string;
  readonly added_date: string;
  readonly status: 'active' | 'archived' | 'pending-review';
  readonly tags: readonly string[];
}

/** Sources registry structure. */
export interface SourcesRegistry {
  readonly schema_version: string;
  readonly sources: Record<string, SourceEntry>;
}

/** Error for sources I/O operations. */
export interface SourcesIOError {
  readonly code: 'NOT_FOUND' | 'PARSE_ERROR' | 'WRITE_ERROR' | 'PATH_TRAVERSAL';
  readonly message: string;
}

// =============================================================================
// VALIDATION
// =============================================================================

/** Validates a file path is within allowed root. */
function validatePath(
  constructedPath: string,
  allowedRoot: string
): Result<string, SourcesIOError> {
  const resolved = path.resolve(constructedPath);
  const root = path.resolve(allowedRoot);
  if (!resolved.startsWith(root)) {
    return {
      ok: false,
      error: { code: 'PATH_TRAVERSAL', message: `Path ${resolved} is outside ${root}` },
    };
  }
  return { ok: true, value: resolved };
}

// =============================================================================
// LOAD / SAVE
// =============================================================================

/**
 * Load the sources registry from disk.
 *
 * @param rootDir - Optional root directory override
 * @returns Result containing the sources registry
 */
export async function loadSourcesRegistry(
  rootDir?: string
): Promise<Result<SourcesRegistry, SourcesIOError>> {
  const root = rootDir ?? getProjectRoot();
  const filePath = path.join(root, REGISTRY_PATH, SOURCES_FILE);
  const pathResult = validatePath(filePath, root);
  if (!pathResult.ok) return pathResult;

  try {
    const content = await fs.readFile(pathResult.value, 'utf-8');
    const parsed = parseYaml(content) as SourcesRegistry;
    return { ok: true, value: parsed };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // Return empty registry if file doesn't exist
      return {
        ok: true,
        value: { schema_version: '1.0', sources: {} },
      };
    }
    return {
      ok: false,
      error: {
        code: 'PARSE_ERROR',
        message: `Failed to load sources: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

/**
 * Save the sources registry to disk.
 *
 * @param registry - Sources registry to save
 * @param rootDir - Optional root directory override
 * @returns Result indicating success or failure
 */
export async function saveSourcesRegistry(
  registry: SourcesRegistry,
  rootDir?: string
): Promise<Result<void, SourcesIOError>> {
  const root = rootDir ?? getProjectRoot();
  const filePath = path.join(root, REGISTRY_PATH, SOURCES_FILE);
  const pathResult = validatePath(filePath, root);
  if (!pathResult.ok) return pathResult;

  try {
    const yaml = stringifyYaml(registry, { indent: 2 });
    await fs.writeFile(pathResult.value, yaml, 'utf-8');
    return { ok: true, value: undefined };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'WRITE_ERROR',
        message: `Failed to save sources: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

/**
 * Check if a source already exists in the registry.
 *
 * @param url - Source URL to check
 * @param rootDir - Optional root directory override
 * @returns true if source exists
 */
export async function sourceExistsInRegistry(url: string, rootDir?: string): Promise<boolean> {
  const result = await loadSourcesRegistry(rootDir);
  if (!result.ok) return false;

  return Object.values(result.value.sources).some((s) => s.url === url);
}

/**
 * Add a source to the registry.
 *
 * @param id - Source identifier
 * @param entry - Source entry to add
 * @param rootDir - Optional root directory override
 * @returns Result indicating success or failure
 */
export async function addSourceToRegistry(
  id: string,
  entry: SourceEntry,
  rootDir?: string
): Promise<Result<void, SourcesIOError>> {
  const loadResult = await loadSourcesRegistry(rootDir);
  if (!loadResult.ok) return loadResult;

  const registry = loadResult.value;
  const updatedSources = { ...registry.sources, [id]: entry };
  const updatedRegistry: SourcesRegistry = {
    ...registry,
    sources: updatedSources,
  };

  return saveSourcesRegistry(updatedRegistry, rootDir);
}
