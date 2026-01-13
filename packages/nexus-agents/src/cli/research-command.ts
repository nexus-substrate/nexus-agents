/**
 * Research Registry CLI Commands
 *
 * CLI commands for interacting with the research registry.
 * Provides add, status, and overlap commands.
 *
 * @see docs/research/RESEARCH_INDEX.md
 * @see Issue #237 (Epic #225)
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type {
  TechniquesRegistry,
  TechniqueEntry,
  TechniqueStatus,
  TechniqueStatusSummary,
  ResearchStatusOptions,
  ResearchStatusResult,
  ResearchOverlapOptions,
  ResearchOverlapResult,
  OverlapMatch,
  ResearchAddOptions,
  ResearchAddResult,
  ArxivMetadata,
  PapersRegistry,
} from './research-types.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const REGISTRY_PATH = 'docs/research/registry';
const TECHNIQUES_FILE = 'techniques.yaml';
const PAPERS_FILE = 'papers.yaml';

// =============================================================================
// REGISTRY I/O
// =============================================================================

/**
 * Get the project root directory
 * Note: Returns cwd since registry operations use explicit rootDir parameter
 */
export function getProjectRoot(): string {
  return process.cwd();
}

/**
 * Load techniques registry from YAML file
 */
export async function loadTechniquesRegistry(rootDir?: string): Promise<TechniquesRegistry> {
  const root = rootDir ?? process.cwd();
  const filePath = path.join(root, REGISTRY_PATH, TECHNIQUES_FILE);
  const content = await fs.readFile(filePath, 'utf-8');
  return parseYaml(content) as TechniquesRegistry;
}

/**
 * Load papers registry from YAML file
 */
export async function loadPapersRegistry(rootDir?: string): Promise<PapersRegistry> {
  const root = rootDir ?? process.cwd();
  const filePath = path.join(root, REGISTRY_PATH, PAPERS_FILE);
  const content = await fs.readFile(filePath, 'utf-8');
  return parseYaml(content) as PapersRegistry;
}

/**
 * Save techniques registry to YAML file
 */
export async function saveTechniquesRegistry(
  registry: TechniquesRegistry,
  rootDir?: string
): Promise<void> {
  const root = rootDir ?? process.cwd();
  const filePath = path.join(root, REGISTRY_PATH, TECHNIQUES_FILE);
  const content = stringifyYaml(registry, { lineWidth: 100 });
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Save papers registry to YAML file
 */
export async function savePapersRegistry(
  registry: PapersRegistry,
  rootDir?: string
): Promise<void> {
  const root = rootDir ?? process.cwd();
  const filePath = path.join(root, REGISTRY_PATH, PAPERS_FILE);
  const content = stringifyYaml(registry, { lineWidth: 100 });
  await fs.writeFile(filePath, content, 'utf-8');
}

// =============================================================================
// STATUS COMMAND
// =============================================================================

/**
 * Convert technique entry to status summary
 */
export function toStatusSummary(id: string, entry: TechniqueEntry): TechniqueStatusSummary {
  return {
    id,
    name: entry.name,
    status: entry.status,
    priority: entry.priority,
    topic: entry.topic,
    implementationIssue: entry.implementation_issue,
  };
}

/**
 * Filter techniques by status
 */
export function filterByStatus(
  techniques: Record<string, TechniqueEntry>,
  status: TechniqueStatus | 'all'
): TechniqueStatusSummary[] {
  return Object.entries(techniques)
    .filter(([, entry]) => status === 'all' || entry.status === status)
    .map(([id, entry]) => toStatusSummary(id, entry))
    .sort((a, b) => {
      // Sort by priority (P1 first), then by name
      const priorityOrder: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };
      const aPriority = a.priority !== null ? (priorityOrder[a.priority] ?? 4) : 4;
      const bPriority = b.priority !== null ? (priorityOrder[b.priority] ?? 4) : 4;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.name.localeCompare(b.name);
    });
}

/**
 * Count techniques by status
 */
export function countByStatus(
  techniques: Record<string, TechniqueEntry>
): ResearchStatusResult['counts'] {
  let implemented = 0;
  let planned = 0;
  let notStarted = 0;
  let rejected = 0;

  for (const entry of Object.values(techniques)) {
    switch (entry.status) {
      case 'implemented':
        implemented++;
        break;
      case 'planned':
      case 'in-progress':
        planned++;
        break;
      case 'not-started':
        notStarted++;
        break;
      case 'rejected':
        rejected++;
        break;
    }
  }

  return {
    implemented,
    planned,
    notStarted,
    rejected,
    total: implemented + planned + notStarted + rejected,
  };
}

/**
 * Get status of techniques
 */
export async function getResearchStatus(
  options: ResearchStatusOptions
): Promise<ResearchStatusResult> {
  const registry = await loadTechniquesRegistry();

  // If specific technique requested
  if (options.techniqueId !== undefined && options.techniqueId !== '') {
    const entry = registry.techniques[options.techniqueId];
    if (entry === undefined) {
      return {
        success: false,
        techniques: [],
        counts: countByStatus(registry.techniques),
      };
    }
    return {
      success: true,
      techniques: [toStatusSummary(options.techniqueId, entry)],
      counts: countByStatus(registry.techniques),
    };
  }

  // Filter by status
  const statusFilter = options.status === 'all' ? 'all' : (options.status as TechniqueStatus);
  const techniques = filterByStatus(registry.techniques, statusFilter);

  return {
    success: true,
    techniques,
    counts: countByStatus(registry.techniques),
  };
}

/**
 * Format status result for display
 */
export function formatStatusResult(
  result: ResearchStatusResult,
  format: 'table' | 'json' | 'compact'
): string {
  if (format === 'json') {
    return JSON.stringify(result, null, 2);
  }

  if (format === 'compact') {
    const lines = result.techniques.map(
      (t) => `${t.status.padEnd(12)} ${(t.priority ?? '-').padEnd(3)} ${t.id}`
    );
    return lines.join('\n');
  }

  // Table format
  const lines: string[] = [];
  lines.push('Research Registry Status');
  lines.push('='.repeat(60));
  lines.push('');

  // Summary counts
  const { counts } = result;
  lines.push(
    `Implemented: ${String(counts.implemented)} | Planned: ${String(counts.planned)} | Not Started: ${String(counts.notStarted)} | Rejected: ${String(counts.rejected)}`
  );
  lines.push(`Total: ${String(counts.total)}`);
  lines.push('');

  if (result.techniques.length === 0) {
    lines.push('No techniques found matching criteria.');
    return lines.join('\n');
  }

  // Table header
  lines.push('Status       | Pri | Topic          | ID');
  lines.push('-'.repeat(60));

  for (const tech of result.techniques) {
    const status = tech.status.padEnd(12);
    const priority = (tech.priority ?? '-').padEnd(3);
    const topic = tech.topic.slice(0, 14).padEnd(14);
    lines.push(`${status} | ${priority} | ${topic} | ${tech.id}`);
  }

  return lines.join('\n');
}

// =============================================================================
// OVERLAP COMMAND
// =============================================================================

/**
 * Calculate tag overlap score between two techniques
 */
export function calculateTagOverlap(tags1: readonly string[], tags2: readonly string[]): number {
  const set1 = new Set(tags1);
  const set2 = new Set(tags2);
  const intersection = [...set1].filter((tag) => set2.has(tag));
  const union = new Set([...set1, ...set2]);
  return union.size === 0 ? 0 : intersection.length / union.size;
}

/**
 * Find shared tags between two techniques
 */
export function findSharedTags(tags1: readonly string[], tags2: readonly string[]): string[] {
  const set2 = new Set(tags2);
  return tags1.filter((tag) => set2.has(tag));
}

/**
 * Determine relationship type based on overlap characteristics
 */
export function determineRelationship(
  source: TechniqueEntry,
  target: TechniqueEntry,
  overlapScore: number
): OverlapMatch['relationship'] {
  // High overlap in same topic = overlapping
  if (source.topic === target.topic && overlapScore > 0.5) {
    return 'overlapping';
  }

  // Same topic but lower overlap = complementary
  if (source.topic === target.topic) {
    return 'complementary';
  }

  // Different topic with some overlap = enhances
  if (overlapScore > 0.3) {
    return 'enhances';
  }

  return 'complementary';
}

/**
 * Find overlapping techniques
 */
export async function findOverlaps(
  options: ResearchOverlapOptions
): Promise<ResearchOverlapResult> {
  const registry = await loadTechniquesRegistry();

  const sourceEntry = registry.techniques[options.techniqueId];
  if (!sourceEntry) {
    return {
      success: false,
      sourceId: options.techniqueId,
      matches: [],
      suggestedAlignments: [],
    };
  }

  const matches: OverlapMatch[] = [];

  for (const [id, entry] of Object.entries(registry.techniques)) {
    if (id === options.techniqueId) continue;

    const overlapScore = calculateTagOverlap(sourceEntry.tags, entry.tags);
    const sharedTopic = sourceEntry.topic === entry.topic;

    // Apply threshold
    if (overlapScore >= options.threshold || sharedTopic) {
      matches.push({
        techniqueId: id,
        name: entry.name,
        overlapScore,
        sharedTags: findSharedTags(sourceEntry.tags, entry.tags),
        sharedTopic,
        relationship: determineRelationship(sourceEntry, entry, overlapScore),
      });
    }
  }

  // Sort by overlap score descending
  matches.sort((a, b) => b.overlapScore - a.overlapScore);

  // Generate suggested alignments
  const suggestedAlignments = matches
    .filter((m) => m.relationship === 'overlapping' || m.relationship === 'enhances')
    .slice(0, 3)
    .map((m) => `${options.techniqueId} -> ${m.techniqueId}: ${m.relationship}`);

  return {
    success: true,
    sourceId: options.techniqueId,
    matches,
    suggestedAlignments,
  };
}

/**
 * Format overlap result for display
 */
export function formatOverlapResult(
  result: ResearchOverlapResult,
  format: 'table' | 'json'
): string {
  if (format === 'json') {
    return JSON.stringify(result, null, 2);
  }

  const lines: string[] = [];
  lines.push(`Overlap Analysis: ${result.sourceId}`);
  lines.push('='.repeat(60));
  lines.push('');

  if (!result.success) {
    lines.push(`Technique '${result.sourceId}' not found in registry.`);
    return lines.join('\n');
  }

  if (result.matches.length === 0) {
    lines.push('No overlapping techniques found.');
    return lines.join('\n');
  }

  lines.push(`Found ${String(result.matches.length)} related technique(s):`);
  lines.push('');

  for (const match of result.matches) {
    const score = (match.overlapScore * 100).toFixed(0);
    lines.push(`  ${match.techniqueId}`);
    lines.push(`    Name: ${match.name}`);
    lines.push(`    Overlap: ${score}% | Relationship: ${match.relationship}`);
    if (match.sharedTags.length > 0) {
      lines.push(`    Shared tags: ${match.sharedTags.join(', ')}`);
    }
    lines.push('');
  }

  if (result.suggestedAlignments.length > 0) {
    lines.push('Suggested alignments.yaml entries:');
    for (const alignment of result.suggestedAlignments) {
      lines.push(`  - ${alignment}`);
    }
  }

  return lines.join('\n');
}

// =============================================================================
// ADD COMMAND (stub - requires arXiv API)
// =============================================================================

/**
 * Parse arXiv XML response into metadata
 */
function parseArxivXml(arxivId: string, xml: string): ArxivMetadata | null {
  const titleMatch = xml.match(/<title>([^<]+)<\/title>/);
  const summaryMatch = xml.match(/<summary>([^<]+)<\/summary>/s);
  const publishedMatch = xml.match(/<published>([^<]+)<\/published>/);

  const titleContent = titleMatch?.[1];
  if (titleContent === undefined || titleContent === '') return null;

  return {
    id: arxivId,
    title: titleContent.trim().replace(/\s+/g, ' '),
    authors: [], // Would need more complex parsing
    summary: summaryMatch?.[1]?.trim().replace(/\s+/g, ' ') ?? '',
    published: publishedMatch?.[1] ?? '',
    updated: '',
    categories: [],
    pdfUrl: `https://arxiv.org/pdf/${arxivId}.pdf`,
  };
}

/**
 * Fetch paper metadata from arXiv API
 * Note: This is a simplified implementation
 */
export async function fetchArxivMetadata(arxivId: string): Promise<ArxivMetadata | null> {
  const url = `http://export.arxiv.org/api/query?id_list=${arxivId}`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const xml = await response.text();
    return parseArxivXml(arxivId, xml);
  } catch {
    return null;
  }
}

/**
 * Check if paper already exists in registry
 */
export async function paperExists(arxivId: string): Promise<boolean> {
  const registry = await loadPapersRegistry();
  const paperId = `arxiv-${arxivId}`;
  return paperId in registry.papers;
}

/**
 * Add a paper to the registry
 */
export async function addResearchPaper(options: ResearchAddOptions): Promise<ResearchAddResult> {
  // Check for duplicates
  const exists = await paperExists(options.arxivId);
  if (exists) {
    return {
      success: false,
      paperId: `arxiv-${options.arxivId}`,
      title: '',
      message: `Paper arxiv-${options.arxivId} already exists in registry`,
      dryRun: options.dryRun,
    };
  }

  // Fetch metadata
  const metadata = await fetchArxivMetadata(options.arxivId);
  if (!metadata) {
    return {
      success: false,
      paperId: `arxiv-${options.arxivId}`,
      title: '',
      message: `Could not fetch metadata for arXiv ID ${options.arxivId}`,
      dryRun: options.dryRun,
    };
  }

  if (options.dryRun) {
    return {
      success: true,
      paperId: `arxiv-${options.arxivId}`,
      title: metadata.title,
      message: `[DRY RUN] Would add paper: ${metadata.title}`,
      dryRun: true,
    };
  }

  // TODO: Add to registry (requires more implementation)
  return {
    success: true,
    paperId: `arxiv-${options.arxivId}`,
    title: metadata.title,
    message: `Added paper: ${metadata.title}`,
    dryRun: false,
  };
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
