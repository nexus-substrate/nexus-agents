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
  discoverGitHubRepos,
  discoverGoogleAI,
  discoverMetaFAIR,
  discoverMicrosoftResearch,
  discoverDeepMind,
  type DiscoveredSource,
} from './research-helpers-sources.js';
import {
  discoverSemanticScholar,
  discoverPapersWithCode,
  discoverOpenAlex,
} from './research-helpers-sources-academic.js';
import {
  handleStatsCommand,
  handleRefreshCommand,
  handleCheckCommand,
} from './research-helpers-index-ops.js';
import {
  executeReview,
  formatReviewResults,
  executePrioritize,
} from './research-helpers-review.js';
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
// DISCOVER HANDLER (Phase 3)
// =============================================================================

/** Valid discover sources. */
type DiscoverSource =
  | 'arxiv'
  | 'github'
  | 'google_ai'
  | 'meta_fair'
  | 'microsoft'
  | 'deepmind'
  | 'semantic_scholar'
  | 'papers_with_code'
  | 'openalex'
  | 'all';

/** Source provider mapping for discovery. */
const SOURCE_PROVIDERS: ReadonlyArray<{
  key: string;
  label: string;
  fn: (
    topic: string,
    max: number
  ) => Promise<
    import('../core/result.js').Result<
      DiscoveredSource[],
      import('./research-helpers-sources.js').DiscoverError
    >
  >;
}> = [
  { key: 'github', label: 'GitHub', fn: discoverGitHubRepos },
  { key: 'google_ai', label: 'Google AI', fn: discoverGoogleAI },
  { key: 'meta_fair', label: 'Meta FAIR', fn: discoverMetaFAIR },
  { key: 'microsoft', label: 'Microsoft', fn: discoverMicrosoftResearch },
  { key: 'deepmind', label: 'DeepMind', fn: discoverDeepMind },
  { key: 'semantic_scholar', label: 'Semantic Scholar', fn: discoverSemanticScholar },
  { key: 'papers_with_code', label: 'Papers with Code', fn: discoverPapersWithCode },
  { key: 'openalex', label: 'OpenAlex', fn: discoverOpenAlex },
];

/** Query all requested discovery sources. */
async function queryDiscoverSources(
  topic: string,
  source: DiscoverSource,
  maxResults: number
): Promise<{ results: DiscoveredSource[]; errors: string[] }> {
  const results: DiscoveredSource[] = [];
  const errors: string[] = [];
  for (const provider of SOURCE_PROVIDERS) {
    if (source !== 'all' && source !== provider.key) continue;
    const result = await provider.fn(topic, maxResults);
    if (result.ok) results.push(...result.value);
    else errors.push(`${provider.label}: ${result.error.message}`);
  }
  return { results, errors };
}

/** Format discovery results into display string. */
function formatDiscoverResults(
  topic: string,
  items: readonly DiscoveredSource[],
  errors: readonly string[],
  maxResults: number
): string {
  const lines: string[] = [];
  lines.push(`Discovery Results: "${topic}"`);
  lines.push('='.repeat(60));
  lines.push(`Found ${String(items.length)} items`);
  lines.push('');
  for (const item of items.slice(0, maxResults)) {
    lines.push(`  [${item.source}] ${item.title}`);
    lines.push(`    URL: ${item.url}`);
    lines.push(`    Relevance: ${item.relevance}`);
    if (item.description !== '') {
      const desc =
        item.description.length > 100 ? item.description.slice(0, 97) + '...' : item.description;
      lines.push(`    ${desc}`);
    }
    lines.push('');
  }
  if (errors.length > 0) {
    lines.push('Errors:');
    for (const err of errors) lines.push(`  - ${err}`);
  }
  return lines.join('\n');
}

/** Handle discover subcommand. */
async function handleDiscoverCommand(
  args: string[],
  options: Record<string, unknown>
): Promise<string> {
  const topic = args[0] ?? (options['topic'] as string | undefined);
  if (topic === undefined || topic === '') {
    return 'Error: --topic is required for discover command';
  }
  const source = (options['source'] as DiscoverSource | undefined) ?? 'all';
  const maxResults = (options['maxResults'] as number | undefined) ?? 10;
  const { results, errors } = await queryDiscoverSources(topic, source, maxResults);
  return formatDiscoverResults(topic, results, errors, maxResults);
}

// =============================================================================
// REVIEW + PRIORITIZE HANDLERS (Phase 3)
// =============================================================================

/** Handle review subcommand: discover → score → rank → optionally create issues. */
async function handleReviewCommand(
  args: string[],
  options: Record<string, unknown>
): Promise<string> {
  const topic = args[0] ?? (options['topic'] as string | undefined);
  if (topic === undefined || topic === '') {
    return 'Error: --topic is required for review command';
  }
  const maxResults = (options['maxResults'] as number | undefined) ?? 10;
  const createIssues = (options['createIssues'] as boolean | undefined) ?? false;
  const vote = (options['vote'] as boolean | undefined) ?? false;

  const result = await executeReview({ topic, maxResults, createIssues, vote }, (t, max) =>
    queryDiscoverSources(t, 'all', max)
  );
  return formatReviewResults(result);
}

/** Handle prioritize subcommand: load registry → rank actionable items. */
async function handlePrioritizeCommand(
  args: string[],
  options: Record<string, unknown>
): Promise<string> {
  const topic = args[0] ?? (options['topic'] as string | undefined);
  const vote = (options['vote'] as boolean | undefined) ?? false;
  return executePrioritize({ topic, vote });
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
  | 'index'
  | 'discover'
  | 'review'
  | 'prioritize';

/** All valid subcommand names. */
const VALID_SUBCOMMANDS = [
  'status',
  'overlap',
  'add',
  'stats',
  'refresh',
  'check',
  'index',
  'discover',
  'review',
  'prioritize',
] as const;

/** Validates that a subcommand is valid. */
export function isValidResearchSubcommand(value: string | undefined): value is ResearchSubcommand {
  return value !== undefined && (VALID_SUBCOMMANDS as readonly string[]).includes(value);
}

// Re-export index command helpers for CLI integration
export { researchIndexCommand, parseResearchIndexArgs, getResearchIndexHelp };

/** Handle index subcommand. */
async function handleIndexCommand(args: string[]): Promise<string> {
  const indexOptions = parseResearchIndexArgs(args);
  const result = await researchIndexCommand(indexOptions);
  return result.message;
}

/** Subcommand dispatch map to reduce cyclomatic complexity. */
type SubcommandHandler = (args: string[], options: Record<string, unknown>) => Promise<string>;
const SUBCOMMAND_HANDLERS: Record<ResearchSubcommand, SubcommandHandler> = {
  status: handleStatusCommand,
  overlap: handleOverlapCommand,
  add: handleAddCommand,
  stats: (_args, options) => handleStatsCommand(options),
  refresh: (_args, options) => handleRefreshCommand(options),
  check: () => handleCheckCommand(),
  index: (args) => handleIndexCommand(args),
  discover: handleDiscoverCommand,
  review: handleReviewCommand,
  prioritize: handlePrioritizeCommand,
};

/**
 * Research command subcommand handler.
 */
export async function researchCommand(
  subcommand: ResearchSubcommand,
  args: string[],
  options: Record<string, unknown>
): Promise<string> {
  const handler = SUBCOMMAND_HANDLERS[subcommand] as SubcommandHandler | undefined;
  if (handler === undefined) {
    return `Unknown subcommand: ${subcommand}. Available: ${VALID_SUBCOMMANDS.join(', ')}`;
  }
  return handler(args, options);
}
