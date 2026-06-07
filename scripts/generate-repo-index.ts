#!/usr/bin/env npx tsx
/**
 * generate-repo-index.ts - Generate deterministic repository capability index
 *
 * Scans the codebase to create a machine-readable index of all CLI commands,
 * MCP tools, workflow templates, and entry points.
 *
 * Usage:
 *   npx tsx scripts/generate-repo-index.ts           # Generate index
 *   npx tsx scripts/generate-repo-index.ts --check   # Check if in sync (for CI)
 *   npx tsx scripts/generate-repo-index.ts --verbose # Verbose output
 *
 * Output:
 *   - artifacts/repo-index.json (machine-readable)
 *   - docs/reference/capabilities.md (human-readable)
 *
 * (Source: Issue #615, Epic #615)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { catalogForExtractors } from '../packages/nexus-agents/src/cli-command-catalog.js';

// ============================================================================
// Configuration
// ============================================================================

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const CLI_COMMANDS_FILE = path.join(REPO_ROOT, 'packages/nexus-agents/src/cli-commands.ts');
// #3566: canonical tool-name list is the leaf TOOL_MANIFEST array.
const MCP_TOOLS_INDEX = path.join(
  REPO_ROOT,
  'packages/nexus-agents/src/mcp/tools/tool-manifest.ts'
);
const WORKFLOWS_DIR = path.join(REPO_ROOT, 'packages/nexus-agents/src/workflows/templates');
const PACKAGE_JSON = path.join(REPO_ROOT, 'packages/nexus-agents/package.json');

const OUTPUT_JSON = path.join(REPO_ROOT, 'artifacts/repo-index.json');
const OUTPUT_MD = path.join(REPO_ROOT, 'docs/reference/capabilities.md');

// ============================================================================
// Types
// ============================================================================

interface CLICommand {
  name: string;
  type: 'sync' | 'async';
  handler: string;
  file: string;
  description?: string;
}

interface MCPTool {
  name: string;
  file: string;
  description?: string;
}

interface WorkflowTemplate {
  name: string;
  file: string;
  description?: string;
}

interface RepoIndex {
  version: string;
  generated: string;
  generator: string;
  packageVersion: string;
  cli: {
    binary: string;
    commands: CLICommand[];
  };
  mcp: {
    tools: MCPTool[];
  };
  workflows: {
    templates: WorkflowTemplate[];
  };
}

interface PackageJson {
  version?: string;
}

// ============================================================================
// Output Helpers
// ============================================================================

function log(message: string): void {
  process.stdout.write(message + '\n');
}

// ============================================================================
// Extraction Functions
// ============================================================================

/**
 * Parse commands from a handler block
 */
function parseCommandsFromBlock(
  blockContent: string,
  commandType: 'sync' | 'async',
  handlerPrefix: string
): CLICommand[] {
  const commands: CLICommand[] = [];
  const regex = /(?:'([^']+)'|([a-zA-Z][a-zA-Z0-9-]*))\s*:\s*(\w+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(blockContent)) !== null) {
    const cmdName = match[1] ?? match[2] ?? '';
    const handler = match[3] ?? '';

    if (cmdName !== '' && handler !== '' && handler.startsWith(handlerPrefix)) {
      commands.push({
        name: cmdName,
        type: commandType,
        handler,
        file: 'src/cli-commands-handlers.ts',
      });
    }
  }

  return commands;
}

/**
 * Extract CLI commands from cli-commands.ts
 */
function extractCLICommands(): CLICommand[] {
  const content = fs.readFileSync(CLI_COMMANDS_FILE, 'utf-8');
  const commands: CLICommand[] = [];

  // Extract sync commands from SYNC_COMMAND_HANDLERS
  const syncMatch = content.match(/const SYNC_COMMAND_HANDLERS[^=]*=[^{]*{([\s\S]*?)};/);
  const syncBlock = syncMatch?.[1];
  if (syncBlock !== undefined) {
    commands.push(...parseCommandsFromBlock(syncBlock, 'sync', 'handle'));
  }

  // Extract async commands from ASYNC_COMMAND_HANDLERS
  const asyncMatch = content.match(/const ASYNC_COMMAND_HANDLERS[^=]*=[\s\S]*?{([\s\S]*?)};/);
  const asyncBlock = asyncMatch?.[1];
  if (asyncBlock !== undefined) {
    commands.push(...parseCommandsFromBlock(asyncBlock, 'async', 'handle'));
  }

  // Cross-check against the catalog single-source-of-truth (#2156). Warn on
  // drift in either direction — a new dispatch-table entry without a catalog
  // row, or a catalog row with no dispatch handler. Non-fatal: the index
  // still emits, but CI sees the message.
  const catalogNames = new Set(catalogForExtractors().map((e) => e.command));
  const dispatchNames = new Set(commands.map((c) => c.name));
  for (const name of dispatchNames) {
    if (!catalogNames.has(name)) {
      log(
        `[warn] dispatch command "${name}" has no entry in cli-command-catalog.ts — add one (#2156)`
      );
    }
  }
  for (const name of catalogNames) {
    if (!dispatchNames.has(name)) {
      log(
        `[warn] catalog command "${name}" has no handler in SYNC/ASYNC_COMMAND_HANDLERS — check naming drift (#2156)`
      );
    }
  }

  // Sort alphabetically for deterministic output
  return commands.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Extract MCP tools from mcp/tools/index.ts
 */
function extractMCPTools(): MCPTool[] {
  const content = fs.readFileSync(MCP_TOOLS_INDEX, 'utf-8');

  // Source of truth is the module-level `REGISTERED_TOOL_NAMES` const
  // (extracted out of `registerTools()` to fit the max-lines-per-function
  // gate). Fall back to the inline `tools: [...]` shape for older checkouts.
  const toolsMatch =
    content.match(/TOOL_MANIFEST\s*=\s*\[([\s\S]*?)\]\s*as const/) ??
    content.match(/REGISTERED_TOOL_NAMES\s*=\s*\[([\s\S]*?)\]\s*as const/) ??
    content.match(/tools:\s*\[([\s\S]*?)\]/);
  if (toolsMatch?.[1] === undefined) {
    console.error('Could not parse tools array from MCP tool manifest');
    return [];
  }

  const toolNames = toolsMatch[1]
    .split('\n')
    .map((line) => line.match(/'([^']+)'/)?.[1])
    .filter((name): name is string => name !== undefined);

  return toolNames
    .map((name) => ({
      name,
      file: `src/mcp/tools/${name.replace(/_/g, '-')}.ts`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Extract workflow templates from workflows/templates directory
 */
function extractWorkflowTemplates(): WorkflowTemplate[] {
  const templates: WorkflowTemplate[] = [];

  if (fs.existsSync(WORKFLOWS_DIR)) {
    const files = fs
      .readdirSync(WORKFLOWS_DIR)
      .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));

    for (const file of files) {
      const name = path.basename(file, path.extname(file));
      templates.push({
        name,
        file: `src/workflows/templates/${file}`,
      });
    }
  }

  return templates.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get package version
 */
function getPackageVersion(): string {
  const content = fs.readFileSync(PACKAGE_JSON, 'utf-8');
  const pkg = JSON.parse(content) as PackageJson;
  return pkg.version ?? '0.0.0';
}

// ============================================================================
// Generation Functions
// ============================================================================

/**
 * Generate the repo index
 */
function generateIndex(): RepoIndex {
  return {
    version: '1.0.0',
    generated: new Date().toISOString(),
    generator: 'scripts/generate-repo-index.ts',
    packageVersion: getPackageVersion(),
    cli: {
      binary: 'nexus-agents',
      commands: extractCLICommands(),
    },
    mcp: {
      tools: extractMCPTools(),
    },
    workflows: {
      templates: extractWorkflowTemplates(),
    },
  };
}

/**
 * Generate markdown documentation
 */
function generateMarkdown(index: RepoIndex): string {
  const cmdCount = String(index.cli.commands.length);
  const toolCount = String(index.mcp.tools.length);
  const wfCount = String(index.workflows.templates.length);

  let md = `# Repository Capabilities Index

**Generated:** ${index.generated}
**Package Version:** ${index.packageVersion}
**Generator:** \`${index.generator}\`

> This file is auto-generated. Do not edit manually.
> Run \`npx tsx scripts/generate-repo-index.ts\` to regenerate.

---

## CLI Commands (${cmdCount})

Binary: \`${index.cli.binary}\`

| Command | Type | Handler | Source File |
| --------- | ------ | --------- | ------------- |
`;

  for (const cmd of index.cli.commands) {
    md += `| \`${cmd.name}\` | ${cmd.type} | \`${cmd.handler}\` | \`${cmd.file}\` |\n`;
  }

  md += `
---

## MCP Tools (${toolCount})

| Tool | Source File |
| ------ | ------------- |
`;

  for (const tool of index.mcp.tools) {
    md += `| \`${tool.name}\` | \`${tool.file}\` |\n`;
  }

  md += `
---

## Workflow Templates (${wfCount})

| Template | Source File |
| ---------- | ------------- |
`;

  for (const template of index.workflows.templates) {
    md += `| \`${template.name}\` | \`${template.file}\` |\n`;
  }

  md += `
---

## Machine-Readable Index

For programmatic access, see \`artifacts/repo-index.json\`.

---

_This index is deterministic: same input produces same output._
`;

  return md;
}

// ============================================================================
// File Operations
// ============================================================================

/**
 * Ensure directory exists
 */
function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Compare content for change detection (JSON files)
 */
function hasJsonChanged(filePath: string, newContent: string): boolean {
  if (!fs.existsSync(filePath)) {
    return true;
  }
  try {
    const existing = fs.readFileSync(filePath, 'utf-8');
    const existingObj = JSON.parse(existing) as Record<string, unknown>;
    const newObj = JSON.parse(newContent) as Record<string, unknown>;
    // Compare without generated timestamp
    delete existingObj['generated'];
    delete newObj['generated'];
    return JSON.stringify(existingObj) !== JSON.stringify(newObj);
  } catch {
    return true;
  }
}

/**
 * Compare content for change detection (Markdown files)
 */
function hasMdChanged(filePath: string, newContent: string): boolean {
  if (!fs.existsSync(filePath)) {
    return true;
  }
  const existing = fs.readFileSync(filePath, 'utf-8');
  // Compare ignoring the generated timestamp line
  const existingWithoutTs = existing.replace(/\*\*Generated:\*\* [^\n]+/, '');
  const newWithoutTs = newContent.replace(/\*\*Generated:\*\* [^\n]+/, '');
  return existingWithoutTs !== newWithoutTs;
}

// ============================================================================
// Main
// ============================================================================

function showHelp(): void {
  log(`
generate-repo-index.ts - Generate deterministic repository capability index

Usage:
  npx tsx scripts/generate-repo-index.ts [options]

Options:
  --check     Check if index is in sync (exit 1 if not, for CI)
  --verbose   Show detailed output
  --help, -h  Show this help message

Output:
  artifacts/repo-index.json    Machine-readable index
  docs/reference/capabilities.md  Human-readable documentation
`);
}

function runCheckMode(jsonChanged: boolean, mdChanged: boolean): void {
  if (jsonChanged || mdChanged) {
    log('✗ Repository index is out of date.');
    if (jsonChanged) log('  - artifacts/repo-index.json needs update');
    if (mdChanged) log('  - docs/reference/capabilities.md needs update');
    log('\nRun "npx tsx scripts/generate-repo-index.ts" to update.');
    process.exit(1);
  }
  log('✓ Repository index is up to date.');
  process.exit(0);
}

function writeOutput(
  index: RepoIndex,
  jsonContent: string,
  mdContent: string,
  jsonChanged: boolean,
  mdChanged: boolean
): void {
  ensureDir(OUTPUT_JSON);
  ensureDir(OUTPUT_MD);

  fs.writeFileSync(OUTPUT_JSON, jsonContent);
  fs.writeFileSync(OUTPUT_MD, mdContent);

  const cmdCount = String(index.cli.commands.length);
  const toolCount = String(index.mcp.tools.length);
  const wfCount = String(index.workflows.templates.length);

  log('Summary:');
  log(
    `  ${jsonChanged ? '→' : '✓'} artifacts/repo-index.json ${jsonChanged ? '(updated)' : '(up-to-date)'}`
  );
  log(
    `  ${mdChanged ? '→' : '✓'} docs/reference/capabilities.md ${mdChanged ? '(updated)' : '(up-to-date)'}`
  );
  log('');
  log('Index contains:');
  log(`  - ${cmdCount} CLI commands`);
  log(`  - ${toolCount} MCP tools`);
  log(`  - ${wfCount} workflow templates`);
}

function main(): void {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const verbose = args.includes('--verbose');

  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  log('Generating repository capability index...\n');

  const index = generateIndex();
  const jsonContent = JSON.stringify(index, null, 2);
  const mdContent = generateMarkdown(index);

  if (verbose) {
    log(`Found ${String(index.cli.commands.length)} CLI commands`);
    log(`Found ${String(index.mcp.tools.length)} MCP tools`);
    log(`Found ${String(index.workflows.templates.length)} workflow templates`);
    log('');
  }

  const jsonChanged = hasJsonChanged(OUTPUT_JSON, jsonContent);
  const mdChanged = hasMdChanged(OUTPUT_MD, mdContent);

  if (check) {
    runCheckMode(jsonChanged, mdChanged);
    return;
  }

  writeOutput(index, jsonContent, mdContent, jsonChanged, mdChanged);
}

main();
