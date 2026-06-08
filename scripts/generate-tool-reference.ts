#!/usr/bin/env npx tsx
/**
 * MCP Tool Reference Generator (#3687, child of docs-site epic #3532).
 *
 * Emits a per-tool MCP reference into the Astro `docs` content collection
 * (`docs/reference/tools/`) so each of the registered tools gets a page with
 * its name, one-line description, and an input-parameter summary. The data is
 * sourced from the existing single-source surfaces — it is never hand-written,
 * so it cannot drift:
 *
 *   - tool list  → `TOOL_MANIFEST` (canonical, #3566)
 *   - description→ `TOOL_DESCRIPTIONS` (scripts/tool-descriptions-data.ts, the
 *                  same map the description-drift gate validates against)
 *   - parameters → the exported `*InputSchema` Zod object in each tool's source,
 *                  parsed statically (no module import — same hazard-free
 *                  approach as scripts/check-mcp-description-drift.ts; importing
 *                  the tool modules at build time trips a pre-existing
 *                  ci-health circular-init bug under tsx ESM evaluation).
 *
 * Composes with, rather than forks, the existing doc tooling:
 *   - reuses `parseConcatenatedString` from check-mcp-description-drift.ts to
 *     resolve `.describe('a' + 'b')` literals;
 *   - follows the generate-docs-content.ts pattern (generate + `--check` mode);
 *   - lands in the spike's (#3686) Astro `docs` collection, which reads the
 *     repo-top-level `docs/` dir and requires a `title` in frontmatter.
 *
 * Usage:
 *   npx tsx scripts/generate-tool-reference.ts          # write the reference
 *   npx tsx scripts/generate-tool-reference.ts --check  # fail if out of date
 *
 * @module scripts/generate-tool-reference
 * (Source: Issue #3687)
 */

/* eslint-disable no-console */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { SRC_ROOT, DOCS_ROOT } from './script-paths.js';
import { TOOL_MANIFEST } from '../packages/nexus-agents/src/mcp/tools/tool-manifest.js';
import { TOOL_DESCRIPTIONS, README_TOOL_DESCRIPTIONS } from './tool-descriptions-data.js';
import { parseConcatenatedString } from './check-mcp-description-drift.js';

const CHECK_MODE = process.argv.includes('--check');
const TOOLS_DIR = join(SRC_ROOT, 'mcp/tools');
const OUT_DIR = join(DOCS_ROOT, 'reference/tools');

/**
 * Maps each manifest tool name to the exported `*InputSchema` const that
 * defines its input parameters. Curated (the runtime `inputSchema:` arg name is
 * inconsistent across tools — `toolSchema`, `*.shape`, locals), and validated
 * against the manifest at generation time: a manifest tool with no mapping, or
 * a mapping whose schema can't be found, fails loud (mirrors the drift gate's
 * fail-loud contract). Adding a tool? Add its row here.
 */
const TOOL_SCHEMA_NAMES: Record<string, string> = {
  orchestrate: 'OrchestrateInputSchema',
  create_expert: 'CreateExpertInputSchema',
  execute_expert: 'ExecuteExpertInputSchema',
  run_workflow: 'RunWorkflowInputSchema',
  delegate_to_model: 'DelegateInputSchema',
  list_experts: 'ListExpertsInputSchema',
  list_workflows: 'ListWorkflowsInputSchema',
  consensus_vote: 'ConsensusVoteInputSchema',
  research_query: 'ResearchQueryInputSchema',
  research_add: 'ResearchAddInputSchema',
  research_add_source: 'ResearchAddSourceInputSchema',
  research_discover: 'ResearchDiscoverInputSchema',
  research_analyze: 'ResearchAnalyzeInputSchema',
  research_catalog_review: 'ResearchCatalogReviewInputSchema',
  research_synthesize: 'ResearchSynthesizeInputSchema',
  survey_oss_landscape: 'SurveyOssLandscapeInputSchema',
  vendor_publishing_audit: 'VendorPublishingAuditInputSchema',
  compare_data_feeds: 'CompareDataFeedsInputSchema',
  memory_query: 'MemoryQueryInputSchema',
  memory_stats: 'MemoryStatsInputSchema',
  memory_write: 'MemoryWriteInputSchema',
  weather_report: 'WeatherReportInputSchema',
  issue_triage: 'IssueTriageInputSchema',
  run_graph_workflow: 'RunGraphWorkflowInputSchema',
  execute_spec: 'ExecuteSpecInputSchema',
  registry_import: 'RegistryImportInputSchema',
  query_trace: 'QueryTraceInputSchema',
  query_task_state: 'QueryTaskStateInputSchema',
  get_job_result: 'GetJobResultInputSchema',
  list_jobs: 'ListJobsInputSchema',
  cancel_job: 'CancelJobInputSchema',
  ci_health_check: 'CiHealthCheckInputSchema',
  verify_audit_chain: 'VerifyAuditChainInputSchema',
  repo_analyze: 'RepoAnalyzeInputSchema',
  repo_security_plan: 'RepoSecurityPlanInputSchema',
  extract_symbols: 'ExtractSymbolsInputSchema',
  search_codebase: 'SearchCodebaseInputSchema',
  run_dev_pipeline: 'DevPipelineInputSchema',
  run_pipeline: 'PipelineInputSchema',
  pr_review: 'PrReviewInputSchema',
  supply_chain_tradeoff_panel: 'SupplyChainTradeoffPanelInputSchema',
  improvement_review: 'ImprovementReviewInputSchema',
  run_quality_gate: 'RunQualityGateInputSchema',
  suggest_research_tasks: 'SuggestResearchTasksInputSchema',
  list_available_models: 'ListAvailableModelsInputSchema',
  run: 'RunInputSchema',
};

// ─── Schema parsing ────────────────────────────────────────────────────────

/** One parsed input parameter of a tool. */
interface ParamInfo {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly description: string;
}

/**
 * Map a tool's source filename by the `*InputSchema` const it defines. We scan
 * for `(export )?const <Name> = z.object(` so re-export-only files are skipped
 * and the *defining* file wins.
 */
function indexSchemaFiles(): Map<string, string> {
  const byName = new Map<string, string>();
  for (const file of readdirSync(TOOLS_DIR)) {
    if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
    const source = readFileSync(join(TOOLS_DIR, file), 'utf-8');
    const re = /(?:export\s+)?const\s+([A-Za-z0-9_]+InputSchema)\s*=\s*z\.object\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      if (m[1] !== undefined && !byName.has(m[1])) byName.set(m[1], source);
    }
  }
  return byName;
}

/**
 * Strip `//` and block comments from a TS snippet so brace/paren balancing and
 * field detection are not thrown off by punctuation inside comments (JSDoc on
 * schema fields routinely contains `{`, `(`, `owner/repo`, etc.).
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * Slice the `z.object({ ... })` body for `schemaName` from its source, balancing
 * braces so nested objects are contained. Returns null if not found.
 */
function extractObjectBody(source: string, schemaName: string): string | null {
  const start = source.search(
    new RegExp(
      `const\\s+${schemaName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*z\\.object\\(\\s*\\{`
    )
  );
  if (start === -1) return null;
  const braceStart = source.indexOf('{', start);
  if (braceStart === -1) return null;
  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(braceStart + 1, i);
    }
  }
  return null;
}

/**
 * Split the object body into top-level field chunks (one per `name: z....`),
 * ignoring commas nested inside braces/parens/brackets.
 */
function splitTopLevelFields(body: string): string[] {
  const chunks: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '{' || ch === '(' || ch === '[') depth++;
    else if (ch === '}' || ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) {
      chunks.push(body.slice(start, i));
      start = i + 1;
    }
  }
  chunks.push(body.slice(start));
  return chunks.map((c) => c.trim()).filter((c) => c.length > 0);
}

/** Base `z.<kind>` → label map for simple scalar/container types. */
const SIMPLE_TYPES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^z\.string\b/, 'string'],
  [/^z\.number\b/, 'number'],
  [/^z\.boolean\b/, 'boolean'],
  [/^z\.array\b/, 'array'],
  [/^z\.record\b/, 'record'],
  [/^z\.object\b/, 'object'],
  [/^z\.literal\b/, 'literal'],
  [/^z\.union\b/, 'union'],
];

/** Render an inline `z.enum([...])` as `enum: a | b | c`, or `enum` if opaque. */
function inferEnum(expr: string): string {
  const en = expr.match(/z\.(?:native)?[Ee]num\(\s*\[([\s\S]*?)\]/);
  const vals = en?.[1]?.match(/'[^']*'|"[^"]*"/g);
  if (vals && vals.length > 0) {
    return `enum: ${vals.map((v) => v.replace(/['"]/g, '')).join(' | ')}`;
  }
  return 'enum';
}

/** Human-readable base type for a field chunk's `z.<...>` expression. */
function inferType(chunk: string): string {
  const expr = chunk
    .slice(chunk.indexOf(':') + 1)
    .replace(/\s+/g, ' ')
    .replace(/z\s*\.\s*/g, 'z.')
    .trim();
  for (const [re, label] of SIMPLE_TYPES) {
    if (re.test(expr)) return label;
  }
  if (/^z\.enum\b/.test(expr) || /^z\.nativeEnum\b/.test(expr)) return inferEnum(expr);
  // Field defined via a referenced schema const (e.g. `VotingStrategySchema`).
  // Resolving its enum members would require chasing the const across files;
  // surface the schema name so the reader knows the concrete type to consult.
  const ref = expr.match(/^([A-Z][A-Za-z0-9_]*(?:Schema|Enum))\b/);
  return ref?.[1] ?? 'object';
}

/** Pull the `.describe(...)` text from a field chunk (handles concatenation). */
function extractDescribe(chunk: string): string {
  const idx = chunk.indexOf('.describe(');
  if (idx === -1) return '';
  // Slice from inside `.describe(` to the matching close paren, then reuse the
  // drift gate's concatenated-string-literal parser.
  const open = idx + '.describe('.length;
  let depth = 1;
  let end = open;
  for (let i = open; i < chunk.length; i++) {
    const ch = chunk[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const inner = chunk.slice(open, end);
  return parseConcatenatedString(inner) ?? '';
}

/** Parse a schema's parameters from its source. Throws if the schema is absent. */
function parseParams(rawSource: string, schemaName: string, tool: string): ParamInfo[] {
  const source = stripComments(rawSource);
  const body = extractObjectBody(source, schemaName);
  if (body === null) {
    throw new Error(`Could not locate z.object body for ${schemaName} (tool "${tool}")`);
  }
  const params: ParamInfo[] = [];
  for (const chunk of splitTopLevelFields(body)) {
    const nameMatch = chunk.match(/^([A-Za-z0-9_]+)\s*:/);
    const name = nameMatch?.[1];
    if (name === undefined) continue;
    const required = !/\.optional\(\)|\.default\(/.test(chunk);
    params.push({
      name,
      type: inferType(chunk),
      required,
      description: extractDescribe(chunk).replace(/\s+/g, ' ').trim(),
    });
  }
  return params;
}

// ─── Markdown emission ───────────────────────────────────────────────────────

interface ToolDoc {
  readonly name: string;
  readonly description: string;
  readonly short: string;
  readonly params: ParamInfo[];
}

function collectToolDocs(): ToolDoc[] {
  const schemaSources = indexSchemaFiles();
  const docs: ToolDoc[] = [];
  for (const tool of TOOL_MANIFEST) {
    const schemaName = TOOL_SCHEMA_NAMES[tool];
    if (schemaName === undefined) {
      throw new Error(`No TOOL_SCHEMA_NAMES mapping for manifest tool "${tool}"`);
    }
    const description = TOOL_DESCRIPTIONS[tool];
    if (description === undefined) {
      throw new Error(`No TOOL_DESCRIPTIONS entry for manifest tool "${tool}"`);
    }
    const source = schemaSources.get(schemaName);
    if (source === undefined) {
      throw new Error(`No source defines ${schemaName} (tool "${tool}")`);
    }
    docs.push({
      name: tool,
      description,
      short: README_TOOL_DESCRIPTIONS[tool] ?? description,
      params: parseParams(source, schemaName, tool),
    });
  }
  return docs;
}

/** YAML-escape a scalar for single-quoted frontmatter. */
function yamlQuote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

function renderToolPage(doc: ToolDoc): string {
  const lines: string[] = [];
  lines.push('---');
  lines.push(`title: ${yamlQuote(`MCP Tool: ${doc.name}`)}`);
  lines.push(`description: ${yamlQuote(doc.short)}`);
  lines.push('tier: 2');
  lines.push('keywords: [mcp, tool, reference, ' + doc.name + ']');
  lines.push('---');
  lines.push('');
  lines.push(`# \`${doc.name}\``);
  lines.push('');
  lines.push('> Auto-generated from the registered MCP tool descriptions and input');
  lines.push('> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.');
  lines.push('');
  lines.push(doc.description);
  lines.push('');
  lines.push('## Parameters');
  lines.push('');
  if (doc.params.length === 0) {
    lines.push('_This tool takes no input parameters._');
  } else {
    lines.push('| Parameter | Type | Required | Description |');
    lines.push('| --------- | ---- | -------- | ----------- |');
    for (const p of doc.params) {
      const desc = p.description.replace(/\|/g, '\\|') || '—';
      lines.push(
        `| \`${p.name}\` | ${p.type.replace(/\|/g, '\\|')} | ${p.required ? 'yes' : 'no'} | ${desc} |`
      );
    }
  }
  lines.push('');
  return lines.join('\n');
}

function renderIndexPage(docs: ToolDoc[]): string {
  const lines: string[] = [];
  lines.push('---');
  lines.push(`title: 'MCP Tool Reference'`);
  lines.push(
    `description: 'Per-tool reference for all ${String(docs.length)} registered nexus-agents MCP tools, generated from the tool manifest and input schemas.'`
  );
  lines.push('tier: 1');
  lines.push('keywords: [mcp, tools, reference, api]');
  lines.push('---');
  lines.push('');
  lines.push('# MCP Tool Reference');
  lines.push('');
  lines.push('> Auto-generated from the registered MCP tool descriptions and input');
  lines.push('> schemas (`pnpm docs:tools`). Do not edit by hand.');
  lines.push('');
  lines.push(
    `nexus-agents exposes **${String(docs.length)} MCP tools** via stdio. Each tool below links to its full parameter reference.`
  );
  lines.push('');
  lines.push('| Tool | Summary |');
  lines.push('| ---- | ------- |');
  for (const doc of docs) {
    const summary = doc.short.replace(/\|/g, '\\|');
    lines.push(`| [\`${doc.name}\`](./${doc.name}.md) | ${summary} |`);
  }
  lines.push('');
  return lines.join('\n');
}

// ─── Drift detection (for --check) ───────────────────────────────────────────

interface OutFile {
  readonly path: string;
  readonly content: string;
}

function buildOutputs(): OutFile[] {
  const docs = collectToolDocs();
  const out: OutFile[] = [{ path: join(OUT_DIR, 'index.md'), content: renderIndexPage(docs) }];
  for (const doc of docs) {
    out.push({ path: join(OUT_DIR, `${doc.name}.md`), content: renderToolPage(doc) });
  }
  return out;
}

/** Compare on-disk pages to `outputs`; returns human-readable drift lines. */
function findDrifts(outputs: OutFile[]): string[] {
  const drifts: string[] = [];
  const expected = new Set(outputs.map((o) => o.path));
  // Stale files: anything in OUT_DIR not in the expected set.
  if (existsSync(OUT_DIR)) {
    for (const f of readdirSync(OUT_DIR)) {
      if (f.endsWith('.md') && !expected.has(join(OUT_DIR, f))) {
        drifts.push(`stale (should be removed): ${f}`);
      }
    }
  }
  for (const o of outputs) {
    const current = existsSync(o.path) ? readFileSync(o.path, 'utf-8') : null;
    if (current === null) drifts.push(`missing: ${o.path}`);
    else if (current !== o.content) drifts.push(`out of date: ${o.path}`);
  }
  return drifts;
}

function runCheck(outputs: OutFile[]): void {
  const drifts = findDrifts(outputs);
  if (drifts.length === 0) {
    console.log(`✓ Tool reference up to date (${String(outputs.length)} files).`);
    process.exit(0);
  }
  console.error(`✗ Tool reference drift (${String(drifts.length)}):`);
  for (const d of drifts) console.error(`  - ${d}`);
  console.error('  Run "pnpm docs:tools" to regenerate.');
  process.exit(1);
}

function main(): void {
  const outputs = buildOutputs();
  if (CHECK_MODE) {
    runCheck(outputs);
    return;
  }
  // Clean stale pages then write.
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });
  for (const o of outputs) writeFileSync(o.path, o.content, 'utf-8');
  console.log(`✓ Generated ${String(outputs.length)} tool-reference files into ${OUT_DIR}`);
}

main();
