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
import { createLogger } from '../core/index.js';
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
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Failed to parse index file: ${message}`,
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
 * Validates ARCHITECTURE.md against the index.
 */
async function validateArchitecture(_options: IndexCommandOptions): Promise<IndexCommandResult> {
  // This is a placeholder for future ARCHITECTURE.md validation
  // For now, just check if the index exists and is valid

  const indexPath = 'docs/codebase-index.yaml';

  try {
    await fs.access(indexPath);
  } catch {
    return {
      success: false,
      message: 'Index file not found. Run "nexus-agents index generate" first.',
    };
  }

  return {
    success: true,
    message: 'ARCHITECTURE.md validation not yet implemented. Index exists.',
  };
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
    restRoutesPath: 'src/api/routes',
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

  const total =
    manifest.cli_commands.length + manifest.mcp_tools.length + manifest.rest_endpoints.length;

  return {
    success: true,
    message: `Extracted ${String(total)} entrypoints (${String(manifest.cli_commands.length)} CLI, ${String(manifest.mcp_tools.length)} MCP, ${String(manifest.rest_endpoints.length)} REST)`,
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
  const hasIssues = summary.stale > 0 || summary.warning > 0;

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

  return {
    success: !hasIssues,
    message: hasIssues
      ? `Documentation freshness check: ${String(summary.stale)} stale, ${String(summary.warning)} warnings`
      : `Documentation freshness check: ${String(summary.fresh)} documents are fresh`,
    data: {
      filesIndexed: summary.total,
    },
  };
}

/**
 * Validates markdown links.
 * Part of Epic #261 - Automated Documentation System.
 */
async function linksCommand(_options: IndexCommandOptions): Promise<IndexCommandResult> {
  // Placeholder for link validation (Issue #263)
  // TODO: Implement using markdown-link-check package
  await Promise.resolve();
  return {
    success: true,
    message: 'Link validation via CLI not yet implemented. Use CI workflow.',
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
