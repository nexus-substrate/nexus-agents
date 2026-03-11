#!/usr/bin/env npx tsx
/**
 * Documentation Generation Script
 *
 * Generates llms.txt and llms-full.txt from INDEX.yaml
 * Part of Phase 5: Auto-Generation Pipeline (Issue #283)
 *
 * Usage:
 *   npx tsx scripts/generate-docs.ts
 *   npx tsx scripts/generate-docs.ts --check  # Verify files are up to date
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parse } from 'yaml';
import { join } from 'node:path';
import { ROOT } from './script-paths.js';

interface TopicEntry {
  summary: string;
  tier2_file: string;
  tier3_files: string[];
  keywords: string[];
}

interface BudgetEntry {
  tokens: number;
  description: string;
  load: string[];
}

interface IndexYaml {
  schema_version: string;
  last_updated: string;
  navigation: Record<string, string>;
  topics: Record<string, TopicEntry>;
  context_budgets: Record<string, BudgetEntry>;
  quick_reference: Record<string, Record<string, string>>;
}

function loadIndex(): IndexYaml {
  const indexPath = join(ROOT, 'docs/INDEX.yaml');
  const content = readFileSync(indexPath, 'utf-8');
  return parse(content) as IndexYaml;
}

function buildNavigationList(navigation: Record<string, string>): string {
  return Object.entries(navigation)
    .map(([name, file]) => `- ${file} - ${name.replace(/_/g, ' ')}`)
    .join('\n');
}

function buildTopicList(topics: Record<string, TopicEntry>): string {
  return Object.values(topics)
    .map((topic) => {
      const summary = topic.summary.split('.')[0] ?? topic.summary;
      return `- ${topic.tier2_file} - ${summary}`;
    })
    .join('\n');
}

function buildBudgetTable(budgets: Record<string, BudgetEntry>): string {
  return Object.entries(budgets)
    .map(([name, budget]) => {
      const displayName = name.charAt(0).toUpperCase() + name.slice(1);
      const loadFiles = budget.load.slice(0, 2).join(' + ');
      return `| ${displayName} | ${String(budget.tokens)} | ${loadFiles} |`;
    })
    .join('\n');
}

function getOverviewSection(): string {
  return `## Project Overview

nexus-agents coordinates multiple AI models (Claude, Gemini, Codex) to handle complex software development tasks. It runs as an MCP server for Claude Desktop or as a standalone CLI orchestrator.

Key capabilities:
- Multi-model routing with budget constraints
- Expert agent delegation (Code, Architecture, Security, etc.)
- Workflow automation via YAML templates
- Byzantine fault-tolerant consensus protocols
- 8-type memory system for context management`;
}

function getQuickStartSection(): string {
  return `## Quick Start

\`\`\`bash
npm install -g nexus-agents
nexus-agents doctor           # Verify installation
nexus-agents --help           # See all commands
\`\`\``;
}

function getEntryPointsSection(): string {
  return `## Key Entry Points

### CLI Commands
- \`nexus-agents\` - Start MCP server (default)
- \`nexus-agents orchestrate <task>\` - Run task orchestration
- \`nexus-agents expert list\` - List available experts
- \`nexus-agents workflow run <template>\` - Execute workflow
- \`nexus-agents doctor\` - Health check

### MCP Tools (via Claude Desktop)
- orchestrate - Task decomposition and delegation
- create_expert - Spawn specialized agent
- run_workflow - Execute workflow template
- list_experts - Available expert types

### Programmatic API
\`\`\`typescript
import { createServer, TechLead, Expert } from 'nexus-agents';
\`\`\``;
}

function getArchHighlightsSection(): string {
  return `## Architecture Highlights

- **Agents**: TechLead orchestrates Expert pool (Code, Security, Architecture, etc.)
- **Routing**: CompositeRouter chains Budget→TOPSIS→LinUCB for model selection
- **Memory**: 8-type system (Core, Episodic, Semantic, Procedural, Resource, Vault, Graph, Adaptive)
- **Consensus**: 11 protocols including Aegean, CP-WBFT, Reflexion

## File Structure

\`\`\`
packages/nexus-agents/src/
├── core/          # Types, Result<T,E>, errors
├── agents/        # TechLead, Experts, collaboration
├── cli-adapters/  # Claude/Gemini/Codex integration
├── context/       # Memory and token management
├── consensus/     # Voting protocols
├── mcp/           # MCP server and tools
└── workflows/     # Template engine
\`\`\`

## For More Information

- Full docs: docs/llms-full.txt
- API reference: docs/ENTRYPOINTS.md
- Architecture: ARCHITECTURE.md
- Contributing: CONTRIBUTING.md`;
}

function generateLlmsTxt(index: IndexYaml): string {
  const now = new Date().toISOString().split('T')[0] ?? 'unknown';
  const navList = buildNavigationList(index.navigation);
  const topicList = buildTopicList(index.topics);
  const budgetTable = buildBudgetTable(index.context_budgets);

  return `# nexus-agents

> Multi-agent orchestration MCP server for AI-powered software development

${getOverviewSection()}

${getQuickStartSection()}

## Documentation Index

### Tier 1: Navigation (start here)
${navList}

### Tier 2: Actionable Reference (load when relevant)
${topicList}

### Tier 3: Deep Detail (load on demand)
- ARCHITECTURE.md - Full system architecture
- CODING_STANDARDS.md - Code style and patterns
- docs/architecture/*.md - Component deep dives
- docs/development/*.md - Development walkthroughs

## Context Budget Guide

| Task Type | Tokens | What to Load |
| --------- | ------ | ------------ |
${budgetTable}

${getEntryPointsSection()}

${getArchHighlightsSection()}

<!-- Generated: ${now} from docs/INDEX.yaml -->
`;
}

// Import the full text generator from a separate module
import { generateLlmsFullTxt } from './generate-docs-full.js';

function log(message: string): void {
  // eslint-disable-next-line no-console
  console.log(message);
}

function logError(message: string): void {
  console.error(message);
}

function stripGenerationDate(content: string): string {
  return content.replace(/<!-- Generated: .* -->/g, '').trim();
}

/** Files that require YAML frontmatter (tier 1/2 human-maintained docs) */
const FRONTMATTER_REQUIRED_FILES = [
  'CLAUDE.md',
  'QUICK_START.md',
  'docs/README.md',
  'docs/ENTRYPOINTS.md',
  'docs/TROUBLESHOOTING.md',
  'docs/ALIGNMENT_ROADMAP.md',
  'docs/skills-index.md',
  'docs/architecture/CONTEXT_LOAD_BALANCING.md',
  'docs/architecture/MCP_PROTOCOL.md',
  'docs/architecture/README.md',
  'docs/architecture/ROUTING_SYSTEM.md',
  'docs/architecture/SECURITY.md',
  'docs/architecture/CONSENSUS_PROTOCOLS.md',
  'docs/architecture/MEMORY_SYSTEM.md',
  'docs/architecture/UNTRUSTED_INPUT_HARDENING.md',
  'docs/development/AGENT_DEVELOPMENT.md',
  'docs/development/CONTRIBUTION_GUIDE.md',
  'docs/development/README.md',
  'docs/development/CLI_UX_QUALITY_GATE.md',
  'docs/development/SHELL_TESTING_ANTI_PATTERNS.md',
  'docs/development/TOOL_DEVELOPMENT.md',
  'docs/development/MEMORY_DEVELOPMENT.md',
  'docs/development/CLI_DELEGATION_GUIDE.md',
  'docs/getting-started/INSTALLATION.md',
  'docs/getting-started/CONFIGURATION.md',
  'docs/guides/DEBUGGING_OBSERVABILITY.md',
  'docs/guides/MCP_INTEGRATION.md',
  'docs/guides/WORKFLOW_TEMPLATES.md',
  'docs/guides/CUSTOM_ENDPOINT_SETUP.md',
  'docs/research/RESEARCH_INDEX.md',
  'docs/SECRETS_SETUP.md',
  'docs/workflows/SELF_DEVELOPMENT_WORKFLOW.md',
  'docs/workflows/self-dev-phases.md',
  'docs/workflows/self-dev-execution.md',
  'docs/workflows/self-dev-operations.md',
  'docs/workflows/self-dev-validation.md',
];

const REQUIRED_FRONTMATTER_FIELDS = ['title', 'description', 'tier', 'keywords'];

interface FrontmatterData {
  title?: string;
  description?: string;
  tier?: number;
  keywords?: string[];
  related_files?: string[];
}

function parseFrontmatter(content: string): FrontmatterData | null {
  const match = /^---\n([\s\S]*?)\n---/.exec(content);
  const yamlBlock = match?.[1];
  if (yamlBlock === undefined || yamlBlock === '') return null;
  try {
    return parse(yamlBlock) as FrontmatterData;
  } catch {
    return null;
  }
}

function verifyFrontmatter(): boolean {
  let allValid = true;
  for (const file of FRONTMATTER_REQUIRED_FILES) {
    const filePath = join(ROOT, file);
    if (!existsSync(filePath)) {
      logError(`  ✗ ${file} — file not found`);
      allValid = false;
      continue;
    }
    const content = readFileSync(filePath, 'utf-8');
    const fm = parseFrontmatter(content);
    if (!fm) {
      logError(`  ✗ ${file} — missing YAML frontmatter`);
      allValid = false;
      continue;
    }
    const missing = REQUIRED_FRONTMATTER_FIELDS.filter(
      (f) => !(f in fm) || fm[f as keyof FrontmatterData] === undefined
    );
    if (missing.length > 0) {
      logError(`  ✗ ${file} — missing fields: ${missing.join(', ')}`);
      allValid = false;
    } else {
      log(`  ✓ ${file}`);
    }
  }
  return allValid;
}

function verifyFiles(
  llmsPath: string,
  llmsTxt: string,
  llmsFullPath: string,
  llmsFullTxt: string
): boolean {
  const existingLlms = existsSync(llmsPath) ? readFileSync(llmsPath, 'utf-8') : '';
  const existingFull = existsSync(llmsFullPath) ? readFileSync(llmsFullPath, 'utf-8') : '';

  const llmsMatch = stripGenerationDate(existingLlms) === stripGenerationDate(llmsTxt);
  const fullMatch = stripGenerationDate(existingFull) === stripGenerationDate(llmsFullTxt);

  if (!llmsMatch || !fullMatch) {
    logError('✗ Generated docs are out of date!');
    if (!llmsMatch) logError('  - docs/llms.txt needs regeneration');
    if (!fullMatch) logError('  - docs/llms-full.txt needs regeneration');
    logError('\nRun: npx tsx scripts/generate-docs.ts');
    return false;
  }

  log('✓ docs/llms.txt is up to date');
  log('✓ docs/llms-full.txt is up to date');
  log('\n✓ All generated docs are current');
  return true;
}

function main(): void {
  const args = process.argv.slice(2);
  const checkMode = args.includes('--check');

  log('📚 Documentation Generator');
  log('==========================\n');

  const index = loadIndex();
  log(`✓ Loaded INDEX.yaml (schema v${index.schema_version})`);

  const llmsTxt = generateLlmsTxt(index);
  const llmsPath = join(ROOT, 'docs/llms.txt');

  const llmsFullTxt = generateLlmsFullTxt(index);
  const llmsFullPath = join(ROOT, 'docs/llms-full.txt');

  if (checkMode) {
    const filesOk = verifyFiles(llmsPath, llmsTxt, llmsFullPath, llmsFullTxt);

    log('\nFrontmatter validation:');
    const fmOk = verifyFrontmatter();
    if (fmOk) log('\n✓ All frontmatter valid');

    if (!filesOk || !fmOk) process.exit(1);
  } else {
    writeFileSync(llmsPath, llmsTxt);
    log(`✓ Generated ${llmsPath}`);

    writeFileSync(llmsFullPath, llmsFullTxt);
    log(`✓ Generated ${llmsFullPath}`);

    log('\n✓ Documentation generation complete');
  }
}

main();
