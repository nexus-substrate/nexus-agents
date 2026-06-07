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

/* eslint-disable no-console */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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

export interface DescriptionDriftReport {
  /** Tools whose runtime vs doc-table descriptions disagree below threshold. */
  readonly drifts: readonly DriftFinding[];
  /** Manifest tools whose runtime description could not be statically parsed. */
  readonly unparseable: readonly string[];
  /** Manifest tools with no TOOL_DESCRIPTIONS entry. */
  readonly missingDocEntry: readonly string[];
}

/**
 * Concatenate the string-literal segments of a JS/TS expression, joining
 * `'a' + 'b'`-style concatenations. Returns null if no string literal is found
 * (e.g. a computed/templated expression we won't guess at — fail loud).
 */
export function parseConcatenatedString(expr: string): string | null {
  // A template-literal expression (the RHS *starts* with a backtick): take its
  // static text, blanking out `${...}` interpolations (the doc-table carries the
  // expanded form; the surrounding prose is what we compare on). Gate on the
  // leading backtick so a markdown code-span (e.g. `tool_name`) INSIDE a
  // single-quoted string is not mistaken for a template literal.
  if (expr.trimStart().startsWith('`')) {
    const tmpl = expr.match(/`((?:[^`\\]|\\.)*)`/);
    if (tmpl?.[1] !== undefined) {
      const text = tmpl[1].replace(/\$\{[^}]*\}/g, ' ').replace(/\\(['"`\\])/g, '$1');
      return text.trim().length > 0 ? text : null;
    }
  }
  // Match single/double-quoted literals, honoring backslash escapes.
  const re = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g;
  const parts: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(expr)) !== null) {
    const raw = m[1] ?? m[2] ?? '';
    parts.push(raw.replace(/\\(['"\\])/g, '$1'));
  }
  if (parts.length === 0) return null;
  return parts.join('');
}

/**
 * Extract the runtime registerTool description for `toolName` from a tool source
 * file. Handles the two real shapes: a `const description`/`const *_DESCRIPTION`
 * declaration referenced as `description,`, and an inline `description: '...'`.
 * Returns null when it cannot be parsed (caller fails loud).
 */
export function extractRuntimeDescription(source: string, toolName: string): string | null {
  // Locate the registerTool call for this tool (name as first string arg,
  // possibly on the next line).
  const callIdx = source.search(
    // `server.registerTool(` or the MCP Tasks `registerToolTask(` form.
    new RegExp(
      `registerTool(?:Task)?\\(\\s*['"]${toolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`
    )
  );
  if (callIdx === -1) return null;
  // Bound the search to the registerTool config object's description field —
  // i.e. up to `inputSchema` (which always follows `description` in these
  // configs). Without this bound a later `description:` (e.g. a Zod schema
  // field) inside the call window can be grabbed by mistake.
  const window = source.slice(callIdx, callIdx + 2000);
  const cfgEnd = window.indexOf('inputSchema');
  const after = cfgEnd > 0 ? window.slice(0, cfgEnd) : window;

  // Inline: `description: '...'` (+ concatenations) up to the line's end.
  const inline = after.match(
    /description:\s*((?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")(?:\s*\+\s*(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"))*)/
  );
  if (inline?.[1] !== undefined) {
    return parseConcatenatedString(inline[1]);
  }

  // Reference: `description: IDENT,` or shorthand `description,` → resolve const.
  const ref = after.match(/description:\s*([A-Za-z_$][\w$]*)\s*[,}]/);
  const ident = ref?.[1] ?? (/(?:^|[,{\s])description\s*[,}]/.test(after) ? 'description' : null);
  if (ident === null) return null;
  return resolveConst(source, ident);
}

/** Finds `const <ident> = <expr>;` and parses its string value, or null. */
function resolveConst(source: string, ident: string): string | null {
  const decl = source.match(
    new RegExp(`const\\s+${ident.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*([\\s\\S]*?);`)
  );
  if (decl?.[1] === undefined) return null;
  return parseConcatenatedString(decl[1]);
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
    const sim = similarity(runtime, docTableEntry);
    if (sim < SIMILARITY_THRESHOLD) {
      drifts.push({ tool, similarity: sim, runtime, docTable: docTableEntry });
    }
  }
  return { drifts, unparseable, missingDocEntry };
}

/** CLI gate: exits non-zero on any drift, unparseable, or missing entry. */
function main(): void {
  const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
  const report = buildDriftReport([...TOOL_MANIFEST], TOOL_DESCRIPTIONS);
  const problems = report.drifts.length + report.unparseable.length + report.missingDocEntry.length;

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
    console.log(`✓ MCP description-drift check passed (${String(TOOL_MANIFEST.length)} tools).`);
    process.exit(0);
  }
  process.exit(1);
}

const invokedDirectly = process.argv[1]?.endsWith('check-mcp-description-drift.ts') === true;
if (invokedDirectly) {
  main();
}
