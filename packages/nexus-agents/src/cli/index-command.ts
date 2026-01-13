/**
 * nexus-agents/cli - Index Command
 *
 * CLI command to generate and manage the codebase index.
 * Supports generate, check, diagram, and validate subcommands.
 *
 * @module cli/index-command
 * (Source: Issue #240)
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
  type OutputFormat,
} from '../indexer/index.js';

const logger = createLogger({ component: 'index-command' });

// =============================================================================
// Types
// =============================================================================

/** Subcommand for the index CLI. */
export type IndexSubcommand = 'generate' | 'check' | 'diagram' | 'validate';

/** Options for the index command. */
export interface IndexCommandOptions {
  readonly subcommand: IndexSubcommand;
  readonly format?: OutputFormat;
  readonly output?: string;
  readonly verbose?: boolean;
  readonly module?: string;
  readonly inline?: boolean;
}

/** Result of the index command. */
export interface IndexCommandResult {
  readonly success: boolean;
  readonly message: string;
  readonly data?: {
    readonly filesIndexed?: number;
    readonly modulesFound?: number;
    readonly outputPath?: string;
    readonly validationResult?: {
      readonly valid: boolean;
      readonly missingFiles: readonly string[];
      readonly extraFiles: readonly string[];
      readonly modifiedFiles: readonly string[];
    };
  };
}

// =============================================================================
// ANSI Formatting
// =============================================================================

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

// =============================================================================
// Command Implementation
// =============================================================================

/**
 * Generates a fresh codebase index.
 */
async function generateIndex(options: IndexCommandOptions): Promise<IndexCommandResult> {
  const format: OutputFormat = options.format ?? 'yaml';
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
    default: {
      const exhaustive: never = options.subcommand;
      return {
        success: false,
        message: `Unknown subcommand: ${exhaustive as string}`,
      };
    }
  }
}

// =============================================================================
// CLI Output Formatting
// =============================================================================

/** Formats a file list with a prefix marker, truncated to 10 items. */
function formatFileList(
  files: readonly string[],
  label: string,
  marker: string,
  lines: string[]
): void {
  if (files.length === 0) return;
  lines.push('');
  lines.push(`  ${ANSI.yellow}${label}:${ANSI.reset}`);
  for (const file of files.slice(0, 10)) {
    lines.push(`    ${marker} ${file}`);
  }
  if (files.length > 10) {
    lines.push(`    ... and ${String(files.length - 10)} more`);
  }
}

/** Formats validation result details. */
function formatValidationResult(
  v: NonNullable<IndexCommandResult['data']>['validationResult'],
  lines: string[]
): void {
  if (v === undefined) return;
  formatFileList(v.missingFiles, 'Missing files (in codebase but not in index)', '+', lines);
  formatFileList(v.extraFiles, 'Extra files (in index but not in codebase)', '-', lines);
  formatFileList(v.modifiedFiles, 'Modified files (line count changed)', '~', lines);
}

/**
 * Formats the command result for CLI output.
 */
export function formatIndexResult(result: IndexCommandResult): string {
  const lines: string[] = [];
  const status = result.success
    ? `${ANSI.green}${ANSI.bold}SUCCESS`
    : `${ANSI.red}${ANSI.bold}FAILED`;
  lines.push(`${status}${ANSI.reset} ${result.message}`);

  if (result.data !== undefined) {
    lines.push('');
    const d = result.data;
    if (d.filesIndexed !== undefined)
      lines.push(`  ${ANSI.cyan}Files indexed:${ANSI.reset} ${String(d.filesIndexed)}`);
    if (d.modulesFound !== undefined)
      lines.push(`  ${ANSI.cyan}Modules found:${ANSI.reset} ${String(d.modulesFound)}`);
    if (d.outputPath !== undefined)
      lines.push(`  ${ANSI.cyan}Output:${ANSI.reset} ${d.outputPath}`);
    formatValidationResult(d.validationResult, lines);
  }

  return lines.join('\n');
}
