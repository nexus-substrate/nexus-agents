#!/usr/bin/env npx tsx
/* eslint-disable max-lines */
/**
 * Governance Injection Script
 *
 * Generates and injects documentation for MCP tools, expert types,
 * workflow templates, and skills into CLAUDE.md from canonical source code.
 * Prevents documentation drift by reading directly from source of truth.
 *
 * Per System Mandate - Constraint #4: MCP Governance Injection
 *
 * Usage:
 *   npx tsx scripts/inject-governance.ts          # inject all sections
 *   npx tsx scripts/inject-governance.ts inject    # same as above
 *   npx tsx scripts/inject-governance.ts check     # CI validation mode
 *
 * @module scripts/inject-governance
 * (Source: Issue #569, #761)
 */

/* eslint-disable no-console */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import * as prettier from 'prettier';
import { parse as parseYaml } from 'yaml';
import { ROOT } from './script-paths.js';
import { parseRegisteredToolNames } from './parse-tool-manifest.js';
import { TOOL_DESCRIPTIONS, README_TOOL_DESCRIPTIONS } from './tool-descriptions-data.js';
import { loadBaseline, runDistinctnessCheck } from './check-tool-distinctness.js';
import { scanToolFiles } from './check-tool-output-consistency.js';
import {
  newOffenders as newMemoryContractOffenders,
  readBaseline as readMemoryContractBaseline,
  scan as scanMemoryContract,
} from './check-memory-contract.js';
import { checkStrategyManifestRegistry } from './check-strategy-manifest-drift.js';
const CLAUDE_MD_PATH = join(ROOT, 'CLAUDE.md');
const README_PATH = join(ROOT, 'README.md');
// #3334: docs/ENTRYPOINTS.md carries TWO MCP-tool enumerations (a prose
// markdown table + a `BEGIN:MCP_TOOLS` YAML block) that drifted to 42/45
// while REGISTERED_TOOL_NAMES grew. Both are now generated from the same
// registry + TOOL_DESCRIPTIONS corpus as the CLAUDE.md / README surfaces.
const ENTRYPOINTS_PATH = join(ROOT, 'docs/ENTRYPOINTS.md');
const TOOLS_INDEX = join(ROOT, 'packages/nexus-agents/src/mcp/tools/index.ts');
// #3566: the canonical tool-name list is now the leaf `TOOL_MANIFEST` array;
// `REGISTERED_TOOL_NAMES` is a derived re-export, so the parser reads the manifest.
const TOOL_MANIFEST_FILE = join(ROOT, 'packages/nexus-agents/src/mcp/tools/tool-manifest.ts');
const EXPERT_CONFIG = join(ROOT, 'packages/nexus-agents/src/agents/experts/expert-config.ts');
const TEMPLATE_TYPES = join(ROOT, 'packages/nexus-agents/src/workflows/template-types.ts');
const SKILLS_DIR = join(ROOT, 'skills');
const AGENTS_DIR = join(ROOT, 'agents');
const MODEL_CAPS = join(ROOT, 'packages/nexus-agents/src/config/in-tree-data.ts');
const PACKAGE_JSON_PATH = join(ROOT, 'packages/nexus-agents/package.json');

// Additional inject targets for #1837 count-drift prevention.
const AGENTS_MD_PATH = join(ROOT, 'AGENTS.md');
const PLUGIN_JSON_PATH = join(ROOT, '.claude-plugin/plugin.json');
const MARKETPLACE_JSON_PATH = join(ROOT, '.claude-plugin/marketplace.json');
const PLUGIN_INSTALL_PATH = join(ROOT, 'docs/getting-started/PLUGIN_INSTALL.md');
// MCP-spec server.json — what the model context protocol registry reads.
// Drifted to 2.53.0 while package.json was at 2.63.1; see #2326 / #2327.
const SERVER_JSON_PATH = join(ROOT, 'packages/nexus-agents/server.json');

/**
 * Write `content` to `path` after running it through prettier with the
 * filepath's parser, so the on-disk shape exactly matches what
 * `lint-staged → prettier --write` produces on commit (#2290).
 *
 * Without this, `inject-governance.ts` and the lint-staged hook produce
 * subtly different padding on markdown tables — one trailing-space
 * difference is enough to fail the docs-check `Verify injection
 * idempotency` step on every tool/expert/workflow add.
 */
async function writeFormatted(path: string, content: string): Promise<void> {
  const config = await prettier.resolveConfig(path);
  const formatted = await prettier.format(content, {
    ...(config ?? {}),
    filepath: path,
  });
  writeFileSync(path, formatted);
}

// Markers for governance sections
const MARKERS = {
  toolIndexStart: '<!-- GOVERNANCE:TOOL_INDEX:START -->',
  toolIndexEnd: '<!-- GOVERNANCE:TOOL_INDEX:END -->',
  modelListStart: '<!-- GOVERNANCE:MODEL_LIST:START -->',
  modelListEnd: '<!-- GOVERNANCE:MODEL_LIST:END -->',
  versionStart: '<!-- GOVERNANCE:VERSION:START -->',
  versionEnd: '<!-- GOVERNANCE:VERSION:END -->',
  readmeToolsStart: '<!-- GOVERNANCE:README_TOOLS:START -->',
  readmeToolsEnd: '<!-- GOVERNANCE:README_TOOLS:END -->',
  // #2317: Workflows table is now generated from skills/index.yaml so adding/
  // removing a skill cannot drift the CLAUDE.md table. Index covers the
  // canonical (#1828) skill→SKILL.md layout.
  workflowIndexStart: '<!-- GOVERNANCE:WORKFLOW_INDEX:START -->',
  workflowIndexEnd: '<!-- GOVERNANCE:WORKFLOW_INDEX:END -->',
  // #2657 (Epic C): AGENTS.md "Rules index" table is generated from the
  // `paths:` + `description:` frontmatter on every `.rules/*.md`. It is the
  // universal cross-adapter bridge — Codex / Gemini / OpenCode only see a
  // rule if AGENTS.md references it — so hand-maintaining it drifts.
  rulesIndexStart: '<!-- GOVERNANCE:RULES_INDEX:START -->',
  rulesIndexEnd: '<!-- GOVERNANCE:RULES_INDEX:END -->',
  // #3334: ENTRYPOINTS.md prose tool table. The YAML block keeps its own
  // pre-existing `BEGIN/END:MCP_TOOLS` markers (see ENTRYPOINTS_YAML_*).
  entrypointsToolsStart: '<!-- GOVERNANCE:ENTRYPOINTS_TOOLS:START -->',
  entrypointsToolsEnd: '<!-- GOVERNANCE:ENTRYPOINTS_TOOLS:END -->',
  // #3446 (Phase 2+3): CLAUDE.md's agnostic body is GENERATED from AGENTS.md's
  // `AGNOSTIC:BODY` slice so harness-neutral prose is authored exactly once.
  // The slice is injected between these markers; everything outside them
  // (authored header + Claude-specific overlay) stays hand-maintained.
  claudeAgnosticStart: '<!-- GENERATED:FROM_AGENTS:START -->',
  claudeAgnosticEnd: '<!-- GENERATED:FROM_AGENTS:END -->',
};

// #3446: the AGENTS.md agnostic body is delimited by these markers. The text
// strictly BETWEEN them (exclusive of the marker lines) is the single source
// of harness-neutral content that re-enters CLAUDE.md via the generated block.
const AGNOSTIC_BODY_START = '<!-- AGNOSTIC:BODY:START -->';
const AGNOSTIC_BODY_END = '<!-- AGNOSTIC:BODY:END -->';

// #3334: the ENTRYPOINTS.md YAML block already shipped with these markers
// (a different convention from the GOVERNANCE:* family). Reuse them rather
// than re-marking the block, so the diff stays minimal.
const ENTRYPOINTS_YAML_START = '<!-- BEGIN:MCP_TOOLS -->';
const ENTRYPOINTS_YAML_END = '<!-- END:MCP_TOOLS -->';

// #3334: tools whose ENTRYPOINTS auth surface is not the default
// "None (local)" / `none`. Only `run_dev_pipeline` is currently optional
// (it can take a GitHub token). Keyed by tool name; the value is the
// canonical auth label rendered in both the prose table and the YAML block.
const ENTRYPOINTS_TOOL_AUTH: Record<string, { prose: string; yaml: string }> = {
  run_dev_pipeline: { prose: 'Optional', yaml: 'optional' },
};

const ENTRYPOINTS_DEFAULT_AUTH = { prose: 'None (local)', yaml: 'none' } as const;

const SKILLS_INDEX_PATH = join(SKILLS_DIR, 'index.yaml');
const RULES_DIR = join(ROOT, '.rules');

// ============================================================================
// Registry Extraction
// ============================================================================

interface ToolMetadata {
  name: string;
  description: string;
}

interface ExpertMetadata {
  role: string;
  displayName: string;
}

interface WorkflowMetadata {
  name: string;
  category: string;
}

interface SkillMetadata {
  name: string;
  filename: string;
}

/**
 * Workflow row rendered from skills/index.yaml — the canonical, auto-generated
 * skill registry (#2317). Description is the first line of the skill's
 * descriptive blob; triggers are taken verbatim.
 */
interface WorkflowRow {
  name: string;
  description: string;
  triggers: readonly string[];
}

// Curated MCP tool descriptions live in `tool-descriptions-data.ts` (imported
// at the top of this file) so the #2650 distinctness lint can import the same
// corpus this script renders into the CLAUDE.md / README tables.
// `extractMcpTools()` below validates TOOL_DESCRIPTIONS against the canonical
// tools array in index.ts.

/**
 * Extract registered MCP tools from the canonical tools/index.ts.
 * Reads the `tools` array in `registerTools()` return value and
 * matches against curated descriptions.
 */
function extractMcpTools(): ToolMetadata[] {
  // #3566: source of truth is the leaf `TOOL_MANIFEST` array in tool-manifest.ts.
  // Fall back to tools/index.ts (`REGISTERED_TOOL_NAMES`) for pre-#3566 checkouts.
  const manifestExists = existsSync(TOOL_MANIFEST_FILE);
  const sourceFile = manifestExists ? TOOL_MANIFEST_FILE : TOOLS_INDEX;
  if (!existsSync(sourceFile)) {
    console.error('MCP tool manifest/index not found: ' + sourceFile);
    return [];
  }

  const content = readFileSync(sourceFile, 'utf-8');

  // Extract the tool names by walking the AST (#3596). Source of truth is the
  // module-level `TOOL_MANIFEST` array (or, pre-#3566, `REGISTERED_TOOL_NAMES`),
  // with a legacy inline `tools: [...]` fallback for very old checkouts. AST
  // parsing reads a literal regardless of formatting and is the seam that lets the
  // list become fully derived later (a regex over a literal cannot).
  const toolNames = parseRegisteredToolNames(content);
  if (toolNames.length === 0) {
    console.error('Could not parse tools array from ' + sourceFile);
    return [];
  }

  // Warn about tools in code but not in description map
  for (const name of toolNames) {
    if (!(name in TOOL_DESCRIPTIONS)) {
      console.warn(
        `WARNING: Tool '${name}' found in code but not in TOOL_DESCRIPTIONS map. Add a description.`
      );
    }
  }

  return toolNames.map((name) => ({
    name,
    description: TOOL_DESCRIPTIONS[name] ?? `${name} tool`,
  }));
}

/**
 * Extract built-in expert types from expert-config.ts.
 * Reads the BuiltInExpertType union type.
 */
function extractExpertTypes(): ExpertMetadata[] {
  if (!existsSync(EXPERT_CONFIG)) {
    console.error('Expert config not found: ' + EXPERT_CONFIG);
    return [];
  }

  const content = readFileSync(EXPERT_CONFIG, 'utf-8');

  // Extract from BuiltInExpertType union
  const typeMatch = content.match(/type\s+BuiltInExpertType\s*=\s*([\s\S]*?);/);
  if (typeMatch?.[1] === undefined) {
    console.error('Could not parse BuiltInExpertType from expert-config.ts');
    return [];
  }

  const roles = typeMatch[1]
    .split('|')
    .map((s) => s.trim().replace(/['"]/g, ''))
    .filter((s) => s.length > 0);

  return roles.map((role) => ({
    role,
    displayName: role.charAt(0).toUpperCase() + role.slice(1),
  }));
}

/**
 * Parse category mapping from TEMPLATE_CATEGORIES in file content.
 */
function parseCategoryMap(content: string): Map<string, string> {
  const categoryMatch = content.match(
    /TEMPLATE_CATEGORIES[\s\S]*?=\s*\{([\s\S]*?)\}\s*(?:as\s*const)?;/
  );
  const categoryMap = new Map<string, string>();
  if (categoryMatch?.[1] !== undefined) {
    const entries = categoryMatch[1].matchAll(/'([^']+)':\s*'([^']+)'/g);
    for (const entry of entries) {
      if (entry[1] !== undefined && entry[2] !== undefined) {
        categoryMap.set(entry[1], entry[2]);
      }
    }
  }
  return categoryMap;
}

/**
 * Extract built-in workflow templates from template-types.ts.
 * Reads the BUILT_IN_TEMPLATES const array.
 */
function extractWorkflowTemplates(): WorkflowMetadata[] {
  if (!existsSync(TEMPLATE_TYPES)) {
    console.error('Template types not found: ' + TEMPLATE_TYPES);
    return [];
  }

  const content = readFileSync(TEMPLATE_TYPES, 'utf-8');
  const templatesMatch = content.match(/BUILT_IN_TEMPLATES\s*=\s*\[([\s\S]*?)\]\s*as\s*const/);
  if (templatesMatch?.[1] === undefined) {
    console.error('Could not parse BUILT_IN_TEMPLATES from template-types.ts');
    return [];
  }

  const names = templatesMatch[1]
    .split('\n')
    .map((line) => line.match(/'([^']+)'/)?.[1])
    .filter((name): name is string => name !== undefined);

  const categoryMap = parseCategoryMap(content);
  return names.map((name) => ({
    name,
    category: categoryMap.get(name) ?? 'custom',
  }));
}

/**
 * Extract skills from .claude/skills/ directory.
 */
/**
 * Extract the canonical skill list from `skills/index.yaml` (#2317).
 * The YAML index is itself auto-generated by `scripts/generate-skills-index.ts`,
 * so each skill's description and triggers come from a single source of truth.
 *
 * Falls back to `[]` if the index is missing — `extractSkills()` (the count-
 * source) still scans the directory directly, so the count probes keep working.
 */
function parseSkillEntries(parsed: unknown): unknown[] | null {
  if (typeof parsed !== 'object' || parsed === null) return null;
  const skills = (parsed as { skills?: unknown }).skills;
  return Array.isArray(skills) ? skills : null;
}

function toWorkflowRow(entry: unknown): WorkflowRow | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const e = entry as { name?: unknown; description?: unknown; triggers?: unknown };
  if (typeof e.name !== 'string') return null;
  const description = typeof e.description === 'string' ? e.description : '';
  const triggers = Array.isArray(e.triggers)
    ? e.triggers.filter((t): t is string => typeof t === 'string')
    : [];
  return { name: e.name, description: firstSentence(description), triggers };
}

function extractWorkflowRows(): WorkflowRow[] {
  if (!existsSync(SKILLS_INDEX_PATH)) {
    console.error('skills/index.yaml not found: ' + SKILLS_INDEX_PATH);
    return [];
  }
  const entries = parseSkillEntries(parseYaml(readFileSync(SKILLS_INDEX_PATH, 'utf-8')));
  if (entries === null) {
    console.error('skills/index.yaml: missing or malformed `skills` array');
    return [];
  }
  const rows = entries.map(toWorkflowRow).filter((r): r is WorkflowRow => r !== null);
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Returns the first sentence of a multi-line description, with newlines
 * collapsed to spaces. We deliberately do NOT truncate — the table cell
 * width is dynamic, and a one-sentence cap is enough to keep rows scannable
 * without losing meaning.
 */
function firstSentence(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed === '') return '';
  const periodIdx = collapsed.indexOf('. ');
  return periodIdx === -1 ? collapsed : collapsed.slice(0, periodIdx + 1);
}

function extractSkills(): SkillMetadata[] {
  if (!existsSync(SKILLS_DIR)) {
    console.error('Skills directory not found: ' + SKILLS_DIR);
    return [];
  }

  // Canonical layout (#1828): skills/<name>/SKILL.md
  const dirs = readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(SKILLS_DIR, e.name, 'SKILL.md')))
    .map((e) => e.name)
    .sort();

  return dirs.map((name) => ({
    name,
    filename: join(name, 'SKILL.md'),
  }));
}

/**
 * Count plugin-native agents from agents/<name>.md (#1837).
 */
function extractAgents(): string[] {
  if (!existsSync(AGENTS_DIR)) return [];
  return readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith('.md') && f !== 'index.yaml')
    .map((f) => f.replace(/\.md$/, ''))
    .sort();
}

/**
 * Extract model IDs from in-tree-data.ts.
 * Parses the models array for id, displayName, cliName, and contextWindow.
 */
interface ModelMetadata {
  id: string;
  displayName: string;
  cliName: string;
  contextWindow: number;
}

function extractModels(): ModelMetadata[] {
  if (!existsSync(MODEL_CAPS)) {
    console.error('Model capabilities not found: ' + MODEL_CAPS);
    return [];
  }

  const content = readFileSync(MODEL_CAPS, 'utf-8');
  const models: ModelMetadata[] = [];

  // Match each model block
  const modelBlocks = content.matchAll(
    /id:\s*'([^']+)'[\s\S]*?displayName:\s*'([^']+)'[\s\S]*?contextWindow:\s*([\d_]+)[\s\S]*?cliName:\s*'([^']+)'/g
  );

  for (const match of modelBlocks) {
    models.push({
      id: match[1] ?? '',
      displayName: match[2] ?? '',
      contextWindow: parseInt((match[3] ?? '0').replace(/_/g, ''), 10),
      cliName: match[4] ?? '',
    });
  }

  return models;
}

// ============================================================================
// Generation
// ============================================================================

/**
 * Generate the MCP tools reference for CLAUDE.md. Emits a flat
 * comma-separated list of tool names — descriptions and schemas live in
 * `docs/ENTRYPOINTS.md` and the README MCP tools table (which still gets
 * the long form via `generateReadmeToolTable`). The CLAUDE.md form is
 * tuned for context efficiency: agents need to know the name to look up
 * the schema, not re-read 38 one-line descriptions on every conversation.
 */
function generateToolIndex(tools: ToolMetadata[]): string {
  const names = tools.map((t) => '`' + t.name + '`').join(', ');

  const lines = [
    MARKERS.toolIndexStart,
    '',
    '## MCP Tools Reference',
    '',
    `**${String(tools.length)} MCP tools registered.** Full schemas, parameter docs, and one-line summaries in [docs/ENTRYPOINTS.md](./docs/ENTRYPOINTS.md) and the README MCP tools table. Names below; look up the schema before calling.`,
    '',
    names,
    '',
    `_Auto-generated from source. ${String(tools.length)} tools registered._`,
    '',
    MARKERS.toolIndexEnd,
  ];

  return lines.join('\n');
}

/**
 * Generate the README MCP tools table. Uses short descriptions from
 * `README_TOOL_DESCRIPTIONS`, falling back to the long `TOOL_DESCRIPTIONS`
 * entry when no short variant exists (with a warning so the maintainer
 * notices and writes one).
 */
function generateReadmeToolTable(tools: ToolMetadata[]): string {
  const rows = tools.map((t) => {
    const short = README_TOOL_DESCRIPTIONS[t.name];
    if (short === undefined) {
      console.warn(
        `WARNING: Tool '${t.name}' has no README short description. ` +
          `Add one to README_TOOL_DESCRIPTIONS in scripts/inject-governance.ts. ` +
          `Falling back to long description.`
      );
    }
    return { name: t.name, desc: short ?? t.description };
  });

  const toolCells = rows.map((r) => '`' + r.name + '`');
  const descCells = rows.map((r) => r.desc);
  const toolColWidth = Math.max('Tool'.length, ...toolCells.map((c) => c.length));
  const descColWidth = Math.max('Description'.length, ...descCells.map((c) => c.length));

  const header = `| ${'Tool'.padEnd(toolColWidth)} | ${'Description'.padEnd(descColWidth)} |`;
  const separator = `| ${'-'.repeat(toolColWidth)} | ${'-'.repeat(descColWidth)} |`;

  const lines = [MARKERS.readmeToolsStart, '', header, separator];

  for (const row of rows) {
    const paddedName = ('`' + row.name + '`').padEnd(toolColWidth);
    lines.push(`| ${paddedName} | ${row.desc.padEnd(descColWidth)} |`);
  }

  lines.push('');
  lines.push(MARKERS.readmeToolsEnd);

  return lines.join('\n');
}

// ============================================================================
// ENTRYPOINTS.md MCP tool enumerations (#3334)
// ============================================================================

/** Auth label for a tool in the ENTRYPOINTS surfaces (prose + YAML). */
function entrypointsAuth(name: string): { prose: string; yaml: string } {
  return ENTRYPOINTS_TOOL_AUTH[name] ?? ENTRYPOINTS_DEFAULT_AUTH;
}

/**
 * One-line ENTRYPOINTS description for a tool. Sourced from the same
 * `TOOL_DESCRIPTIONS` corpus the CLAUDE.md / README surfaces use, collapsed
 * to its first sentence so the table cell stays scannable. Throws if a
 * registered tool has no description — the prose table must never emit a
 * blank row (#3334). Backslashes are escaped FIRST, then `|`, so a description
 * can't break the markdown column or smuggle a half-escaped pipe past the
 * escaping (CodeQL js/incomplete-sanitization).
 */
function entrypointsToolDescription(t: ToolMetadata): string {
  const raw = TOOL_DESCRIPTIONS[t.name];
  if (raw === undefined || raw.trim() === '') {
    throw new Error(
      `Tool '${t.name}' is registered but has no TOOL_DESCRIPTIONS entry — ` +
        `add one in scripts/tool-descriptions-data.ts before generating ENTRYPOINTS (#3334).`
    );
  }
  return firstSentence(raw).replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

/**
 * Generate the ENTRYPOINTS.md prose MCP tools table (#3334). Four columns —
 * Tool, Description, Auth, Rate Limit — every registered tool rendered exactly
 * once. Column padding mirrors `generateReadmeToolTable` so prettier produces
 * no follow-up diff. Rate Limit is uniform ("Shared bucket") because every
 * tool shares the single token bucket; Auth comes from `ENTRYPOINTS_TOOL_AUTH`.
 */
function generateEntrypointsToolTable(tools: ToolMetadata[]): string {
  const rows = tools.map((t) => ({
    name: '`' + t.name + '`',
    desc: entrypointsToolDescription(t),
    auth: entrypointsAuth(t.name).prose,
    rate: 'Shared bucket',
  }));

  const toolW = Math.max('Tool'.length, ...rows.map((r) => r.name.length));
  const descW = Math.max('Description'.length, ...rows.map((r) => r.desc.length));
  const authW = Math.max('Auth'.length, ...rows.map((r) => r.auth.length));
  const rateW = Math.max('Rate Limit'.length, ...rows.map((r) => r.rate.length));

  const lines = [
    MARKERS.entrypointsToolsStart,
    '',
    `| ${'Tool'.padEnd(toolW)} | ${'Description'.padEnd(descW)} | ${'Auth'.padEnd(authW)} | ${'Rate Limit'.padEnd(rateW)} |`,
    `| ${'-'.repeat(toolW)} | ${'-'.repeat(descW)} | ${'-'.repeat(authW)} | ${'-'.repeat(rateW)} |`,
  ];
  for (const r of rows) {
    lines.push(
      `| ${r.name.padEnd(toolW)} | ${r.desc.padEnd(descW)} | ${r.auth.padEnd(authW)} | ${r.rate.padEnd(rateW)} |`
    );
  }
  lines.push('');
  lines.push(
    `_Auto-generated from \`REGISTERED_TOOL_NAMES\` + \`TOOL_DESCRIPTIONS\` by \`scripts/inject-governance.ts\`. ${String(tools.length)} tools._`,
    '',
    MARKERS.entrypointsToolsEnd
  );
  return lines.join('\n');
}

/**
 * Generate the ENTRYPOINTS.md `BEGIN:MCP_TOOLS` YAML block (#3334). Preserves
 * the pre-existing schema (`mcp_tools:` → `rate_limiting:` + `tools:` list of
 * `{ name, auth }`) so downstream YAML consumers are unaffected; only the
 * `tools:` list is regenerated, one entry per registered tool.
 */
function generateEntrypointsYamlBlock(tools: ToolMetadata[]): string {
  const lines = [
    ENTRYPOINTS_YAML_START,
    '',
    '```yaml',
    'mcp_tools:',
    "  rate_limiting: 'shared token bucket (capacity: 100, refill: 10/sec)'",
    '  tools:',
  ];
  for (const t of tools) {
    lines.push(`    - name: ${t.name}`);
    lines.push(`      auth: ${entrypointsAuth(t.name).yaml}`);
  }
  lines.push('```', '', ENTRYPOINTS_YAML_END);
  return lines.join('\n');
}

/**
 * Regenerate both ENTRYPOINTS.md enumerations (prose table + YAML block) in
 * one pass (#3334). The prose table is injected via the GOVERNANCE marker
 * family; the YAML block reuses its own pre-existing `BEGIN/END:MCP_TOOLS`
 * markers. Returns the updated content; throws (via the description lookup)
 * if any registered tool lacks a description.
 */
function applyEntrypointsInjections(content: string, tools: ToolMetadata[]): string {
  let next = injectSection(
    content,
    MARKERS.entrypointsToolsStart,
    MARKERS.entrypointsToolsEnd,
    generateEntrypointsToolTable(tools)
  );
  next = injectSection(
    next,
    ENTRYPOINTS_YAML_START,
    ENTRYPOINTS_YAML_END,
    generateEntrypointsYamlBlock(tools)
  );
  return next;
}

/**
 * Write the regenerated ENTRYPOINTS.md enumerations (#3334). Soft-skips when
 * the file or the prose-table markers are absent, so the script stays drop-in
 * compatible with older checkouts that haven't been marker-prepped.
 */
async function injectEntrypoints(tools: ToolMetadata[]): Promise<void> {
  if (!existsSync(ENTRYPOINTS_PATH)) return;
  const content = readFileSync(ENTRYPOINTS_PATH, 'utf-8');
  if (!content.includes(MARKERS.entrypointsToolsStart)) return;
  const updated = applyEntrypointsInjections(content, tools);
  if (updated !== content) await writeFormatted(ENTRYPOINTS_PATH, updated);
}

/**
 * Verify both ENTRYPOINTS.md enumerations are in sync with the canonical
 * registry (#3334). Soft-skip when the file or prose-table markers are absent;
 * otherwise fail (with a structured error) when regeneration would diff.
 */
function checkEntrypoints(tools: ToolMetadata[]): boolean {
  if (!existsSync(ENTRYPOINTS_PATH)) return true;
  const content = readFileSync(ENTRYPOINTS_PATH, 'utf-8');
  if (!content.includes(MARKERS.entrypointsToolsStart)) return true;
  const updated = applyEntrypointsInjections(content, tools);
  if (updated !== content) {
    console.error(
      'docs/ENTRYPOINTS.md MCP tool enumerations are stale (#3334). Run: pnpm governance:inject'
    );
    return false;
  }
  return true;
}

/**
 * Generate the Workflows table for CLAUDE.md (#2317).
 *
 * Source of truth: `skills/index.yaml` (itself auto-generated). Adding or
 * removing a skill cannot drift the CLAUDE.md table — re-running this script
 * picks up the change.
 */
function generateWorkflowIndex(rows: readonly WorkflowRow[]): string {
  // CLAUDE.md form is a flat list of skill names. Detail (description,
  // trigger keywords, instructions) lives in each `skills/<name>/SKILL.md`
  // (Anthropic Agent Skills spec, #1828) and the harness routes on the
  // SKILL.md frontmatter. Listing only names is enough for the agent to
  // know what's available; it can read SKILL.md when it picks one.
  const names = rows.map((r) => '`' + r.name + '`').join(', ');

  const lines = [
    MARKERS.workflowIndexStart,
    '',
    '## Workflows (via Skills)',
    '',
    `**${String(rows.length)} skills registered.** Each skill's detailed steps and trigger keywords live in \`skills/<name>/SKILL.md\` (Anthropic Agent Skills spec, #1828). Non-Claude agents discover via [\`skills/index.yaml\`](./skills/index.yaml) referenced from [AGENTS.md](./AGENTS.md).`,
    '',
    names,
    '',
    `_Auto-generated from \`skills/index.yaml\`. ${String(rows.length)} skills._`,
    '',
    MARKERS.workflowIndexEnd,
  ];

  return lines.join('\n');
}

/**
 * Generate the supported models list for CLAUDE.md billing mode section.
 */
function generateModelList(models: ModelMetadata[]): string {
  const ids = models.map((m) => m.id).join(', ');
  return `${MARKERS.modelListStart}Supported models: ${ids}.${MARKERS.modelListEnd}`;
}

// ============================================================================
// Rules Index (#2657, Epic C) — AGENTS.md cross-adapter bridge
// ============================================================================

interface RuleMetadata {
  /** Basename, e.g. `typescript.md`. */
  readonly file: string;
  /** Glob patterns from the `paths:` frontmatter field. */
  readonly paths: readonly string[];
  /** The `description:` frontmatter field — the "when to read" hint. */
  readonly description: string;
}

/** Normalize a frontmatter `paths:` field (YAML list or scalar) to a string array. */
function normalizePathsField(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((p) => String(p));
  if (typeof raw === 'string') return [raw];
  return [];
}

/** Parse one `.rules/*.md` file's frontmatter into RuleMetadata. */
function parseRuleFile(entry: string): RuleMetadata {
  const content = readFileSync(join(RULES_DIR, entry), 'utf-8');
  const match = /^---\n([\s\S]*?)\n---/.exec(content);
  if (match?.[1] === undefined) {
    throw new Error(`.rules/${entry}: missing frontmatter (run checkRuleFrontmatter)`);
  }
  const fm = parseYaml(match[1]) as Record<string, unknown>;
  const paths = normalizePathsField(fm['paths']);
  const description = typeof fm['description'] === 'string' ? fm['description'].trim() : '';
  if (paths.length === 0 || description === '') {
    throw new Error(`.rules/${entry}: frontmatter missing \`paths:\` or \`description:\``);
  }
  return { file: entry, paths, description };
}

/**
 * Scan `.rules/*.md`, parsing the `paths:` + `description:` frontmatter that
 * `checkRuleFrontmatter` (#2656) already requires. Both fields are consumed
 * by `generateRulesIndex` — `paths:` is not dead metadata. Sorted by
 * filename so the generated table is deterministic.
 */
function extractRules(): RuleMetadata[] {
  if (!existsSync(RULES_DIR)) return [];
  return readdirSync(RULES_DIR)
    .sort()
    .filter((entry) => entry.endsWith('.md'))
    .map(parseRuleFile);
}

/**
 * Generate the AGENTS.md "Rules index" table from `.rules/*.md` frontmatter.
 * Columns are padded to fixed widths so the output is prettier-stable (the
 * same approach as `generateReadmeToolTable`) — a re-run produces no diff.
 */
function generateRulesIndex(rules: readonly RuleMetadata[]): string {
  const rows = rules.map((r) => ({
    file: `[\`.rules/${r.file}\`](./.rules/${r.file})`,
    applies: r.paths.map((p) => '`' + p + '`').join(', '),
    when: r.description,
  }));

  const fileW = Math.max('File'.length, ...rows.map((r) => r.file.length));
  const appliesW = Math.max('Applies to'.length, ...rows.map((r) => r.applies.length));
  const whenW = Math.max('When to read'.length, ...rows.map((r) => r.when.length));

  const lines = [
    MARKERS.rulesIndexStart,
    '',
    'Load-bearing rules live at `.rules/*.md`. Read the relevant file when its topic applies. Claude Code autoloads these by keyword match; Codex / Gemini CLI / OpenCode only see a rule if it is listed here — this table is the cross-adapter bridge. See [docs/guides/RULE_PRECEDENCE.md](./docs/guides/RULE_PRECEDENCE.md) for the per-adapter precise reference.',
    '',
    `| ${'File'.padEnd(fileW)} | ${'Applies to'.padEnd(appliesW)} | ${'When to read'.padEnd(whenW)} |`,
    `| ${'-'.repeat(fileW)} | ${'-'.repeat(appliesW)} | ${'-'.repeat(whenW)} |`,
  ];
  for (const r of rows) {
    lines.push(
      `| ${r.file.padEnd(fileW)} | ${r.applies.padEnd(appliesW)} | ${r.when.padEnd(whenW)} |`
    );
  }
  lines.push('');
  lines.push(
    `_Auto-generated from \`.rules/*.md\` frontmatter by \`scripts/inject-governance.ts\`. ${String(rules.length)} rules._`,
    '',
    MARKERS.rulesIndexEnd
  );
  return lines.join('\n');
}

/**
 * Inject the Rules index into AGENTS.md (#2657). Soft-skips when AGENTS.md
 * has no markers yet, so the script stays drop-in compatible with checkouts
 * that have not been marker-prepped.
 */
function injectRulesIndex(content: string, rules: readonly RuleMetadata[]): string {
  if (rules.length === 0 || !content.includes(MARKERS.rulesIndexStart)) return content;
  return injectSection(
    content,
    MARKERS.rulesIndexStart,
    MARKERS.rulesIndexEnd,
    generateRulesIndex(rules)
  );
}

/**
 * Verify the AGENTS.md Rules index is in sync with `.rules/*.md` frontmatter
 * (#2657). Soft-skip when AGENTS.md is absent or has no markers; otherwise
 * fail (with a structured error) when regeneration would produce a diff.
 */
function checkRulesIndex(): boolean {
  if (!existsSync(AGENTS_MD_PATH)) return true;
  const content = readFileSync(AGENTS_MD_PATH, 'utf-8');
  if (!content.includes(MARKERS.rulesIndexStart)) return true;
  const updated = injectRulesIndex(content, extractRules());
  if (updated !== content) {
    console.error('AGENTS.md Rules index is stale (#2657). Run: pnpm governance:inject');
    return false;
  }
  return true;
}

// ============================================================================
// Claude agnostic block (#3446, Phase 2+3) — CLAUDE.md generated from AGENTS.md
// ============================================================================

/**
 * Slice the harness-neutral body out of AGENTS.md: the text strictly BETWEEN
 * the `AGNOSTIC:BODY:START` / `AGNOSTIC:BODY:END` markers, exclusive of the
 * marker lines themselves. This slice is the single authoritative source of
 * agnostic prose — CLAUDE.md re-uses it verbatim via the generated block so no
 * harness-neutral content is authored twice (#3446).
 *
 * Throws if either marker is missing — AGENTS.md is a required source for the
 * CLAUDE.md generator, so a silent empty slice would erase the agnostic body.
 */
function extractAgnosticBody(): string {
  if (!existsSync(AGENTS_MD_PATH)) {
    throw new Error(
      `AGENTS.md not found at ${AGENTS_MD_PATH} — required by the CLAUDE.md generator (#3446)`
    );
  }
  const content = readFileSync(AGENTS_MD_PATH, 'utf-8');
  const startIdx = content.indexOf(AGNOSTIC_BODY_START);
  const endIdx = content.indexOf(AGNOSTIC_BODY_END);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(
      `AGENTS.md is missing the AGNOSTIC:BODY markers (#3446) — cannot generate CLAUDE.md`
    );
  }
  // Fail loud on malformed markers rather than emitting an empty/garbage slice
  // that the drift gate would then "pass" against (silently erasing the agnostic
  // body — the exact failure this generator must prevent). Reordered (END before
  // START) → empty slice; duplicated → swallows a marker line (#3446 QA).
  if (endIdx <= startIdx) {
    throw new Error(
      `AGENTS.md AGNOSTIC:BODY:END precedes START (#3446) — markers are reordered/malformed`
    );
  }
  if (
    content.lastIndexOf(AGNOSTIC_BODY_START) !== startIdx ||
    content.lastIndexOf(AGNOSTIC_BODY_END) !== endIdx
  ) {
    throw new Error(
      `AGENTS.md has duplicate AGNOSTIC:BODY markers (#3446) — exactly one pair is required`
    );
  }
  // Take everything after the start marker line and before the end marker,
  // then trim the surrounding blank lines so the injected block has exactly
  // one blank line of padding (matching the "do not edit" note layout below).
  const between = content.slice(startIdx + AGNOSTIC_BODY_START.length, endIdx);
  return between.replace(/^\n+/, '').replace(/\n+$/, '');
}

/**
 * Generate the CLAUDE.md agnostic block (#3446). The block is the AGENTS.md
 * `AGNOSTIC:BODY` slice wrapped in the `GENERATED:FROM_AGENTS` markers with a
 * "do not edit by hand" note, so an editor who opens CLAUDE.md knows the prose
 * is owned by AGENTS.md and gated by `inject-governance.ts check`.
 */
function generateClaudeFromAgents(slice: string): string {
  return [
    MARKERS.claudeAgnosticStart,
    '',
    "<!-- DO NOT EDIT THIS BLOCK BY HAND. It is generated from AGENTS.md's",
    '     AGNOSTIC:BODY slice by `scripts/inject-governance.ts` and gated in CI.',
    '     Edit the agnostic prose in AGENTS.md; run `pnpm governance:inject`. (#3446) -->',
    '',
    slice,
    '',
    MARKERS.claudeAgnosticEnd,
  ].join('\n');
}

/**
 * Inject the generated agnostic block into CLAUDE.md (#3446). Soft-skips when
 * CLAUDE.md has no `GENERATED:FROM_AGENTS` markers yet, so the script stays
 * drop-in compatible with checkouts that have not been marker-prepped.
 */
function injectClaudeAgnosticBlock(content: string): string {
  if (!content.includes(MARKERS.claudeAgnosticStart)) return content;
  return injectSection(
    content,
    MARKERS.claudeAgnosticStart,
    MARKERS.claudeAgnosticEnd,
    generateClaudeFromAgents(extractAgnosticBody())
  );
}

/**
 * Verify the CLAUDE.md agnostic block is in sync with AGENTS.md's
 * `AGNOSTIC:BODY` slice (#3446). Soft-skip when CLAUDE.md is absent or has no
 * markers; otherwise fail (with a structured error) when regeneration would
 * produce a diff — i.e. someone edited the agnostic prose in CLAUDE.md instead
 * of AGENTS.md, or edited AGENTS.md without re-running the injector.
 */
function checkClaudeAgnosticBlock(): boolean {
  if (!existsSync(CLAUDE_MD_PATH)) return true;
  const content = readFileSync(CLAUDE_MD_PATH, 'utf-8');
  if (!content.includes(MARKERS.claudeAgnosticStart)) return true;
  const updated = injectClaudeAgnosticBlock(content);
  if (updated !== content) {
    console.error(
      'CLAUDE.md GENERATED:FROM_AGENTS block is stale (#3446) — edit the agnostic ' +
        'prose in AGENTS.md, then run: pnpm governance:inject'
    );
    return false;
  }
  return true;
}

/**
 * Generate governance version section.
 *
 * The stamp is the commit date of the most recently changed canonical
 * source file (#2571). Using a content-derived date instead of
 * `new Date()` makes the inject output deterministic — the
 * "Verify injection idempotency" CI step no longer flips red at the
 * date rollover on branches that haven't been touched today. The
 * staleness check in release-validate-helpers.ts:222 keeps working
 * because the format is unchanged.
 */
function getGovernanceSourceDate(): string {
  const sources = [TOOLS_INDEX, EXPERT_CONFIG, TEMPLATE_TYPES, SKILLS_INDEX_PATH, MODEL_CAPS];
  let latest = '';
  for (const path of sources) {
    try {
      const out = execSync(`git log -1 --format=%cs -- "${path}"`, {
        encoding: 'utf-8',
        cwd: ROOT,
      }).trim();
      if (out !== '' && out > latest) latest = out;
    } catch {
      // Source missing or git unavailable — skip; another source will fill in.
    }
  }
  if (latest === '') {
    // Fallback (fresh clone, shallow CI, etc.): use today's date in ET.
    const now = new Date();
    const etOffset = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const etDate = new Date(etOffset);
    const y = etDate.getFullYear();
    const m = String(etDate.getMonth() + 1).padStart(2, '0');
    const d = String(etDate.getDate()).padStart(2, '0');
    return `${String(y)}-${m}-${d}`;
  }
  return latest;
}

function generateVersionSection(): string {
  const timestamp = getGovernanceSourceDate();

  return [
    MARKERS.versionStart,
    '',
    `_Governance Version: ${timestamp}_`,
    '',
    MARKERS.versionEnd,
  ].join('\n');
}

// ============================================================================
// Injection
// ============================================================================

/**
 * Inject or update a section between markers.
 */
function injectSection(
  content: string,
  startMarker: string,
  endMarker: string,
  newSection: string
): string {
  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);

  if (startIdx !== -1 && endIdx !== -1) {
    return content.slice(0, startIdx) + newSection + content.slice(endIdx + endMarker.length);
  }

  // Section doesn't exist - append before last "---" separator or at end
  const insertPoint = content.lastIndexOf('\n---\n');
  if (insertPoint !== -1) {
    return content.slice(0, insertPoint) + '\n\n' + newSection + content.slice(insertPoint);
  }

  return content + '\n\n' + newSection;
}

// ============================================================================
// Registry Summary (for check mode)
// ============================================================================

interface RegistrySummary {
  tools: number;
  experts: number;
  workflows: number;
  skills: number;
}

/**
 * Extract current counts from CLAUDE.md content.
 */
function extractDocumentedCounts(content: string): RegistrySummary {
  // Tools: count from tool index table
  const toolSection = content.match(/GOVERNANCE:TOOL_INDEX:START[\s\S]*?GOVERNANCE:TOOL_INDEX:END/);
  const toolCount = toolSection ? (toolSection[0].match(/\| `[^`]+`/g) ?? []).length : 0;

  // Experts: count from "Available Experts" or expert mentions
  const expertMatches = content.match(/Experts:.*?`expert-config\.ts`\s*\((\d+)\s*types\)/);
  const expertCount = expertMatches ? parseInt(expertMatches[1] ?? '0', 10) : 0;

  // Workflows: count from canonical registries
  const workflowMatches = content.match(
    /Workflows:.*?`template-types\.ts`\s*\((\d+)\s*templates\)/
  );
  const workflowCount = workflowMatches ? parseInt(workflowMatches[1] ?? '0', 10) : 0;

  // Skills: count from canonical registries
  const skillMatches = content.match(/Skills:.*?`skills\/<name>\/SKILL\.md`\s*\((\d+)\s*skills\)/);
  const skillCount = skillMatches ? parseInt(skillMatches[1] ?? '0', 10) : 0;

  return {
    tools: toolCount,
    experts: expertCount,
    workflows: workflowCount,
    skills: skillCount,
  };
}

// ============================================================================
// Commands
// ============================================================================

/**
 * Verify that every registered MCP tool has an entry in
 * `TOOL_ANNOTATIONS` (Issue #2648, Epic A). Tools registered without
 * annotations silently fall back to MCP-spec defaults (destructive,
 * non-idempotent, open-world), which break Epic B's prerequisite gates
 * and degrade Claude / Codex / Gemini / OpenCode permission-prompt UX.
 *
 * Parses the canonical `TOOL_MANIFEST` as the source of truth and
 * cross-references against `extractMcpTools()`. Reports missing entries
 * AND stale entries (annotated but not registered).
 */
function checkToolAnnotations(tools: ToolMetadata[]): boolean {
  // #3597: the per-tool annotation/side-effect data is folded INTO TOOL_MANIFEST
  // (each `{ name, annotations, sideEffects }` entry). The manifest is the
  // annotation source of truth; this gate verifies every registered tool's entry
  // actually carries an `annotations` block (a name without one — which TS also
  // rejects via `ToolManifestEntry` — would slip MCP-default hints).
  if (!existsSync(TOOL_MANIFEST_FILE)) {
    console.error('Missing src/mcp/tools/tool-manifest.ts (#2648/#3358/#3597)');
    return false;
  }
  const content = readFileSync(TOOL_MANIFEST_FILE, 'utf-8');
  // Names of manifest entries that pair a `name` with an `annotations: {` block.
  const annotatedNames = new Set<string>();
  const annotatedPattern = /name:\s*'([a-z_]+)',\s*annotations:\s*\{/g;
  let annotated: RegExpExecArray | null;
  while ((annotated = annotatedPattern.exec(content)) !== null) {
    if (annotated[1] !== undefined) annotatedNames.add(annotated[1]);
  }
  const registeredNames = new Set(tools.map((t) => t.name));

  const missing = [...registeredNames].filter((n) => !annotatedNames.has(n));
  const stale = [...annotatedNames].filter((n) => !registeredNames.has(n));
  if (missing.length === 0 && stale.length === 0) return true;

  if (missing.length > 0) {
    console.error('Registered tools missing annotations in TOOL_ANNOTATIONS (#2648):');
    for (const n of missing) console.error('  - ' + n);
  }
  if (stale.length > 0) {
    console.error('TOOL_ANNOTATIONS entries for tools that are not registered (#2648):');
    for (const n of stale) console.error('  - ' + n);
  }
  return false;
}

/**
 * Verify that every `.rules/*.md` file has frontmatter with `paths:` and
 * `description:` fields (Issue #2656, Epic C). Frontmatter is the
 * cross-adapter primitive that lets Codex / Gemini / OpenCode resolve
 * rules deterministically — without it, those adapters silently miss
 * the rule even when its topic applies.
 *
 * Frontmatter must:
 *   1. Open with `---` on line 1.
 *   2. Contain a `paths:` field (single string or YAML list).
 *   3. Contain a `description:` field.
 *   4. Close with a second `---` line.
 */
function checkRuleFrontmatter(): boolean {
  const rulesDir = join(ROOT, '.rules');
  if (!existsSync(rulesDir)) return true; // Nothing to validate.
  const failures: string[] = [];
  for (const entry of readdirSync(rulesDir)) {
    if (!entry.endsWith('.md')) continue;
    const path = join(rulesDir, entry);
    const content = readFileSync(path, 'utf-8');
    if (!content.startsWith('---\n')) {
      failures.push(`${entry}: missing opening frontmatter delimiter`);
      continue;
    }
    const second = content.indexOf('\n---\n', 4);
    if (second === -1) {
      failures.push(`${entry}: missing closing frontmatter delimiter`);
      continue;
    }
    const block = content.slice(4, second);
    if (!/^paths:/m.test(block)) failures.push(`${entry}: missing \`paths:\``);
    if (!/^description:/m.test(block)) failures.push(`${entry}: missing \`description:\``);
  }
  if (failures.length > 0) {
    console.error('.rules/*.md frontmatter drift (#2656):');
    for (const f of failures) console.error('  - ' + f);
    return false;
  }
  return true;
}

/**
 * Validate every entry in the CLAUDE.md "Canonical Paths" table resolves on
 * disk (#2317, #2321). The table is intentionally hand-curated — adding or
 * removing a row is a deliberate edit — but a row that points at a missing
 * file silently misleads any agent that tries to Read it.
 *
 * Parses each row of the table that lives between the "## Canonical Paths"
 * heading and the next blank-line-followed `---` separator, and checks that
 * the path in the third backticked column exists from repo root.
 */
/**
 * Verify that `docs/guides/RULE_PRECEDENCE.md` exists and contains a
 * top-level section header for each of the four supported adapters
 * (Issue #2655, Epic C). The doc is the cross-adapter bridge for rule
 * loading; if any adapter's section is dropped, operators on that
 * harness silently miss rules.
 *
 * Checks for `## Claude Code`, `## Codex CLI`, `## Gemini CLI`,
 * `## OpenCode` as discrete header lines — substring matching is too
 * loose because the body prose mentions every adapter throughout.
 */
function checkAdapterPrecedenceDocs(): boolean {
  const path = join(ROOT, 'docs/guides/RULE_PRECEDENCE.md');
  if (!existsSync(path)) {
    console.error('Missing docs/guides/RULE_PRECEDENCE.md (#2655)');
    return false;
  }
  const content = readFileSync(path, 'utf-8');
  const required = ['## Claude Code', '## Codex CLI', '## Gemini CLI', '## OpenCode'];
  // Match the header as a full line — `content.includes('## OpenCode')`
  // would also accept `## OpenCodeXXX`, which defeats the check.
  const lines = new Set(content.split('\n'));
  const missing = required.filter((header) => !lines.has(header));
  if (missing.length > 0) {
    console.error(`RULE_PRECEDENCE.md missing section header(s): ${missing.join(', ')}`);
    return false;
  }
  return true;
}

/**
 * Verify every MCP tool returns errors through the structured error
 * envelope (Issue #2649, Epic A) — no tool file may build a raw
 * `{ isError: true }` literal. After the #2649 migration the only
 * legitimate `isError: true` literal lives inside `toolStructuredError`
 * in `tool-result.ts`; every other error return must go through that
 * helper (or `toolError`, its back-compat alias).
 *
 * Scans `src/mcp/tools/**` (excluding `tool-result.ts` and tests). The
 * match pattern is anchored to start-of-line or an opening `{`/`,` so it
 * catches object-literal properties but not prose mentions of
 * `isError: true` inside JSDoc comments.
 */
function checkMcpErrorEnvelope(): boolean {
  const toolsDir = join(ROOT, 'packages/nexus-agents/src/mcp/tools');
  if (!existsSync(toolsDir)) return true;
  const rawLiteral = /(?:^|[{,]\s*)isError\s*:\s*true\b/m;
  const offenders: string[] = [];
  for (const entry of readdirSync(toolsDir)) {
    if (!entry.endsWith('.ts')) continue;
    if (entry.endsWith('.test.ts') || entry === 'tool-result.ts') continue;
    const content = readFileSync(join(toolsDir, entry), 'utf-8');
    if (rawLiteral.test(content)) offenders.push(entry);
  }
  if (offenders.length > 0) {
    console.error(
      'MCP tools with a raw `isError: true` literal — use toolStructuredError (#2649):'
    );
    for (const f of offenders) console.error('  - ' + f);
    return false;
  }
  return true;
}

/**
 * Verify no MCP tool-description pair has drifted into insufficient
 * distinctness (Issue #2650, Epic A). Baseline-aware regression gate:
 * fails on a NEW pair at/above the threshold in
 * `docs/ops/tool-distinctness-baseline.json`, or a baseline pair whose
 * similarity rose past the tolerance. The full lint + report logic lives
 * in `check-tool-distinctness.ts`.
 */
function checkToolDistinctness(): boolean {
  const result = runDistinctnessCheck(TOOL_DESCRIPTIONS, loadBaseline());
  if (result.ok) return true;
  for (const p of result.newOffenders) {
    console.error(
      `Tool-description distinctness: NEW overlapping pair ${p.a} <-> ${p.b} ` +
        `(similarity ${p.similarity.toFixed(3)}) (#2650)`
    );
  }
  for (const p of result.regressions) {
    console.error(
      `Tool-description distinctness: baseline pair ${p.a} <-> ${p.b} grew more similar ` +
        `(${p.similarity.toFixed(3)}) (#2650)`
    );
  }
  return false;
}

/**
 * Tool names whose manifest `annotations` block lacks `readOnlyHint: true`.
 * #3597: reads the folded-in annotations from each `TOOL_MANIFEST` entry
 * (`name: '<tool>', annotations: { … },`) — the annotations no longer live in a
 * standalone file.
 */
function extractNonReadOnlyTools(manifestSrc: string): Set<string> {
  const names = new Set<string>();
  // `annotations: {` has no nested braces, so the non-greedy body stops at its
  // own closing `}` (before the `,` that precedes `sideEffects`).
  const entryPattern = /name:\s*'([a-z_]+)',\s*annotations:\s*\{([\s\S]*?)\},/g;
  let entry: RegExpExecArray | null;
  while ((entry = entryPattern.exec(manifestSrc)) !== null) {
    const name = entry[1];
    const body = entry[2] ?? '';
    if (name !== undefined && !/readOnlyHint:\s*true/.test(body)) names.add(name);
  }
  return names;
}

/** Tool names listed in `TOOL_PREREQUISITES` or `NO_PREREQUISITE`. */
function extractPrerequisiteCoveredTools(prereqSrc: string): Set<string> {
  const covered = new Set<string>();
  for (const mapName of ['TOOL_PREREQUISITES', 'NO_PREREQUISITE']) {
    const start = prereqSrc.indexOf(`export const ${mapName}`);
    if (start === -1) continue;
    const open = prereqSrc.indexOf('{', start);
    const end = prereqSrc.indexOf('\n};', open);
    const body = prereqSrc.slice(open, end === -1 ? undefined : end);
    for (const m of body.matchAll(/^ {2}([a-z_]+):/gm)) {
      if (m[1] !== undefined) covered.add(m[1]);
    }
  }
  return covered;
}

/**
 * Verify every non-read-only MCP tool has made a deliberate prerequisite
 * decision (Issue #2652, Epic B). A tool that mutates state, emits audit
 * entries, or acts on untrusted input must appear in either
 * `TOOL_PREREQUISITES` (it declares a call-time predicate) or
 * `NO_PREREQUISITE` (deliberately ungated, with a reason) in
 * `src/mcp/middleware/tool-prerequisites.ts` — so a newly added sensitive
 * tool cannot ship ungated by omission. Read-only tools are exempt.
 */
function checkToolPrerequisites(): boolean {
  // #3597: readOnly hints are folded into TOOL_MANIFEST entries, so the
  // non-read-only set is parsed from the manifest (was tool-annotations.ts,
  // which #3444 had already had to chase across the #3358 move).
  const prereqPath = join(ROOT, 'packages/nexus-agents/src/mcp/middleware/tool-prerequisites.ts');
  if (!existsSync(TOOL_MANIFEST_FILE) || !existsSync(prereqPath)) {
    console.error('Missing tool-manifest.ts or tool-prerequisites.ts (#2652)');
    return false;
  }
  const nonReadOnly = extractNonReadOnlyTools(readFileSync(TOOL_MANIFEST_FILE, 'utf-8'));
  const covered = extractPrerequisiteCoveredTools(readFileSync(prereqPath, 'utf-8'));
  const missing = [...nonReadOnly].filter((t) => !covered.has(t));
  if (missing.length > 0) {
    console.error('Non-read-only MCP tools with no prerequisite decision (#2652):');
    for (const t of missing) console.error('  - ' + t);
    console.error(
      '  Add each to TOOL_PREREQUISITES (declare a predicate) or NO_PREREQUISITE ' +
        '(with a reason) in src/mcp/middleware/tool-prerequisites.ts.'
    );
    return false;
  }
  return true;
}

/**
 * Verify no MCP tool's OUTPUT surface types a timestamp-named field as a
 * bare `number` (Issue #2653, Epic B). A preventive lint — #2653's
 * proposed runtime normalization layer was dropped after research found
 * no current output heterogeneity; this catches a NEW tool diverging at
 * source instead. Full logic in `check-tool-output-consistency.ts`.
 */
function checkToolOutputConsistency(): boolean {
  const violations = scanToolFiles();
  if (violations.length === 0) return true;
  console.error(
    'Tool-output consistency: timestamp-named field(s) typed as a bare number (#2653):'
  );
  for (const v of violations) {
    console.error(`  - ${v.file}:${String(v.line)} ${v.field}`);
  }
  console.error('  Type timestamps as an ISO-8601 string or a Date — see .rules/hooks.md.');
  return false;
}

/**
 * Phase 8 of #2766 — fail on new direct memory access (better-sqlite3
 * Database, raw MobiMem ctor, outcomes.jsonl path) outside the
 * baseline. The baseline lives at `docs/ops/memory-contract-baseline.json`
 * and is regenerated by `npx tsx scripts/check-memory-contract.ts baseline`.
 */
function checkMemoryContract(): boolean {
  const findings = scanMemoryContract();
  const baseline = readMemoryContractBaseline();
  const offenders = newMemoryContractOffenders(findings, baseline);
  if (offenders.length === 0) return true;
  console.error(
    `Memory-contract drift: ${String(offenders.length)} new direct-access violation(s) (#2766 Phase 8):`
  );
  for (const f of offenders) {
    console.error(`  - ${f.file}:${String(f.line)}  [${f.probeId}]`);
    console.error(`    ${f.snippet}`);
  }
  console.error(
    '  Fix: route through `getMemoryRegistry()` / `getSharedMobiMem()` / `getOutcomeStore()`,'
  );
  console.error(
    '  OR regenerate the baseline: `npx tsx scripts/check-memory-contract.ts baseline` with a justification.'
  );
  return false;
}

/**
 * Resolve a canonical-paths candidate against the repo. AGENTS.md's table uses
 * a `src/...` shorthand that means `packages/nexus-agents/src/...`, while
 * `packages/...` paths are repo-root-relative (#3446). Try repo-root first,
 * then the nexus-agents package prefix as a fallback for the shorthand.
 */
function canonicalPathResolves(candidate: string): boolean {
  if (existsSync(join(ROOT, candidate))) return true;
  if (candidate.startsWith('src/')) {
    return existsSync(join(ROOT, 'packages/nexus-agents', candidate));
  }
  return false;
}

/**
 * Extract EVERY existence-checkable file path from one canonical-paths table
 * row (empty if none — header/separator, or a row that only names a code
 * symbol). The path cell may hold several backticked tokens (e.g. a row naming
 * two source files); ALL file-path-shaped tokens (contain `/` or end in `.ts`)
 * are returned and checked, so a broken path is caught wherever it sits in the
 * row, not just in the last cell (#3446 QA). Directory markers (trailing `/`)
 * are deliberately excluded — they are not existence-checked.
 */
function canonicalPathCandidates(line: string): string[] {
  if (!line.startsWith('|')) return [];
  if (/^\|\s*Concern\s*\|/.test(line) || /^\|\s*-+/.test(line)) return [];
  return [...line.matchAll(/`([^`]+)`/g)]
    .map((m) => m[1] ?? '')
    .filter((t) => (t.includes('/') || t.endsWith('.ts')) && !t.endsWith('/'));
}

/**
 * Validate that every file path in the "## Canonical paths" table resolves on
 * disk (#2317, #2321, #3446). Repointed at AGENTS.md — the authoritative
 * source of the canonical-paths table now that CLAUDE.md generates its copy
 * from AGENTS.md's AGNOSTIC:BODY slice. The AGENTS table is `| Concern |
 * Canonical path |`; only file paths are existence-checked (see
 * `canonicalPathCandidate`).
 */
function checkCanonicalPaths(): boolean {
  if (!existsSync(AGENTS_MD_PATH)) return true;
  const content = readFileSync(AGENTS_MD_PATH, 'utf-8');
  const headerIdx = content.search(/^## Canonical paths$/m);
  if (headerIdx === -1) return true;
  const tail = content.slice(headerIdx);
  // Stop at the first `###` subheading (e.g. "### Memory contract scope") so we
  // only scan the top-level concern→path table, not the promotion table below.
  const sectionEnd = tail.search(/\n### /);
  const section = sectionEnd === -1 ? tail : tail.slice(0, sectionEnd);

  const failures: string[] = [];
  for (const line of section.split('\n')) {
    for (const candidate of canonicalPathCandidates(line)) {
      if (!canonicalPathResolves(candidate)) failures.push(candidate);
    }
  }

  if (failures.length > 0) {
    console.error('Canonical Paths drift — these entries no longer resolve:');
    for (const f of failures) console.error('  - ' + f);
    return false;
  }
  return true;
}

/**
 * Check a single registry for drift.
 * Returns true if the check passes (no drift).
 */
function checkRegistryDrift(label: string, documented: number, actual: number): boolean {
  if (documented !== 0 && documented !== actual) {
    console.error(`${label} drift: documented ${String(documented)}, actual ${String(actual)}`);
    return false;
  }
  return true;
}

/** Print the passing-governance count summary. */
function printGovernanceSummary(
  actual: {
    tools: ToolMetadata[];
    experts: ExpertMetadata[];
    workflows: WorkflowMetadata[];
    skills: SkillMetadata[];
    models: unknown[];
  },
  agentCount: number
): void {
  console.log('Governance check passed:');
  console.log(`  MCP Tools: ${String(actual.tools.length)}`);
  console.log(`  Expert Types: ${String(actual.experts.length)}`);
  console.log(`  Workflow Templates: ${String(actual.workflows.length)}`);
  console.log(`  Skills: ${String(actual.skills.length)}`);
  console.log(`  Agents: ${String(agentCount)}`);
  console.log(`  Models: ${String(actual.models.length)}`);
}

/**
 * Check if governance is current (CI validation mode).
 */
function checkGovernance(): boolean {
  if (!existsSync(CLAUDE_MD_PATH)) {
    console.error('CLAUDE.md not found');
    return false;
  }

  const content = readFileSync(CLAUDE_MD_PATH, 'utf-8');
  const actual = {
    tools: extractMcpTools(),
    experts: extractExpertTypes(),
    workflows: extractWorkflowTemplates(),
    skills: extractSkills(),
    models: extractModels(),
  };
  const documented = extractDocumentedCounts(content);

  const agents = extractAgents();
  const ancillaryOk = checkAncillaryCounts({
    toolCount: actual.tools.length,
    skillCount: actual.skills.length,
    agentCount: agents.length,
  });
  const versionOk = checkPluginVersion();

  const checks = [
    checkRegistryDrift('MCP tools', documented.tools, actual.tools.length),
    checkRegistryDrift('Expert types', documented.experts, actual.experts.length),
    checkRegistryDrift('Workflows', documented.workflows, actual.workflows.length),
    checkRegistryDrift('Skills', documented.skills, actual.skills.length),
    content.includes(MARKERS.toolIndexStart) ||
      (console.error('Tool index section not found'), false),
    ancillaryOk,
    versionOk,
    checkReadmeToolTable(actual.tools),
    checkEntrypoints(actual.tools),
    checkCanonicalPaths(),
    checkClaudeAgnosticBlock(),
    checkAdapterPrecedenceDocs(),
    checkRuleFrontmatter(),
    checkRulesIndex(),
    checkToolAnnotations(actual.tools),
    checkMcpErrorEnvelope(),
    checkToolDistinctness(),
    checkToolPrerequisites(),
    checkToolOutputConsistency(),
    checkMemoryContract(),
    checkServerJson(actual.tools.length),
    // #3837 (Epic C, M2): the strategy-manifest registry joins the drift-gated
    // registries. Fails on YAML↔TS drift, a missing/extra/duplicate manifest vs
    // the ExecutionStrategy union, or a YAML that no longer validates against the
    // #3834 Zod schema. Logic lives in check-strategy-manifest-drift.ts (which the
    // standalone `strategy-manifest:check` script also drives).
    checkStrategyManifestRegistry(),
  ];

  const passed = checks.every(Boolean);
  if (passed) printGovernanceSummary(actual, agents.length);
  return passed;
}

/**
 * Verify that ancillary count surfaces (plugin manifests, AGENTS.md,
 * install docs) match the canonical registry counts. (#1837)
 */
interface Probe {
  path: string;
  pattern: RegExp;
  expected: number;
  label: string;
}

function buildAgentsMdProbes(t: number, s: number): Probe[] {
  return [
    {
      path: AGENTS_MD_PATH,
      pattern: /for all (\d+) skills\./,
      expected: s,
      label: 'AGENTS.md skills count',
    },
    {
      path: AGENTS_MD_PATH,
      pattern: /Nexus-agents exposes (\d+) MCP tools/,
      expected: t,
      label: 'AGENTS.md MCP tools count',
    },
  ];
}

function buildMarketplaceProbes(t: number, s: number, a: number): Probe[] {
  return [
    {
      path: PLUGIN_JSON_PATH,
      pattern: /(\d+) MCP tools for agent management/,
      expected: t,
      label: 'plugin.json MCP tools count',
    },
    {
      path: MARKETPLACE_JSON_PATH,
      pattern: /(\d+) MCP tools \(orchestrate/,
      expected: t,
      label: 'marketplace.json MCP tools count',
    },
    {
      path: MARKETPLACE_JSON_PATH,
      pattern: /, (\d+) skills,/,
      expected: s,
      label: 'marketplace.json skills count',
    },
    {
      path: MARKETPLACE_JSON_PATH,
      pattern: /, (\d+) expert agents/,
      expected: a,
      label: 'marketplace.json agents count',
    },
  ];
}

function buildPluginInstallProbes(t: number, s: number, a: number): Probe[] {
  return [
    {
      path: PLUGIN_INSTALL_PATH,
      pattern: /- (\d+) MCP tools \(/,
      expected: t,
      label: 'PLUGIN_INSTALL MCP tools count',
    },
    {
      path: PLUGIN_INSTALL_PATH,
      pattern: /- (\d+) skills \(research-and-vote/,
      expected: s,
      label: 'PLUGIN_INSTALL skills count',
    },
    {
      path: PLUGIN_INSTALL_PATH,
      pattern: /- (\d+) agent mirrors/,
      expected: a,
      label: 'PLUGIN_INSTALL agent mirrors count',
    },
    {
      path: PLUGIN_INSTALL_PATH,
      pattern: /After install, confirm the (\d+) MCP tools/,
      expected: t,
      label: 'PLUGIN_INSTALL verify tools count',
    },
    {
      path: PLUGIN_INSTALL_PATH,
      pattern: /The (\d+) skills appear in `\/skills`/,
      expected: s,
      label: 'PLUGIN_INSTALL /skills count',
    },
    {
      path: PLUGIN_INSTALL_PATH,
      pattern: /and the (\d+) agents in `\/agents`/,
      expected: a,
      label: 'PLUGIN_INSTALL /agents count',
    },
  ];
}

function buildAncillaryProbes(counts: AncillaryCounts): Probe[] {
  const { toolCount: t, skillCount: s, agentCount: a } = counts;
  return [
    ...buildAgentsMdProbes(t, s),
    ...buildMarketplaceProbes(t, s, a),
    ...buildPluginInstallProbes(t, s, a),
  ];
}

function runProbe(probe: Probe): boolean {
  if (!existsSync(probe.path)) return true;
  const content = readFileSync(probe.path, 'utf-8');
  const match = probe.pattern.exec(content);
  if (match === null) {
    console.error(`❌ ${probe.label}: pattern not found in ${probe.path}`);
    return false;
  }
  const actual = Number(match[1]);
  if (actual !== probe.expected) {
    console.error(
      `❌ ${probe.label}: expected ${String(probe.expected)}, found ${String(actual)} in ${probe.path}`
    );
    return false;
  }
  return true;
}

function checkAncillaryCounts(counts: AncillaryCounts): boolean {
  return buildAncillaryProbes(counts).every(runProbe);
}

/**
 * Apply the inline registry-count rewrites that update the documentation
 * section's "(N types/templates/tools/skills)" markers. Pure string ops,
 * extracted from injectGovernance() to keep that function under the
 * max-lines-per-function gate (#2317).
 */
function applyInlineCountRewrites(
  content: string,
  counts: { experts: number; workflows: number; tools: number; skills: number }
): string {
  let next = content.replace(
    /Experts:.*?`expert-config\.ts`\s*\(\d+\s*types\)/,
    `Experts: \`expert-config.ts\` (${String(counts.experts)} types)`
  );
  next = next.replace(
    /Workflows:.*?`template-types\.ts`\s*\(\d+\s*templates\)/,
    `Workflows: \`template-types.ts\` (${String(counts.workflows)} templates)`
  );
  next = next.replace(
    /MCP Tools:.*?`src\/mcp\/tools\/index\.ts`\s*\(\d+\s*tools\)/,
    `MCP Tools: \`src/mcp/tools/index.ts\` (${String(counts.tools)} tools)`
  );
  next = next.replace(
    /Skills:.*?`\.claude\/skills\/\*\.md`\s*\(\d+\s*skills\)/,
    `Skills: \`skills/<name>/SKILL.md\` (${String(counts.skills)} skills)`
  );
  return next;
}

/**
 * Inject the Workflows table (#2317). Soft-skip if the markers have not yet
 * been added to CLAUDE.md so this script remains compatible with older
 * checkouts that haven't migrated.
 */
function injectWorkflowIndex(content: string, rows: readonly WorkflowRow[]): string {
  if (rows.length === 0 || !content.includes(MARKERS.workflowIndexStart)) return content;
  return injectSection(
    content,
    MARKERS.workflowIndexStart,
    MARKERS.workflowIndexEnd,
    generateWorkflowIndex(rows)
  );
}

/**
 * Inject all governance sections into CLAUDE.md.
 */
interface GovernanceRegistries {
  tools: ToolMetadata[];
  experts: ExpertMetadata[];
  workflows: WorkflowMetadata[];
  skills: SkillMetadata[];
  models: ModelMetadata[];
}

function loadAllRegistries(): GovernanceRegistries {
  return {
    tools: extractMcpTools(),
    experts: extractExpertTypes(),
    workflows: extractWorkflowTemplates(),
    skills: extractSkills(),
    models: extractModels(),
  };
}

function applyAllSectionInjections(content: string, r: GovernanceRegistries): string {
  // #3446: regenerate the agnostic body FIRST from AGENTS.md's AGNOSTIC:BODY
  // slice, so the harness-neutral prose stays single-sourced. The remaining
  // injections target the authored header / Claude-specific overlay markers,
  // which live in disjoint regions of the file.
  let next = injectClaudeAgnosticBlock(content);
  next = injectSection(
    next,
    MARKERS.toolIndexStart,
    MARKERS.toolIndexEnd,
    generateToolIndex(r.tools)
  );
  next = injectWorkflowIndex(next, extractWorkflowRows());
  next = injectSection(
    next,
    MARKERS.modelListStart,
    MARKERS.modelListEnd,
    generateModelList(r.models)
  );
  next = applyInlineCountRewrites(next, {
    experts: r.experts.length,
    workflows: r.workflows.length,
    tools: r.tools.length,
    skills: r.skills.length,
  });
  return injectSection(next, MARKERS.versionStart, MARKERS.versionEnd, generateVersionSection());
}

async function injectGovernance(): Promise<void> {
  if (!existsSync(CLAUDE_MD_PATH)) {
    console.error('CLAUDE.md not found');
    process.exit(1);
  }
  const registries = loadAllRegistries();
  const original = readFileSync(CLAUDE_MD_PATH, 'utf-8');
  const updated = applyAllSectionInjections(original, registries);
  await writeFormatted(CLAUDE_MD_PATH, updated);
  // Bind to the post-write registry snapshot for the remaining steps.
  const { tools, experts, workflows, skills, models } = registries;

  // Inject README MCP tools table (#2269) — same registry, scannable
  // descriptions. Soft-skip if README has no markers yet so this script
  // remains drop-in compatible with older checkouts.
  await injectReadmeToolTable(tools);

  // Inject the AGENTS.md Rules index (#2657) from `.rules/*.md` frontmatter —
  // the cross-adapter bridge. Soft-skip if AGENTS.md has no markers yet.
  await injectAgentsRulesIndex();

  // #3334: regenerate both docs/ENTRYPOINTS.md MCP-tool enumerations (the
  // prose table and the BEGIN:MCP_TOOLS YAML block) from the same registry.
  await injectEntrypoints(tools);

  // #1837: keep ancillary count surfaces (plugin manifests, AGENTS.md,
  // install docs) aligned with canonical registries.
  const agents = extractAgents();
  injectAncillaryCounts({
    toolCount: tools.length,
    skillCount: skills.length,
    agentCount: agents.length,
  });

  // #1839: keep .claude-plugin/plugin.json `version` in sync with
  // packages/nexus-agents/package.json so marketplace listing never
  // drifts from the shipped npm package.
  syncPluginVersion();

  // #2327 + #2295 follow-up: sync packages/nexus-agents/server.json — the
  // MCP-spec registry file — to package.json's version, canonical tool
  // count, and the full `tools[]` array. The latter previously needed a
  // manual edit per tool; CI's docs-content-drift gate (#2107) caught it
  // every release.
  syncServerJson(tools.map((t) => t.name));

  // #2295 follow-up: sync ancillary count surfaces that the docs-content-
  // drift gate (#2107) checks but didn't write. Each new tool used to
  // require manual edits in 5+ places; now they all flow from this script.
  syncWebsiteToolCount(tools.length);
  syncDesignDocsToolCount(tools.length);
  syncReadmeToolCount(tools.length);

  console.log('Governance injected:');
  console.log(`  MCP Tools: ${String(tools.length)}`);
  console.log(`  Expert Types: ${String(experts.length)}`);
  console.log(`  Workflow Templates: ${String(workflows.length)}`);
  console.log(`  Skills: ${String(skills.length)}`);
  console.log(`  Agents: ${String(agents.length)}`);
  console.log(`  Models: ${String(models.length)}`);
}

/**
 * Verify the README MCP tools section is in sync with the canonical
 * registry (#2269). Returns true if README is absent (soft-skip) OR has
 * markers AND running the generator would produce no diff. Returns false
 * (with a structured error) when markers exist but the table is stale —
 * the maintainer must run `pnpm governance:inject` and commit.
 */
function checkReadmeToolTable(tools: ToolMetadata[]): boolean {
  if (!existsSync(README_PATH)) return true;
  const content = readFileSync(README_PATH, 'utf-8');
  if (!content.includes(MARKERS.readmeToolsStart)) return true;
  const expected = generateReadmeToolTable(tools);
  const updated = injectSection(
    content,
    MARKERS.readmeToolsStart,
    MARKERS.readmeToolsEnd,
    expected
  );
  if (updated !== content) {
    console.error('README MCP tools table is stale. Run: pnpm governance:inject');
    return false;
  }
  return true;
}

/**
 * Write the README MCP tools table between governance markers (#2269).
 * Soft-skip when README is missing or markers are absent so this script
 * remains drop-in compatible with older checkouts that haven't been
 * marker-prepped yet.
 */
async function injectReadmeToolTable(tools: ToolMetadata[]): Promise<void> {
  if (!existsSync(README_PATH)) {
    return;
  }
  const content = readFileSync(README_PATH, 'utf-8');
  if (!content.includes(MARKERS.readmeToolsStart)) {
    return;
  }
  const table = generateReadmeToolTable(tools);
  const updated = injectSection(content, MARKERS.readmeToolsStart, MARKERS.readmeToolsEnd, table);
  if (updated !== content) {
    await writeFormatted(README_PATH, updated);
  }
}

/**
 * Write the AGENTS.md Rules index between governance markers (#2657).
 * Soft-skip when AGENTS.md is missing or markers are absent so this script
 * stays drop-in compatible with checkouts that have not been marker-prepped.
 */
async function injectAgentsRulesIndex(): Promise<void> {
  if (!existsSync(AGENTS_MD_PATH)) return;
  const content = readFileSync(AGENTS_MD_PATH, 'utf-8');
  if (!content.includes(MARKERS.rulesIndexStart)) return;
  const updated = injectRulesIndex(content, extractRules());
  if (updated !== content) {
    await writeFormatted(AGENTS_MD_PATH, updated);
  }
}

/**
 * Apply count replacements across plugin + install docs (#1837).
 * Each replacement is keyed on a stable phrase so the file remains
 * hand-editable otherwise. Silent no-ops on missing files.
 */
interface AncillaryCounts {
  toolCount: number;
  skillCount: number;
  agentCount: number;
}

interface Replacement {
  path: string;
  pattern: RegExp;
  replacement: string;
}

// eslint-disable-next-line max-lines-per-function -- declarative probe table, splitting would just add cosmetic helpers
function buildAncillaryReplacements(c: AncillaryCounts): Replacement[] {
  const { toolCount: t, skillCount: s, agentCount: a } = c;
  return [
    {
      path: AGENTS_MD_PATH,
      pattern: /for all \d+ skills\./,
      replacement: `for all ${String(s)} skills.`,
    },
    {
      path: AGENTS_MD_PATH,
      pattern: /Nexus-agents exposes \d+ MCP tools/,
      replacement: `Nexus-agents exposes ${String(t)} MCP tools`,
    },
    {
      path: PLUGIN_JSON_PATH,
      pattern: /\d+ MCP tools for agent management/,
      replacement: `${String(t)} MCP tools for agent management`,
    },
    {
      path: MARKETPLACE_JSON_PATH,
      pattern:
        /\d+ MCP tools \(orchestrate, consensus voting, research, pipelines\), \d+ skills, \d+ expert agents/,
      replacement: `${String(t)} MCP tools (orchestrate, consensus voting, research, pipelines), ${String(s)} skills, ${String(a)} expert agents`,
    },
    {
      path: PLUGIN_INSTALL_PATH,
      pattern: /- \d+ MCP tools \(/,
      replacement: `- ${String(t)} MCP tools (`,
    },
    {
      path: PLUGIN_INSTALL_PATH,
      pattern: /- \d+ skills \(research-and-vote/,
      replacement: `- ${String(s)} skills (research-and-vote`,
    },
    {
      path: PLUGIN_INSTALL_PATH,
      pattern: /- \d+ agent mirrors \(/,
      replacement: `- ${String(a)} agent mirrors (`,
    },
    {
      path: PLUGIN_INSTALL_PATH,
      pattern: /After install, confirm the \d+ MCP tools/,
      replacement: `After install, confirm the ${String(t)} MCP tools`,
    },
    {
      path: PLUGIN_INSTALL_PATH,
      pattern: /The \d+ skills appear in `\/skills`, and the \d+ agents/,
      replacement: `The ${String(s)} skills appear in \`/skills\`, and the ${String(a)} agents`,
    },
    {
      path: PLUGIN_INSTALL_PATH,
      pattern: /\| Skills \(canonical\)  \| `skills\/<name>\/SKILL\.md` \(\d+\) \|/,
      replacement: `| Skills (canonical)  | \`skills/<name>/SKILL.md\` (${String(s)}) |`,
    },
    {
      path: PLUGIN_INSTALL_PATH,
      pattern: /\| Agents             \| `agents\/\*\.md` \(\d+\) \|/,
      replacement: `| Agents             | \`agents/*.md\` (${String(a)}) |`,
    },
  ];
}

function injectAncillaryCounts(counts: AncillaryCounts): void {
  for (const { path, pattern, replacement } of buildAncillaryReplacements(counts)) {
    if (!existsSync(path)) continue;
    const current = readFileSync(path, 'utf-8');
    const updated = current.replace(pattern, replacement);
    if (updated !== current) writeFileSync(path, updated);
  }
}

/**
 * CI drift probe for plugin manifest version (#1839).
 * Fails if .claude-plugin/plugin.json `version` !== package.json `version`.
 */
function checkPluginVersion(): boolean {
  if (!existsSync(PACKAGE_JSON_PATH) || !existsSync(PLUGIN_JSON_PATH)) return true;
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf-8')) as { version?: string };
  const plugin = JSON.parse(readFileSync(PLUGIN_JSON_PATH, 'utf-8')) as { version?: string };
  if (pkg.version === plugin.version) return true;
  console.error(
    `❌ Plugin manifest version: plugin.json has ${String(plugin.version)}, package.json has ${String(pkg.version)}`
  );
  return false;
}

/**
 * Keep .claude-plugin/plugin.json `version` aligned with
 * packages/nexus-agents/package.json (#1839 marketplace submission prep).
 * The plugin manifest is what Anthropic's marketplace listing reads.
 */
function syncPluginVersion(): void {
  if (!existsSync(PACKAGE_JSON_PATH) || !existsSync(PLUGIN_JSON_PATH)) return;
  const pkgVersion = (JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf-8')) as { version?: string })
    .version;
  if (typeof pkgVersion !== 'string' || pkgVersion.length === 0) return;

  const plugin = JSON.parse(readFileSync(PLUGIN_JSON_PATH, 'utf-8')) as Record<string, unknown>;
  if (plugin['version'] === pkgVersion) return;

  plugin['version'] = pkgVersion;
  writeFileSync(PLUGIN_JSON_PATH, JSON.stringify(plugin, null, 2) + '\n');
}

/**
 * Keep packages/nexus-agents/server.json aligned with package.json (#2327).
 * The MCP-spec server.json carries TWO version fields (top-level + per-package
 * entry) and an inline "N MCP tools" count in `description`. All three drift
 * silently — the file was 10 minor versions behind when this sync was added.
 */
interface ServerJsonShape {
  version?: string;
  description?: string;
  packages?: Array<Record<string, unknown>>;
  tools?: string[];
  [k: string]: unknown;
}

function syncServerVersionFields(server: ServerJsonShape, pkgVersion: string): boolean {
  let dirty = false;
  if (server.version !== pkgVersion) {
    server.version = pkgVersion;
    dirty = true;
  }
  if (Array.isArray(server.packages)) {
    for (const pkgEntry of server.packages) {
      if (pkgEntry['version'] !== pkgVersion) {
        pkgEntry['version'] = pkgVersion;
        dirty = true;
      }
    }
  }
  return dirty;
}

function syncServerToolCount(server: ServerJsonShape, toolCount: number): boolean {
  if (typeof server.description !== 'string') return false;
  const updated = server.description.replace(/(\d+) MCP tools/, `${String(toolCount)} MCP tools`);
  if (updated === server.description) return false;
  server.description = updated;
  return true;
}

/**
 * Sync the `tools[]` array from the authoritative `STANDALONE_TOOLS` list
 * (#2295 follow-up). Preserves source order — the registration order in
 * `mcp/tools/index.ts` is meaningful for help-text and matches consumer
 * expectations.
 */
function syncServerToolList(server: ServerJsonShape, toolNames: readonly string[]): boolean {
  if (Array.isArray(server.tools)) {
    const same =
      server.tools.length === toolNames.length && server.tools.every((t, i) => t === toolNames[i]);
    if (same) return false;
  }
  server.tools = [...toolNames];
  return true;
}

function syncServerJson(toolNames: readonly string[]): void {
  if (!existsSync(PACKAGE_JSON_PATH) || !existsSync(SERVER_JSON_PATH)) return;
  const pkgVersion = (JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf-8')) as { version?: string })
    .version;
  if (typeof pkgVersion !== 'string' || pkgVersion.length === 0) return;

  const server = JSON.parse(readFileSync(SERVER_JSON_PATH, 'utf-8')) as ServerJsonShape;
  const versionDirty = syncServerVersionFields(server, pkgVersion);
  const countDirty = syncServerToolCount(server, toolNames.length);
  const listDirty = syncServerToolList(server, toolNames);
  if (versionDirty || countDirty || listDirty) {
    writeFileSync(SERVER_JSON_PATH, JSON.stringify(server, null, 2) + '\n');
  }
}

const SITE_DATA_PATH = join(ROOT, 'website/src/data/site-data.ts');
const COMPONENTS_DOC_PATH = join(ROOT, 'docs/design/components.md');

/**
 * Update the `MCP_TOOL_COUNT = N` constant in the website's site-data.ts
 * (#2295 follow-up). Soft-skip if the website module isn't checked out.
 */
function syncWebsiteToolCount(toolCount: number): void {
  if (!existsSync(SITE_DATA_PATH)) return;
  const content = readFileSync(SITE_DATA_PATH, 'utf-8');
  const updated = content.replace(
    /(export const MCP_TOOL_COUNT\s*=\s*)\d+(\s*;)/,
    `$1${String(toolCount)}$2`
  );
  if (updated !== content) writeFileSync(SITE_DATA_PATH, updated);
}

/**
 * Update the three "N tool" / "N MCP tools" / "N registered tools" inline
 * mentions in docs/design/components.md (#2295 follow-up). Each was a manual
 * edit on every tool addition; the docs-content-drift gate (#2107) caught
 * them at release time.
 */
function syncDesignDocsToolCount(toolCount: number): void {
  if (!existsSync(COMPONENTS_DOC_PATH)) return;
  const content = readFileSync(COMPONENTS_DOC_PATH, 'utf-8');
  let updated = content.replace(
    /(MCP server, )(\d+)( tool handlers, gateway)/,
    `$1${String(toolCount)}$3`
  );
  updated = updated.replace(
    /(against )(\d+)( registered tools and \d+ expert roles)/,
    `$1${String(toolCount)}$3`
  );
  updated = updated.replace(
    /(`registerTools\(\)` — )(\d+)( tools total)/,
    `$1${String(toolCount)}$3`
  );
  if (updated !== content) writeFileSync(COMPONENTS_DOC_PATH, updated);
}

/**
 * Update the two `N MCP tools` mentions in the root README.md (#2295
 * follow-up). One in the architecture diagram, one in the capabilities
 * table. The capabilities-table cell uses a special `**N MCP Tools**`
 * pattern that won't false-match other prose.
 */
function syncReadmeToolCount(toolCount: number): void {
  if (!existsSync(README_PATH)) return;
  const content = readFileSync(README_PATH, 'utf-8');
  let updated = content.replace(
    /(│\s+)(\d+)( MCP tools · multi-stage CompositeRouter)/,
    `$1${String(toolCount)}$3`
  );
  updated = updated.replace(/(\*\*)(\d+)( MCP Tools\*\*)/, `$1${String(toolCount)}$3`);
  if (updated !== content) writeFileSync(README_PATH, updated);
}

/**
 * CI drift probe for server.json (#2327). Mirrors checkPluginVersion: fails
 * when version OR description's tool count is stale. The two `packages[].version`
 * fields aren't separately probed — they're written by the same syncServerJson
 * step, so a drift there indicates the sync didn't run, which the top-level
 * version check already catches.
 */
function checkServerJson(toolCount: number): boolean {
  if (!existsSync(PACKAGE_JSON_PATH) || !existsSync(SERVER_JSON_PATH)) return true;
  const pkgVersion = (JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf-8')) as { version?: string })
    .version;
  const server = JSON.parse(readFileSync(SERVER_JSON_PATH, 'utf-8')) as ServerJsonShape;

  let ok = true;
  if (server.version !== pkgVersion) {
    console.error(
      `❌ server.json version: server.json has ${String(server.version)}, package.json has ${String(pkgVersion)}`
    );
    ok = false;
  }
  if (typeof server.description === 'string') {
    const match = /(\d+) MCP tools/.exec(server.description);
    if (match !== null && match[1] !== String(toolCount)) {
      console.error(
        `❌ server.json description: claims "${String(match[1])} MCP tools", canonical count is ${String(toolCount)}`
      );
      ok = false;
    }
  }
  return ok;
}

// CLI interface
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'check':
    process.exit(checkGovernance() ? 0 : 1);
    break;
  case 'inject':
  default:
    await injectGovernance();
    break;
}
