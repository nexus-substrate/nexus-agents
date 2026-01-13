/**
 * Research Registry CLI Commands
 *
 * CLI commands for interacting with the research registry.
 * Provides add, status, and overlap commands.
 *
 * @see docs/research/RESEARCH_INDEX.md
 * @see Issue #237 (Epic #225)
 */

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
  fetchArxivMetadata,
  paperExists,
  addResearchPaper,
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
// MAIN COMMAND HANDLER
// =============================================================================

/**
 * Research command subcommand handler
 */
export async function researchCommand(
  subcommand: 'status' | 'overlap' | 'add',
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
    default:
      return `Unknown subcommand: ${String(subcommand)}. Available: status, overlap, add`;
  }
}
