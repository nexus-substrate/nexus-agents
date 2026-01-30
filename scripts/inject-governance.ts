#!/usr/bin/env npx tsx
/**
 * Governance Injection Script
 *
 * Generates and injects MCP tool documentation into CLAUDE.md.
 * Ensures governance documentation stays in sync with actual tool implementations.
 *
 * Per System Mandate - Constraint #4: MCP Governance Injection
 *
 * @module scripts/inject-governance
 * (Source: Issue #569)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

// Configuration
const ROOT = join(dirname(import.meta.url.replace('file://', '')), '..');
const CLAUDE_MD_PATH = join(ROOT, 'CLAUDE.md');
const TOOLS_DIR = join(ROOT, 'packages/nexus-agents/src/mcp/tools');

// Markers for governance sections
const MARKERS = {
  toolIndexStart: '<!-- GOVERNANCE:TOOL_INDEX:START -->',
  toolIndexEnd: '<!-- GOVERNANCE:TOOL_INDEX:END -->',
  versionStart: '<!-- GOVERNANCE:VERSION:START -->',
  versionEnd: '<!-- GOVERNANCE:VERSION:END -->',
};

/**
 * MCP Tool metadata extracted from source files.
 */
interface ToolMetadata {
  name: string;
  description: string;
  file: string;
}

/**
 * Extract tool metadata from source files.
 */
function extractToolMetadata(): ToolMetadata[] {
  const tools: ToolMetadata[] = [];

  // Core MCP tools
  const toolFiles = [
    { file: 'orchestrate.ts', name: 'orchestrate' },
    { file: 'create-expert.ts', name: 'create_expert' },
    { file: 'execute-expert.ts', name: 'execute_expert' },
    { file: 'run-workflow.ts', name: 'run_workflow' },
    { file: 'consensus-vote.ts', name: 'consensus_vote' },
    { file: 'delegate-to-model.ts', name: 'delegate_to_model' },
    { file: 'list-experts.ts', name: 'list_experts' },
    { file: 'list-workflows.ts', name: 'list_workflows' },
  ];

  for (const { file, name } of toolFiles) {
    const filePath = join(TOOLS_DIR, file);
    if (!existsSync(filePath)) continue;

    const content = readFileSync(filePath, 'utf-8');

    // Extract description from the tool registration
    const descMatch = content.match(/const description\s*=\s*['"`]([^'"`]+)['"`]/);
    const description = descMatch?.[1] ?? `${name} tool`;

    tools.push({ name, description, file });
  }

  return tools;
}

/**
 * Generate the tool index markdown section.
 */
function generateToolIndex(tools: ToolMetadata[]): string {
  const lines = [
    MARKERS.toolIndexStart,
    '',
    '## MCP Tools Reference',
    '',
    '| Tool | Description |',
    '|------|-------------|',
  ];

  for (const tool of tools) {
    lines.push(`| \`${tool.name}\` | ${tool.description} |`);
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
  const timestamp = new Date().toISOString().split('T')[0] ?? 'unknown';
  const lines = [
    MARKERS.versionStart,
    '',
    `_Governance Version: ${timestamp}_`,
    '',
    MARKERS.versionEnd,
  ];
  return lines.join('\n');
}

/**
 * Inject or update a section in CLAUDE.md.
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
    // Replace existing section
    return content.slice(0, startIdx) + newSection + content.slice(endIdx + endMarker.length);
  }

  // Section doesn't exist - append before "---" separator or at end
  const insertPoint = content.lastIndexOf('\n---\n');
  if (insertPoint !== -1) {
    return content.slice(0, insertPoint) + '\n\n' + newSection + content.slice(insertPoint);
  }

  return content + '\n\n' + newSection;
}

/**
 * Check if governance is current (for CI validation).
 */
function checkGovernance(): boolean {
  if (!existsSync(CLAUDE_MD_PATH)) {
    console.error('CLAUDE.md not found');
    return false;
  }

  const content = readFileSync(CLAUDE_MD_PATH, 'utf-8');
  const tools = extractToolMetadata();

  // Check if tool index exists and matches
  const hasToolIndex = content.includes(MARKERS.toolIndexStart);
  if (!hasToolIndex) {
    console.error('Tool index section not found in CLAUDE.md');
    return false;
  }

  // Extract current tool index
  const startIdx = content.indexOf(MARKERS.toolIndexStart);
  const endIdx = content.indexOf(MARKERS.toolIndexEnd);
  if (startIdx === -1 || endIdx === -1) {
    console.error('Tool index markers incomplete');
    return false;
  }

  const currentSection = content.slice(startIdx, endIdx + MARKERS.toolIndexEnd.length);

  // Compare tool counts (simple check)
  const currentToolCount = (currentSection.match(/\| `[^`]+` \|/g) ?? []).length;
  if (currentToolCount !== tools.length) {
    console.error(
      `Tool count mismatch: expected ${String(tools.length)}, found ${String(currentToolCount)}`
    );
    return false;
  }

  // eslint-disable-next-line no-console
  console.log(`Governance check passed: ${String(tools.length)} tools documented`);
  return true;
}

/**
 * Inject governance into CLAUDE.md.
 */
function injectGovernance(): void {
  if (!existsSync(CLAUDE_MD_PATH)) {
    console.error('CLAUDE.md not found');
    process.exit(1);
  }

  let content = readFileSync(CLAUDE_MD_PATH, 'utf-8');
  const tools = extractToolMetadata();

  // Generate sections
  const toolIndex = generateToolIndex(tools);
  const versionSection = generateVersionSection();

  // Inject tool index
  content = injectSection(content, MARKERS.toolIndexStart, MARKERS.toolIndexEnd, toolIndex);

  // Inject version
  content = injectSection(content, MARKERS.versionStart, MARKERS.versionEnd, versionSection);

  // Write back
  writeFileSync(CLAUDE_MD_PATH, content);

  // eslint-disable-next-line no-console
  console.log(`Governance injected: ${String(tools.length)} tools documented`);
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
