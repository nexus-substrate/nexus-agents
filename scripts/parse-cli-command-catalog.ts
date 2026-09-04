/**
 * AST-based parser for the CLI command catalog (#5458).
 *
 * `packages/nexus-agents/src/cli-command-catalog.ts` exports `COMMAND_CATALOG`,
 * the single source of truth for every top-level CLI command (`--help` renders
 * from it). `inject-governance.ts` generates the `docs/ENTRYPOINTS.md` command
 * tables from it and `check-cli-docs-drift.ts` compares the doc's name set
 * against it; both read the literal through this parser so the two surfaces
 * cannot disagree about what the catalog says.
 *
 * Walks the TypeScript AST rather than scraping with a regex, for the same
 * reason `parse-tool-manifest.ts` does (#3596): a prettier-wrapped description,
 * a comment between properties, or a quote-style change must not silently drop
 * an entry — and a dropped entry here disappears from the docs AND from the
 * gate that would have noticed.
 *
 * Pure + side-effect-free so it is unit-testable in isolation.
 *
 * @module scripts/parse-cli-command-catalog
 */

import * as ts from 'typescript';

/** One catalog entry — the three fields the catalog vouches for. */
export interface ParsedCatalogEntry {
  readonly command: string;
  readonly description: string;
  readonly audience: string;
}

const CATALOG_VAR_NAME = 'COMMAND_CATALOG';
const REQUIRED_FIELDS = ['command', 'description', 'audience'] as const;

/** Read the string-literal properties of one `{ command, description, audience }` literal. */
function entryFromObjectLiteral(obj: ts.ObjectLiteralExpression): ParsedCatalogEntry | undefined {
  const fields: Partial<Record<(typeof REQUIRED_FIELDS)[number], string>> = {};
  for (const prop of obj.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      ts.isIdentifier(prop.name) &&
      ts.isStringLiteralLike(prop.initializer)
    ) {
      const key = prop.name.text;
      if ((REQUIRED_FIELDS as readonly string[]).includes(key)) {
        fields[key as (typeof REQUIRED_FIELDS)[number]] = prop.initializer.text;
      }
    }
  }
  const { command, description, audience } = fields;
  // An entry missing a field is skipped, not padded: rendering a blank cell
  // would present a half-written entry as documentation.
  if (command === undefined || description === undefined || audience === undefined) {
    return undefined;
  }
  return { command, description, audience };
}

/** Unwrap `as const` / type assertions, then read the array literal's entries. */
function readEntries(expr: ts.Expression | undefined): ParsedCatalogEntry[] | undefined {
  let node = expr;
  while (node !== undefined && (ts.isAsExpression(node) || ts.isSatisfiesExpression(node))) {
    node = node.expression;
  }
  if (node === undefined || !ts.isArrayLiteralExpression(node)) return undefined;
  const entries: ParsedCatalogEntry[] = [];
  for (const element of node.elements) {
    if (!ts.isObjectLiteralExpression(element)) continue;
    const entry = entryFromObjectLiteral(element);
    if (entry !== undefined) entries.push(entry);
  }
  return entries;
}

/**
 * Parse `COMMAND_CATALOG` from a TS source file's text. Returns entries in
 * source order, or `[]` when no `COMMAND_CATALOG` array literal is found (a
 * non-literal initializer yields `[]`). Callers MUST treat `[]` as a parser
 * failure, not as an empty catalog — the catalog is never empty.
 */
export function parseCommandCatalog(content: string): ParsedCatalogEntry[] {
  const source = ts.createSourceFile(
    'cli-command-catalog.ts',
    content,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false
  );

  let found: ParsedCatalogEntry[] | undefined;
  const visit = (node: ts.Node): void => {
    if (found !== undefined) return;
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === CATALOG_VAR_NAME
    ) {
      found = readEntries(node.initializer);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  return found ?? [];
}
