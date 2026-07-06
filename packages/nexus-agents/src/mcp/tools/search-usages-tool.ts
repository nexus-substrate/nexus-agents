/**
 * nexus-agents/mcp - Search Usages MCP Tool (#4265 / epic #4249 Child A)
 *
 * Structural USAGE / call-site search for a symbol, backed by ast-grep
 * (`@ast-grep/napi`, MIT, Rust + tree-sitter). Answers "where is X used /
 * called" — the gap `search_codebase` cannot fill: that tool indexes declared
 * symbol NAMES only (declarations), not usages/call-sites. This tool is
 * additive and complementary; it does NOT replace the ts-morph symbol
 * extractor (`indexer/symbol-extractor.ts`), which stays the type-checker-aware
 * declaration index.
 *
 * Syntactic, not type-aware: matches are structural (a `foo()` call, an
 * `obj.foo()` member call, `new foo()`, an import, a bare reference) and are
 * NOT resolved against a type checker — a member call on an unrelated object of
 * the same property name will match. That is the documented ast-grep trade-off
 * (the epic keeps ts-morph for type-aware needs).
 *
 * **Read-only**: reads source files and walks their ASTs; performs NO writes,
 * so the Rule-of-Two (untrusted-input + write + secrets) is not triggered.
 *
 * @module mcp/tools/search-usages-tool
 */

import { readFile } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import { Lang, parse } from '@ast-grep/napi';
import type { NapiConfig, SgNode } from '@ast-grep/napi';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger, formatZodError } from '../../core/index.js';
import { findSourceFiles } from '../../indexer/codebase-search.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import {
  toolStructuredError,
  toolSuccess,
  type BaseMcpToolDeps,
  type ToolResult,
} from './tool-result.js';
import { getToolAnnotations } from '../tool-annotations.js';

// ============================================================================
// Constants + output cap (reuses the #4253 output-cap discipline)
// ============================================================================

/** Default cap on emitted usage matches. Excess is counted + reported, never silently dropped. */
export const DEFAULT_USAGES_LIMIT = 50;
/** Hard upper bound a caller may request for the match cap. */
export const MAX_USAGES_LIMIT = 500;
/** Default directory depth for the dir-scope walk. */
const DEFAULT_USAGES_MAX_DEPTH = 24;
/** Hard upper bound on directory walk depth (matches the symbol index clamp). */
const MAX_USAGES_MAX_DEPTH = 64;
/** Upper bound on files parsed in a single dir-scope search, to bound worst-case cost. */
const MAX_FILES_SCANNED = 5000;
/** Per-match snippet char cap. */
const MAX_SNIPPET_CHARS = 200;

/** A single JS identifier — anchored so a symbol can't smuggle ast-grep pattern metachars. */
const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

// ============================================================================
// Input Schema
// ============================================================================

const LANG_VALUES = ['typescript', 'tsx', 'javascript'] as const;
type SupportedLang = (typeof LANG_VALUES)[number];

export const SearchUsagesInputSchema = z.object({
  symbol: z
    .string()
    .min(1)
    .max(200)
    .regex(IDENTIFIER_RE, 'symbol must be a single JS identifier (letters, digits, _ or $)')
    .describe('Identifier to find usages/call-sites of (a single JS identifier)'),
  path: z
    .string()
    .min(1)
    .max(500)
    .optional()
    .describe('Restrict to a single source file (takes precedence over dir)'),
  dir: z
    .string()
    .min(1)
    .max(500)
    .optional()
    .describe('Directory to search recursively (default: current working directory)'),
  lang: z
    .enum(LANG_VALUES)
    .optional()
    .describe(
      'Language override (default: inferred from each file extension, fallback typescript)'
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_USAGES_LIMIT)
    .optional()
    .describe(
      `Max usage matches emitted (default ${String(DEFAULT_USAGES_LIMIT)}). Excess is reported.`
    ),
  maxDepth: z
    .number()
    .int()
    .min(1)
    .max(MAX_USAGES_MAX_DEPTH)
    .optional()
    .describe(`Directory walk depth for dir scope (default ${String(DEFAULT_USAGES_MAX_DEPTH)}).`),
});

export type SearchUsagesInput = z.infer<typeof SearchUsagesInputSchema>;
export type SearchUsagesDeps = BaseMcpToolDeps;

// ============================================================================
// Core: structural usage matching via ast-grep
// ============================================================================

/** The kind of a usage site. Declarations are excluded (that is the name index's job). */
export type UsageKind = 'call' | 'method-call' | 'new' | 'import' | 'reference';

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

/** Escape regex metacharacters so a `$`-bearing identifier anchors correctly. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
// File scope resolution + gathering
// ============================================================================

/** Infer the ast-grep language for a file from its extension. */
function inferLang(file: string): SupportedLang {
  const ext = extname(file).toLowerCase();
  if (ext === '.tsx' || ext === '.jsx') return 'tsx';
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') return 'javascript';
  return 'typescript';
}

/** Resolve a caller path against a path-traversal guard (must stay within cwd). */
function resolveWithinCwd(target: string): { resolved: string } | { error: string } {
  const resolved = resolve(target);
  const cwdRoot = resolve('.');
  // The `+ sep` is load-bearing: a sibling dir whose name starts with the cwd
  // basename bypasses a bare startsWith. Matches security/safe-path.ts.
  if (resolved !== cwdRoot && !resolved.startsWith(cwdRoot + sep)) {
    return { error: `Path traversal denied: scope must be within ${cwdRoot}` };
  }
  return { resolved };
}

interface FileScope {
  files: string[];
  root: string;
}

/** Resolve the input scope to a concrete file list (single file or a bounded dir walk). */
async function resolveFileScope(input: SearchUsagesInput): Promise<FileScope | { error: string }> {
  if (input.path !== undefined) {
    const guard = resolveWithinCwd(input.path);
    if ('error' in guard) return guard;
    return { files: [guard.resolved], root: resolve('.') };
  }
  const guard = resolveWithinCwd(input.dir ?? process.cwd());
  if ('error' in guard) return guard;
  const walk = await findSourceFiles(guard.resolved, input.maxDepth ?? DEFAULT_USAGES_MAX_DEPTH);
  return { files: walk.files.slice(0, MAX_FILES_SCANNED), root: guard.resolved };
}

interface FileUsage extends UsageMatch {
  file: string;
}

/** Collect usages across files up to `limit`, counting the total so overflow is reported. */
async function collectUsages(
  input: SearchUsagesInput,
  scope: FileScope,
  limit: number,
  ctx: HandlerContext
): Promise<{ results: FileUsage[]; total: number }> {
  const results: FileUsage[] = [];
  let total = 0;
  for (const file of scope.files) {
    let src: string;
    try {
      src = await readFile(file, 'utf8');
    } catch {
      ctx.logger.warn(`search_usages: skipped unreadable file ${file}`);
      continue;
    }
    const lang = input.lang ?? inferLang(file);
    const rel = relative(scope.root, file) || file;
    for (const match of findUsagesInSource(input.symbol, src, lang)) {
      total += 1;
      if (results.length < limit) results.push({ file: rel, ...match });
    }
  }
  return { results, total };
}

function buildOutput(
  input: SearchUsagesInput,
  scope: FileScope,
  limit: number,
  collected: { results: FileUsage[]; total: number }
): string {
  const payload: Record<string, unknown> = {
    symbol: input.symbol,
    scope: input.path !== undefined ? { path: input.path } : { dir: input.dir ?? '.' },
    lang: input.lang ?? 'inferred',
    filesScanned: scope.files.length,
    totalMatches: collected.total,
    results: collected.results,
  };
  if (collected.total > collected.results.length) {
    payload['truncated'] = true;
    payload['omittedMatches'] = collected.total - collected.results.length;
    payload['limit'] = limit;
  }
  return JSON.stringify(payload, null, 2);
}

// ============================================================================
// Handler
// ============================================================================

async function searchUsagesHandler(args: unknown, ctx: HandlerContext): Promise<ToolResult> {
  const parsed = SearchUsagesInputSchema.safeParse(args);
  if (!parsed.success) {
    return toolStructuredError({
      errorCategory: 'validation',
      message: `Validation error: ${formatZodError(parsed.error)}`,
    });
  }

  const scope = await resolveFileScope(parsed.data);
  if ('error' in scope) {
    return toolStructuredError({ errorCategory: 'permission', message: scope.error });
  }

  try {
    const limit = parsed.data.limit ?? DEFAULT_USAGES_LIMIT;
    const collected = await collectUsages(parsed.data, scope, limit, ctx);
    return toolSuccess(buildOutput(parsed.data, scope, limit, collected));
  } catch (caught: unknown) {
    const e = caught instanceof Error ? caught : new Error(String(caught));
    ctx.logger.error('Usage search failed', e);
    return toolStructuredError({
      errorCategory: 'internal',
      message: `Usage search failed: ${e.message}`,
    });
  }
}

// ============================================================================
// Testing exports (#2159)
// ============================================================================

/** Test-only surface — do not import in production code. */
export const _testing = {
  /** Raw handler for unit testing (bypasses secure-handler + timeout middleware). */
  searchUsagesHandler,
};

// ============================================================================
// Registration
// ============================================================================

/** @category MCP */
export function registerSearchUsagesTool(server: McpServer, deps: SearchUsagesDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'search_usages' });

  const toolSchema = {
    symbol: z
      .string()
      .min(1)
      .max(200)
      .regex(IDENTIFIER_RE, 'symbol must be a single JS identifier')
      .describe('Identifier to find usages/call-sites of'),
    path: z.string().min(1).max(500).optional().describe('Restrict to a single source file'),
    dir: z.string().min(1).max(500).optional().describe('Directory to search (default: cwd)'),
    lang: z.enum(LANG_VALUES).optional().describe('Language override (default: infer from ext)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_USAGES_LIMIT)
      .optional()
      .describe(`Max matches (default ${String(DEFAULT_USAGES_LIMIT)})`),
    maxDepth: z
      .number()
      .int()
      .min(1)
      .max(MAX_USAGES_MAX_DEPTH)
      .optional()
      .describe(`Directory walk depth (default ${String(DEFAULT_USAGES_MAX_DEPTH)})`),
  };

  const description =
    'Structural USAGE / call-site search for a symbol via ast-grep (tree-sitter). ' +
    'Answers "where is X used or called" — finds calls (foo()), member calls (obj.foo()), ' +
    'new expressions (new Foo()), imports, and bare references, with file:line:column + snippet. ' +
    'This is the gap `search_codebase` CANNOT fill: that indexes declared symbol NAMES only, ' +
    'not usages. Excludes the declaration itself (use `search_codebase` for declarations). ' +
    'Syntactic, not type-aware (a same-named member on an unrelated object may match). ' +
    `Read-only. Results capped at ${String(DEFAULT_USAGES_LIMIT)} by default (override via limit up to ${String(MAX_USAGES_LIMIT)}); overflow is reported, never silent.`;

  const secureHandler = createSecureHandler(searchUsagesHandler, {
    toolName: 'search_usages',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  const timeoutMs = getToolTimeout('search_usages', deps.security);
  const wrapped = wrapToolWithTimeout('search_usages', secureHandler, { timeoutMs, logger });

  server.registerTool(
    'search_usages',
    { description, inputSchema: toolSchema, annotations: getToolAnnotations('search_usages') },
    toSdkCallback(wrapped)
  );
  logger.info('Registered search_usages tool');
}
