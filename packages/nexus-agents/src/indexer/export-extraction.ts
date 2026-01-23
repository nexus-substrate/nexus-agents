/**
 * nexus-agents/indexer - Export Extraction
 *
 * Export extraction utilities from TypeScript source files.
 *
 * (Source: Issue #240)
 */

import type { SourceFile } from 'ts-morph';
import type { ExportEntry } from './types.js';

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
