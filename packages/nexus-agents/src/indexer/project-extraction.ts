/**
 * nexus-agents/indexer - Project Extraction
 *
 * Project-level extraction and file entry creation.
 *
 * (Source: Issue #240)
 */

import { Project, type SourceFile } from 'ts-morph';
import * as path from 'node:path';
import { getTimeProvider } from '../core/index.js';
import type { FileEntry, ExtractorOptions } from './types.js';
import { DEFAULT_EXTRACTOR_OPTIONS } from './types.js';
import { detectFileCategory } from './category-detection.js';
import { extractExports } from './export-extraction.js';
import { extractDependencies } from './dependency-extraction.js';
import { extractDescription } from './description-extraction.js';

/**
 * Result of extracting a project.
 */
export interface ExtractionResult {
  /** Extracted file entries */
  readonly files: readonly FileEntry[];
  /** Any errors encountered */
  readonly errors: readonly string[];
  /** Duration in milliseconds */
  readonly durationMs: number;
}

/**
 * Extracts metadata from a single source file.
 */
export function extractFileEntry(
  sourceFile: SourceFile,
  rootDir: string,
  extractDescriptions: boolean
): FileEntry {
  const absolutePath = sourceFile.getFilePath();
  const relativePath = path.relative(rootDir, absolutePath);
  const lineCount = sourceFile.getEndLineNumber();

  const entry: FileEntry = {
    path: relativePath,
    lines: lineCount,
    category: detectFileCategory(relativePath, sourceFile),
    exports: extractExports(sourceFile),
    dependencies: extractDependencies(sourceFile),
  };

  if (extractDescriptions) {
    const desc = extractDescription(sourceFile);
    if (desc !== undefined) {
      (entry as { description: string }).description = desc;
    }
  }

  return entry;
}

/**
 * Processes source files and extracts metadata.
 *
 * Exclusion is enforced by ts-morph itself via negated glob patterns passed
 * to `addSourceFilesAtPaths` (see `extractProject`), so every source file
 * already in the project is eligible for extraction here.
 */
function processSourceFiles(
  project: Project,
  rootDir: string,
  extractDescriptions: boolean
): { files: FileEntry[]; errors: string[] } {
  const files: FileEntry[] = [];
  const errors: string[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();

    try {
      files.push(extractFileEntry(sourceFile, rootDir, extractDescriptions));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Error extracting ${filePath}: ${message}`);
    }
  }

  return { files, errors };
}

/**
 * Extracts metadata from all TypeScript files in a project.
 */
export function extractProject(options: Partial<ExtractorOptions> = {}): ExtractionResult {
  const opts: ExtractorOptions = { ...DEFAULT_EXTRACTOR_OPTIONS, ...options };
  const startTime = getTimeProvider().now();

  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });

  const rootDir = path.resolve(process.cwd(), opts.rootDir);
  const includePatterns = opts.include.map((p) => path.join(rootDir, p));
  // Negated glob patterns: ts-morph forwards these straight through to
  // tinyglobby, which honors `!`-prefixed entries as exclusions within the
  // same pattern list passed to `addSourceFilesAtPaths`.
  const excludePatterns = opts.exclude.map((p) => `!${path.join(rootDir, p)}`);

  try {
    project.addSourceFilesAtPaths([...includePatterns, ...excludePatterns]);
    const { files, errors } = processSourceFiles(project, rootDir, opts.extractDescriptions);
    return { files, errors, durationMs: getTimeProvider().now() - startTime };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      files: [],
      errors: [`Error loading project: ${message}`],
      durationMs: getTimeProvider().now() - startTime,
    };
  }
}
