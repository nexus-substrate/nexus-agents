/**
 * Academic Source Discovery Providers
 *
 * Semantic Scholar and Papers with Code discovery providers.
 * Separate from research-helpers-sources.ts (anti-sprawl exception: new capability).
 *
 * @module cli/research-helpers-sources-academic
 * (Source: Research System Enhancement - Phase 2A/2B)
 */

import { z } from 'zod';
import type { Result } from '../core/result.js';
import type { DiscoverError, DiscoveredSource } from './research-helpers-sources.js';
import { fetchSource } from './research-helpers-sources.js';

// =============================================================================
// HELPERS
// =============================================================================

/** Gets today's date in YYYY-MM-DD format. */
function getToday(): string {
  return new Date().toISOString().split('T')[0] ?? '';
}

/** Truncate text to max length. */
function truncate(text: string, maxLen = 200): string {
  return text.length > maxLen ? text.slice(0, maxLen - 3) + '...' : text;
}

// =============================================================================
// ZOD SCHEMAS FOR EXTERNAL API RESPONSES
// =============================================================================

/** Zod schema for Semantic Scholar paper. */
const SemanticScholarPaperSchema = z.object({
  paperId: z.string().optional(),
  title: z.string().optional(),
  url: z.string().optional(),
  abstract: z.string().nullable().optional(),
  citationCount: z.number().optional(),
  year: z.number().optional(),
  isOpenAccess: z.boolean().optional(),
  externalIds: z
    .object({
      ArXiv: z.string().optional(),
      DOI: z.string().optional(),
    })
    .optional(),
});

const SemanticScholarResponseSchema = z.object({
  data: z.array(SemanticScholarPaperSchema).optional(),
});

/** Zod schema for Papers with Code paper. */
const PapersWithCodePaperSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  url_abs: z.string().optional(),
  url_pdf: z.string().optional(),
  abstract: z.string().nullable().optional(),
  proceeding: z.string().nullable().optional(),
  repository_count: z.number().optional(),
});

const PapersWithCodeResponseSchema = z.object({
  results: z.array(PapersWithCodePaperSchema).optional(),
});

// =============================================================================
// SEMANTIC SCHOLAR DISCOVERY
// =============================================================================

/** Determine relevance from citation count. */
function citationRelevance(count: number): 'high' | 'medium' | 'low' {
  if (count > 100) return 'high';
  if (count > 20) return 'medium';
  return 'low';
}

/** Map validated Semantic Scholar paper to DiscoveredSource. */
function mapSemanticScholarPaper(
  paper: z.infer<typeof SemanticScholarPaperSchema>
): DiscoveredSource {
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
  // Note: sort parameter only works on /paper/search/bulk, not /paper/search
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${query}&limit=${String(maxResults)}&fields=${fields}`;

  const fetchResult = await fetchSource({
    url,
    source: 'semantic_scholar',
    headers: { 'User-Agent': 'nexus-agents', Accept: 'application/json' },
  });
  if (!fetchResult.ok) return fetchResult;

  let raw: unknown;
  try {
    raw = await fetchResult.value.json();
  } catch {
    return {
      ok: false,
      error: {
        code: 'PARSE_ERROR',
        source: 'semantic_scholar',
        message: 'Response is not valid JSON',
      },
    };
  }
  const parsed = SemanticScholarResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'PARSE_ERROR',
        source: 'semantic_scholar',
        message: 'Response schema mismatch',
      },
    };
  }

  const items = (parsed.data.data ?? [])
    .filter((p) => p.title !== undefined && p.title !== '')
    .map(mapSemanticScholarPaper);

  return { ok: true, value: items };
}

// =============================================================================
// PAPERS WITH CODE DISCOVERY
// =============================================================================

/** Map validated PwC paper to DiscoveredSource. */
function mapPwcPaper(paper: z.infer<typeof PapersWithCodePaperSchema>): DiscoveredSource {
  const hasCode = (paper.repository_count ?? 0) > 0;
  return {
    source: 'papers_with_code',
    title: paper.title ?? '',
    url: paper.url_abs ?? '',
    description: truncate(paper.abstract ?? ''),
    relevance: hasCode ? 'high' : 'medium',
    discoveredAt: getToday(),
  };
}

/** Parse error for a source. */
function pwcParseError(message: string): { ok: false; error: DiscoverError } {
  return { ok: false, error: { code: 'PARSE_ERROR', source: 'papers_with_code', message } };
}

/**
 * Discover research papers from Papers with Code.
 */
export async function discoverPapersWithCode(
  topic: string,
  maxResults = 10
): Promise<Result<DiscoveredSource[], DiscoverError>> {
  const query = encodeURIComponent(topic);
  const url = `https://paperswithcode.com/api/v1/papers/?q=${query}&items_per_page=${String(maxResults)}`;

  const fetchResult = await fetchSource({
    url,
    source: 'papers_with_code',
    headers: { 'User-Agent': 'nexus-agents', Accept: 'application/json' },
  });
  if (!fetchResult.ok) return fetchResult;

  let raw: unknown;
  try {
    raw = await fetchResult.value.json();
  } catch {
    return pwcParseError('Response is not valid JSON (possible HTML error page)');
  }
  const parsed = PapersWithCodeResponseSchema.safeParse(raw);
  if (!parsed.success) return pwcParseError('Response schema mismatch');

  const items = (parsed.data.results ?? [])
    .filter((p) => p.title !== undefined && p.title !== '')
    .map(mapPwcPaper);

  return { ok: true, value: items };
}
