#!/usr/bin/env npx tsx
/**
 * Documentation Content Generator
 *
 * Auto-generates documentation sections that are derivable from source code.
 * Prevents drift by reading directly from the source of truth.
 *
 * Generates:
 *   - docs/interfaces/agent.md       → AgentRole union from core/types/agent.ts
 *   - docs/design/components.md      → Module inventory from src/ directory scan
 *   - docs/ops/docs-inventory.md     → ADR count, MCP tool count, directory scan
 *
 * Usage:
 *   npx tsx scripts/generate-docs-content.ts          # generate all
 *   npx tsx scripts/generate-docs-content.ts --check   # CI validation mode
 *
 * @module scripts/generate-docs-content
 * (Source: Issue #1651)
 */

/* eslint-disable no-console */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, SRC_ROOT, DOCS_ROOT } from './script-paths.js';

const CHECK_MODE = process.argv.includes('--check');
// #3566: canonical tool-name list is the leaf TOOL_MANIFEST array.
const TOOLS_INDEX = join(SRC_ROOT, 'mcp/tools/tool-manifest.ts');
const TEMPLATE_TYPES = join(SRC_ROOT, 'workflows/template-types.ts');
const AGENT_TYPES = join(SRC_ROOT, 'core/types/agent.ts');
const ADR_DIR = join(DOCS_ROOT, 'adr');
const PAPERS_YAML = join(DOCS_ROOT, 'research/registry/papers.yaml');
const TECHNIQUES_YAML = join(DOCS_ROOT, 'research/registry/techniques.yaml');

// ─── Extractors ──────────────────────────────────────────────────────────────

interface DriftReport {
  file: string;
  section: string;
  expected: string;
  actual: string;
}

const drifts: DriftReport[] = [];

/**
 * Count MCP tools from the STANDALONE_TOOLS array in mcp/tools/index.ts.
 */
function extractMcpToolCount(): number {
  const src = readFileSync(TOOLS_INDEX, 'utf-8');
  // Source of truth is the leaf `TOOL_MANIFEST` const (#3566); fall back to the
  // pre-#3566 `REGISTERED_TOOL_NAMES` and legacy `tools: [...]` shapes.
  const arrayMatch =
    src.match(/TOOL_MANIFEST\s*=\s*\[([\s\S]*?)\]\s*as const/) ??
    src.match(/REGISTERED_TOOL_NAMES\s*=\s*\[([\s\S]*?)\]\s*as const/) ??
    src.match(/tools:\s*\[([\s\S]*?)\]/);
  if (!arrayMatch) return 0;
  const names = arrayMatch[1].match(/'[a-z_]+'/g);
  return names ? names.length : 0;
}

/**
 * Extract built-in workflow template names from template-types.ts.
 */
function extractBuiltInTemplates(): string[] {
  const src = readFileSync(TEMPLATE_TYPES, 'utf-8');
  const names: string[] = [];
  const regex = /['"]([a-z][-a-z]+)['"]\s*(?:,|])/g;
  // Find the BUILT_IN_TEMPLATES array
  const arrayMatch = src.match(/BUILT_IN_TEMPLATES\s*(?::[^=]*)?\s*=\s*\[([\s\S]*?)\]/);
  if (arrayMatch) {
    let m: RegExpExecArray | null;
    while ((m = regex.exec(arrayMatch[1])) !== null) {
      names.push(m[1]);
    }
  }
  return names;
}

/**
 * Extract AgentRole variants from core/types/agent.ts.
 */
function extractAgentRoles(): string[] {
  const src = readFileSync(AGENT_TYPES, 'utf-8');
  const roles: string[] = [];
  // Match the AgentRole type definition
  const typeMatch = src.match(/type\s+AgentRole\s*=\s*([\s\S]*?);/);
  if (typeMatch) {
    const regex = /['"]([a-z_]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(typeMatch[1])) !== null) {
      roles.push(m[1]);
    }
  }
  return roles;
}

/**
 * Count ADR files in docs/adr/.
 */
function countAdrs(): number {
  if (!existsSync(ADR_DIR)) return 0;
  return readdirSync(ADR_DIR).filter((f) => f.endsWith('.md') && f !== 'README.md').length;
}

/**
 * Count source modules (top-level directories in src/).
 */
function countSourceModules(): { name: string; files: number; tests: number }[] {
  const modules: { name: string; files: number; tests: number }[] = [];
  if (!existsSync(SRC_ROOT)) return modules;

  for (const entry of readdirSync(SRC_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(SRC_ROOT, entry.name);
    const allTs = countTsFiles(dir);
    const testTs = countTestFiles(dir);
    modules.push({
      name: entry.name,
      files: allTs - testTs,
      tests: testTs,
    });
  }
  return modules.sort((a, b) => b.files - a.files);
}

function countTsFiles(dir: string): number {
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      count += countTsFiles(full);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      count++;
    }
  }
  return count;
}

function countTestFiles(dir: string): number {
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      count += countTestFiles(full);
    } else if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.spec.ts')) {
      count++;
    }
  }
  return count;
}

// ─── Validators ──────────────────────────────────────────────────────────────

function checkMcpToolCount(): void {
  const actual = extractMcpToolCount();
  // Check docs-inventory.md
  const inventoryPath = join(DOCS_ROOT, 'ops/docs-inventory.md');
  if (existsSync(inventoryPath)) {
    const content = readFileSync(inventoryPath, 'utf-8');
    const match = content.match(/(\d+)\s+MCP\s+[Tt]ools/i);
    if (match) {
      const documented = parseInt(match[1], 10);
      if (documented !== actual) {
        drifts.push({
          file: 'docs/ops/docs-inventory.md',
          section: 'MCP tool count',
          expected: String(actual),
          actual: String(documented),
        });
      }
    }
  }

  // Check components.md
  const componentsPath = join(DOCS_ROOT, 'design/components.md');
  if (!existsSync(componentsPath)) return;
  const compContent = readFileSync(componentsPath, 'utf-8');
  const compMatches = compContent.match(
    /(\d+)\s+(?:tool handlers|registered tool|tools registered)/gi
  );
  if (!compMatches) return;
  const firstStale = compMatches.find((m) => {
    const numMatch = m.match(/(\d+)/);
    return numMatch && parseInt(numMatch[1], 10) !== actual;
  });
  if (firstStale !== undefined) {
    const num = firstStale.match(/(\d+)/);
    drifts.push({
      file: 'docs/design/components.md',
      section: 'MCP tool count',
      expected: String(actual),
      actual: num ? num[1] : 'unknown',
    });
  }
}

function checkAdrCount(): void {
  const actual = countAdrs();
  const inventoryPath = join(DOCS_ROOT, 'ops/docs-inventory.md');
  if (existsSync(inventoryPath)) {
    const content = readFileSync(inventoryPath, 'utf-8');
    const match = content.match(/(\d+)\s+ADRs?/i);
    if (match) {
      const documented = parseInt(match[1], 10);
      if (documented !== actual) {
        drifts.push({
          file: 'docs/ops/docs-inventory.md',
          section: 'ADR count',
          expected: String(actual),
          actual: String(documented),
        });
      }
    }
  }
}

function checkBuiltInTemplates(): void {
  const actual = extractBuiltInTemplates();
  const guidePath = join(DOCS_ROOT, 'guides/WORKFLOW_TEMPLATES.md');
  if (!existsSync(guidePath)) return;

  const content = readFileSync(guidePath, 'utf-8');
  // Check for known wrong template names
  const wrongNames = ['pr-review', 'test-gen', 'doc-gen'];
  for (const wrong of wrongNames) {
    if (content.includes(`\`${wrong}\``) || content.includes(`"${wrong}"`)) {
      drifts.push({
        file: 'docs/guides/WORKFLOW_TEMPLATES.md',
        section: 'Built-in template names',
        expected: `Valid: ${actual.join(', ')}`,
        actual: `Found invalid template name: ${wrong}`,
      });
    }
  }
}

function checkAgentRoles(): void {
  const actual = extractAgentRoles();
  const agentDocPath = join(DOCS_ROOT, 'interfaces/agent.md');
  if (!existsSync(agentDocPath)) return;

  const content = readFileSync(agentDocPath, 'utf-8');
  const missing = actual.filter(
    (role) => !content.includes(`'${role}'`) && !content.includes(`"${role}"`)
  );
  if (missing.length > 0) {
    drifts.push({
      file: 'docs/interfaces/agent.md',
      section: 'AgentRole union',
      expected: `All ${String(actual.length)} roles documented`,
      actual: `Missing: ${missing.join(', ')}`,
    });
  }
}

// ─── Research Registry Validators ────────────────────────────────────────────

function checkPapersYaml(): void {
  if (!existsSync(PAPERS_YAML)) return;
  const content = readFileSync(PAPERS_YAML, 'utf-8');

  // Check for malformed titles (arXiv API URL strings)
  const malformedTitles = content.match(/title:\s*['"]?arXiv Query/g);
  if (malformedTitles) {
    drifts.push({
      file: 'docs/research/registry/papers.yaml',
      section: 'Paper titles',
      expected: 'All papers have proper titles',
      actual: `${String(malformedTitles.length)} papers have raw arXiv API URL as title`,
    });
  }

  // Check for empty topics
  const emptyTopics = content.match(/topics:\s*\[\s*\]/g);
  if (emptyTopics) {
    drifts.push({
      file: 'docs/research/registry/papers.yaml',
      section: 'Paper topics',
      expected: 'All papers have at least one topic',
      actual: `${String(emptyTopics.length)} papers have empty topics`,
    });
  }
}

function checkTechniqueFiles(): void {
  if (!existsSync(TECHNIQUES_YAML)) return;
  const content = readFileSync(TECHNIQUES_YAML, 'utf-8');
  const repoRoot = ROOT;

  // Extract integration_files paths and check they exist
  const fileRefs = content.match(/- 'packages\/[^']+'/g);
  if (!fileRefs) return;

  const missing: string[] = [];
  for (const ref of fileRefs) {
    const filePath = ref.replace(/^- '/, '').replace(/'$/, '');
    const fullPath = join(repoRoot, filePath);
    if (!existsSync(fullPath)) {
      missing.push(filePath);
    }
  }

  if (missing.length > 0) {
    drifts.push({
      file: 'docs/research/registry/techniques.yaml',
      section: 'integration_files',
      expected: 'All integration files exist in source',
      actual: `${String(missing.length)} missing: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '...' : ''}`,
    });
  }

  // Check all techniques have implementation_issue
  const nullIssues = content.match(/implementation_issue:\s*null/g);
  if (nullIssues) {
    drifts.push({
      file: 'docs/research/registry/techniques.yaml',
      section: 'implementation_issue tracking',
      expected: 'All techniques have a GitHub issue',
      actual: `${String(nullIssues.length)} techniques have null implementation_issue`,
    });
  }
}

// ─── Main ───────────────��────────────────────────────────────────────────────

function main(): void {
  console.log('Checking documentation content drift...\n');

  checkMcpToolCount();
  checkAdrCount();
  checkBuiltInTemplates();
  checkAgentRoles();
  checkPapersYaml();
  checkTechniqueFiles();

  // Summary stats (always print)
  const toolCount = extractMcpToolCount();
  const adrCount = countAdrs();
  const templates = extractBuiltInTemplates();
  const roles = extractAgentRoles();
  const modules = countSourceModules();

  console.log('Source of truth:');
  console.log(`  MCP tools:       ${String(toolCount)}`);
  console.log(`  ADRs:            ${String(adrCount)}`);
  console.log(`  Templates:       ${String(templates.length)} (${templates.join(', ')})`);
  console.log(`  Agent roles:     ${String(roles.length)}`);
  console.log(`  Source modules:  ${String(modules.length)}`);
  console.log('');

  if (drifts.length === 0) {
    console.log('✅ No documentation content drift detected');
    process.exit(0);
  }

  console.log(`❌ Found ${String(drifts.length)} drift(s):\n`);
  for (const d of drifts) {
    console.log(`  ${d.file} [${d.section}]`);
    console.log(`    Expected: ${d.expected}`);
    console.log(`    Actual:   ${d.actual}`);
    console.log('');
  }

  if (CHECK_MODE) {
    console.log('Run "npx tsx scripts/generate-docs-content.ts" to see details');
    process.exit(1);
  }
}

main();
