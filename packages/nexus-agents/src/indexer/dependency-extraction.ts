/**
 * nexus-agents/indexer - Dependency Extraction
 *
 * Dependency and import extraction utilities.
 *
 * (Source: Issue #240)
 */

import type { SourceFile } from 'ts-morph';
import type { DependencyEntry } from './types.js';

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
