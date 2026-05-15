/**
 * nexus-agents/cli - Index Command
 *
 * CLI command to generate and manage the codebase index.
 * Supports generate, check, diagram, and validate subcommands.
 *
 * @module cli/index-command
 * (Source: Issue #240)
 *
 * File structure: Types in index-command-types.ts, formatters in
 * index-command-formatters.ts. Extracted per Issue #272.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as yaml from 'yaml';
import { createLogger, getErrorMessage } from '../core/index.js';
import {
  extractProject,
  buildIndex,
  indexToYaml,
  indexToJson,
  generateDiagramMarkdown,
  validateIndex,
  CodebaseIndexSchema,
  type CodebaseIndex,
  extractEntrypoints,
  manifestToYaml,
  manifestToJson,
  analyzeFreshness,
  formatFreshnessTable,
  formatFreshnessJson,
} from '../indexer/index.js';
import {
  validateLinks,
  formatLinkValidationTable,
  formatLinkValidationJson,
} from './index-command-link-validator.js';

// Re-export types and formatters
export type {
  IndexSubcommand,
  IndexCommandOptions,
  IndexCommandResult,
} from './index-command-types.js';
export { formatIndexResult, ANSI } from './index-command-formatters.js';

// Local imports from extracted modules
import type { IndexCommandOptions, IndexCommandResult } from './index-command-types.js';

const logger = createLogger({ component: 'index-command' });

// =============================================================================
// Command Implementation
// =============================================================================

/**
 * Generates a fresh codebase index.
 */
async function generateIndex(options: IndexCommandOptions): Promise<IndexCommandResult> {
  const format = options.format ?? 'yaml';
  const outputPath =
    options.output ?? (format === 'yaml' ? 'docs/codebase-index.yaml' : 'docs/codebase-index.json');

  logger.info('Extracting codebase metadata...');

  // Extract files
  const extraction = extractProject({
    extractDescriptions: true,
  });

  if (extraction.errors.length > 0) {
    for (const error of extraction.errors) {
      logger.warn(`Extraction warning: ${error}`);
    }
  }

  logger.info(
    `Extracted ${String(extraction.files.length)} files in ${String(extraction.durationMs)}ms`
  );

  // Build index
  const index = buildIndex(extraction.files);

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  await fs.mkdir(outputDir, { recursive: true });

  // Write index
  const content = format === 'yaml' ? indexToYaml(index) : indexToJson(index);
  await fs.writeFile(outputPath, content, 'utf-8');

  logger.info(`Wrote index to ${outputPath}`);

  return {
    success: true,
    message: `Generated index with ${String(index.stats.totalFiles)} files in ${String(index.stats.moduleCount)} modules`,
    data: {
      filesIndexed: index.stats.totalFiles,
      modulesFound: index.stats.moduleCount,
      outputPath,
    },
  };
}

/**
 * Checks if the existing index is up to date.
 */
async function checkIndex(options: IndexCommandOptions): Promise<IndexCommandResult> {
  const indexPath = options.output ?? 'docs/codebase-index.yaml';

  // Check if index file exists
  try {
    await fs.access(indexPath);
  } catch {
    return {
      success: false,
      message: `Index file not found: ${indexPath}. Run 'nexus-agents index generate' first.`,
    };
  }

  // Load existing index
  const content = await fs.readFile(indexPath, 'utf-8');
  let existingIndex: CodebaseIndex;
  try {
    const parsed: unknown = indexPath.endsWith('.json') ? JSON.parse(content) : yaml.parse(content);
    CodebaseIndexSchema.parse(parsed); // Validate schema
    existingIndex = parsed as CodebaseIndex; // Cast after validation
  } catch (error) {
    return {
      success: false,
      message: `Failed to parse index file: ${getErrorMessage(error)}`,
    };
  }

  // Extract current files
  const extraction = extractProject({ extractDescriptions: false });
  const currentFiles = extraction.files.map((f) => ({ path: f.path, lines: f.lines }));

  // Validate
  const validation = validateIndex(existingIndex, currentFiles);

  if (validation.valid) {
    return {
      success: true,
      message: 'Index is up to date',
      data: {
        validationResult: validation,
      },
    };
  }

  return {
    success: false,
    message: 'Index is out of date',
    data: {
      validationResult: validation,
    },
  };
}

/**
 * Generates a Mermaid dependency diagram.
 */
async function generateDiagram(options: IndexCommandOptions): Promise<IndexCommandResult> {
  const indexPath = options.output ?? 'docs/codebase-index.yaml';
  const diagramPath = 'docs/dependency-graph.md';

  // Check if index file exists
  try {
    await fs.access(indexPath);
  } catch {
    // Generate index first
    logger.info('Index not found, generating...');
    await generateIndex({ ...options, subcommand: 'generate' });
  }

  // Load index
  const content = await fs.readFile(indexPath, 'utf-8');
  const parsed: unknown = indexPath.endsWith('.json') ? JSON.parse(content) : yaml.parse(content);
  CodebaseIndexSchema.parse(parsed); // Validate schema
  const index = parsed as CodebaseIndex; // Cast after validation

  // Generate diagram
  const diagram = generateDiagramMarkdown(index);

  // Write diagram
  await fs.mkdir(path.dirname(diagramPath), { recursive: true });
  await fs.writeFile(diagramPath, diagram, 'utf-8');

  logger.info(`Wrote diagram to ${diagramPath}`);

  return {
    success: true,
    message: `Generated dependency diagram at ${diagramPath}`,
    data: {
      outputPath: diagramPath,
    },
  };
}

/**
 * Extracts documented modules from ARCHITECTURE.md module structure section.
 * Parses the directory tree in the markdown.
 */
function extractDocumentedModules(architectureContent: string): string[] {
  const modules: string[] = [];
  const moduleStructureMatch = architectureContent.match(
    /## Module Structure[\s\S]*?```[\s\S]*?src\/\s*([\s\S]*?)```/
  );

  const captured = moduleStructureMatch?.[1];
  if (captured !== undefined && captured !== '') {
    // Extract directory names from tree: │ ├── core/ # Comment
    for (const line of captured.split('\n')) {
      const dirMatch = line.match(/[├└]── ([a-z-]+)\//);
      const dirName = dirMatch?.[1];
      if (dirName !== undefined && dirName !== '') {
        modules.push(dirName);
      }
    }
  }
  return modules;
}

/**
 * Gets actual module directories from src/.
 */
async function getActualModules(srcPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(srcPath, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('__'))
      .map((e) => e.name);
  } catch (error: unknown) {
    logger.debug('Failed to read source modules', { srcPath, error: getErrorMessage(error) });
    return [];
  }
}

/**
 * Compares documented and actual modules, returning validation result.
 */
function compareModules(documentedModules: string[], actualModules: string[]): IndexCommandResult {
  const missingInDocs = actualModules.filter((m) => !documentedModules.includes(m));
  const missingInCode = documentedModules.filter((m) => !actualModules.includes(m));

  if (missingInDocs.length > 0 || missingInCode.length > 0) {
    const issues: string[] = [];
    if (missingInDocs.length > 0) {
      issues.push(`Modules in src/ but not in ARCHITECTURE.md: ${missingInDocs.join(', ')}`);
    }
    if (missingInCode.length > 0) {
      issues.push(`Modules in ARCHITECTURE.md but not in src/: ${missingInCode.join(', ')}`);
    }
    return {
      success: false,
      message: `ARCHITECTURE.md validation failed:\n${issues.join('\n')}`,
      data: { documentedModules, actualModules, missingInDocs, missingInCode },
    };
  }

  return {
    success: true,
    message: `ARCHITECTURE.md is in sync with codebase (${String(actualModules.length)} modules validated)`,
    data: { documentedModules, actualModules, modulesValidated: actualModules.length },
  };
}

/**
 * Validates ARCHITECTURE.md module structure against actual codebase.
 * (Source: Issue #445)
 */
async function validateArchitecture(options: IndexCommandOptions): Promise<IndexCommandResult> {
  const architecturePath = options.output ?? 'ARCHITECTURE.md';
  const srcPath = 'packages/nexus-agents/src';

  let architectureContent: string;
  try {
    architectureContent = await fs.readFile(architecturePath, 'utf-8');
  } catch {
    return { success: false, message: `ARCHITECTURE.md not found at ${architecturePath}` };
  }

  try {
    await fs.access(srcPath);
  } catch {
    return { success: false, message: `Source directory not found: ${srcPath}` };
  }

  const documentedModules = extractDocumentedModules(architectureContent);
  if (documentedModules.length === 0) {
    return {
      success: false,
      message:
        'No module structure found in ARCHITECTURE.md. Expected "## Module Structure" section.',
    };
  }

  const actualModules = await getActualModules(srcPath);
  return compareModules(documentedModules, actualModules);
}

/**
 * Extracts entrypoints (CLI, MCP, REST) from source code.
 * Part of Epic #261 - Automated Documentation System.
 */
async function entrypointsCommand(options: IndexCommandOptions): Promise<IndexCommandResult> {
  const format = options.format ?? 'yaml';
  const outputPath =
    options.output ??
    (format === 'yaml' ? 'docs/.generated/entrypoints.yaml' : 'docs/.generated/entrypoints.json');

  logger.info('Extracting entrypoints from source code...');

  const result = extractEntrypoints({
    packageRoot: 'packages/nexus-agents',
    cliCommandsPath: 'src/cli-commands.ts',
    mcpToolsPath: 'src/mcp/tools',
    sanitize: true,
  });

  if (!result.success || result.manifest === undefined) {
    const errorMsg = result.errors.join(', ') || 'Unknown extraction error';
    return {
      success: false,
      message: `Entrypoint extraction failed: ${errorMsg}`,
    };
  }

  const manifest = result.manifest;

  // Log warnings if any
  for (const warning of result.warnings) {
    logger.warn(warning);
  }

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  await fs.mkdir(outputDir, { recursive: true });

  // Write manifest
  const content = format === 'yaml' ? manifestToYaml(manifest) : manifestToJson(manifest);
  await fs.writeFile(outputPath, content, 'utf-8');

  logger.info(`Wrote entrypoints manifest to ${outputPath}`);

  const total = manifest.cli_commands.length + manifest.mcp_tools.length;

  return {
    success: true,
    message: `Extracted ${String(total)} entrypoints (${String(manifest.cli_commands.length)} CLI, ${String(manifest.mcp_tools.length)} MCP)`,
    data: {
      outputPath,
    },
  };
}

/**
 * Checks documentation freshness.
 * Part of Epic #261 - Automated Documentation System.
 */
async function freshnessCommand(options: IndexCommandOptions): Promise<IndexCommandResult> {
  logger.info('Analyzing documentation freshness...');

  const result = analyzeFreshness();

  const { summary } = result;

  // #2720 brainstorm #5: pre-fix `unknown` (every tracked doc unreadable —
  // typically because the user ran the command outside the nexus-agents
  // source repo, so `projectRoot = process.cwd()` resolves to a directory
  // that doesn't contain README.md / ARCHITECTURE.md / etc.) was not
  // counted in `hasIssues`, so the command exited success with the message
  // "0 documents are fresh". That's the same surface-vs-state shape as
  // #2716 (fitness-audit silently passing from outside the repo).
  // Treat any `unknown` as an issue, and detect "all unknown" as a wrong-
  // CWD error with actionable hint.
  const allUnknown = summary.total > 0 && summary.unknown === summary.total;
  const hasIssues = summary.stale > 0 || summary.warning > 0 || summary.unknown > 0;

  // Format output based on requested format
  const output =
    options.format === 'json' ? formatFreshnessJson(result) : formatFreshnessTable(result);

  // Write to file if output path specified
  if (options.output !== undefined) {
    const outputDir = path.dirname(options.output);
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(options.output, output, 'utf-8');
    logger.info(`Wrote freshness report to ${options.output}`);
  } else {
    // Print to stdout
    process.stdout.write(output + '\n');
  }

  const wrongCwdHint =
    'No tracked documents found at the current CWD. ' +
    '`index freshness` audits the nexus-agents source repo — run it from ' +
    'the repo root (or pass --project-root once that flag is wired).';

  let message: string;
  if (allUnknown) {
    message = `Documentation freshness check: ${wrongCwdHint}`;
  } else if (hasIssues) {
    message =
      `Documentation freshness check: ${String(summary.stale)} stale, ` +
      `${String(summary.warning)} warnings, ${String(summary.unknown)} unknown`;
  } else {
    message = `Documentation freshness check: ${String(summary.fresh)} documents are fresh`;
  }

  return {
    success: !hasIssues,
    message,
    data: {
      filesIndexed: summary.total,
    },
  };
}

/**
 * Validates markdown links.
 * Part of Epic #261 - Automated Documentation System.
 */
async function linksCommand(options: IndexCommandOptions): Promise<IndexCommandResult> {
  logger.info('Validating documentation links...');

  const result = await validateLinks({
    baseDir: 'docs',
    checkExternal: true,
  });

  const { summary } = result;
  const hasBrokenLinks = summary.brokenLinks > 0;

  // Format output based on requested format
  const output =
    options.format === 'json'
      ? formatLinkValidationJson(result)
      : formatLinkValidationTable(result);

  // Write to file if output path specified
  if (options.output !== undefined) {
    const outputDir = path.dirname(options.output);
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(options.output, output, 'utf-8');
    logger.info(`Wrote link validation report to ${options.output}`);
  } else {
    // Print to stdout
    process.stdout.write(output + '\n');
  }

  return {
    success: !hasBrokenLinks,
    message: hasBrokenLinks
      ? `Link validation: ${String(summary.brokenLinks)} broken links found`
      : `Link validation: ${String(summary.totalLinks)} links validated, all OK`,
    data: {
      totalFiles: summary.totalFiles,
      totalLinks: summary.totalLinks,
      brokenLinks: summary.brokenLinks,
    },
  };
}

/**
 * Main entry point for the index command.
 */
export async function indexCommand(options: IndexCommandOptions): Promise<IndexCommandResult> {
  logger.info(`Running index ${options.subcommand} command`);

  switch (options.subcommand) {
    case 'generate':
      return generateIndex(options);
    case 'check':
      return checkIndex(options);
    case 'diagram':
      return generateDiagram(options);
    case 'validate':
      return validateArchitecture(options);
    case 'entrypoints':
      return entrypointsCommand(options);
    case 'freshness':
      return freshnessCommand(options);
    case 'links':
      return linksCommand(options);
    default: {
      const exhaustive: never = options.subcommand;
      return {
        success: false,
        message: `Unknown subcommand: ${exhaustive as string}`,
      };
    }
  }
}
