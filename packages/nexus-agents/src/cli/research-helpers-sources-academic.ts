/**
 * Academic Source Discovery Providers
 *
 * Semantic Scholar, Papers with Code, and OpenAlex discovery providers.
 * Separate from research-helpers-sources.ts (anti-sprawl exception: new capability).
 *
 * @module cli/research-helpers-sources-academic
 * (Source: Research System Enhancement - Phase 2A/2B)
 * (OpenAlex: Issue #750)
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

/** Check if a Response has a non-JSON content type (e.g., HTML from redirect). */
function isNonJsonResponse(response: Response): boolean {
  const contentType = response.headers.get('content-type') ?? '';
  return contentType !== '' && !contentType.includes('application/json');
}

/**
 * Discover research papers from Papers with Code.
 *
 * NOTE: As of 2026-02, the PwC API redirects to HuggingFace and returns HTML
 * instead of JSON. This function handles that gracefully by detecting non-JSON
 * responses and returning an empty result set rather than a failure.
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

  // PwC API may redirect to HuggingFace and return HTML instead of JSON.
  if (isNonJsonResponse(fetchResult.value)) return { ok: true, value: [] };

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

// =============================================================================
// OPENALEX DISCOVERY (Issue #750)
// =============================================================================

/** Zod schema for OpenAlex work (paper). */
const OpenAlexWorkSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  doi: z.string().nullable().optional(),
  publication_date: z.string().nullable().optional(),
  cited_by_count: z.number().optional(),
  is_oa: z.boolean().optional(),
  abstract_inverted_index: z.record(z.array(z.number())).nullable().optional(),
  primary_location: z
    .object({
      landing_page_url: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  ids: z
    .object({
      openalex: z.string().optional(),
      doi: z.string().optional(),
    })
    .optional(),
});

const OpenAlexResponseSchema = z.object({
  results: z.array(OpenAlexWorkSchema).optional(),
});

/**
 * Reconstruct abstract from OpenAlex inverted index format.
 * OpenAlex stores abstracts as {word: [positions]} for compression.
 */
function reconstructAbstract(invertedIndex: Record<string, number[]> | null | undefined): string {
  if (!invertedIndex) return '';
  const words: Array<[string, number]> = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      words.push([word, pos]);
    }
  }
  words.sort((a, b) => a[1] - b[1]);
  return words.map(([w]) => w).join(' ');
}

/** Map validated OpenAlex work to DiscoveredSource. */
function mapOpenAlexWork(work: z.infer<typeof OpenAlexWorkSchema>): DiscoveredSource {
  const url = work.primary_location?.landing_page_url ?? work.ids?.doi ?? work.id ?? '';

  return {
    source: 'openalex',
    title: work.title ?? '',
    url,
    description: truncate(reconstructAbstract(work.abstract_inverted_index)),
    relevance: citationRelevance(work.cited_by_count ?? 0),
    discoveredAt: getToday(),
  };
}

/** Parse error for OpenAlex. */
function openAlexParseError(message: string): { ok: false; error: DiscoverError } {
  return { ok: false, error: { code: 'PARSE_ERROR', source: 'openalex', message } };
}

/**
 * Discover research papers from OpenAlex.
 *
 * OpenAlex is a free, open catalog of scholarly works with 250M+ papers.
 * Uses polite API with email parameter for higher rate limits.
 *
 * @param topic - Search topic
 * @param maxResults - Maximum results (default 10)
 * @param apiKey - Optional API key for authenticated access
 * @returns Result containing discovered papers
 */
export async function discoverOpenAlex(
  topic: string,
  maxResults = 10,
  apiKey?: string
): Promise<Result<DiscoveredSource[], DiscoverError>> {
  const query = encodeURIComponent(topic);
  // Use polite API with mailto for better rate limits
  const mailto = 'nexus-agents@example.com';
  const url = `https://api.openalex.org/works?search=${query}&per_page=${String(maxResults)}&mailto=${mailto}`;

  // Add API key if provided
  const headers: Record<string, string> = {
    'User-Agent': 'nexus-agents',
    Accept: 'application/json',
  };
  if (apiKey !== undefined && apiKey !== '') {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const fetchResult = await fetchSource({
    url,
    source: 'openalex',
    headers,
  });
  if (!fetchResult.ok) return fetchResult;

  let raw: unknown;
  try {
    raw = await fetchResult.value.json();
  } catch {
    return openAlexParseError('Response is not valid JSON');
  }

  const parsed = OpenAlexResponseSchema.safeParse(raw);
  if (!parsed.success) return openAlexParseError('Response schema mismatch');

  const items = (parsed.data.results ?? [])
    .filter((w) => w.title !== undefined && w.title !== '')
    .map(mapOpenAlexWork);

  return { ok: true, value: items };
}
