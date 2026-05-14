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
import { TOOL_DESCRIPTIONS, README_TOOL_DESCRIPTIONS } from './tool-descriptions-data.js';
import { loadBaseline, runDistinctnessCheck } from './check-tool-distinctness.js';
import { scanToolFiles } from './check-tool-output-consistency.js';
const CLAUDE_MD_PATH = join(ROOT, 'CLAUDE.md');
const README_PATH = join(ROOT, 'README.md');
const TOOLS_INDEX = join(ROOT, 'packages/nexus-agents/src/mcp/tools/index.ts');
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
};

const SKILLS_INDEX_PATH = join(SKILLS_DIR, 'index.yaml');

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
  if (!existsSync(TOOLS_INDEX)) {
    console.error('MCP tools index not found: ' + TOOLS_INDEX);
    return [];
  }

  const content = readFileSync(TOOLS_INDEX, 'utf-8');

  // Extract the tools array. Source of truth is the module-level
  // `REGISTERED_TOOL_NAMES` const (extracted out of `registerTools()` to fit
  // the max-lines-per-function gate). Fall back to the inline `tools: [...]`
  // shape for older checkouts that haven't migrated yet.
  const toolsMatch =
    content.match(/REGISTERED_TOOL_NAMES\s*=\s*\[([\s\S]*?)\]\s*as const/) ??
    content.match(/tools:\s*\[([\s\S]*?)\]/);
  if (toolsMatch?.[1] === undefined) {
    console.error('Could not parse tools array from index.ts');
    return [];
  }

  const toolNames = toolsMatch[1]
    .split('\n')
    .map((line) => line.match(/'([^']+)'/)?.[1])
    .filter((name): name is string => name !== undefined);

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
 * Parses `packages/nexus-agents/src/mcp/tool-annotations.ts` as the
 * source of truth (regex match on top-level keys of TOOL_ANNOTATIONS),
 * cross-references against `extractMcpTools()`. Reports missing entries
 * AND stale entries (in the map but not registered).
 */
function checkToolAnnotations(tools: ToolMetadata[]): boolean {
  const path = join(ROOT, 'packages/nexus-agents/src/mcp/tool-annotations.ts');
  if (!existsSync(path)) {
    console.error('Missing src/mcp/tool-annotations.ts (#2648)');
    return false;
  }
  const content = readFileSync(path, 'utf-8');
  // Extract tool names from the TOOL_ANNOTATIONS object literal. The keys
  // are bare identifiers (snake_case) followed by `: {`.
  const annotatedNames = new Set<string>();
  const keyPattern = /^\s{2}([a-z_]+):\s*\{/gm;
  let match: RegExpExecArray | null;
  while ((match = keyPattern.exec(content)) !== null) {
    if (match[1] !== undefined) annotatedNames.add(match[1]);
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

/** Tool names whose annotation block lacks `readOnlyHint: true`. */
function extractNonReadOnlyTools(annotationsSrc: string): Set<string> {
  const names = new Set<string>();
  const blockPattern = /^ {2}([a-z_]+):\s*\{([\s\S]*?)\n {2}\},/gm;
  let block: RegExpExecArray | null;
  while ((block = blockPattern.exec(annotationsSrc)) !== null) {
    const name = block[1];
    const body = block[2] ?? '';
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
  const annotationsPath = join(ROOT, 'packages/nexus-agents/src/mcp/tool-annotations.ts');
  const prereqPath = join(ROOT, 'packages/nexus-agents/src/mcp/middleware/tool-prerequisites.ts');
  if (!existsSync(annotationsPath) || !existsSync(prereqPath)) {
    console.error('Missing tool-annotations.ts or tool-prerequisites.ts (#2652)');
    return false;
  }
  const nonReadOnly = extractNonReadOnlyTools(readFileSync(annotationsPath, 'utf-8'));
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

function checkCanonicalPaths(): boolean {
  if (!existsSync(CLAUDE_MD_PATH)) return false;
  const content = readFileSync(CLAUDE_MD_PATH, 'utf-8');
  const headerIdx = content.indexOf('## Canonical Paths');
  if (headerIdx === -1) return true;
  const tail = content.slice(headerIdx);
  const sectionEnd = tail.search(/\n---\n/);
  const section = sectionEnd === -1 ? tail : tail.slice(0, sectionEnd);

  const rowPattern = /^\|\s*\*\*[^*]+\*\*\s*\|[^|]*\|\s*`([^`]+)`\s*\|/gm;
  const failures: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(section)) !== null) {
    const candidate = match[1];
    if (candidate === undefined) continue;
    if (candidate.endsWith('/')) continue; // directory marker, e.g. `src/security/`
    const abs = join(ROOT, candidate);
    if (!existsSync(abs)) failures.push(candidate);
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
    checkCanonicalPaths(),
    checkAdapterPrecedenceDocs(),
    checkRuleFrontmatter(),
    checkToolAnnotations(actual.tools),
    checkMcpErrorEnvelope(),
    checkToolDistinctness(),
    checkToolPrerequisites(),
    checkToolOutputConsistency(),
    checkServerJson(actual.tools.length),
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
  let next = injectSection(
    content,
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
