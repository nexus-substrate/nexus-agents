/**
 * Research Registry I/O Operations
 *
 * File operations for loading and saving research registry YAML files.
 *
 * @see docs/research/RESEARCH_INDEX.md
 * @see Issue #237 (Epic #225)
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { TechniquesRegistry, PapersRegistry } from './research-types.js';

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
// LOAD OPERATIONS
// =============================================================================

/**
 * Load techniques registry from YAML file.
 */
export async function loadTechniquesRegistry(rootDir?: string): Promise<TechniquesRegistry> {
  const root = rootDir ?? process.cwd();
  const filePath = path.join(root, REGISTRY_PATH, TECHNIQUES_FILE);
  const content = await fs.readFile(filePath, 'utf-8');
  return parseYaml(content) as TechniquesRegistry;
}

/**
 * Load papers registry from YAML file.
 */
export async function loadPapersRegistry(rootDir?: string): Promise<PapersRegistry> {
  const root = rootDir ?? process.cwd();
  const filePath = path.join(root, REGISTRY_PATH, PAPERS_FILE);
  const content = await fs.readFile(filePath, 'utf-8');
  return parseYaml(content) as PapersRegistry;
}

// =============================================================================
// SAVE OPERATIONS
// =============================================================================

/**
 * Save techniques registry to YAML file.
 */
export async function saveTechniquesRegistry(
  registry: TechniquesRegistry,
  rootDir?: string
): Promise<void> {
  const root = rootDir ?? process.cwd();
  const filePath = path.join(root, REGISTRY_PATH, TECHNIQUES_FILE);
  const content = stringifyYaml(registry, { lineWidth: 100 });
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Save papers registry to YAML file.
 */
export async function savePapersRegistry(
  registry: PapersRegistry,
  rootDir?: string
): Promise<void> {
  const root = rootDir ?? process.cwd();
  const filePath = path.join(root, REGISTRY_PATH, PAPERS_FILE);
  const content = stringifyYaml(registry, { lineWidth: 100 });
  await fs.writeFile(filePath, content, 'utf-8');
}
