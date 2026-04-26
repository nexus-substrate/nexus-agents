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
import { join } from 'node:path';
import { ROOT } from './script-paths.js';
const CLAUDE_MD_PATH = join(ROOT, 'CLAUDE.md');
const TOOLS_INDEX = join(ROOT, 'packages/nexus-agents/src/mcp/tools/index.ts');
const EXPERT_CONFIG = join(ROOT, 'packages/nexus-agents/src/agents/experts/expert-config.ts');
const TEMPLATE_TYPES = join(ROOT, 'packages/nexus-agents/src/workflows/template-types.ts');
const SKILLS_DIR = join(ROOT, 'skills');
const AGENTS_DIR = join(ROOT, 'agents');
const MODEL_CAPS = join(ROOT, 'packages/nexus-agents/src/config/model-capabilities.ts');
const PACKAGE_JSON_PATH = join(ROOT, 'packages/nexus-agents/package.json');

// Additional inject targets for #1837 count-drift prevention.
const AGENTS_MD_PATH = join(ROOT, 'AGENTS.md');
const PLUGIN_JSON_PATH = join(ROOT, '.claude-plugin/plugin.json');
const MARKETPLACE_JSON_PATH = join(ROOT, '.claude-plugin/marketplace.json');
const PLUGIN_INSTALL_PATH = join(ROOT, 'docs/getting-started/PLUGIN_INSTALL.md');

// Markers for governance sections
const MARKERS = {
  toolIndexStart: '<!-- GOVERNANCE:TOOL_INDEX:START -->',
  toolIndexEnd: '<!-- GOVERNANCE:TOOL_INDEX:END -->',
  modelListStart: '<!-- GOVERNANCE:MODEL_LIST:START -->',
  modelListEnd: '<!-- GOVERNANCE:MODEL_LIST:END -->',
  versionStart: '<!-- GOVERNANCE:VERSION:START -->',
  versionEnd: '<!-- GOVERNANCE:VERSION:END -->',
};

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
 * Curated descriptions for MCP tools.
 * Updated when tools change. The extractMcpTools function validates
 * this map against the canonical tools array in index.ts.
 */
const TOOL_DESCRIPTIONS: Record<string, string> = {
  orchestrate:
    'Orchestrate a task by analyzing it, breaking it into subtasks if needed, and coordinating expert agents',
  create_expert:
    'Create a specialized expert agent for code, architecture, security, documentation, testing, devops, research, product management, or UX tasks',
  execute_expert:
    'Execute a task using a previously created expert agent. Returns the expert analysis including output, confidence, and token usage.',
  run_workflow:
    'Execute workflow templates with provided inputs, supporting built-in templates and custom paths',
  consensus_vote:
    'Execute multi-model consensus voting on a proposal. Uses specialized agent roles to vote with configurable strategies.',
  delegate_to_model:
    'Route a task to the optimal model based on capability matching. Returns model recommendation with reasoning.',
  list_experts:
    'List available expert types that can be created with create_expert. Returns role names, descriptions, and capabilities.',
  list_workflows:
    'List available workflow templates that can be executed with run_workflow. Returns template names and descriptions.',
  research_query:
    'Query the research registry for technique status, overlaps, statistics, or text search.',
  research_add:
    'Add an arXiv paper to the research registry. Fetches metadata from the arXiv API and persists to the registry.',
  research_discover:
    'Discover new research papers and repositories from external sources. Searches arXiv, GitHub, and other sources.',
  research_analyze:
    'Analyze the research registry for gaps, trends, priorities, stale entries, or coverage.',
  research_catalog_review: 'Review auto-cataloged research references found during tool execution.',
  research_synthesize:
    'Synthesize the research registry by grouping papers into topic clusters with themes, insights, and implementation opportunities.',
  memory_query: 'Query across all memory backends with unified results and relevance scoring.',
  memory_stats: 'Get memory system statistics dashboard showing backend availability and metrics.',
  weather_report:
    'Get multi-CLI performance weather report with per-CLI success rates and adaptive routing bonuses.',
  issue_triage: 'Triage GitHub issues with trust classification and typed action recommendations.',
  run_graph_workflow:
    'Execute graph-based workflow templates with checkpoint and rollback support.',
  execute_spec:
    'Execute an AI software factory spec through the full pipeline (parse, decompose, compile, execute, validate).',
  registry_import:
    'Generate a draft model registry entry for a new AI model. Returns a template with conservative defaults for human review.',
  query_trace:
    'Query execution trace JSONL files from disk for a given run ID. Supports filtering by event type and pagination.',
  memory_write:
    'Write a memory entry to a specific backend. Supports session, belief, agentic, adaptive, and typed backends.',
  repo_analyze:
    'Analyze a GitHub repository structure. Returns language, framework, package manager, CI provider, security tooling, and gap identification.',
  repo_security_plan:
    'Generate a security scanning pipeline recommendation for a GitHub repository based on detected tech stack.',
  research_add_source:
    'Add a non-paper source (GitHub repo, tool, blog) to the research registry with auto quality scoring.',
  extract_symbols:
    'Extract code symbols (functions, classes, types) from source files for analysis.',
  search_codebase:
    'Search the codebase for code patterns, symbols, or text across all source files.',
  query_task_state:
    'Read the structured task-state log for a task ID and return the current snapshot. Requires NEXUS_TASK_STATE_ENABLED=1 during the originating orchestrate call.',
  run_dev_pipeline:
    'Run the multi-agent development pipeline. Accepts direct task instructions, a plan file, or a spec file. Supports dry-run (plan+vote only).',
  run_pipeline:
    'Single unified entry point for all pipeline templates (dev/research/audit/greenfield). Auto-detects template from task content or accepts an explicit override.',
  pr_review:
    'Run multi-voter consensus review on a PR diff (#2233). 5 voters (architect, security, devex, catfish, scope_steward) each emit approve/request_changes/abstain with reasoning and citations. Reuses consensus_vote infra; experimental.',
};

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

  // Extract the tools array from the return statement
  const toolsMatch = content.match(/tools:\s*\[([\s\S]*?)\]/);
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
 * Extract model IDs from model-capabilities.ts.
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
 * Generate the MCP tools reference table.
 */
function generateToolIndex(tools: ToolMetadata[]): string {
  // Dynamically calculate column widths to match Prettier's formatting
  const toolCells = tools.map((t) => '`' + t.name + '`');
  const descCells = tools.map((t) => t.description);
  const toolColWidth = Math.max('Tool'.length, ...toolCells.map((c) => c.length));
  const descColWidth = Math.max('Description'.length, ...descCells.map((c) => c.length));

  const header = `| ${'Tool'.padEnd(toolColWidth)} | ${'Description'.padEnd(descColWidth)} |`;
  const separator = `| ${'-'.repeat(toolColWidth)} | ${'-'.repeat(descColWidth)} |`;

  const lines = [MARKERS.toolIndexStart, '', '## MCP Tools Reference', '', header, separator];

  for (const tool of tools) {
    const paddedName = ('`' + tool.name + '`').padEnd(toolColWidth);
    lines.push(`| ${paddedName} | ${tool.description.padEnd(descColWidth)} |`);
  }

  lines.push('');
  lines.push(`_Auto-generated from source. ${String(tools.length)} tools registered._`);
  lines.push('');
  lines.push(MARKERS.toolIndexEnd);

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
 */
function generateVersionSection(): string {
  const now = new Date();
  const etOffset = now.toLocaleString('en-US', {
    timeZone: 'America/New_York',
  });
  const etDate = new Date(etOffset);
  const year = etDate.getFullYear();
  const month = String(etDate.getMonth() + 1).padStart(2, '0');
  const day = String(etDate.getDate()).padStart(2, '0');
  const timestamp = `${String(year)}-${month}-${day}`;

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
  ];

  const passed = checks.every(Boolean);
  if (passed) {
    console.log('Governance check passed:');
    console.log(`  MCP Tools: ${String(actual.tools.length)}`);
    console.log(`  Expert Types: ${String(actual.experts.length)}`);
    console.log(`  Workflow Templates: ${String(actual.workflows.length)}`);
    console.log(`  Skills: ${String(actual.skills.length)}`);
    console.log(`  Agents: ${String(agents.length)}`);
    console.log(`  Models: ${String(actual.models.length)}`);
  }
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
 * Inject all governance sections into CLAUDE.md.
 */
function injectGovernance(): void {
  if (!existsSync(CLAUDE_MD_PATH)) {
    console.error('CLAUDE.md not found');
    process.exit(1);
  }

  let content = readFileSync(CLAUDE_MD_PATH, 'utf-8');

  // Extract all registries
  const tools = extractMcpTools();
  const experts = extractExpertTypes();
  const workflows = extractWorkflowTemplates();
  const skills = extractSkills();
  const models = extractModels();

  // Generate and inject tool index
  const toolIndex = generateToolIndex(tools);
  content = injectSection(content, MARKERS.toolIndexStart, MARKERS.toolIndexEnd, toolIndex);

  // Generate and inject model list
  const modelList = generateModelList(models);
  content = injectSection(content, MARKERS.modelListStart, MARKERS.modelListEnd, modelList);

  // Update canonical registry counts in the documentation section
  // These are inline references like: `expert-config.ts` (7 types)
  content = content.replace(
    /Experts:.*?`expert-config\.ts`\s*\(\d+\s*types\)/,
    `Experts: \`expert-config.ts\` (${String(experts.length)} types)`
  );
  content = content.replace(
    /Workflows:.*?`template-types\.ts`\s*\(\d+\s*templates\)/,
    `Workflows: \`template-types.ts\` (${String(workflows.length)} templates)`
  );
  content = content.replace(
    /MCP Tools:.*?`src\/mcp\/tools\/index\.ts`\s*\(\d+\s*tools\)/,
    `MCP Tools: \`src/mcp/tools/index.ts\` (${String(tools.length)} tools)`
  );
  content = content.replace(
    /Skills:.*?`\.claude\/skills\/\*\.md`\s*\(\d+\s*skills\)/,
    `Skills: \`skills/<name>/SKILL.md\` (${String(skills.length)} skills)`
  );

  // Generate and inject version section
  const versionSection = generateVersionSection();
  content = injectSection(content, MARKERS.versionStart, MARKERS.versionEnd, versionSection);

  writeFileSync(CLAUDE_MD_PATH, content);

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

  console.log('Governance injected:');
  console.log(`  MCP Tools: ${String(tools.length)}`);
  console.log(`  Expert Types: ${String(experts.length)}`);
  console.log(`  Workflow Templates: ${String(workflows.length)}`);
  console.log(`  Skills: ${String(skills.length)}`);
  console.log(`  Agents: ${String(agents.length)}`);
  console.log(`  Models: ${String(models.length)}`);
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

// CLI interface
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'check':
    process.exit(checkGovernance() ? 0 : 1);
    break;
  case 'inject':
  default:
    injectGovernance();
    break;
}
