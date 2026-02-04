/**
 * Research Source Discovery Providers
 *
 * Functions for discovering research from external sources:
 * GitHub, Google AI, Meta FAIR, Microsoft Research, DeepMind.
 *
 * @module cli/research-helpers-sources
 * (Source: Research System Enhancement - Phase 3)
 */

import type { Result } from '../core/result.js';

// =============================================================================
// TYPES
// =============================================================================

/** Timeout for external API requests. */
const SOURCE_API_TIMEOUT_MS = 30_000;

/** Error codes for source discovery. */
export type DiscoverErrorCode = 'TIMEOUT' | 'NETWORK' | 'HTTP_ERROR' | 'PARSE_ERROR';

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
// GITHUB DISCOVERY
// =============================================================================

/** Converts GitHub API response items to DiscoveredSource[]. */
function parseGitHubRepos(data: {
  items?: Array<{
    full_name?: string;
    html_url?: string;
    description?: string;
    stargazers_count?: number;
  }>;
}): DiscoveredSource[] {
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
  const query = encodeURIComponent(`${topic} language:python language:typescript`);
  const url = `https://api.github.com/search/repositories?q=${query}&sort=stars&order=desc&per_page=${String(maxResults)}`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(SOURCE_API_TIMEOUT_MS),
      headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'nexus-agents' },
    });

    if (!response.ok) {
      return {
        ok: false,
        error: createError(
          'HTTP_ERROR',
          'github',
          `GitHub API returned ${String(response.status)}`
        ),
      };
    }

    const data = (await response.json()) as Parameters<typeof parseGitHubRepos>[0];
    return { ok: true, value: parseGitHubRepos(data) };
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'TimeoutError';
    return {
      ok: false,
      error: createError(
        isTimeout ? 'TIMEOUT' : 'NETWORK',
        'github',
        isTimeout ? 'GitHub API timed out' : 'Network error querying GitHub',
        error
      ),
    };
  }
}

// =============================================================================
// GOOGLE AI DISCOVERY
// =============================================================================

/**
 * Discover Google AI research publications.
 * Uses Google AI Blog RSS/sitemap as a proxy since there's no public API.
 *
 * @param topic - Search topic
 * @param maxResults - Maximum results (default 10)
 * @returns Result containing discovered items
 */
export async function discoverGoogleAI(
  topic: string,
  maxResults = 10
): Promise<Result<DiscoveredSource[], DiscoverError>> {
  // Google AI doesn't have a public search API; use arXiv with Google affiliation
  const query = encodeURIComponent(
    `all:${topic} AND (au:"Google Research" OR au:"Google DeepMind" OR au:"Google Brain")`
  );
  const url = `https://export.arxiv.org/api/query?search_query=${query}&start=0&max_results=${String(maxResults)}&sortBy=submittedDate&sortOrder=descending`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(SOURCE_API_TIMEOUT_MS),
    });
    if (!response.ok) {
      return {
        ok: false,
        error: createError(
          'HTTP_ERROR',
          'google_ai',
          `arXiv API returned ${String(response.status)}`
        ),
      };
    }

    const xml = await response.text();
    const items = parseArxivEntries(xml, 'google_ai', topic);
    return { ok: true, value: items };
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'TimeoutError';
    return {
      ok: false,
      error: createError(
        isTimeout ? 'TIMEOUT' : 'NETWORK',
        'google_ai',
        isTimeout ? 'Google AI discovery timed out' : 'Network error',
        error
      ),
    };
  }
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
  maxResults = 10
): Promise<Result<DiscoveredSource[], DiscoverError>> {
  const query = encodeURIComponent(
    `all:${topic} AND (au:"Meta AI" OR au:FAIR OR au:"Meta Research")`
  );
  const url = `https://export.arxiv.org/api/query?search_query=${query}&start=0&max_results=${String(maxResults)}&sortBy=submittedDate&sortOrder=descending`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(SOURCE_API_TIMEOUT_MS),
    });
    if (!response.ok) {
      return {
        ok: false,
        error: createError(
          'HTTP_ERROR',
          'meta_fair',
          `arXiv API returned ${String(response.status)}`
        ),
      };
    }

    const xml = await response.text();
    const items = parseArxivEntries(xml, 'meta_fair', topic);
    return { ok: true, value: items };
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'TimeoutError';
    return {
      ok: false,
      error: createError(
        isTimeout ? 'TIMEOUT' : 'NETWORK',
        'meta_fair',
        isTimeout ? 'Meta FAIR discovery timed out' : 'Network error',
        error
      ),
    };
  }
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
  maxResults = 10
): Promise<Result<DiscoveredSource[], DiscoverError>> {
  const query = encodeURIComponent(`all:${topic} AND (au:"Microsoft Research" OR au:MSR)`);
  const url = `https://export.arxiv.org/api/query?search_query=${query}&start=0&max_results=${String(maxResults)}&sortBy=submittedDate&sortOrder=descending`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(SOURCE_API_TIMEOUT_MS),
    });
    if (!response.ok) {
      return {
        ok: false,
        error: createError(
          'HTTP_ERROR',
          'microsoft',
          `arXiv API returned ${String(response.status)}`
        ),
      };
    }

    const xml = await response.text();
    const items = parseArxivEntries(xml, 'microsoft', topic);
    return { ok: true, value: items };
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'TimeoutError';
    return {
      ok: false,
      error: createError(
        isTimeout ? 'TIMEOUT' : 'NETWORK',
        'microsoft',
        isTimeout ? 'Microsoft Research discovery timed out' : 'Network error',
        error
      ),
    };
  }
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
  maxResults = 10
): Promise<Result<DiscoveredSource[], DiscoverError>> {
  const query = encodeURIComponent(`all:${topic} AND (au:DeepMind OR au:"Google DeepMind")`);
  const url = `https://export.arxiv.org/api/query?search_query=${query}&start=0&max_results=${String(maxResults)}&sortBy=submittedDate&sortOrder=descending`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(SOURCE_API_TIMEOUT_MS),
    });
    if (!response.ok) {
      return {
        ok: false,
        error: createError(
          'HTTP_ERROR',
          'deepmind',
          `arXiv API returned ${String(response.status)}`
        ),
      };
    }

    const xml = await response.text();
    const items = parseArxivEntries(xml, 'deepmind', topic);
    return { ok: true, value: items };
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'TimeoutError';
    return {
      ok: false,
      error: createError(
        isTimeout ? 'TIMEOUT' : 'NETWORK',
        'deepmind',
        isTimeout ? 'DeepMind discovery timed out' : 'Network error',
        error
      ),
    };
  }
}

// =============================================================================
// SHARED PARSING
// =============================================================================

/** Extract a tag value from XML. */
function extractTag(entry: string, tag: string): string {
  const regex = new RegExp(`<${tag}>(.*?)</${tag}>`, 's');
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
