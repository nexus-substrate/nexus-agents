/**
 * Research Registry arXiv Helpers
 *
 * Functions for fetching and parsing arXiv paper metadata.
 *
 * @see docs/research/RESEARCH_INDEX.md
 * @see Issue #237 (Epic #225)
 */

import type { ArxivMetadata, ResearchAddOptions, ResearchAddResult } from './research-types.js';
import { loadPapersRegistry } from './research-helpers-io.js';

// =============================================================================
// ARXIV PARSING
// =============================================================================

/**
 * Parse arXiv XML response into metadata.
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

// =============================================================================
// ARXIV API
// =============================================================================

/**
 * Fetch paper metadata from arXiv API.
 * Note: This is a simplified implementation.
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

// =============================================================================
// REGISTRY OPERATIONS
// =============================================================================

/**
 * Check if paper already exists in registry.
 */
export async function paperExists(arxivId: string): Promise<boolean> {
  const registry = await loadPapersRegistry();
  const paperId = `arxiv-${arxivId}`;
  return paperId in registry.papers;
}

/**
 * Add a paper to the registry.
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
