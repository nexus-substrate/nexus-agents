/**
 * Research Registry CLI Commands
 *
 * CLI commands for interacting with the research registry.
 * Provides add, status, overlap, stats, refresh, and check commands.
 *
 * @see docs/research/RESEARCH_INDEX.md
 * @see Issue #237 (Epic #225)
 * @see Epic #261 (Automated Documentation System)
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {
  ResearchStatusOptions,
  ResearchOverlapOptions,
  ResearchAddOptions,
} from './research-types.js';
import {
  getResearchStatus,
  formatStatusResult,
  findOverlaps,
  formatOverlapResult,
  addResearchPaper,
} from './research-helpers.js';
import {
  parseRegistry,
  generateIndexMarkdown,
  generateStatsJson,
  generateSummaryReport,
} from '../indexer/research-index/index.js';
import {
  researchIndexCommand,
  parseResearchIndexArgs,
  getResearchIndexHelp,
} from './research-index-command.js';
export type {
  ResearchIndexOptions,
  ResearchIndexResult,
  ResearchIndexAction,
} from './research-index-command.js';

// Re-export helpers for external use
export {
  getProjectRoot,
  loadTechniquesRegistry,
  loadPapersRegistry,
  saveTechniquesRegistry,
  savePapersRegistry,
  toStatusSummary,
  filterByStatus,
  countByStatus,
  getResearchStatus,
  formatStatusResult,
  calculateTagOverlap,
  findSharedTags,
  determineRelationship,
  findOverlaps,
  formatOverlapResult,
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- Re-exporting for backward compatibility
  fetchArxivMetadata,
  fetchArxivMetadataResult,
  paperExists,
  addResearchPaper,
  // Registry helpers (Issue #299)
  generateRegistryEntry,
  paperExistsInRegistry,
  addPaperToRegistry,
  getCurrentDate,
} from './research-helpers.js';
export type {
  ArxivFetchError,
  ArxivFetchErrorCode,
  // Registry types (Issue #299)
  RegistryError,
  RegistryErrorCode,
  AddPaperOptions,
  AddPaperResult,
} from './research-helpers.js';

// =============================================================================
// SUBCOMMAND HANDLERS
// =============================================================================

/**
 * Handle status subcommand
 */
async function handleStatusCommand(
  args: string[],
  options: Record<string, unknown>
): Promise<string> {
  const status = (options['status'] as ResearchStatusOptions['status'] | undefined) ?? 'all';
  const format = (options['format'] as ResearchStatusOptions['format'] | undefined) ?? 'table';
  const statusOptions: ResearchStatusOptions = {
    techniqueId: args[0],
    status,
    format,
  };
  const result = await getResearchStatus(statusOptions);
  return formatStatusResult(result, format);
}

/**
 * Handle overlap subcommand
 */
async function handleOverlapCommand(
  args: string[],
  options: Record<string, unknown>
): Promise<string> {
  const techniqueId = args[0];
  if (techniqueId === undefined || techniqueId === '') {
    return 'Error: technique-id is required for overlap command';
  }
  const format = (options['format'] as ResearchOverlapOptions['format'] | undefined) ?? 'table';
  const overlapOptions: ResearchOverlapOptions = {
    techniqueId,
    threshold: (options['threshold'] as number | undefined) ?? 0.3,
    format,
  };
  const result = await findOverlaps(overlapOptions);
  return formatOverlapResult(result, format);
}

/**
 * Handle add subcommand
 */
async function handleAddCommand(args: string[], options: Record<string, unknown>): Promise<string> {
  const arxivId = args[0];
  if (arxivId === undefined || arxivId === '') {
    return 'Error: arxiv-id is required for add command';
  }
  const addOptions: ResearchAddOptions = {
    arxivId,
    topic: options['topic'] as string | undefined,
    priority: options['priority'] as ResearchAddOptions['priority'],
    dryRun: (options['dryRun'] as boolean | undefined) ?? false,
  };
  const result = await addResearchPaper(addOptions);
  return result.message;
}

// =============================================================================
// INDEX GENERATION HANDLERS (Epic #261)
// =============================================================================

/** Gets the registry path. */
function getRegistryPath(): string {
  return path.resolve(process.cwd(), 'docs/research/registry');
}

/** Gets the index output path. */
function getIndexPath(): string {
  return path.resolve(process.cwd(), 'docs/research/RESEARCH_INDEX.md');
}

/**
 * Handle stats subcommand - show research statistics
 */
async function handleStatsCommand(options: Record<string, unknown>): Promise<string> {
  const registryPath = getRegistryPath();
  const result = parseRegistry({ registryPath });

  if (!result.ok) {
    return `Error: Failed to parse registry: ${result.error.message}`;
  }

  const index = result.value;
  const format = options['format'] as string | undefined;

  // Ensure async compliance (future: may add async registry operations)
  await Promise.resolve();

  if (format === 'json') {
    return generateStatsJson(index);
  }

  return generateSummaryReport(index);
}

/**
 * Handle refresh subcommand - regenerate RESEARCH_INDEX.md
 */
async function handleRefreshCommand(options: Record<string, unknown>): Promise<string> {
  const outputPath = (options['output'] as string | undefined) ?? getIndexPath();
  const registryPath = getRegistryPath();
  const result = parseRegistry({ registryPath });

  if (!result.ok) {
    return `Error: Failed to parse registry: ${result.error.message}`;
  }

  const index = result.value;
  const mdResult = generateIndexMarkdown(index);

  if (!mdResult.ok) {
    return `Error: Failed to generate markdown: ${mdResult.error.message}`;
  }

  // Write the index
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, mdResult.value, 'utf-8');

  const stats = index.stats;
  return [
    `Research index regenerated successfully`,
    `  Output: ${outputPath}`,
    `  Papers: ${String(stats.totalPapers)}`,
    `  Techniques: ${String(stats.totalTechniques)}`,
    `  Implemented: ${String(stats.techniquesByStatus.implemented)}`,
  ].join('\n');
}

/**
 * Handle check subcommand - check if index is up to date
 */
async function handleCheckCommand(): Promise<string> {
  const indexPath = getIndexPath();

  // Check if index exists
  try {
    await fs.access(indexPath);
  } catch {
    return `Error: Research index not found: ${indexPath}. Run 'nexus-agents research refresh' first.`;
  }

  // Parse registry and generate fresh index
  const registryPath = getRegistryPath();
  const result = parseRegistry({ registryPath });

  if (!result.ok) {
    return `Error: Failed to parse registry: ${result.error.message}`;
  }

  const mdResult = generateIndexMarkdown(result.value);
  if (!mdResult.ok) {
    return `Error: Failed to generate markdown: ${mdResult.error.message}`;
  }

  // Read existing index
  const existingContent = await fs.readFile(indexPath, 'utf-8');
  const freshContent = mdResult.value;

  // Compare (normalize whitespace for comparison)
  const normalize = (s: string): string => s.replace(/\s+/g, ' ').trim();
  const isFresh = normalize(existingContent) === normalize(freshContent);

  if (isFresh) {
    return `Research index is up to date (${String(result.value.stats.totalTechniques)} techniques)`;
  }

  return `Research index is out of date. Run "nexus-agents research refresh" to update.`;
}

// =============================================================================
// MAIN COMMAND HANDLER
// =============================================================================

/** Valid research subcommands. */
export type ResearchSubcommand =
  | 'status'
  | 'overlap'
  | 'add'
  | 'stats'
  | 'refresh'
  | 'check'
  | 'index';

/** Validates that a subcommand is valid. */
export function isValidResearchSubcommand(value: string | undefined): value is ResearchSubcommand {
  return (
    value !== undefined &&
    ['status', 'overlap', 'add', 'stats', 'refresh', 'check', 'index'].includes(value)
  );
}

// Re-export index command helpers for CLI integration
export { researchIndexCommand, parseResearchIndexArgs, getResearchIndexHelp };

/**
 * Research command subcommand handler
 */
export async function researchCommand(
  subcommand: ResearchSubcommand,
  args: string[],
  options: Record<string, unknown>
): Promise<string> {
  switch (subcommand) {
    case 'status':
      return handleStatusCommand(args, options);
    case 'overlap':
      return handleOverlapCommand(args, options);
    case 'add':
      return handleAddCommand(args, options);
    case 'stats':
      return handleStatsCommand(options);
    case 'refresh':
      return handleRefreshCommand(options);
    case 'check':
      return handleCheckCommand();
    case 'index': {
      // Handle index subcommand with --generate, --validate, --check flags
      const indexOptions = parseResearchIndexArgs(args);
      const result = await researchIndexCommand(indexOptions);
      return result.message;
    }
    default:
      return `Unknown subcommand: ${String(subcommand)}. Available: status, overlap, add, stats, refresh, check, index`;
  }
}
