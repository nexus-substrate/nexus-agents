/**
 * nexus-agents/indexer - Shared structural usage / call-site AST core.
 *
 * The ast-grep (`@ast-grep/napi`, MIT, Rust + tree-sitter) primitives that
 * answer "where is symbol X used / called". Extracted from the `search_usages`
 * MCP tool (#4265 / epic #4249 Child A) so a SECOND consumer — the repo-map
 * ranker (#4268) — can reuse the exact same call-site-finding logic instead of
 * duplicating the ast-grep querying or going through the MCP tool layer.
 *
 * Two entry points share the same classification core:
 *  - {@link findUsagesInSource} — every usage of ONE symbol (call, member call,
 *    `new`, import, reference), the `search_usages` tool's per-symbol scan.
 *  - {@link countCallSitesInSource} — a SINGLE-parse tally of how often each of
 *    MANY symbols is *called* (call / member-call / `new`) in a source, the
 *    bounded signal the repo-map needs (one parse per file, not one per symbol).
 *
 * Syntactic, not type-aware: matches are structural and are NOT resolved
 * against a type checker — a member call on an unrelated object of the same
 * property name will match. That is the documented ast-grep trade-off.
 *
 * @module indexer/usage-ast
 */

import { extname } from 'node:path';
import { Lang, parse } from '@ast-grep/napi';
import type { NapiConfig, SgNode } from '@ast-grep/napi';

// ============================================================================
// Language + identifier primitives
// ============================================================================

export const LANG_VALUES = ['typescript', 'tsx', 'javascript'] as const;
export type SupportedLang = (typeof LANG_VALUES)[number];

/** Per-match snippet char cap. */
const MAX_SNIPPET_CHARS = 200;

/** A single JS identifier — anchored so a symbol can't smuggle ast-grep pattern metachars. */
export const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** The kind of a usage site. Declarations are excluded (that is the name index's job). */
export type UsageKind = 'call' | 'method-call' | 'new' | 'import' | 'reference';

/** Usage kinds that represent an actual call-site (what the repo-map ranks on). */
const CALL_USAGE_KINDS: ReadonlySet<UsageKind> = new Set<UsageKind>(['call', 'method-call', 'new']);

/** A single usage match within one source string. */
export interface UsageMatch {
  /** 1-based line number. */
  line: number;
  /** 1-based column number. */
  column: number;
  kind: UsageKind;
  /** Trimmed, length-capped source line for the match. */
  snippet: string;
}

/** Identifier parents whose matched identifier IS the declared name — not a usage. */
const DECLARATION_PARENT_KINDS = new Set<string>([
  'function_declaration',
  'generator_function_declaration',
  'class_declaration',
  'interface_declaration',
  'type_alias_declaration',
  'enum_declaration',
  'function_signature',
  'method_definition',
  'abstract_method_signature',
]);

/** Identifier parents that denote an import binding. */
const IMPORT_PARENT_KINDS = new Set<string>([
  'import_specifier',
  'namespace_import',
  'import_clause',
]);

function langToNapi(lang: SupportedLang): Lang {
  if (lang === 'tsx') return Lang.Tsx;
  if (lang === 'javascript') return Lang.JavaScript;
  return Lang.TypeScript;
}

/** Infer the ast-grep language for a file from its extension. */
export function inferLang(file: string): SupportedLang {
  const ext = extname(file).toLowerCase();
  if (ext === '.tsx' || ext === '.jsx') return 'tsx';
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') return 'javascript';
  return 'typescript';
}

/** Escape regex metacharacters so a `$`-bearing identifier anchors correctly. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// Classification
// ============================================================================

/** True when the identifier `node` is the `name` field of its variable_declarator parent. */
function isDeclaredName(declarator: SgNode, node: SgNode): boolean {
  const name = declarator.field('name');
  return name !== null && name.id() === node.id();
}

/** Classify a plain `identifier` occurrence; returns null when it is a declaration name to skip. */
function classifyIdentifier(node: SgNode): UsageKind | null {
  const parent = node.parent();
  if (parent === null) return 'reference';
  const pk = String(parent.kind());
  if (DECLARATION_PARENT_KINDS.has(pk)) return null;
  if (pk === 'variable_declarator') return isDeclaredName(parent, node) ? null : 'reference';
  if (IMPORT_PARENT_KINDS.has(pk)) return 'import';
  if (pk === 'call_expression') return 'call';
  if (pk === 'new_expression') return 'new';
  return 'reference';
}

/** Classify a `property_identifier` occurrence (member access): method-call vs plain reference. */
function classifyProperty(node: SgNode): UsageKind {
  const member = node.parent();
  const grandparent = member === null ? null : member.parent();
  if (grandparent !== null && String(grandparent.kind()) === 'call_expression')
    return 'method-call';
  return 'reference';
}

function toMatch(node: SgNode, kind: UsageKind, lines: readonly string[]): UsageMatch {
  const { start } = node.range();
  const rawLine = lines[start.line] ?? node.text();
  return {
    line: start.line + 1,
    column: start.column + 1,
    kind,
    snippet: rawLine.trim().slice(0, MAX_SNIPPET_CHARS),
  };
}

// ============================================================================
// Single-symbol scan (search_usages)
// ============================================================================

/**
 * Find every structural usage of `symbol` in `src`. Returns call-sites, member
 * calls, `new` expressions, imports, and bare references — but NOT the symbol's
 * own declaration (that is what `search_codebase`'s name index already covers).
 * Sorted by position. This is the capability `search_codebase` cannot provide.
 */
export function findUsagesInSource(symbol: string, src: string, lang: SupportedLang): UsageMatch[] {
  if (!IDENTIFIER_RE.test(symbol)) return [];
  const root = parse(langToNapi(lang), src).root();
  const lines = src.split('\n');
  const out: UsageMatch[] = [];

  for (const node of root.findAll(symbol)) {
    const kind = classifyIdentifier(node);
    if (kind !== null) out.push(toMatch(node, kind, lines));
  }

  // Member-access occurrences are `property_identifier` nodes, which the bare
  // identifier pattern above does not match — collect them via a kind rule.
  const propRule: NapiConfig = {
    rule: { kind: 'property_identifier', regex: `^${escapeRegex(symbol)}$` },
  };
  for (const node of root.findAll(propRule)) {
    out.push(toMatch(node, classifyProperty(node), lines));
  }

  return out.sort((a, b) => a.line - b.line || a.column - b.column);
}

// ============================================================================
// Multi-symbol call-site tally (repo-map ranking, #4268)
// ============================================================================

/** Bump the tally for `name` when it is one of the tracked symbols. */
function bump(counts: Map<string, number>, symbols: ReadonlySet<string>, name: string): void {
  if (symbols.has(name)) counts.set(name, (counts.get(name) ?? 0) + 1);
}

/** Tally call-kind occurrences of tracked plain-identifier symbols in one parse. */
function tallyIdentifierCalls(
  root: SgNode,
  symbols: ReadonlySet<string>,
  counts: Map<string, number>
): void {
  for (const node of root.findAll({ rule: { kind: 'identifier' } })) {
    const kind = classifyIdentifier(node);
    if (kind !== null && CALL_USAGE_KINDS.has(kind)) bump(counts, symbols, node.text());
  }
}

/** Tally method-call occurrences of tracked member-access symbols in one parse. */
function tallyPropertyCalls(
  root: SgNode,
  symbols: ReadonlySet<string>,
  counts: Map<string, number>
): void {
  for (const node of root.findAll({ rule: { kind: 'property_identifier' } })) {
    if (CALL_USAGE_KINDS.has(classifyProperty(node))) bump(counts, symbols, node.text());
  }
}

/**
 * Count structural CALL-SITES (call / member-call / `new`) of any symbol in
 * `symbols` within `src`, in a SINGLE parse — the bounded signal the repo-map
 * ranks on (#4268). Returns per-symbol counts (symbols with zero call-sites are
 * absent). Excludes declarations, imports, and bare references — only actual
 * call-sites, since that is what "how used is this module" means for ranking.
 * Syntactic like {@link findUsagesInSource}: same-named members on unrelated
 * objects can match; that is the documented ast-grep trade-off.
 */
export function countCallSitesInSource(
  symbols: ReadonlySet<string>,
  src: string,
  lang: SupportedLang
): Map<string, number> {
  const counts = new Map<string, number>();
  if (symbols.size === 0) return counts;
  const root = parse(langToNapi(lang), src).root();
  tallyIdentifierCalls(root, symbols, counts);
  tallyPropertyCalls(root, symbols, counts);
  return counts;
}
