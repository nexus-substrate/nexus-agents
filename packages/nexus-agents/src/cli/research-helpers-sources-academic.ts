/**
 * Academic Source Discovery Providers
 *
 * Semantic Scholar and Papers with Code discovery providers.
 * Separate from research-helpers-sources.ts (anti-sprawl exception: new capability).
 *
 * @module cli/research-helpers-sources-academic
 * (Source: Research System Enhancement - Phase 2A/2B)
 */

import type { Result } from '../core/result.js';
import type { DiscoverError, DiscoveredSource } from './research-helpers-sources.js';

/** Timeout for external API requests. */
const ACADEMIC_API_TIMEOUT_MS = 30_000;

// =============================================================================
// HELPERS
// =============================================================================

/** Creates a discover error. */
function createError(
  code: DiscoverError['code'],
  source: string,
  message: string,
  cause?: unknown
): DiscoverError {
  return { code, message, source, cause };
}

/** Gets today's date in YYYY-MM-DD format. */
function getToday(): string {
  return new Date().toISOString().split('T')[0] ?? '';
}

// =============================================================================
// SEMANTIC SCHOLAR DISCOVERY
// =============================================================================

/** Semantic Scholar API paper result. */
interface SemanticScholarPaper {
  paperId?: string;
  title?: string;
  url?: string;
  abstract?: string;
  citationCount?: number;
  year?: number;
  isOpenAccess?: boolean;
  externalIds?: { ArXiv?: string; DOI?: string };
}

/** Determine relevance from citation count. */
function citationRelevance(count: number): 'high' | 'medium' | 'low' {
  if (count > 100) return 'high';
  if (count > 20) return 'medium';
  return 'low';
}

/** Truncate text to max length. */
function truncate(text: string, maxLen = 200): string {
  return text.length > maxLen ? text.slice(0, maxLen - 3) + '...' : text;
}

/** Map Semantic Scholar paper to DiscoveredSource. */
function mapSemanticScholarPaper(paper: SemanticScholarPaper): DiscoveredSource {
  const arxivId = paper.externalIds?.ArXiv;
  const paperUrl =
    arxivId !== undefined
      ? `https://arxiv.org/abs/${arxivId}`
      : (paper.url ?? `https://api.semanticscholar.org/paper/${paper.paperId ?? ''}`);

  return {
    source: 'semantic_scholar',
    title: paper.title ?? '',
    url: paperUrl,
    description: truncate(paper.abstract ?? ''),
    relevance: citationRelevance(paper.citationCount ?? 0),
    discoveredAt: getToday(),
  };
}

/**
 * Discover research papers from Semantic Scholar.
 *
 * @param topic - Search topic
 * @param maxResults - Maximum results (default 10)
 * @returns Result containing discovered papers
 */
export async function discoverSemanticScholar(
  topic: string,
  maxResults = 10
): Promise<Result<DiscoveredSource[], DiscoverError>> {
  const query = encodeURIComponent(topic);
  const fields = 'title,url,abstract,citationCount,year,isOpenAccess,externalIds';
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${query}&limit=${String(maxResults)}&fields=${fields}&sort=citationCount:desc`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(ACADEMIC_API_TIMEOUT_MS),
      headers: { 'User-Agent': 'nexus-agents' },
    });

    if (!response.ok) {
      return {
        ok: false,
        error: createError(
          'HTTP_ERROR',
          'semantic_scholar',
          `Semantic Scholar API returned ${String(response.status)}`
        ),
      };
    }

    const data = (await response.json()) as { data?: SemanticScholarPaper[] };
    const items = (data.data ?? [])
      .filter((p) => p.title !== undefined && p.title !== '')
      .map(mapSemanticScholarPaper);

    return { ok: true, value: items };
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'TimeoutError';
    return {
      ok: false,
      error: createError(
        isTimeout ? 'TIMEOUT' : 'NETWORK',
        'semantic_scholar',
        isTimeout ? 'Semantic Scholar API timed out' : 'Network error querying Semantic Scholar',
        error
      ),
    };
  }
}

// =============================================================================
// PAPERS WITH CODE DISCOVERY
// =============================================================================

/** Papers with Code API paper result. */
interface PapersWithCodePaper {
  id?: string;
  title?: string;
  url_abs?: string;
  url_pdf?: string;
  abstract?: string;
  proceeding?: string;
  repository_count?: number;
}

/**
 * Discover research papers from Papers with Code.
 *
 * @param topic - Search topic
 * @param maxResults - Maximum results (default 10)
 * @returns Result containing discovered papers with code
 */
export async function discoverPapersWithCode(
  topic: string,
  maxResults = 10
): Promise<Result<DiscoveredSource[], DiscoverError>> {
  const query = encodeURIComponent(topic);
  const url = `https://paperswithcode.com/api/v1/papers/?q=${query}&items_per_page=${String(maxResults)}`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(ACADEMIC_API_TIMEOUT_MS),
      headers: { 'User-Agent': 'nexus-agents' },
    });

    if (!response.ok) {
      return {
        ok: false,
        error: createError(
          'HTTP_ERROR',
          'papers_with_code',
          `Papers with Code API returned ${String(response.status)}`
        ),
      };
    }

    const data = (await response.json()) as { results?: PapersWithCodePaper[] };
    const papers = data.results ?? [];

    const items: DiscoveredSource[] = papers
      .filter((p) => p.title !== undefined && p.title !== '')
      .map((paper) => {
        const hasCode = (paper.repository_count ?? 0) > 0;
        return {
          source: 'papers_with_code',
          title: paper.title ?? '',
          url: paper.url_abs ?? '',
          description: truncate(paper.abstract ?? ''),
          relevance: hasCode ? 'high' : 'medium',
          discoveredAt: getToday(),
        };
      });

    return { ok: true, value: items };
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'TimeoutError';
    return {
      ok: false,
      error: createError(
        isTimeout ? 'TIMEOUT' : 'NETWORK',
        'papers_with_code',
        isTimeout ? 'Papers with Code API timed out' : 'Network error querying Papers with Code',
        error
      ),
    };
  }
}
