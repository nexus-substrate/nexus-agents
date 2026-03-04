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
import { synthesizeResearch } from './research-helpers-synthesize.js';
import type { SynthesisResult } from './research-helpers-synthesize.js';
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
// CLI Option Helpers
// =============================================================================

/** Extracts a string option from CLI options record. */
function optString(options: Record<string, unknown>, key: string): string | undefined {
  const val = options[key];
  return typeof val === 'string' ? val : undefined;
}

/** Extracts a number option from CLI options record. */
function optNumber(options: Record<string, unknown>, key: string): number | undefined {
  const val = options[key];
  return typeof val === 'number' ? val : undefined;
}

/** Extracts a boolean option from CLI options record. */
function optBoolean(options: Record<string, unknown>, key: string): boolean {
  return options[key] === true;
}

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
  const status =
    (optString(options, 'status') as ResearchStatusOptions['status'] | undefined) ?? 'all';
  const format =
    (optString(options, 'format') as ResearchStatusOptions['format'] | undefined) ?? 'table';
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
  const format =
    (optString(options, 'format') as ResearchOverlapOptions['format'] | undefined) ?? 'table';
  const overlapOptions: ResearchOverlapOptions = {
    techniqueId,
    threshold: optNumber(options, 'threshold') ?? 0.3,
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
    topic: optString(options, 'topic'),
    priority: optString(options, 'priority') as ResearchAddOptions['priority'],
    dryRun: optBoolean(options, 'dryRun'),
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
  const topic = args[0] ?? optString(options, 'topic');
  if (topic === undefined || topic === '') {
    return 'Error: --topic is required for discover command';
  }
  const source = (optString(options, 'source') as DiscoverSource | undefined) ?? 'all';
  const maxResults = optNumber(options, 'maxResults') ?? 10;
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
  const topic = args[0] ?? optString(options, 'topic');
  if (topic === undefined || topic === '') {
    return 'Error: --topic is required for review command';
  }
  const maxResults = optNumber(options, 'maxResults') ?? 10;
  const createIssues = optBoolean(options, 'createIssues');
  const vote = optBoolean(options, 'vote');

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
  const topic = args[0] ?? optString(options, 'topic');
  const vote = optBoolean(options, 'vote');
  return executePrioritize({ topic, vote });
}

// =============================================================================
// SYNTHESIZE HANDLER (Issue #1386)
// =============================================================================

/** Handle synthesize subcommand: group papers by topic and generate synthesis. */
async function handleSynthesizeCommand(
  args: string[],
  options: Record<string, unknown>
): Promise<string> {
  const topic = args[0] ?? optString(options, 'topic');
  const result = await synthesizeResearch(topic);
  if (!result.ok) {
    return `Error: ${result.error.message}`;
  }
  return formatSynthesisResult(result.value);
}

/** Format synthesis result for CLI display. */
function formatSynthesisResult(synthesis: SynthesisResult): string {
  const lines: string[] = [
    `Research Synthesis: ${String(synthesis.totalPapers)} papers across ${String(synthesis.topicCount)} topics`,
    '',
  ];
  for (const cluster of synthesis.clusters) {
    formatCluster(cluster, lines);
  }
  if (synthesis.crossCuttingThemes.length > 0) {
    lines.push('## Cross-Cutting Themes');
    for (const theme of synthesis.crossCuttingThemes) {
      lines.push(`  - ${theme}`);
    }
    lines.push('');
  }
  formatAlignmentSummary(synthesis.alignmentSummary, lines);
  formatFeatureGates(synthesis.featureGates, lines);
  return lines.join('\n');
}

/** Format a single cluster section. */
function formatCluster(cluster: SynthesisResult['clusters'][number], lines: string[]): void {
  lines.push(`## ${cluster.topic} (${String(cluster.paperCount)} papers)`);
  lines.push(`Papers: ${cluster.papers.join(', ')}`);
  if (cluster.commonThemes.length > 0) lines.push(`Themes: ${cluster.commonThemes.join(', ')}`);
  if (cluster.keyInsights.length > 0) {
    lines.push('Key insights:');
    for (const insight of cluster.keyInsights.slice(0, 5)) lines.push(`  - ${insight}`);
  }
  if (cluster.implementationOpportunities.length > 0) {
    lines.push(`Opportunities: ${cluster.implementationOpportunities.join(', ')}`);
  }
  if (cluster.gaps.length > 0) lines.push(`Gaps: ${cluster.gaps.join('; ')}`);
  const partial = cluster.alignedTechniques.filter((a) => a.status === 'partial');
  if (partial.length > 0) {
    lines.push('Improvement opportunities:');
    for (const a of partial.slice(0, 3)) {
      const hint = a.improvementHint !== undefined ? ` — ${a.improvementHint}` : '';
      lines.push(`  - ${a.technique} (${a.canonicalPath ?? 'unknown'})${hint}`);
    }
  }
  lines.push('');
}

/** Format feature gate section. */
function formatFeatureGates(gates: SynthesisResult['featureGates'], lines: string[]): void {
  if (gates.length === 0) return;
  const linked = gates.filter((g) => g.linkedTechniqueCount > 0);
  const unlinked = gates.filter((g) => g.linkedTechniqueCount === 0);
  lines.push('');
  lines.push(
    `## Feature Gates (${String(gates.length)} total, ${String(linked.length)} research-linked)`
  );
  for (const g of linked) {
    lines.push(
      `  ${g.envVar}=${g.defaultValue} — ${g.description} [${String(g.linkedTechniqueCount)} techniques]`
    );
  }
  if (unlinked.length > 0) {
    lines.push(
      `  + ${String(unlinked.length)} infrastructure gates (auth, logging, rate limiting, etc.)`
    );
  }
}

/** Format alignment summary section. */
function formatAlignmentSummary(
  summary: SynthesisResult['alignmentSummary'],
  lines: string[]
): void {
  if (summary.total === 0) return;
  lines.push('## Alignment Summary');
  lines.push(
    `Implemented: ${String(summary.implemented)} | Partial: ${String(summary.partial)} | ` +
      `Not started: ${String(summary.notStarted)} | Total: ${String(summary.total)}`
  );
  if (summary.topOpportunities.length > 0) {
    lines.push('Top improvement opportunities:');
    for (const opp of summary.topOpportunities.slice(0, 5)) lines.push(`  - ${opp}`);
  }
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
  | 'prioritize'
  | 'synthesize';

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
  'synthesize',
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
  synthesize: handleSynthesizeCommand,
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
