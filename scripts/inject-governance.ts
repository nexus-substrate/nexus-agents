#!/usr/bin/env npx tsx
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
import { join, dirname, basename } from 'node:path';

// Configuration
const ROOT = join(dirname(import.meta.url.replace('file://', '')), '..');
const CLAUDE_MD_PATH = join(ROOT, 'CLAUDE.md');
const TOOLS_INDEX = join(ROOT, 'packages/nexus-agents/src/mcp/tools/index.ts');
const EXPERT_CONFIG = join(ROOT, 'packages/nexus-agents/src/agents/experts/expert-config.ts');
const TEMPLATE_TYPES = join(ROOT, 'packages/nexus-agents/src/workflows/template-types.ts');
const SKILLS_DIR = join(ROOT, '.claude/skills');

// Markers for governance sections
const MARKERS = {
  toolIndexStart: '<!-- GOVERNANCE:TOOL_INDEX:START -->',
  toolIndexEnd: '<!-- GOVERNANCE:TOOL_INDEX:END -->',
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
    'Create a specialized expert agent for code, architecture, security, documentation, testing, devops, or research tasks',
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
  memory_query: 'Query across all memory backends with unified results and relevance scoring.',
  memory_stats: 'Get memory system statistics dashboard showing backend availability and metrics.',
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

  const files = readdirSync(SKILLS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort();

  return files.map((f) => ({
    name: basename(f, '.md'),
    filename: f,
  }));
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
  const skillMatches = content.match(/Skills:.*?`\.claude\/skills\/\*\.md`\s*\((\d+)\s*skills\)/);
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
  };
  const documented = extractDocumentedCounts(content);

  const checks = [
    checkRegistryDrift('MCP tools', documented.tools, actual.tools.length),
    checkRegistryDrift('Expert types', documented.experts, actual.experts.length),
    checkRegistryDrift('Workflows', documented.workflows, actual.workflows.length),
    checkRegistryDrift('Skills', documented.skills, actual.skills.length),
    content.includes(MARKERS.toolIndexStart) ||
      (console.error('Tool index section not found'), false),
  ];

  const passed = checks.every(Boolean);
  if (passed) {
    console.log('Governance check passed:');
    console.log(`  MCP Tools: ${String(actual.tools.length)}`);
    console.log(`  Expert Types: ${String(actual.experts.length)}`);
    console.log(`  Workflow Templates: ${String(actual.workflows.length)}`);
    console.log(`  Skills: ${String(actual.skills.length)}`);
  }
  return passed;
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

  // Generate and inject tool index
  const toolIndex = generateToolIndex(tools);
  content = injectSection(content, MARKERS.toolIndexStart, MARKERS.toolIndexEnd, toolIndex);

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
    `Skills: \`.claude/skills/*.md\` (${String(skills.length)} skills)`
  );

  // Generate and inject version section
  const versionSection = generateVersionSection();
  content = injectSection(content, MARKERS.versionStart, MARKERS.versionEnd, versionSection);

  writeFileSync(CLAUDE_MD_PATH, content);

  console.log('Governance injected:');
  console.log(`  MCP Tools: ${String(tools.length)}`);
  console.log(`  Expert Types: ${String(experts.length)}`);
  console.log(`  Workflow Templates: ${String(workflows.length)}`);
  console.log(`  Skills: ${String(skills.length)}`);
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
