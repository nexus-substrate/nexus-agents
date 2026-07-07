/**
 * nexus-agents/security - Polyglot (Python/Go) AST QA/Security Rule Runner (#4249 child C)
 *
 * Runs YAML-defined `@ast-grep/napi` rules against Python/Go source, detecting
 * common QA/security anti-patterns (dynamic `eval`/`exec`, shell injection,
 * unchecked external command execution). Same engine already used by
 * `search_usages` (indexer/usage-ast.ts, #4265) and the ast-fixer rewrites
 * (agents/collaboration/ast-rewrites.ts, #4243/#4249 child B) — no new AST
 * dependency, just new language grammars for it.
 *
 * **Language support gap.** `Lang` in `@ast-grep/napi@0.44.1` ships only
 * Html/JavaScript/Tsx/Css/TypeScript — no Python, no Go. This module closes
 * that gap via napi's `@experimental registerDynamicLanguage` API, backed by
 * the `@ast-grep/lang-python`/`@ast-grep/lang-go` prebuilt tree-sitter
 * grammars. Both are EXACT-pinned in package.json (no caret): these are
 * early/experimental packages and a caret range could silently swap in an
 * incompatible native `.so` grammar build underneath a "safe" semver-minor
 * bump. `registerDynamicLanguage` throws if called more than once per
 * process (napi-rs's own documented constraint) — {@link ensurePolyglotLangs}
 * is a lazy, module-level, once-only guard so repeated calls (tests, repeat
 * runner invocations within one process) never trip it twice.
 *
 * **Read-only.** Reads rule YAML and target source files, walks their ASTs,
 * performs NO writes. ast-grep YAML rule files support a `fix:` key for
 * autofixing, but napi's `SgNode.findAll` (used here) never applies it —
 * only ast-grep's separate rewrite/CLI machinery does — so even a rule
 * author who adds `fix:` cannot turn this runner into a writer by accident.
 * MCP exposure is deliberately deferred (see the follow-up issue referenced
 * in the #4249 child C PR) to keep this surface a plain function until a
 * named consumer needs it wired through a tool.
 *
 * @module security/ast-rule-runner
 * @see Issue #4249 - epic: ast-grep adoption (Child C: polyglot QA/security rules)
 */

import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Lang, parse, registerDynamicLanguage } from '@ast-grep/napi';
import type { NapiConfig } from '@ast-grep/napi';
// Both packages are CJS `export = <LanguageRegistration>` modules — the
// default import is the whole registration object (`libraryPath` getter,
// `extensions`, `languageSymbol`, `expandoChar`). See their `index.d.ts`.
import goLangRegistration from '@ast-grep/lang-go';
import pythonLangRegistration from '@ast-grep/lang-python';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { createLogger, SecurityError, ValidationError, formatZodError } from '../core/index.js';

// ============================================================================
// Dynamic language registration (@experimental, call-once)
// ============================================================================

let polyglotLangsRegistered = false;

/**
 * Lazily register the Python/Go tree-sitter grammars with ast-grep's
 * `registerDynamicLanguage`. That API throws if called more than once in a
 * process; this guard makes every call after the first a no-op so repeated
 * runner invocations (or a test suite that constructs the runner many times)
 * never trip the constraint.
 */
export function ensurePolyglotLangs(): void {
  if (polyglotLangsRegistered) return;
  registerDynamicLanguage({ python: pythonLangRegistration, go: goLangRegistration });
  polyglotLangsRegistered = true;
}

// ============================================================================
// Rule schema (fail-closed)
// ============================================================================

/** Languages a rule file may declare. Only python/go are scanned for today (see
 * {@link inferRuleLang}); typescript/javascript are accepted by the schema so a
 * future rule file is not rejected by the loader before a walker exists for it. */
export const AST_RULE_LANGUAGES = ['python', 'go', 'typescript', 'javascript'] as const;
export type AstRuleLanguage = (typeof AST_RULE_LANGUAGES)[number];

export const AST_RULE_SEVERITIES = ['error', 'warning', 'info'] as const;
export type AstRuleSeverity = (typeof AST_RULE_SEVERITIES)[number];

/** Schema for one `*.yml` rule file. `rule` is passed through as ast-grep's
 * own `Rule` object (napi already validates it structurally at match time);
 * Zod only pins down the envelope so an unknown `language` or a missing
 * field FAILS CLOSED instead of silently loading a partial/broken rule. */
const RuleFileSchema = z.object({
  id: z.string().min(1),
  language: z.enum(AST_RULE_LANGUAGES),
  severity: z.enum(AST_RULE_SEVERITIES),
  message: z.string().min(1),
  rule: z.record(z.string(), z.unknown()),
});

export type AstQaRuleFile = z.infer<typeof RuleFileSchema>;

/** Per-match snippet char cap (matches indexer/usage-ast.ts's discipline). */
const MAX_SNIPPET_CHARS = 200;

/** Default cap on emitted findings. Excess is counted + reported, never silently dropped. */
export const DEFAULT_AST_QA_LIMIT = 200;
/** Hard upper bound a caller may request for the finding cap. */
export const MAX_AST_QA_LIMIT = 2000;
/** Directory walk depth for the target-dir scan (not caller-configurable — no
 * named consumer needs a deeper/shallower walk yet; YAGNI). */
const AST_QA_MAX_DEPTH = 24;
/** Upper bound on files parsed in a single run, to bound worst-case cost. */
const MAX_FILES_SCANNED = 5000;

const logger = createLogger({ component: 'ast-rule-runner' });

// ============================================================================
// Rule loading
// ============================================================================

/**
 * Load and Zod-validate every `*.yml` rule file in `dir`. FAILS CLOSED: a
 * single malformed YAML file, or a file with an unrecognized `language` or
 * missing field, throws a {@link ValidationError} — there is no
 * "load what parsed, skip the rest" partial mode.
 */
export async function loadRules(dir: string): Promise<AstQaRuleFile[]> {
  let entries: string[];
  try {
    entries = (await readdir(dir)).filter((f) => f.endsWith('.yml')).sort();
  } catch (caught: unknown) {
    const e = caught instanceof Error ? caught : new Error(String(caught));
    throw new ValidationError(`ast-rule-runner: cannot read rules dir ${dir}: ${e.message}`, {
      cause: e,
    });
  }

  const rules: AstQaRuleFile[] = [];
  for (const file of entries) {
    const path = join(dir, file);
    const raw = await readFile(path, 'utf8');

    let parsed: unknown;
    try {
      parsed = parseYaml(raw);
    } catch (caught: unknown) {
      const e = caught instanceof Error ? caught : new Error(String(caught));
      throw new ValidationError(`ast-rule-runner: malformed YAML in ${path}: ${e.message}`, {
        cause: e,
      });
    }

    const result = RuleFileSchema.safeParse(parsed);
    if (!result.success) {
      throw new ValidationError(
        `ast-rule-runner: invalid rule file ${path}: ${formatZodError(result.error)}`
      );
    }
    rules.push(result.data);
  }
  return rules;
}

// ============================================================================
// Built-in rules dir resolution (mirrors workflows/template-loader.ts)
// ============================================================================

/**
 * Resolve the built-in `ast-rules/` directory, handling both dev (unbundled,
 * `src/security/ast-rule-runner.ts`) and published (bundled,
 * `dist/index.js` + `dist/security/ast-rules/*.yml` copied by tsup's
 * `onSuccess` step) layouts — the same two-layout problem
 * `getBuiltInTemplatesPath` solves for workflow templates.
 */
export function getBuiltInAstRulesPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);

  if (currentFile.includes(`${sep}dist${sep}`) || currentFile.endsWith(`${sep}dist`)) {
    const distIndex = currentFile.lastIndexOf(`${sep}dist${sep}`);
    if (distIndex !== -1) {
      const distDir = currentFile.substring(0, distIndex + 5); // +5 for "/dist"
      const bundledPath = join(distDir, 'security', 'ast-rules');
      if (existsSync(bundledPath)) return bundledPath;
    }
  }

  const possiblePaths = [
    join(currentDir, 'ast-rules'), // Unbundled: sibling of this file in src/security/
    join(currentDir, 'security', 'ast-rules'), // Bundled chunk: dist/security sibling
    join(dirname(currentDir), 'security', 'ast-rules'),
  ];
  for (const path of possiblePaths) {
    if (existsSync(path)) return path;
  }
  return join(currentDir, 'ast-rules'); // Fallback (for error reporting)
}

// ============================================================================
// Path-traversal guard (copied from mcp/tools/search-usages-tool.ts —
// keep in sync if that guard changes)
// ============================================================================

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

// ============================================================================
// File walk (LOCAL extension map — python/go only; does NOT reuse
// indexer/usage-ast.ts's TS/JS inferLang or indexer/codebase-search.ts's
// TS/JS-only findSourceFiles)
// ============================================================================

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);

/** file-extension -> ast-rule language, for the two languages this runner scans. */
const POLYGLOT_EXT_TO_LANG: Readonly<Record<string, AstRuleLanguage>> = {
  '.py': 'python',
  '.go': 'go',
};

/** Infer the ast-rule language for a file from its extension, or `null` if unsupported. */
function inferRuleLang(file: string): AstRuleLanguage | null {
  return POLYGLOT_EXT_TO_LANG[extname(file).toLowerCase()] ?? null;
}

/** Recursively collect `.py`/`.go` files under `dir`, bounded by `maxDepth`. */
async function findPolyglotFiles(dir: string, maxDepth: number): Promise<string[]> {
  if (maxDepth <= 0) return [];
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
      out.push(...(await findPolyglotFiles(fullPath, maxDepth - 1)));
    } else if (entry.isFile() && inferRuleLang(entry.name) !== null) {
      out.push(fullPath);
    }
  }
  return out;
}

/** Map a rule's declared language to the `parse()` first argument, registering
 * the dynamic grammars on first use of python/go. */
function langToParseArg(lang: AstRuleLanguage): Lang | string {
  if (lang === 'python' || lang === 'go') {
    ensurePolyglotLangs();
    return lang; // the CustomLang string keys used in registerDynamicLanguage()
  }
  return lang === 'javascript' ? Lang.JavaScript : Lang.TypeScript;
}

// ============================================================================
// Findings
// ============================================================================

/** One ast-grep rule match against a source file. */
export interface AstRuleFinding {
  ruleId: string;
  severity: AstRuleSeverity;
  message: string;
  /** Path relative to the resolved `targetDir`. */
  file: string;
  /** 1-based line number. */
  line: number;
  /** 1-based column number. */
  column: number;
  /** Trimmed, length-capped source line for the match. */
  snippet: string;
}

export interface RunAstQaRulesOptions {
  /** Directory containing `*.yml` rule files (default: the built-in bundled rules). */
  rulesDir?: string;
  /** Directory to scan for `.py`/`.go` source files (must stay within cwd). */
  targetDir: string;
  /** Max findings emitted (default {@link DEFAULT_AST_QA_LIMIT}). Excess is counted + reported. */
  limit?: number;
}

/** {@link collectAstQaFindings}'s full result — findings plus the true total,
 * so overflow beyond `limit` is counted and reported, never silently dropped. */
export interface AstQaCollectResult {
  findings: AstRuleFinding[];
  /** True count of matches found, before the `limit` cap was applied. */
  total: number;
  limit: number;
}

/** Findings + true-match-count from scanning ONE already-read source file. */
interface FileScanResult {
  findings: AstRuleFinding[];
  total: number;
}

/** Bundles {@link scanFile}'s cap-tracking inputs (max-params discipline). */
interface FileScanBudget {
  /** Path emitted on each finding (relative to the resolved `targetDir`). */
  rel: string;
  /** Max TOTAL findings across the whole run. */
  limit: number;
  /** Findings already accepted by earlier files in this run. */
  alreadyFound: number;
}

/**
 * Scan one already-read source file against the rules applicable to its
 * language, pushing findings only while the running total (`budget.alreadyFound`
 * + findings pushed so far) stays under `budget.limit` — while still counting
 * every true match, so the caller can report overflow instead of silently
 * dropping it.
 */
function scanFile(
  src: string,
  lang: AstRuleLanguage,
  applicable: readonly AstQaRuleFile[],
  budget: FileScanBudget
): FileScanResult {
  const { rel, limit, alreadyFound } = budget;
  const root = parse(langToParseArg(lang), src).root();
  const lines = src.split('\n');
  const findings: AstRuleFinding[] = [];
  let total = 0;

  for (const rule of applicable) {
    const config: NapiConfig = { rule: rule.rule };
    for (const node of root.findAll(config)) {
      total += 1;
      if (alreadyFound + findings.length < limit) {
        const { start } = node.range();
        const rawLine = lines[start.line] ?? node.text();
        findings.push({
          ruleId: rule.id,
          severity: rule.severity,
          message: rule.message,
          file: rel,
          line: start.line + 1,
          column: start.column + 1,
          snippet: rawLine.trim().slice(0, MAX_SNIPPET_CHARS),
        });
      }
    }
  }
  return { findings, total };
}

/**
 * Run every applicable rule in `rulesDir` against every `.py`/`.go` file under
 * `targetDir`, returning capped findings plus the true total (so callers that
 * need the overflow count — e.g. a future MCP tool wrapper — can report it).
 * {@link runAstQaRules} is the capped-array convenience wrapper over this.
 */
export async function collectAstQaFindings(
  opts: RunAstQaRulesOptions
): Promise<AstQaCollectResult> {
  const guard = resolveWithinCwd(opts.targetDir);
  if ('error' in guard) {
    throw new SecurityError(guard.error);
  }

  const rulesDir = opts.rulesDir ?? getBuiltInAstRulesPath();
  const rules = await loadRules(rulesDir);
  const limit = Math.min(opts.limit ?? DEFAULT_AST_QA_LIMIT, MAX_AST_QA_LIMIT);

  const files = (await findPolyglotFiles(guard.resolved, AST_QA_MAX_DEPTH)).slice(
    0,
    MAX_FILES_SCANNED
  );

  const findings: AstRuleFinding[] = [];
  let total = 0;

  for (const file of files) {
    const lang = inferRuleLang(file);
    if (lang === null) continue;
    const applicable = rules.filter((r) => r.language === lang);
    if (applicable.length === 0) continue;

    let src: string;
    try {
      src = await readFile(file, 'utf8');
    } catch {
      logger.warn(`ast-rule-runner: skipped unreadable file ${file}`);
      continue;
    }

    const rel = relative(guard.resolved, file) || file;
    const scanned = scanFile(src, lang, applicable, { rel, limit, alreadyFound: findings.length });
    findings.push(...scanned.findings);
    total += scanned.total;
  }

  if (total > findings.length) {
    logger.warn(
      `ast-rule-runner: ${String(total - findings.length)} finding(s) omitted beyond ` +
        `limit=${String(limit)} (total=${String(total)})`
    );
  }

  return { findings, total, limit };
}

/**
 * Run the polyglot QA/security ast-grep rules and return the capped findings
 * array. Overflow beyond `limit` is counted and logged (never silently
 * dropped) — use {@link collectAstQaFindings} directly when the caller needs
 * the true total/overflow count programmatically.
 */
export async function runAstQaRules(opts: RunAstQaRulesOptions): Promise<AstRuleFinding[]> {
  const { findings } = await collectAstQaFindings(opts);
  return findings;
}
