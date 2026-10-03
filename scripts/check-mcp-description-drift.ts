/**
 * MCP description-drift gate (#3528, vote-approved Option B).
 *
 * Each MCP tool's user-facing description lives in TWO independently
 * hand-maintained long-form places that drift (#3527):
 *   1. the RUNTIME description passed to `server.registerTool(name, { description })`
 *      in the tool's source file — what MCP clients/agents actually see;
 *   2. `scripts/tool-descriptions-data.ts` `TOOL_DESCRIPTIONS` — consumed by
 *      inject-governance to generate the CLAUDE.md / ENTRYPOINTS doc tables.
 *
 * This gate statically extracts (1) and compares it to (2) with a similarity
 * threshold: intentional emphasis differences pass, substantive disagreement
 * fails. `README_TOOL_DESCRIPTIONS` (a deliberate short-form, avg 66 vs 230
 * chars) is intentionally out of scope.
 *
 * Panel conditions (consensus_vote, #3528): static/deterministic parsing (NO
 * eval), and FAIL-LOUD on any tool whose runtime description can't be parsed —
 * a silently-skipped tool is undetected drift wearing a green check.
 *
 * @module scripts/check-mcp-description-drift
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { TOOL_MANIFEST } from '../packages/nexus-agents/src/mcp/tools/tool-manifest.js';
import { TOOL_DESCRIPTIONS } from './tool-descriptions-data.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const TOOLS_DIR = join(REPO_ROOT, 'packages/nexus-agents/src/mcp/tools');

/** Similarity at/above which two descriptions are considered in agreement. */
export const SIMILARITY_THRESHOLD = 0.5;

export interface DriftFinding {
  readonly tool: string;
  readonly similarity: number;
  readonly runtime: string;
  readonly docTable: string;
}

export interface EvaluatedDescription {
  readonly text: string;
  /** Template substitutions replaced by <dynamic>, without evaluating them. */
  readonly elidedSubstitutions: number;
}

export interface DescriptionDriftReport {
  /** Tools actually compared, including drifted descriptions, with elision counts. */
  readonly compared: readonly { readonly tool: string; readonly elidedSubstitutions: number }[];
  /** Tools whose runtime vs doc-table descriptions disagree below threshold. */
  readonly drifts: readonly DriftFinding[];
  /** Manifest tools whose runtime description could not be statically parsed. */
  readonly unparseable: readonly string[];
  /** Manifest tools with no TOOL_DESCRIPTIONS entry. */
  readonly missingDocEntry: readonly string[];
}

/** Reject parser recovery: incomplete syntax must never become a description. */
function hasParseError(node: ts.Node): boolean {
  return (
    (node.flags & ts.NodeFlags.ThisNodeHasError) !== 0 ||
    ts.forEachChild(node, hasParseError) === true
  );
}

/** Parse syntax only, without executing code or resolving imports. */
function parseSource(source: string): ts.SourceFile | null {
  const file = ts.createSourceFile('description.ts', source, ts.ScriptTarget.Latest, true);
  return hasParseError(file) ? null : file;
}

/** Keep complete static spans; elide only template substitutions, never execute them. */
function evaluateStringExpression(expr: ts.Expression): EvaluatedDescription | null {
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    return expr.isUnterminated === true ? null : { text: expr.text, elidedSubstitutions: 0 };
  }
  if (ts.isTemplateExpression(expr)) {
    const text =
      expr.head.text + expr.templateSpans.map((span) => '<dynamic>' + span.literal.text).join('');
    return { text, elidedSubstitutions: expr.templateSpans.length };
  }
  if (ts.isParenthesizedExpression(expr)) return evaluateStringExpression(expr.expression);
  if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = evaluateStringExpression(expr.left);
    const right = evaluateStringExpression(expr.right);
    return left === null || right === null
      ? null
      : {
          text: left.text + right.text,
          elidedSubstitutions: left.elidedSubstitutions + right.elidedSubstitutions,
        };
  }
  return null;
}

/** Parse a whole string expression; unsupported or incomplete expressions fail loud. */
export function parseConcatenatedString(expr: string): EvaluatedDescription | null {
  const file = parseSource(`(${expr})`);
  const statement = file?.statements[0];
  if (file?.statements.length !== 1 || statement === undefined) return null;
  return ts.isExpressionStatement(statement)
    ? evaluateStringExpression(statement.expression)
    : null;
}

/** Find this tool's registration config in the AST, ignoring comments and strings. */
function findToolConfig(node: ts.Node, toolName: string): ts.ObjectLiteralExpression | undefined {
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    (node.expression.name.text === 'registerTool' ||
      node.expression.name.text === 'registerToolTask')
  ) {
    const [name, config] = node.arguments;
    if (
      name !== undefined &&
      ts.isStringLiteral(name) &&
      name.text === toolName &&
      config !== undefined &&
      ts.isObjectLiteralExpression(config)
    ) {
      return config;
    }
  }
  return ts.forEachChild(node, (child) => findToolConfig(child, toolName));
}

/** Match the config's own description property, including quoted property names. */
function isDescriptionProperty(property: ts.ObjectLiteralElementLike): boolean {
  const name = property.name;
  return (
    name !== undefined &&
    (ts.isIdentifier(name) || ts.isStringLiteral(name)) &&
    name.text === 'description'
  );
}

/**
 * Read the whole registerTool/registerToolTask description initializer, inline
 * or referenced by a const (including shorthand). Unsupported syntax returns null.
 */
export function extractRuntimeDescription(
  source: string,
  toolName: string
): EvaluatedDescription | null {
  const file = parseSource(source);
  if (file === null) return null;
  const config = findToolConfig(file, toolName);
  if (config === undefined) return null;
  for (const property of config.properties) {
    if (!isDescriptionProperty(property)) continue;
    if (ts.isShorthandPropertyAssignment(property)) return resolveConst(source, 'description');
    if (!ts.isPropertyAssignment(property)) return null;
    return ts.isIdentifier(property.initializer)
      ? resolveConst(source, property.initializer.text)
      : evaluateStringExpression(property.initializer);
  }
  return null;
}

/** Find a const declaration's whole initializer, rather than quoted fragments. */
function findConstInitializer(node: ts.Node, ident: string): ts.Expression | undefined {
  if (ts.isVariableDeclarationList(node) && (node.flags & ts.NodeFlags.Const) !== 0) {
    for (const declaration of node.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === ident) {
        return declaration.initializer;
      }
    }
  }
  return ts.forEachChild(node, (child) => findConstInitializer(child, ident));
}

/** Find const <ident> and evaluate its entire string initializer, or null. */
function resolveConst(source: string, ident: string): EvaluatedDescription | null {
  const file = parseSource(source);
  const initializer = file === null ? undefined : findConstInitializer(file, ident);
  return initializer === undefined ? null : evaluateStringExpression(initializer);
}

/** Normalize a description to a lowercase alphanumeric token set. */
function tokenSet(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2)
  );
}

/**
 * True if token `t` matches any token in `larger` — exact, or a loose stem
 * match (shared >=4-char prefix, or one is a prefix of the other) so
 * classify/classification and action/actions count as the same fact.
 */
function tokenMatches(t: string, larger: ReadonlySet<string>): boolean {
  if (larger.has(t)) return true;
  for (const u of larger) {
    if ((t.length >= 4 && u.startsWith(t.slice(0, 4))) || u.startsWith(t) || t.startsWith(u)) {
      return true;
    }
  }
  return false;
}

/**
 * Overlap-coefficient similarity (0..1): |intersection| / |smaller token set|.
 * Chosen over Jaccard because the two sources are independently-authored
 * summaries of DIFFERENT length (doc-table = curated summary; runtime contract
 * is often richer). Overlap measures "are the smaller description's facts present
 * in the larger" — a consistent shorter-vs-longer pair scores HIGH, while
 * genuinely-disagreeing descriptions (different facts) score LOW.
 */
export function similarity(a: string, b: string): number {
  const sa = [...tokenSet(a)];
  const sb = tokenSet(b);
  if (sa.length === 0 && sb.size === 0) return 1;
  const smaller = sa.length <= sb.size ? sa : [...sb];
  const larger = sa.length <= sb.size ? sb : new Set(sa);
  if (smaller.length === 0) return 0;
  let inter = 0;
  for (const t of smaller) if (tokenMatches(t, larger)) inter++;
  return inter / smaller.length;
}

/** Maps each tool file's source by tool name (via its registerTool call). */
function loadToolSources(): Map<string, string> {
  const map = new Map<string, string>();
  for (const file of readdirSync(TOOLS_DIR)) {
    if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
    const source = readFileSync(join(TOOLS_DIR, file), 'utf-8');
    const re = /registerTool(?:Task)?\(\s*['"]([a-z_]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      if (m[1] !== undefined) map.set(m[1], source);
    }
  }
  return map;
}

/**
 * Builds the drift report for every tool in `manifest` against `docTable`.
 * Pure over its inputs except for reading the tool source files.
 */
export function buildDriftReport(
  manifest: readonly string[],
  docTable: Readonly<Record<string, string>>
): DescriptionDriftReport {
  const sources = loadToolSources();
  const compared: { tool: string; elidedSubstitutions: number }[] = [];
  const drifts: DriftFinding[] = [];
  const unparseable: string[] = [];
  const missingDocEntry: string[] = [];

  for (const tool of manifest) {
    const docTableEntry = docTable[tool];
    if (docTableEntry === undefined) {
      missingDocEntry.push(tool);
      continue;
    }
    const source = sources.get(tool);
    const runtime = source !== undefined ? extractRuntimeDescription(source, tool) : null;
    if (runtime === null) {
      unparseable.push(tool);
      continue;
    }
    compared.push({ tool, elidedSubstitutions: runtime.elidedSubstitutions });
    const sim = similarity(runtime.text, docTableEntry);
    if (sim < SIMILARITY_THRESHOLD) {
      drifts.push({ tool, similarity: sim, runtime: runtime.text, docTable: docTableEntry });
    }
  }
  return { compared, drifts, unparseable, missingDocEntry };
}

/** Make elided template substitutions visible for every affected comparison. */
function printElidedSubstitutions(report: DescriptionDriftReport): void {
  for (const { tool, elidedSubstitutions } of report.compared) {
    if (elidedSubstitutions > 0) {
      console.log(`  ${tool} compared with ${String(elidedSubstitutions)} elided substitutions`);
    }
  }
}

/** CLI gate: exits non-zero on any drift, unparseable, or missing entry. */
function main(): void {
  const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
  const report = buildDriftReport(
    TOOL_MANIFEST.map((t) => t.name),
    TOOL_DESCRIPTIONS
  );
  const problems = report.drifts.length + report.unparseable.length + report.missingDocEntry.length;

  if (verbose) printElidedSubstitutions(report);
  if (report.missingDocEntry.length > 0) {
    console.error(
      `✗ ${String(report.missingDocEntry.length)} tool(s) missing a TOOL_DESCRIPTIONS entry:`
    );
    console.error('  ' + report.missingDocEntry.join(', '));
  }
  if (report.unparseable.length > 0) {
    console.error(
      `✗ ${String(report.unparseable.length)} tool(s) whose runtime registerTool description could not be parsed.`
    );
    console.error('  Expose each as a parseable `const DESCRIPTION` / `const description`:');
    console.error('  ' + report.unparseable.join(', '));
  }
  if (report.drifts.length > 0) {
    console.error(
      `✗ ${String(report.drifts.length)} tool(s) whose runtime description drifts from TOOL_DESCRIPTIONS (similarity < ${String(SIMILARITY_THRESHOLD)}):`
    );
    for (const d of report.drifts) {
      console.error(`  - ${d.tool} (similarity ${d.similarity.toFixed(2)})`);
      if (verbose) {
        console.error(`      runtime:  ${d.runtime}`);
        console.error(`      doctable: ${d.docTable}`);
      }
    }
    console.error(
      '  Reconcile the doc-table entry (scripts/tool-descriptions-data.ts) with the runtime description.'
    );
  }

  if (problems === 0) {
    console.log(
      `✓ MCP description-drift check passed (${String(report.compared.length)} tools compared).`
    );
    process.exit(0);
  }
  process.exit(1);
}

const invokedDirectly = process.argv[1]?.endsWith('check-mcp-description-drift.ts') === true;
if (invokedDirectly) {
  main();
}
