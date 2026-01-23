/**
 * nexus-agents/indexer - Category Detection
 *
 * File category detection utilities based on path and content.
 *
 * (Source: Issue #240)
 */

import type { SourceFile } from 'ts-morph';
import * as path from 'node:path';
import type { FileCategory } from './types.js';

/** File name suffix patterns mapped to categories. */
const FILE_SUFFIX_PATTERNS: ReadonlyArray<[string, FileCategory]> = [
  ['.test.ts', 'test'],
  ['.spec.ts', 'test'],
  ['-types.ts', 'types'],
  ['.types.ts', 'types'],
  ['-command.ts', 'cli'],
];

/** File name/directory patterns for category detection. */
const FILE_PATH_PATTERNS: ReadonlyArray<{
  test: (f: string, d: string) => boolean;
  category: FileCategory;
}> = [
  { test: (f) => f === 'index.ts', category: 'index' },
  { test: (_, d) => d.includes('/cli'), category: 'cli' },
  { test: (f, d) => d.includes('config') || f.includes('config'), category: 'config' },
  { test: (f) => f.includes('helper') || f.includes('util'), category: 'util' },
];

/** Detects category from file path patterns. */
function detectCategoryFromPath(fileName: string, dirName: string): FileCategory | undefined {
  for (const [suffix, category] of FILE_SUFFIX_PATTERNS) {
    if (fileName.endsWith(suffix)) return category;
  }
  for (const { test, category } of FILE_PATH_PATTERNS) {
    if (test(fileName, dirName)) return category;
  }
  return undefined;
}

/** Detects if file is types-only based on content. */
function isTypesOnlyFile(sourceFile: SourceFile): boolean {
  const typeCount = sourceFile.getTypeAliases().length + sourceFile.getInterfaces().length;
  const implCount =
    sourceFile.getFunctions().length +
    sourceFile.getClasses().length +
    sourceFile.getVariableDeclarations().length;
  return typeCount > 0 && implCount === 0;
}

/**
 * Detects the category of a file based on its path and content.
 */
export function detectFileCategory(filePath: string, sourceFile: SourceFile): FileCategory {
  const pathCategory = detectCategoryFromPath(path.basename(filePath), path.dirname(filePath));
  if (pathCategory !== undefined) return pathCategory;
  if (isTypesOnlyFile(sourceFile)) return 'types';
  return 'implementation';
}
