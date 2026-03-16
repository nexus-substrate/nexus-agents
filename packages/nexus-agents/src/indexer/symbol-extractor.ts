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

/** Result of extracting symbols from a file. */
export interface SymbolExtractionResult {
  filePath: string;
  symbols: CodeSymbol[];
  totalLines: number;
  totalChars: number;
  symbolChars: number;
  savingsPercent: number;
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
    if (decls.length > 0) {
      return decls[0].name.getText();
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
  if (!['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
    return {
      filePath,
      symbols: [],
      totalLines: 0,
      totalChars: 0,
      symbolChars: 0,
      savingsPercent: 0,
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
  };
}

/**
 * Extract a compact symbol index (names + locations only, no source text).
 * This is the minimal representation for LLM context — ~95%+ token savings.
 */
export async function extractSymbolIndex(filePath: string): Promise<string> {
  const result = await extractSymbols(filePath);
  if (result.symbols.length === 0) return '';

  const lines = result.symbols.map((s) => {
    const exp = s.exported ? 'export ' : '';
    return `${exp}${s.kind} ${s.name} (L${String(s.startLine)}-${String(s.endLine)})`;
  });

  return `// ${filePath} — ${String(result.symbols.length)} symbols\n${lines.join('\n')}`;
}
