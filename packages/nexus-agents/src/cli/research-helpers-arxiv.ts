/**
 * Research Registry arXiv Helpers
 *
 * Functions for fetching and parsing arXiv paper metadata.
 *
 * @see docs/research/RESEARCH_INDEX.md
 * @see Issue #237 (Epic #225)
 * @see Issue #350 (timeout configuration)
 */

import type { Result } from '../core/result.js';
import type { ArxivMetadata, ResearchAddOptions, ResearchAddResult } from './research-types.js';
import { loadPapersRegistry } from './research-helpers-io.js';
import { addPaperToRegistry } from './research-helpers-registry.js';
import { API_TIMEOUTS } from '../config/timeouts.js';

/** Timeout for arXiv API requests in milliseconds. */
const ARXIV_API_TIMEOUT_MS = API_TIMEOUTS.arxivMs;

/**
 * Error codes for arXiv API operations.
 */
export type ArxivFetchErrorCode = 'TIMEOUT' | 'NETWORK' | 'HTTP_ERROR' | 'PARSE_ERROR';

/**
 * Structured error for arXiv fetch failures.
 */
export interface ArxivFetchError {
  readonly code: ArxivFetchErrorCode;
  readonly message: string;
  readonly arxivId: string;
  readonly cause?: unknown;
}

// =============================================================================
// ARXIV PARSING
// =============================================================================

/**
 * Extracts the first &lt;entry&gt; block from arXiv Atom XML to avoid
 * matching feed-level metadata (e.g., feed title "arXiv Query: ...").
 */
function extractEntryXml(xml: string): string {
  const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
  return entryMatch?.[1] ?? xml;
}

/**
 * Parse arXiv XML response into metadata.
 */
function parseArxivXml(arxivId: string, xml: string): ArxivMetadata | null {
  const entryXml = extractEntryXml(xml);

  const titleMatch = entryXml.match(/<title>([^<]+)<\/title>/);
  const summaryMatch = entryXml.match(/<summary>([^<]+)<\/summary>/s);
  const publishedMatch = entryXml.match(/<published>([^<]+)<\/published>/);

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

// =============================================================================
// ARXIV API
// =============================================================================

/**
 * Creates a structured arXiv fetch error.
 */
function createArxivError(
  code: ArxivFetchErrorCode,
  arxivId: string,
  message: string,
  cause?: unknown
): ArxivFetchError {
  return { code, message, arxivId, cause };
}

/**
 * Determines error code from caught exception.
 */
function getErrorCodeFromException(err: unknown): ArxivFetchErrorCode {
  if (err instanceof Error && err.name === 'TimeoutError') {
    return 'TIMEOUT';
  }
  return 'NETWORK';
}

/**
 * Fetch paper metadata from arXiv API with timeout and structured error handling.
 *
 * @param arxivId - The arXiv paper ID (e.g., "2401.12345")
 * @returns Result containing metadata or structured error
 */
export async function fetchArxivMetadataResult(
  arxivId: string
): Promise<Result<ArxivMetadata, ArxivFetchError>> {
  const url = `https://export.arxiv.org/api/query?id_list=${arxivId}`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(ARXIV_API_TIMEOUT_MS),
    });

    if (!response.ok) {
      return {
        ok: false,
        error: createArxivError(
          'HTTP_ERROR',
          arxivId,
          `arXiv API returned ${String(response.status)} ${response.statusText}`
        ),
      };
    }

    const xml = await response.text();
    const metadata = parseArxivXml(arxivId, xml);

    if (metadata === null) {
      return {
        ok: false,
        error: createArxivError('PARSE_ERROR', arxivId, 'Failed to parse arXiv XML response'),
      };
    }

    return { ok: true, value: metadata };
  } catch (err) {
    const code = getErrorCodeFromException(err);
    const message =
      code === 'TIMEOUT'
        ? `arXiv API request timed out after ${String(ARXIV_API_TIMEOUT_MS / 1000)} seconds`
        : 'Network error while fetching from arXiv API';
    return { ok: false, error: createArxivError(code, arxivId, message, err) };
  }
}

// =============================================================================
// REGISTRY OPERATIONS
// =============================================================================

/**
 * Check if paper already exists in registry.
 * Returns false if registry cannot be loaded.
 */
export async function paperExists(arxivId: string): Promise<boolean> {
  const result = await loadPapersRegistry();
  if (!result.ok) {
    return false;
  }
  const paperId = `arxiv-${arxivId}`;
  return paperId in result.value.papers;
}

/**
 * Add a paper to the registry.
 *
 * Fetches paper metadata from arXiv API, generates a registry entry,
 * and persists it to docs/research/registry/papers.yaml.
 *
 * @param options - Options for adding the paper
 * @returns Result indicating success or failure with details
 *
 * @see Issue #299 - Auto-add papers to registry from arXiv fetch
 */
export async function addResearchPaper(options: ResearchAddOptions): Promise<ResearchAddResult> {
  const paperId = `arxiv-${options.arxivId}`;

  // Fetch metadata using Result pattern
  const metadataResult = await fetchArxivMetadataResult(options.arxivId);
  if (!metadataResult.ok) {
    return {
      success: false,
      paperId,
      title: '',
      message: `Could not fetch metadata for arXiv ID ${options.arxivId}: ${metadataResult.error.message}`,
      dryRun: options.dryRun,
    };
  }
  const metadata = metadataResult.value;

  // Add to registry using the registry helper
  const addOptions: {
    metadata: ArxivMetadata;
    topic?: string;
    dryRun?: boolean;
  } = {
    metadata,
    dryRun: options.dryRun,
  };
  if (options.topic !== undefined) {
    addOptions.topic = options.topic;
  }
  const addResult = await addPaperToRegistry(addOptions);

  if (!addResult.ok) {
    return {
      success: false,
      paperId,
      title: metadata.title,
      message: addResult.error.message,
      dryRun: options.dryRun,
    };
  }

  return {
    success: addResult.value.success,
    paperId: addResult.value.paperId,
    title: metadata.title,
    message: addResult.value.message,
    dryRun: addResult.value.dryRun,
  };
}
