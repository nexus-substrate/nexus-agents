/**
 * AST-based parser for the registered MCP tool-name list (#3596).
 *
 * `inject-governance.ts` previously scraped tool names with a line-oriented regex
 * over the `TOOL_MANIFEST` literal. That cannot read a *derived* value and is
 * fragile to formatting (comments between elements, single-line arrays, quote
 * style). This walks the TypeScript AST instead: it finds the canonical
 * `TOOL_MANIFEST` array (or, for pre-#3566 checkouts, `REGISTERED_TOOL_NAMES`, or
 * the legacy inline `tools: [...]` property) and returns its string-literal
 * elements in source order.
 *
 * Pure + side-effect-free so it is unit-testable in isolation (the parent script
 * runs its CLI at import time, so the parser lives here, not there).
 *
 * @module scripts/parse-tool-manifest
 */

import * as ts from 'typescript';

/** Variable-declaration names that hold the tool list, in priority order. */
const MANIFEST_VAR_NAMES = ['TOOL_MANIFEST', 'REGISTERED_TOOL_NAMES'] as const;

/** Unwrap `as const` / type assertions, then read an array literal's string elements. */
function readStringArray(expr: ts.Expression | undefined): string[] | undefined {
  let node = expr;
  while (node !== undefined && ts.isAsExpression(node)) {
    node = node.expression;
  }
  if (node === undefined || !ts.isArrayLiteralExpression(node)) return undefined;
  const names: string[] = [];
  for (const element of node.elements) {
    // isStringLiteralLike covers both '…'/"…" and `…` (no-substitution template).
    if (ts.isStringLiteralLike(element)) names.push(element.text);
  }
  return names;
}

/**
 * Parse the registered MCP tool names from a TS source file's text by walking the
 * AST. Resolution priority: `TOOL_MANIFEST` → `REGISTERED_TOOL_NAMES` (literal) →
 * a legacy `tools: [...]` property. Returns names in source order, or `[]` when no
 * recognizable array literal is found (a non-literal reference yields `[]`).
 */
export function parseRegisteredToolNames(content: string): string[] {
  const source = ts.createSourceFile(
    'tool-source.ts',
    content,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false
  );

  const byKey = new Map<string, string[]>();

  /** Record the first array literal seen for `key` (later duplicates ignored). */
  const capture = (key: string, init: ts.Expression | undefined): void => {
    if (byKey.has(key)) return;
    const names = readStringArray(init);
    if (names !== undefined) byKey.set(key, names);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      if ((MANIFEST_VAR_NAMES as readonly string[]).includes(node.name.text)) {
        capture(node.name.text, node.initializer);
      }
    } else if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
      if (node.name.text === 'tools') capture('tools', node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  return (
    byKey.get('TOOL_MANIFEST') ?? byKey.get('REGISTERED_TOOL_NAMES') ?? byKey.get('tools') ?? []
  );
}
