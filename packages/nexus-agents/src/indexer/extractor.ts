/**
 * nexus-agents/indexer - File Extractor
 *
 * Uses ts-morph to extract exports, imports, and metadata from TypeScript files.
 *
 * (Source: Issue #240)
 */

import { Project, SourceFile } from 'ts-morph';
import * as path from 'node:path';
import type {
  FileEntry,
  FileCategory,
  ExportEntry,
  DependencyEntry,
  ExtractorOptions,
} from './types.js';
import { DEFAULT_EXTRACTOR_OPTIONS } from './types.js';

// ============================================================================
// File Category Detection
// ============================================================================

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

// ============================================================================
// Export Extraction
// ============================================================================

/** Export collection state passed to helper functions. */
interface ExportState {
  readonly exports: ExportEntry[];
  readonly seenNames: Set<string>;
}

/** Adds an export entry if not already seen. */
function addExport(
  state: ExportState,
  name: string,
  kind: ExportEntry['kind'],
  reExportInfo?: { sourceModule: string }
): void {
  if (state.seenNames.has(name)) return;
  state.seenNames.add(name);
  const entry: ExportEntry = { name, kind, isReExport: reExportInfo !== undefined };
  if (reExportInfo !== undefined)
    (entry as { sourceModule: string }).sourceModule = reExportInfo.sourceModule;
  state.exports.push(entry);
}

/** Extracts function and class exports. */
function extractFunctionClassExports(sourceFile: SourceFile, state: ExportState): void {
  for (const fn of sourceFile.getFunctions()) {
    if (fn.isExported()) {
      const name = fn.getName();
      if (name !== undefined) addExport(state, name, 'function');
    }
  }
  for (const cls of sourceFile.getClasses()) {
    if (cls.isExported()) {
      const name = cls.getName();
      if (name !== undefined) addExport(state, name, 'class');
    }
  }
}

/** Extracts type, interface, and enum exports. */
function extractTypeExports(sourceFile: SourceFile, state: ExportState): void {
  for (const iface of sourceFile.getInterfaces()) {
    if (iface.isExported()) addExport(state, iface.getName(), 'interface');
  }
  for (const typeAlias of sourceFile.getTypeAliases()) {
    if (typeAlias.isExported()) addExport(state, typeAlias.getName(), 'type');
  }
  for (const enumDecl of sourceFile.getEnums()) {
    if (enumDecl.isExported()) addExport(state, enumDecl.getName(), 'enum');
  }
}

/** Extracts variable (const) exports. */
function extractVariableExports(sourceFile: SourceFile, state: ExportState): void {
  for (const varStmt of sourceFile.getVariableStatements()) {
    if (varStmt.isExported()) {
      for (const decl of varStmt.getDeclarations()) addExport(state, decl.getName(), 'const');
    }
  }
}

/** Extracts re-exports (export { foo } from './bar'). */
function extractReExports(sourceFile: SourceFile, state: ExportState): void {
  for (const exportDecl of sourceFile.getExportDeclarations()) {
    const moduleSpecifier = exportDecl.getModuleSpecifierValue();
    const namedExports = exportDecl.getNamedExports();
    const reExportInfo =
      moduleSpecifier !== undefined ? { sourceModule: moduleSpecifier } : undefined;
    for (const namedExport of namedExports) {
      const name = namedExport.getAliasNode()?.getText() ?? namedExport.getName();
      addExport(state, name, 'unknown', reExportInfo);
    }
    if (namedExports.length === 0 && reExportInfo !== undefined) {
      addExport(state, '*', 'unknown', reExportInfo);
    }
  }
}

/**
 * Extracts all exports from a source file.
 */
export function extractExports(sourceFile: SourceFile): ExportEntry[] {
  const state: ExportState = { exports: [], seenNames: new Set<string>() };
  extractFunctionClassExports(sourceFile, state);
  extractTypeExports(sourceFile, state);
  extractVariableExports(sourceFile, state);
  extractReExports(sourceFile, state);
  return state.exports;
}

// ============================================================================
// Dependency Extraction
// ============================================================================

/**
 * Determines if an import specifier is external (from node_modules).
 */
function isExternalImport(specifier: string): boolean {
  // Relative imports start with . or /
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    return false;
  }
  // Node built-ins
  if (specifier.startsWith('node:')) {
    return true;
  }
  // Everything else is external (npm packages)
  return true;
}

/**
 * Extracts all dependencies (imports) from a source file.
 */
export function extractDependencies(sourceFile: SourceFile): DependencyEntry[] {
  const deps: DependencyEntry[] = [];
  const seenSpecifiers = new Set<string>();

  for (const importDecl of sourceFile.getImportDeclarations()) {
    const specifier = importDecl.getModuleSpecifierValue();
    if (seenSpecifiers.has(specifier)) continue;
    seenSpecifiers.add(specifier);

    const imports: string[] = [];

    // Named imports
    const namedImports = importDecl.getNamedImports();
    for (const namedImport of namedImports) {
      imports.push(namedImport.getName());
    }

    // Default import
    const defaultImport = importDecl.getDefaultImport();
    if (defaultImport !== undefined) {
      imports.push(defaultImport.getText());
    }

    // Namespace import (import * as X)
    const namespaceImport = importDecl.getNamespaceImport();
    if (namespaceImport !== undefined) {
      imports.push(`* as ${namespaceImport.getText()}`);
    }

    deps.push({
      specifier,
      isExternal: isExternalImport(specifier),
      imports,
    });
  }

  return deps;
}

// ============================================================================
// Description Extraction
// ============================================================================

/** Result of processing a single line in JSDoc extraction. */
type LineResult = 'start' | 'end' | 'stop' | 'skip' | 'content';

/** Determines how to handle a line during JSDoc extraction. */
function classifyJsDocLine(trimmed: string, inComment: boolean): LineResult {
  if (trimmed.startsWith('/**')) return 'start';
  if (trimmed.endsWith('*/')) return 'end';
  if (!inComment && trimmed.length > 0 && !trimmed.startsWith('//')) return 'stop';
  if (!inComment) return 'skip';
  if (trimmed.startsWith('* @') || trimmed.startsWith('@')) return 'skip';
  return 'content';
}

/** Extracts content from a JSDoc comment line (strips leading * and whitespace). */
function extractJsDocLineContent(trimmed: string): string {
  return trimmed.startsWith('*') ? trimmed.slice(1).trim() : trimmed;
}

/** Truncates text to first sentence or max 150 chars. */
function truncateDescription(full: string): string {
  const firstSentence = full.split(/[.!?]/)[0];
  if (firstSentence !== undefined && firstSentence.length <= 150) return firstSentence.trim();
  return full.slice(0, 150).trim() + '...';
}

/**
 * Extracts a description from the file's leading comment or JSDoc.
 */
export function extractDescription(sourceFile: SourceFile): string | undefined {
  const lines = sourceFile.getFullText().split('\n');
  let inComment = false;
  const description: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const result = classifyJsDocLine(trimmed, inComment);

    if (result === 'start') {
      inComment = true;
      continue;
    }
    if (result === 'end' || result === 'stop') break;
    if (result === 'skip') continue;

    const content = extractJsDocLineContent(trimmed);
    if (content.length > 0) description.push(content);
  }

  if (description.length === 0) return undefined;
  return truncateDescription(description.join(' '));
}

// ============================================================================
// File Extraction
// ============================================================================

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

// ============================================================================
// Project Extraction
// ============================================================================

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
 * Checks if a file path matches any exclusion pattern.
 */
function shouldExcludeFile(filePath: string, excludePatterns: string[], rootDir: string): boolean {
  return excludePatterns.some((pattern) => {
    const patternBase = pattern.replace(/\*\*/g, '').replace(/\*/g, '');
    return filePath.includes(patternBase.replace(rootDir, '').replace(/^\//, ''));
  });
}

/**
 * Processes source files and extracts metadata.
 */
function processSourceFiles(
  project: Project,
  rootDir: string,
  excludePatterns: string[],
  extractDescriptions: boolean
): { files: FileEntry[]; errors: string[] } {
  const files: FileEntry[] = [];
  const errors: string[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();

    if (shouldExcludeFile(filePath, excludePatterns, rootDir)) {
      continue;
    }

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
  const startTime = Date.now();

  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });

  const rootDir = path.resolve(process.cwd(), opts.rootDir);
  const includePatterns = opts.include.map((p) => path.join(rootDir, p));
  const excludePatterns = opts.exclude.map((p) => path.join(rootDir, p));

  try {
    project.addSourceFilesAtPaths(includePatterns);
    const { files, errors } = processSourceFiles(
      project,
      rootDir,
      excludePatterns,
      opts.extractDescriptions
    );
    return { files, errors, durationMs: Date.now() - startTime };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      files: [],
      errors: [`Error loading project: ${message}`],
      durationMs: Date.now() - startTime,
    };
  }
}
