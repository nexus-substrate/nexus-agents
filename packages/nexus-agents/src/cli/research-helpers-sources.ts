/**
 * Research Source Discovery Providers
 *
 * Functions for discovering research from external sources:
 * GitHub, Google AI, Meta FAIR, Microsoft Research, DeepMind.
 *
 * @module cli/research-helpers-sources
 * (Source: Research System Enhancement - Phase 3)
 * (Source: Issue #1136 — SCM token for GitHub search auth)
 */

import { z } from 'zod';
import type { Result } from '../core/result.js';
import { resolveToken } from '../scm/token-resolver.js';

// =============================================================================
// TYPES
// =============================================================================

/** Timeout for external API requests. */
const SOURCE_API_TIMEOUT_MS = 30_000;

/** Error codes for source discovery. */
export type DiscoverErrorCode = 'TIMEOUT' | 'NETWORK' | 'HTTP_ERROR' | 'PARSE_ERROR' | 'RATE_LIMIT';

/** Structured error for discovery failures. */
export interface DiscoverError {
  readonly code: DiscoverErrorCode;
  readonly message: string;
  readonly source: string;
  readonly cause?: unknown;
}

/** A discovered source item. */
export interface DiscoveredSource {
  readonly source: string;
  readonly title: string;
  readonly url: string;
  readonly description: string;
  readonly relevance: 'high' | 'medium' | 'low';
  readonly discoveredAt: string;
}

// =============================================================================
// ZOD SCHEMAS FOR EXTERNAL API RESPONSES
// =============================================================================

/** Zod schema for GitHub search API response. */
const GitHubRepoSchema = z.object({
  full_name: z.string().optional(),
  html_url: z.string().optional(),
  description: z.string().nullable().optional(),
  stargazers_count: z.number().optional(),
});

const GitHubSearchResponseSchema = z.object({
  items: z.array(GitHubRepoSchema).optional(),
});

// =============================================================================
// HELPERS
// =============================================================================
/** Creates a discover error. */
function createError(
  code: DiscoverErrorCode,
  source: string,
  message: string,
  cause?: unknown
): DiscoverError {
  return { code, message, source, cause };
}

/** Gets today's date in YYYY-MM-DD format (ET timezone). */
function getToday(): string {
  return new Date().toISOString().split('T')[0] ?? '';
}

// =============================================================================
// SHARED FETCH HELPER
// =============================================================================
/** Options for fetchSource helper. */
interface FetchSourceOptions {
  readonly url: string;
  readonly source: string;
  readonly headers?: Record<string, string>;
  readonly timeoutMs?: number;
}

/** Builds a typed error from a non-ok HTTP response.
 *
 * Surfaces rate-limiting separately so callers distinguish "your key is
 * missing / quota exhausted" from "the API is broken" (#2234). GitHub uses
 * GITHUB_TOKEN (not the *_API_KEY convention) — caught by the v5 pr_review
 * experiment when devex flagged the message pointing at a non-existent env
 * var. */
function buildHttpErrorResult(status: number, source: string): DiscoverError {
  const isRateLimit = status === 429;
  const envHint = source === 'github' ? 'GITHUB_TOKEN' : `${source.toUpperCase()}_API_KEY`;
  const message = isRateLimit
    ? `${source} rate-limited (HTTP 429) — set ${envHint} or retry later`
    : `API returned ${String(status)}`;
  return createError(isRateLimit ? 'RATE_LIMIT' : 'HTTP_ERROR', source, message);
}

/**
 * Shared fetch-and-error-handle helper for source providers.
 * Centralizes timeout handling, HTTP error detection, and error classification.
 */
export async function fetchSource(
  options: FetchSourceOptions
): Promise<Result<Response, DiscoverError>> {
  const { url, source, headers, timeoutMs = SOURCE_API_TIMEOUT_MS } = options;
  try {
    const fetchInit: RequestInit = { signal: AbortSignal.timeout(timeoutMs) };
    if (headers !== undefined) fetchInit.headers = headers;
    const response = await fetch(url, fetchInit);
    if (!response.ok) {
      return { ok: false, error: buildHttpErrorResult(response.status, source) };
    }
    return { ok: true, value: response };
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'TimeoutError';
    return {
      ok: false,
      error: createError(
        isTimeout ? 'TIMEOUT' : 'NETWORK',
        source,
        isTimeout ? `${source} API timed out` : `Network error querying ${source}`,
        error
      ),
    };
  }
}

// =============================================================================
// GITHUB DISCOVERY
// =============================================================================

/** Converts validated GitHub API response items to DiscoveredSource[]. */
function parseGitHubRepos(data: z.infer<typeof GitHubSearchResponseSchema>): DiscoveredSource[] {
  return (data.items ?? []).map((repo) => ({
    source: 'github',
    title: repo.full_name ?? '',
    url: repo.html_url ?? '',
    description: repo.description ?? '',
    relevance:
      (repo.stargazers_count ?? 0) > 1000
        ? 'high'
        : (repo.stargazers_count ?? 0) > 100
          ? 'medium'
          : 'low',
    discoveredAt: getToday(),
  }));
}

/**
 * Discover relevant GitHub repositories for a topic.
 *
 * @param topic - Search topic
 * @param maxResults - Maximum results (default 10)
 * @returns Result containing discovered repositories
 */
export async function discoverGitHubRepos(
  topic: string,
  maxResults = 10
): Promise<Result<DiscoveredSource[], DiscoverError>> {
  // GitHub's search API parses bare `OR` as a top-level operator, which
  // splits the query into two unrelated clauses and zeroes out matches
  // when the topic has multiple distinguishing tokens (#2234). Parenthesizing
  // qualifiers does NOT work either. Best fix: drop the language filter and
  // let the topic terms drive matching; downstream relevance scoring handles
  // quality. Confirmed empirically against api.github.com.
  const query = encodeURIComponent(topic);
  const url = `https://api.github.com/search/repositories?q=${query}&sort=stars&order=desc&per_page=${String(maxResults)}`;

  // Use SCM token-resolver for optional auth (Issue #1136)
  // Authenticated: 5000 req/hr; unauthenticated: 60 req/hr
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'nexus-agents',
  };
  const tokenResult = await resolveToken({ platform: 'github' });
  if (tokenResult.ok) {
    headers['Authorization'] = `Bearer ${tokenResult.value.value}`;
  }

  const fetchResult = await fetchSource({ url, source: 'github', headers });
  if (!fetchResult.ok) return fetchResult;

  let raw: unknown;
  try {
    raw = await fetchResult.value.json();
  } catch {
    return {
      ok: false,
      error: createError('PARSE_ERROR', 'github', 'Response is not valid JSON'),
    };
  }
  const parsed = GitHubSearchResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: createError('PARSE_ERROR', 'github', 'GitHub API response schema mismatch'),
    };
  }
  return { ok: true, value: parseGitHubRepos(parsed.data) };
}

// =============================================================================
// ARXIV-BASED DISCOVERY (shared helper)
// =============================================================================

/** Options for arXiv-based discovery. */
interface ArxivQueryOptions {
  readonly topic: string;
  readonly authorFilter: string;
  readonly maxResults: number;
  readonly sinceDate?: string | undefined;
}

/**
 * Builds an arXiv API search URL with targeted field queries.
 * Uses ti: (title) and abs: (abstract) instead of all: for better relevance.
 * Optionally adds a submittedDate range filter when sinceDate is provided.
 *
 * Exported for testability.
 */
export function buildArxivUrl(opts: ArxivQueryOptions): string {
  // OR-join keywords for multi-word queries and let arXiv rank by relevance;
  // the caller's coverage-based relevance filter (#3542) refines the set.
  // AND-joining every term required all of them to co-occur in one paper, which
  // returned 0 results for normal multi-word topics (#3543); and pairing OR with
  // a date sort would fetch recent-but-off-topic papers, so we sort by relevance.
  const words = opts.topic.split(/\s+/).filter((w) => w.length > 0);
  const topicQuery =
    words.length <= 1
      ? `(ti:${opts.topic} OR abs:${opts.topic})`
      : `(${words.map((w) => `ti:${w} OR abs:${w}`).join(' OR ')})`;
  let fullQuery = opts.authorFilter !== '' ? `${topicQuery} AND ${opts.authorFilter}` : topicQuery;

  // Add date range filter if sinceDate provided (format: YYYYMMDD)
  if (opts.sinceDate !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(opts.sinceDate)) {
    const dateNum = opts.sinceDate.replace(/-/g, '');
    const today = new Date().toISOString().split('T')[0]?.replace(/-/g, '') ?? '';
    fullQuery = `${fullQuery} AND submittedDate:[${dateNum} TO ${today}]`;
  }

  const encoded = encodeURIComponent(fullQuery);
  return `https://export.arxiv.org/api/query?search_query=${encoded}&start=0&max_results=${String(opts.maxResults)}&sortBy=relevance&sortOrder=descending`;
}

/**
 * Shared arXiv-based discovery provider. Used by Google AI, Meta FAIR,
 * Microsoft Research, and DeepMind discovery functions.
 */
async function discoverFromArxiv(
  topic: string,
  authorFilter: string,
  source: string,
  maxResults: number,
  sinceDate?: string
): Promise<Result<DiscoveredSource[], DiscoverError>> {
  const url = buildArxivUrl({ topic, authorFilter, maxResults, sinceDate });
  const fetchResult = await fetchSource({ url, source });
  if (!fetchResult.ok) return fetchResult;

  const xml = await fetchResult.value.text();
  const items = parseArxivEntries(xml, source, topic);
  return { ok: true, value: items };
}

// =============================================================================
// ARXIV DISCOVERY (direct, no author filter)
// =============================================================================

/**
 * Discover papers from arXiv without author affiliation filters.
 * Uses targeted ti:/abs: field queries for better relevance.
 *
 * @param topic - Search topic
 * @param maxResults - Maximum results (default 10)
 * @param sinceDate - Optional date filter (YYYY-MM-DD)
 * @returns Result containing discovered items
 */
export async function discoverArxiv(
  topic: string,
  maxResults = 10,
  sinceDate?: string
): Promise<Result<DiscoveredSource[], DiscoverError>> {
  return discoverFromArxiv(topic, '', 'arxiv', maxResults, sinceDate);
}

// =============================================================================
// GOOGLE AI DISCOVERY
// =============================================================================

/**
 * Discover Google AI research publications via arXiv with author affiliation filter.
 *
 * @param topic - Search topic
 * @param maxResults - Maximum results (default 10)
 * @returns Result containing discovered items
 */
export async function discoverGoogleAI(
  topic: string,
  maxResults = 10,
  sinceDate?: string
): Promise<Result<DiscoveredSource[], DiscoverError>> {
  // arXiv au: field only searches author names, not affiliations.
  // Drop author filter — use topic-only search (same quality as direct arxiv).
  return discoverFromArxiv(topic, '', 'google_ai', maxResults, sinceDate);
}

// =============================================================================
// META FAIR DISCOVERY
// =============================================================================

/**
 * Discover Meta FAIR research publications.
 *
 * @param topic - Search topic
 * @param maxResults - Maximum results (default 10)
 * @returns Result containing discovered items
 */
export async function discoverMetaFAIR(
  topic: string,
  maxResults = 10,
  sinceDate?: string
): Promise<Result<DiscoveredSource[], DiscoverError>> {
  // arXiv au: field only searches author names, not affiliations.
  // Drop author filter — use topic-only search (same quality as direct arxiv).
  return discoverFromArxiv(topic, '', 'meta_fair', maxResults, sinceDate);
}

// =============================================================================
// MICROSOFT RESEARCH DISCOVERY
// =============================================================================

/**
 * Discover Microsoft Research publications.
 *
 * @param topic - Search topic
 * @param maxResults - Maximum results (default 10)
 * @returns Result containing discovered items
 */
export async function discoverMicrosoftResearch(
  topic: string,
  maxResults = 10,
  sinceDate?: string
): Promise<Result<DiscoveredSource[], DiscoverError>> {
  // arXiv au: field only searches author names, not affiliations.
  // Drop author filter — use topic-only search (same quality as direct arxiv).
  return discoverFromArxiv(topic, '', 'microsoft', maxResults, sinceDate);
}

// =============================================================================
// DEEPMIND DISCOVERY
// =============================================================================

/**
 * Discover DeepMind research publications.
 *
 * @param topic - Search topic
 * @param maxResults - Maximum results (default 10)
 * @returns Result containing discovered items
 */
export async function discoverDeepMind(
  topic: string,
  maxResults = 10,
  sinceDate?: string
): Promise<Result<DiscoveredSource[], DiscoverError>> {
  // arXiv au: field only searches author names, not affiliations.
  // Drop author filter — use topic-only search (same quality as direct arxiv).
  return discoverFromArxiv(topic, '', 'deepmind', maxResults, sinceDate);
}

// =============================================================================
// SHARED PARSING
// =============================================================================

/** Extract a tag value from XML. */
function extractTag(entry: string, tag: string): string {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`<${escaped}>(.*?)</${escaped}>`, 's');
  return regex.exec(entry)?.[1]?.trim().replace(/\s+/g, ' ') ?? '';
}

/** Truncate text to max length. */
function truncate(text: string, maxLen = 200): string {
  return text.length > maxLen ? text.slice(0, maxLen - 3) + '...' : text;
}

/** Score relevance based on topic word match ratio in title. */
export function scoreRelevance(title: string, topic: string): 'high' | 'medium' | 'low' {
  const titleLower = title.toLowerCase();
  const topicWords = topic
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  if (topicWords.length === 0) return 'medium';
  const matched = topicWords.filter((w) => titleLower.includes(w)).length;
  const ratio = matched / topicWords.length;
  if (ratio >= 0.6) return 'high';
  if (ratio >= 0.3) return 'medium';
  return 'low';
}

/** Parse arXiv XML entries into DiscoveredSource items. */
function parseArxivEntries(xml: string, source: string, topic = ''): DiscoveredSource[] {
  const items: DiscoveredSource[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match: RegExpExecArray | null;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];
    if (entry === undefined) continue;
    const title = extractTag(entry, 'title');
    if (title === '') continue;
    const id = extractTag(entry, 'id');
    const arxivId = id.match(/(\d{4}\.\d{4,5})/)?.[1] ?? '';
    items.push({
      source,
      title,
      url: arxivId !== '' ? `https://arxiv.org/abs/${arxivId}` : id,
      description: truncate(extractTag(entry, 'summary')),
      relevance: topic !== '' ? scoreRelevance(title, topic) : 'medium',
      discoveredAt: getToday(),
    });
  }
  return items;
}
