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
 *                  converted to JSON Schema via Zod v4's native
 *                  `z.toJSONSchema(... , { io: 'input' })` so the page reflects
 *                  the FULL input contract: enum members, min/max, pattern,
 *                  defaults, and per-field descriptions (#3688). The schema is
 *                  read live by dynamically importing each tool's defining
 *                  module; the previously-feared ci-health circular-init under
 *                  tsx does not reproduce for these schema-only imports.
 *
 * Composes with, rather than forks, the existing doc tooling:
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
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { z as zType } from 'zod';
import { SRC_ROOT, DOCS_ROOT } from './script-paths.js';
import { TOOL_MANIFEST } from '../packages/nexus-agents/src/mcp/tools/tool-manifest.js';
import { TOOL_DESCRIPTIONS, README_TOOL_DESCRIPTIONS } from './tool-descriptions-data.js';

/** The single `zod` surface this generator needs: the schema→JSON-Schema converter. */
type ToJsonSchema = (schema: zType.ZodType, options: { target: string; io: string }) => unknown;

/**
 * `zod` is a dependency of `packages/nexus-agents`, not of the repo root where
 * this script lives, so a bare `import 'zod'` does not resolve under pnpm's
 * isolated store. Resolve it through the package's own module graph instead:
 * `createRequire` anchored at a package source file finds the exact `zod` the
 * tool schemas were built against, independent of hoisting. Loaded lazily so
 * the failure (if any) surfaces inside generation, not at import time.
 */
let toJsonSchemaPromise: Promise<ToJsonSchema> | undefined;
function loadToJsonSchema(): Promise<ToJsonSchema> {
  if (toJsonSchemaPromise === undefined) {
    const anchor = join(SRC_ROOT, 'mcp/tools/tool-manifest.ts');
    const require = createRequire(anchor);
    const zodEntry = require.resolve('zod');
    toJsonSchemaPromise = import(pathToFileURL(zodEntry).href).then(
      (mod: Record<string, unknown>) => {
        const fn = mod.toJSONSchema;
        if (typeof fn !== 'function') {
          throw new Error('zod module did not export a toJSONSchema function');
        }
        return fn as ToJsonSchema;
      }
    );
  }
  return toJsonSchemaPromise;
}

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
  search_usages: 'SearchUsagesInputSchema',
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

// ─── Schema introspection (Zod v4 native → JSON Schema, #3688) ───────────────

/** One parameter of a tool, derived from the live Zod schema's JSON Schema. */
export interface ParamInfo {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly description: string;
  /** Rendered constraint summary (enum members, min/max, pattern, default). */
  readonly constraints: string;
}

/**
 * Map each `*InputSchema` const name to the source file that *defines* it
 * (scans for `export const <Name> = z.object(`, skipping re-export-only files).
 * Returns relative-to-TOOLS_DIR filenames so we can dynamically import the
 * defining module and read the live Zod schema object. Note: not every schema
 * is re-exported from the `tools/index.ts` barrel (e.g. `DevPipelineInputSchema`
 * is exported from its own module but not the barrel), so we import the
 * defining module directly rather than relying on the barrel.
 */
function indexSchemaFiles(): Map<string, string> {
  const byName = new Map<string, string>();
  for (const file of readdirSync(TOOLS_DIR)) {
    if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
    const source = readFileSync(join(TOOLS_DIR, file), 'utf-8');
    const re = /export\s+const\s+([A-Za-z0-9_]+InputSchema)\s*=\s*z\.object\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      if (m[1] !== undefined && !byName.has(m[1])) byName.set(m[1], file);
    }
  }
  return byName;
}

/**
 * A JSON Schema node for a single property, as emitted by `z.toJSONSchema`.
 * Only the fields we render are typed; the converter is a trusted in-repo
 * source, so a structural shape suffices (no schema-validating it).
 */
interface JsonSchemaNode {
  readonly type?: string | readonly string[];
  readonly description?: string;
  readonly enum?: readonly unknown[];
  readonly const?: unknown;
  readonly default?: unknown;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly exclusiveMinimum?: number;
  readonly exclusiveMaximum?: number;
  readonly pattern?: string;
  readonly format?: string;
  readonly items?: unknown;
}

/** The object-shaped JSON Schema `z.toJSONSchema` emits for a `z.object`. */
interface ObjectJsonSchema {
  readonly properties?: Readonly<Record<string, JsonSchemaNode>>;
  readonly required?: readonly string[];
}

/** Narrow an unknown JSON value to a JSON Schema node (non-null object). */
function asNode(v: unknown): JsonSchemaNode | undefined {
  return typeof v === 'object' && v !== null ? v : undefined;
}

/** Render a JSON Schema scalar value compactly for a doc table cell. */
function renderScalar(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

/** Human-readable base type label for a property node. */
function nodeType(node: JsonSchemaNode): string {
  if (node.enum !== undefined && node.enum.length > 0) return 'enum';
  if (node.const !== undefined) return 'literal';
  const t = node.type;
  if (typeof t === 'string') {
    if (t === 'array' && node.items !== undefined) {
      const item = asNode(node.items);
      const itemType = item !== undefined ? nodeType(item) : 'object';
      // Avoid `array<T>` (angle brackets trip markdownlint MD033 / inline-HTML).
      return `array of ${itemType}`;
    }
    return t;
  }
  if (Array.isArray(t)) return t.join(' | ');
  return 'object';
}

/** Numeric/length range constraints, each rendered only when present. */
function rangeConstraints(node: JsonSchemaNode): string[] {
  const ranges: ReadonlyArray<readonly [number | undefined, string]> = [
    [node.minLength, 'minLength'],
    [node.maxLength, 'maxLength'],
    [node.minimum, 'min'],
    [node.maximum, 'max'],
    [node.exclusiveMinimum, '>'],
    [node.exclusiveMaximum, '<'],
  ];
  return ranges.filter(([v]) => v !== undefined).map(([v, label]) => `${label} ${String(v)}`);
}

/** The leading enum-members / const-value clause, if any. */
function valueConstraint(node: JsonSchemaNode): string | undefined {
  if (node.enum !== undefined && node.enum.length > 0) {
    // Use a plain `|` separator; escapeCell() escapes it for the table cell.
    return `one of: ${node.enum.map(renderScalar).join(' | ')}`;
  }
  if (node.const !== undefined) return `= ${renderScalar(node.const)}`;
  return undefined;
}

/**
 * Collapse the JSON Schema constraint keywords for a property into a compact,
 * deterministic summary string (enum members, min/max, pattern, default).
 */
function nodeConstraints(node: JsonSchemaNode): string {
  const parts: string[] = [];
  const value = valueConstraint(node);
  if (value !== undefined) parts.push(value);
  parts.push(...rangeConstraints(node));
  if (node.pattern !== undefined) parts.push(`pattern \`${node.pattern}\``);
  if (node.format !== undefined) parts.push(`format ${node.format}`);
  if (node.default !== undefined) parts.push(`default ${renderScalar(node.default)}`);
  return parts.join('; ');
}

/**
 * Resolve a tool's live `*InputSchema` by dynamically importing its defining
 * module, convert it to JSON Schema via Zod v4's native `z.toJSONSchema`
 * (`io: 'input'` so `.default()`/`.optional()` are reflected as the caller sees
 * them), and project the top-level properties into {@link ParamInfo} rows.
 *
 * Throws (fail-loud, mirroring the manifest validation) if the module does not
 * export the named schema or the conversion yields no object shape.
 */
async function paramsForSchema(
  schemaFile: string,
  schemaName: string,
  tool: string
): Promise<ParamInfo[]> {
  const toJsonSchema = await loadToJsonSchema();
  const moduleUrl = pathToFileURL(join(TOOLS_DIR, schemaFile)).href;
  const mod = (await import(moduleUrl)) as Record<string, unknown>;
  const schema = mod[schemaName];
  if (schema === undefined) {
    throw new Error(`Module ${schemaFile} does not export ${schemaName} (tool "${tool}")`);
  }
  // The cast is the single boundary where the dynamically-imported value meets
  // the typed converter; `io: 'input'` reflects `.default()`/`.optional()` as
  // the caller supplies them.
  const json = toJsonSchema(schema as zType.ZodType, { target: 'draft-7', io: 'input' });
  const obj = asNode(json) as ObjectJsonSchema | undefined;
  if (obj?.properties === undefined) {
    throw new Error(`${schemaName} did not convert to an object schema (tool "${tool}")`);
  }
  const required = new Set(obj.required ?? []);
  const params: ParamInfo[] = [];
  // Preserve the schema's declaration order (Object key order from Zod).
  for (const [name, node] of Object.entries(obj.properties)) {
    params.push({
      name,
      type: nodeType(node),
      required: required.has(name),
      description: (node.description ?? '').replace(/\s+/g, ' ').trim(),
      constraints: nodeConstraints(node),
    });
  }
  return params;
}

// ─── Markdown emission ───────────────────────────────────────────────────────

export interface ToolDoc {
  readonly name: string;
  readonly description: string;
  readonly short: string;
  readonly params: ParamInfo[];
}

export async function collectToolDocs(): Promise<ToolDoc[]> {
  const schemaFiles = indexSchemaFiles();
  const docs: ToolDoc[] = [];
  for (const { name: tool } of TOOL_MANIFEST) {
    const schemaName = TOOL_SCHEMA_NAMES[tool];
    if (schemaName === undefined) {
      throw new Error(`No TOOL_SCHEMA_NAMES mapping for manifest tool "${tool}"`);
    }
    const description = TOOL_DESCRIPTIONS[tool];
    if (description === undefined) {
      throw new Error(`No TOOL_DESCRIPTIONS entry for manifest tool "${tool}"`);
    }
    const schemaFile = schemaFiles.get(schemaName);
    if (schemaFile === undefined) {
      throw new Error(`No source defines ${schemaName} (tool "${tool}")`);
    }
    docs.push({
      name: tool,
      description,
      short: README_TOOL_DESCRIPTIONS[tool] ?? description,
      params: await paramsForSchema(schemaFile, schemaName, tool),
    });
  }
  return docs;
}

/** YAML-escape a scalar for single-quoted frontmatter. */
function yamlQuote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/**
 * Escape a string for a single Markdown table cell. The escape character `\`
 * is escaped FIRST (so existing backslashes can't form spurious escapes), then
 * the cell delimiter `|`, then newlines are flattened (they'd break the row).
 */
function escapeCell(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

export function renderToolPage(doc: ToolDoc): string {
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
    lines.push('| Parameter | Type | Required | Constraints | Description |');
    lines.push('| --------- | ---- | -------- | ----------- | ----------- |');
    for (const p of doc.params) {
      const desc = escapeCell(p.description) || '—';
      const constraints = escapeCell(p.constraints) || '—';
      lines.push(
        `| \`${p.name}\` | ${escapeCell(p.type)} | ${p.required ? 'yes' : 'no'} | ${constraints} | ${desc} |`
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
    const summary = escapeCell(doc.short);
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

/** Tool names are identifiers; reject anything that could escape OUT_DIR (path-injection guard). */
const SAFE_TOOL_NAME = /^[a-z0-9_]+$/;

async function buildOutputs(): Promise<OutFile[]> {
  const docs = await collectToolDocs();
  const out: OutFile[] = [{ path: join(OUT_DIR, 'index.md'), content: renderIndexPage(docs) }];
  for (const doc of docs) {
    // Sanitize the data-derived filename: doc.name comes from parsed source, so
    // assert it's a plain identifier before using it in a filesystem path.
    if (!SAFE_TOOL_NAME.test(doc.name)) {
      throw new Error(`unsafe tool name for file path: ${JSON.stringify(doc.name)}`);
    }
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

async function main(): Promise<void> {
  const outputs = await buildOutputs();
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

// Only run when invoked directly (not when imported by the test for its pure
// render/collect helpers).
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
