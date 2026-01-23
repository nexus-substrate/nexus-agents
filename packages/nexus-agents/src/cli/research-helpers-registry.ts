/**
 * Research Registry Paper Operations
 *
 * Functions for adding papers to the research registry with proper YAML formatting.
 * Supports auto-add from arXiv fetch with duplicate detection.
 *
 * @see docs/research/RESEARCH_INDEX.md
 * @see Issue #299 (Auto-add papers to registry from arXiv fetch)
 * @see Issue #237 (Epic #225)
 */

import type { Result } from '../core/result.js';
import type { ArxivMetadata, PaperEntry, PapersRegistry } from './research-types.js';
import { loadPapersRegistry, savePapersRegistry } from './research-helpers-io.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Error codes for registry operations.
 */
export type RegistryErrorCode =
  | 'LOAD_ERROR'
  | 'SAVE_ERROR'
  | 'DUPLICATE'
  | 'INVALID_METADATA'
  | 'VALIDATION_ERROR';

/**
 * Structured error for registry operations.
 */
export interface RegistryError {
  readonly code: RegistryErrorCode;
  readonly message: string;
  readonly paperId?: string;
  readonly cause?: unknown;
}

/**
 * Options for adding a paper to the registry.
 */
export interface AddPaperOptions {
  /** The arXiv metadata to convert to a registry entry */
  readonly metadata: ArxivMetadata;
  /** Optional topic override (defaults to detecting from metadata) */
  readonly topic?: string;
  /** Whether this is a dry run (no actual changes) */
  readonly dryRun?: boolean;
  /** Project root directory (defaults to cwd) */
  readonly rootDir?: string;
}

/**
 * Result of adding a paper to the registry.
 */
export interface AddPaperResult {
  readonly success: boolean;
  readonly paperId: string;
  readonly entry?: PaperEntry;
  readonly message: string;
  readonly dryRun: boolean;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get current date in YYYY-MM-DD format (America/New_York timezone).
 */
export function getCurrentDate(): string {
  const now = new Date();
  return now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/**
 * Extract publication month from arXiv ID.
 * arXiv IDs have format YYMM.NNNNN (e.g., 2501.06322 = January 2025)
 */
function extractPublicationDate(arxivId: string): string {
  const match = /^(\d{2})(\d{2})\./.exec(arxivId);
  const yearStr = match?.[1];
  const monthStr = match?.[2];
  if (yearStr === undefined || monthStr === undefined) {
    return '';
  }
  const year = parseInt(yearStr, 10);
  const month = monthStr;
  // Convert 2-digit year to 4-digit (assume 20XX for years 00-99)
  const fullYear = year < 50 ? 2000 + year : 1900 + year;
  return `${String(fullYear)}-${month}`;
}

/**
 * Detect topic from arXiv metadata.
 * Uses keywords in title and summary to infer topic.
 */
function detectTopicFromMetadata(metadata: ArxivMetadata): string | undefined {
  const text = `${metadata.title} ${metadata.summary}`.toLowerCase();

  // Topic detection based on keywords
  const topicKeywords: Record<string, readonly string[]> = {
    consensus: ['consensus', 'voting', 'agreement', 'byzantine', 'debate'],
    routing: ['routing', 'route', 'cascade', 'model selection', 'cost-quality'],
    memory: ['memory', 'context', 'kv-cache', 'long-term', 'retrieval'],
    'code-generation': ['code', 'self-improve', 'refine', 'debug', 'skill'],
    orchestration: ['orchestration', 'multi-agent', 'coordination', 'workflow'],
    security: ['safety', 'security', 'adversarial', 'harmful', 'jailbreak'],
  };

  for (const [topic, keywords] of Object.entries(topicKeywords)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        return topic;
      }
    }
  }

  return undefined;
}

/**
 * Generate tags from arXiv metadata.
 * Extracts relevant keywords from title and categories.
 */
function generateTagsFromMetadata(metadata: ArxivMetadata): readonly string[] {
  const tags: string[] = [];
  const title = metadata.title.toLowerCase();

  // Common tag patterns
  const tagPatterns: Record<string, readonly string[]> = {
    survey: ['survey', 'review', 'overview'],
    benchmark: ['benchmark', 'evaluation', 'dataset'],
    'multi-agent': ['multi-agent', 'multiagent', 'multiple agents'],
    llm: ['llm', 'large language model', 'language model'],
    'reinforcement-learning': ['reinforcement learning', 'rl', 'reward'],
  };

  for (const [tag, patterns] of Object.entries(tagPatterns)) {
    for (const pattern of patterns) {
      if (title.includes(pattern)) {
        tags.push(tag);
        break;
      }
    }
  }

  return tags;
}

// =============================================================================
// REGISTRY OPERATIONS
// =============================================================================

/**
 * Creates a structured registry error.
 */
function createRegistryError(
  code: RegistryErrorCode,
  message: string,
  paperId: string | undefined,
  cause?: unknown
): RegistryError {
  const error: RegistryError = { code, message };
  if (paperId !== undefined) {
    return { ...error, paperId, cause };
  }
  if (cause !== undefined) {
    return { ...error, cause };
  }
  return error;
}

/**
 * Generate a PaperEntry from arXiv metadata.
 *
 * @param metadata - The arXiv paper metadata
 * @param topic - Optional topic override
 * @returns A PaperEntry suitable for papers.yaml
 */
export function generateRegistryEntry(
  metadata: ArxivMetadata,
  topic?: string
): Result<PaperEntry, RegistryError> {
  if (metadata.id === '' || metadata.title === '') {
    return {
      ok: false,
      error: createRegistryError(
        'INVALID_METADATA',
        'arXiv metadata is missing required fields (id or title)',
        undefined,
        undefined
      ),
    };
  }

  const detectedTopic = topic ?? detectTopicFromMetadata(metadata);
  const topics = detectedTopic !== undefined ? [detectedTopic] : [];
  const tags = generateTagsFromMetadata(metadata);
  const publicationDate = extractPublicationDate(metadata.id);

  const entry: PaperEntry = {
    title: metadata.title,
    authors: metadata.authors,
    source: 'arxiv',
    arxiv_id: metadata.id,
    url: `https://arxiv.org/abs/${metadata.id}`,
    publication_date: publicationDate,
    venue: null,
    topics,
    tags,
    reviewed_date: getCurrentDate(),
    reviewed_in: '',
    summary: '',
    key_findings: [],
    relevance: 'medium',
    techniques_extracted: [],
    related_issues: [],
    implementation_status: 'not-started',
  };

  return { ok: true, value: entry };
}

/**
 * Check if a paper already exists in the registry.
 *
 * @param arxivId - The arXiv paper ID (e.g., "2501.06322")
 * @param registry - The papers registry to check
 * @returns true if paper exists, false otherwise
 */
export function paperExistsInRegistry(arxivId: string, registry: PapersRegistry): boolean {
  const paperId = `arxiv-${arxivId}`;
  return paperId in registry.papers;
}

/**
 * Create a successful add paper result.
 */
function createAddResult(
  paperId: string,
  entry: PaperEntry,
  message: string,
  dryRun: boolean
): Result<AddPaperResult, RegistryError> {
  return { ok: true, value: { success: true, paperId, entry, message, dryRun } };
}

/**
 * Persist a paper entry to the registry file.
 */
async function persistPaperEntry(
  registry: PapersRegistry,
  paperId: string,
  entry: PaperEntry,
  rootDir: string | undefined
): Promise<Result<void, RegistryError>> {
  const updated: PapersRegistry = {
    schema_version: registry.schema_version,
    papers: { ...registry.papers, [paperId]: entry },
  };
  const saveResult = await savePapersRegistry(updated, rootDir);
  if (!saveResult.ok) {
    return {
      ok: false,
      error: createRegistryError(
        'SAVE_ERROR',
        `Failed to save papers registry: ${saveResult.error.message}`,
        paperId,
        saveResult.error
      ),
    };
  }
  return { ok: true, value: undefined };
}

/**
 * Add a paper entry to the registry.
 *
 * @param options - Options for adding the paper
 * @returns Result with AddPaperResult on success or RegistryError on failure
 */
export async function addPaperToRegistry(
  options: AddPaperOptions
): Promise<Result<AddPaperResult, RegistryError>> {
  const { metadata, topic, dryRun = false, rootDir } = options;
  const paperId = `arxiv-${metadata.id}`;

  const entryResult = generateRegistryEntry(metadata, topic);
  if (!entryResult.ok) return entryResult;
  const entry = entryResult.value;

  const loadResult = await loadPapersRegistry(rootDir);
  if (!loadResult.ok) {
    return {
      ok: false,
      error: createRegistryError(
        'LOAD_ERROR',
        `Failed to load papers registry: ${loadResult.error.message}`,
        paperId,
        loadResult.error
      ),
    };
  }

  if (paperExistsInRegistry(metadata.id, loadResult.value)) {
    return {
      ok: false,
      error: createRegistryError(
        'DUPLICATE',
        `Paper ${paperId} already exists in registry`,
        paperId
      ),
    };
  }

  if (dryRun) {
    return createAddResult(paperId, entry, `[DRY RUN] Would add paper: ${metadata.title}`, true);
  }

  const persistResult = await persistPaperEntry(loadResult.value, paperId, entry, rootDir);
  if (!persistResult.ok) return { ok: false, error: persistResult.error };

  return createAddResult(paperId, entry, `Added paper: ${metadata.title}`, false);
}
