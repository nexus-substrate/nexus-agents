/**
 * AST symbol extraction for token-efficient code retrieval.
 *
 * Uses TypeScript's compiler API to extract function, class, method,
 * interface, and type definitions from source files.
 *
 * Token savings: ~80-99% vs reading full files.
 * No additional dependencies — uses TypeScript (already a project dep).
 *
 * @module indexer/symbol-extractor
 */

import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import ts from 'typescript';

/** A symbol extracted from source code. */
export interface CodeSymbol {
  /** Symbol name */
  name: string;
  /** Symbol kind */
  kind: 'function' | 'class' | 'method' | 'interface' | 'type' | 'variable' | 'enum';
  /** Start line (1-based) */
  startLine: number;
  /** End line (1-based) */
  endLine: number;
  /** Full source text of the symbol */
  text: string;
  /** Whether the symbol is exported */
  exported: boolean;
}

/**
 * Extensions the TypeScript compiler API path can parse (#4517).
 *
 * Exported so the tool layer can name them in its error message instead of
 * asserting a file "may not be TypeScript/JavaScript" without saying what
 * would count.
 */
export const SUPPORTED_EXTENSIONS: readonly string[] = ['.ts', '.tsx', '.js', '.jsx'];

/** Result of extracting symbols from a file. */
export interface SymbolExtractionResult {
  filePath: string;
  symbols: CodeSymbol[];
  totalLines: number;
  totalChars: number;
  symbolChars: number;
  savingsPercent: number;
  /**
   * Whether the file was actually parsed (#4517).
   *
   * `false` means the extension is not supported, so `symbols: []` reports
   * that nothing was READ — not that nothing is there. An unsupported file and
   * a genuinely symbol-free file previously returned identical results, and
   * the tool guessed between them wrongly: a valid TypeScript barrel of 20
   * re-exports was reported as possibly-not-TypeScript.
   */
  parsed: boolean;
}

function getKind(node: ts.Node): CodeSymbol['kind'] | null {
  if (ts.isFunctionDeclaration(node)) return 'function';
  if (ts.isClassDeclaration(node)) return 'class';
  if (ts.isInterfaceDeclaration(node)) return 'interface';
  if (ts.isTypeAliasDeclaration(node)) return 'type';
  if (ts.isEnumDeclaration(node)) return 'enum';
  if (ts.isMethodDeclaration(node)) return 'method';
  if (ts.isVariableStatement(node)) return 'variable';
  return null;
}

function getName(node: ts.Node): string {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isMethodDeclaration(node)
  ) {
    const nameNode = (node as ts.NamedDeclaration).name;
    return nameNode ? nameNode.getText() : '<anonymous>';
  }
  if (ts.isVariableStatement(node)) {
    const decls = node.declarationList.declarations;
    const firstDecl = decls[0];
    if (firstDecl !== undefined) {
      return firstDecl.name.getText();
    }
  }
  return '<anonymous>';
}

function isExported(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  if (modifiers) {
    return modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  }
  return false;
}

function visitNode(node: ts.Node, sourceFile: ts.SourceFile, symbols: CodeSymbol[]): void {
  const kind = getKind(node);
  if (kind !== null) {
    const name = getName(node);
    if (name !== '<anonymous>') {
      const start = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
      symbols.push({
        name,
        kind,
        startLine: start.line + 1,
        endLine: end.line + 1,
        text: node.getText(sourceFile),
        exported: isExported(node),
      });
    }
  }
  if (ts.isClassDeclaration(node)) {
    visitClassMembers(node, sourceFile, symbols);
    return;
  }
  ts.forEachChild(node, (child) => {
    visitNode(child, sourceFile, symbols);
  });
}

function visitClassMembers(
  node: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
  symbols: CodeSymbol[]
): void {
  for (const member of node.members) {
    if (ts.isMethodDeclaration(member) || ts.isPropertyDeclaration(member)) {
      const memberName = member.name.getText();
      if (memberName !== '<anonymous>') {
        const start = sourceFile.getLineAndCharacterOfPosition(member.getStart());
        const end = sourceFile.getLineAndCharacterOfPosition(member.getEnd());
        symbols.push({
          name: memberName,
          kind: 'method',
          startLine: start.line + 1,
          endLine: end.line + 1,
          text: member.getText(sourceFile),
          exported: false,
        });
      }
    }
  }
}

function computeSavings(totalChars: number, symbolChars: number): number {
  return totalChars > 0 ? Math.round(100 * (1 - symbolChars / totalChars) * 10) / 10 : 0;
}

/**
 * Extract symbols from a TypeScript/JavaScript file.
 */
export async function extractSymbols(filePath: string): Promise<SymbolExtractionResult> {
  const ext = extname(filePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    return {
      filePath,
      symbols: [],
      totalLines: 0,
      totalChars: 0,
      symbolChars: 0,
      savingsPercent: 0,
      parsed: false,
    };
  }

  const source = await readFile(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const symbols: CodeSymbol[] = [];

  ts.forEachChild(sourceFile, (node) => {
    visitNode(node, sourceFile, symbols);
  });

  const totalChars = source.length;
  const symbolChars = symbols.reduce((sum, s) => sum + s.text.length, 0);

  return {
    filePath,
    symbols,
    totalLines: source.split('\n').length,
    totalChars,
    symbolChars,
    savingsPercent: computeSavings(totalChars, symbolChars),
    parsed: true,
  };
}

/**
 * Why {@link extractSymbolIndex} produced no index (#4517).
 *
 * `unsupported` and `no-declarations` are different facts about the world:
 * the first says the file was never read, the second says it was read and
 * genuinely declares nothing locally — a re-export barrel, typically. Callers
 * that collapse them tell the user to check a file type that was never the
 * problem.
 */
export type EmptyIndexReason = 'unsupported' | 'no-declarations';

/** A symbol index, or the reason there is none. */
export type SymbolIndexResult =
  | { readonly kind: 'index'; readonly index: string }
  | { readonly kind: 'empty'; readonly reason: EmptyIndexReason };

/**
 * Extract a compact symbol index, reporting why when there is nothing to show.
 *
 * Names + locations only, no source text — the minimal representation for LLM
 * context (~95%+ token savings). Replaced the earlier `extractSymbolIndex`,
 * which returned a bare `''` for both "could not read" and "read, found
 * nothing" and so could not tell a caller which had happened.
 */
export async function extractSymbolIndexResult(filePath: string): Promise<SymbolIndexResult> {
  const result = await extractSymbols(filePath);
  if (!result.parsed) return { kind: 'empty', reason: 'unsupported' };
  if (result.symbols.length === 0) return { kind: 'empty', reason: 'no-declarations' };
  return { kind: 'index', index: renderIndex(filePath, result) };
}

function renderIndex(filePath: string, result: SymbolExtractionResult): string {
  const lines = result.symbols.map((s) => {
    const exp = s.exported ? 'export ' : '';
    return `${exp}${s.kind} ${s.name} (L${String(s.startLine)}-${String(s.endLine)})`;
  });
  return `// ${filePath} — ${String(result.symbols.length)} symbols\n${lines.join('\n')}`;
}
