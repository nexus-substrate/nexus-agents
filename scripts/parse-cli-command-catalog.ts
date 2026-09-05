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
type RequiredField = (typeof REQUIRED_FIELDS)[number];

/**
 * Thrown for any catalog shape the parser cannot evaluate. Deliberately an
 * error, not a skip: the generator and the drift gate read the catalog
 * through this parser, so a silently dropped entry would vanish from the docs
 * AND from the gate that compares them — `--help --all` would show N+1
 * commands, the docs N, and CI would stay green.
 */
export class CatalogParseError extends Error {
  constructor(message: string) {
    super(`COMMAND_CATALOG: ${message} (scripts/parse-cli-command-catalog.ts, #5458)`);
    this.name = 'CatalogParseError';
  }
}

/** Read the string-literal properties of one `{ command, description, audience }` literal. */
function entryFromObjectLiteral(
  obj: ts.ObjectLiteralExpression,
  index: number
): ParsedCatalogEntry {
  const fields: Partial<Record<RequiredField, string>> = {};
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
    const key = prop.name.text;
    if (!(REQUIRED_FIELDS as readonly string[]).includes(key)) continue;
    // Only a plain string literal (or a no-substitution template) can be read
    // without evaluating code. Anything else — `${…}` templates, `'a' + 'b'`,
    // a constant reference — is a value this parser cannot see.
    if (!ts.isStringLiteralLike(prop.initializer)) {
      throw new CatalogParseError(
        `entry #${String(index)}: '${key}' is a ${ts.SyntaxKind[prop.initializer.kind]}, ` +
          'not a string literal — the docs generator cannot evaluate it'
      );
    }
    fields[key as RequiredField] = prop.initializer.text;
  }
  const { command, description, audience } = fields;
  if (command === undefined || description === undefined || audience === undefined) {
    const missing = REQUIRED_FIELDS.filter((k) => fields[k] === undefined);
    const label = command === undefined ? '' : ` ('${command}')`;
    throw new CatalogParseError(`entry #${String(index)}${label} is missing ${missing.join(', ')}`);
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
  return node.elements.map((element, index) => {
    if (!ts.isObjectLiteralExpression(element)) {
      throw new CatalogParseError(
        `element #${String(index)} is a ${ts.SyntaxKind[element.kind]}, not an object literal — ` +
          'a spread or reference hides commands from the docs generator'
      );
    }
    return entryFromObjectLiteral(element, index);
  });
}

/**
 * Parse `COMMAND_CATALOG` from a TS source file's text. Returns entries in
 * source order, or `[]` when no `COMMAND_CATALOG` array literal is found (a
 * non-literal initializer yields `[]`). Callers MUST treat `[]` as a parser
 * failure, not as an empty catalog — the catalog is never empty. Throws
 * `CatalogParseError` for any element or field it cannot read as a literal;
 * both consumers let that propagate rather than rendering a shorter table.
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
