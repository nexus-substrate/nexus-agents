/**
 * Tests for research source discovery providers.
 *
 * @module cli/research-helpers-sources.test
 * (Source: Research System Enhancement - Phase 4)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  discoverGitHubRepos,
  discoverGoogleAI,
  discoverMetaFAIR,
  discoverMicrosoftResearch,
  discoverDeepMind,
  discoverArxiv,
  fetchSource,
  scoreRelevance,
  buildArxivUrl,
} from './research-helpers-sources.js';

// Mock global fetch
const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('scoreRelevance', () => {
  it('should return high for strong topic match', () => {
    expect(scoreRelevance('Multi-Agent Orchestration System', 'multi agent orchestration')).toBe(
      'high'
    );
  });

  it('should return medium for partial match', () => {
    expect(scoreRelevance('Agent-Based Modeling', 'multi agent orchestration')).toBe('medium');
  });

  it('should return low for weak match', () => {
    expect(scoreRelevance('Quantum Computing Overview', 'multi agent orchestration')).toBe('low');
  });

  it('should return medium for empty topic', () => {
    expect(scoreRelevance('Any Title', '')).toBe('medium');
  });

  it('should ignore short words (≤2 chars)', () => {
    expect(scoreRelevance('AI and ML', 'AI ML')).toBe('medium');
  });
});

describe('discoverGitHubRepos', () => {
  it('should parse GitHub API response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          items: [
            {
              full_name: 'org/repo',
              html_url: 'https://github.com/org/repo',
              description: 'Test repo',
              stargazers_count: 1500,
            },
            {
              full_name: 'org/repo2',
              html_url: 'https://github.com/org/repo2',
              description: 'Small repo',
              stargazers_count: 50,
            },
          ],
        }),
    });

    const result = await discoverGitHubRepos('orchestration', 10);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
      expect(result.value[0]?.source).toBe('github');
      expect(result.value[0]?.relevance).toBe('high'); // >1000 stars
      expect(result.value[1]?.relevance).toBe('low'); // <100 stars
    }
  });

  it('should handle HTTP errors', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });
    const result = await discoverGitHubRepos('test', 5);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('HTTP_ERROR');
  });

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));
    const result = await discoverGitHubRepos('test', 5);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NETWORK');
  });

  it('should handle timeout errors', async () => {
    const timeoutError = new Error('timed out');
    timeoutError.name = 'TimeoutError';
    mockFetch.mockRejectedValueOnce(timeoutError);
    const result = await discoverGitHubRepos('test', 5);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('TIMEOUT');
  });

  it('should not include language filter (#2234 — bare OR poisoned the search)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ items: [] }),
    });
    await discoverGitHubRepos('agent orchestration', 5);
    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    const decoded = decodeURIComponent(calledUrl);
    // Bare `OR` between qualifiers caused GitHub to interpret the query as a
    // top-level disjunction and zero out matches when the topic had multiple
    // distinguishing tokens. The fix drops the language filter entirely;
    // downstream relevance scoring handles quality.
    expect(decoded).not.toContain('language:python');
    expect(decoded).not.toContain('language:typescript');
    expect(decoded).toContain('agent orchestration');
  });

  it('should pass topic verbatim into the GitHub search query (#2234)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ items: [] }),
    });
    await discoverGitHubRepos('SWE-agent OpenHands autonomous coding agent', 5);
    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    const decoded = decodeURIComponent(calledUrl);
    expect(decoded).toContain('SWE-agent OpenHands autonomous coding agent');
  });
});

describe('fetchSource', () => {
  it('should return response on success', async () => {
    const mockResponse = { ok: true, status: 200 };
    mockFetch.mockResolvedValueOnce(mockResponse);
    const result = await fetchSource({ url: 'https://example.com', source: 'test' });
    expect(result.ok).toBe(true);
  });

  it('should return RATE_LIMIT on 429 with actionable message (#2234)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429 });
    const result = await fetchSource({ url: 'https://example.com', source: 'semantic_scholar' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('RATE_LIMIT');
      expect(result.error.source).toBe('semantic_scholar');
      // Message must hint at the API-key escape hatch so users aren't stuck.
      expect(result.error.message).toContain('SEMANTIC_SCHOLAR_API_KEY');
    }
  });

  it('should hint GITHUB_TOKEN (not GITHUB_API_KEY) on github 429 — caught by v5 experiment', async () => {
    // Caught by the pr_review v5 experiment (#2241): GitHub uses GITHUB_TOKEN,
    // not the *_API_KEY convention other sources use. The original message
    // pointed users at a non-existent env var.
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429 });
    const result = await fetchSource({ url: 'https://example.com', source: 'github' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('GITHUB_TOKEN');
      expect(result.error.message).not.toContain('GITHUB_API_KEY');
    }
  });

  it('should return HTTP_ERROR on non-429 non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const result = await fetchSource({ url: 'https://example.com', source: 'test' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('HTTP_ERROR');
      expect(result.error.source).toBe('test');
    }
  });

  it('should return TIMEOUT on timeout error', async () => {
    const err = new Error('timed out');
    err.name = 'TimeoutError';
    mockFetch.mockRejectedValueOnce(err);
    const result = await fetchSource({ url: 'https://example.com', source: 'test' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('TIMEOUT');
  });

  it('should return NETWORK on generic error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('DNS fail'));
    const result = await fetchSource({ url: 'https://example.com', source: 'test' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NETWORK');
  });

  it('should pass custom headers when provided', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    await fetchSource({
      url: 'https://example.com',
      source: 'test',
      headers: { Authorization: 'Bearer token' },
    });
    const callArgs = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(callArgs[1].headers).toEqual({ Authorization: 'Bearer token' });
  });
});

describe('discoverGitHubRepos - Zod validation', () => {
  it('should return PARSE_ERROR on invalid schema', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve('not an object'),
    });
    const result = await discoverGitHubRepos('test', 5);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('PARSE_ERROR');
  });
});

describe('discoverArxiv', () => {
  const arxivXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed>
  <entry>
    <id>http://arxiv.org/abs/2401.12345v1</id>
    <title>Multi-Agent Orchestration</title>
    <summary>A paper about agents.</summary>
  </entry>
</feed>`;

  it('should discover papers without author filter', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(arxivXml),
    });
    const result = await discoverArxiv('orchestration', 10);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.source).toBe('arxiv');
      expect(result.value[0]?.url).toContain('2401.12345');
    }
  });

  it('should use ti:/abs: query prefix', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('<feed></feed>'),
    });
    await discoverArxiv('agent memory', 5);
    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('ti%3A');
    expect(calledUrl).toContain('abs%3A');
    expect(calledUrl).not.toContain('all%3A');
  });

  it('should OR-join multi-word topic terms and sort by relevance (#3543)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('<feed></feed>'),
    });
    await discoverArxiv('agent memory consolidation', 5);
    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    const decoded = decodeURIComponent(calledUrl);
    // Multi-word topics OR-join terms (any may match); coverage-based relevance
    // scoring refines downstream. AND-joining every term returned 0 results (#3543).
    expect(decoded).toContain('ti:agent OR abs:agent');
    expect(decoded).toContain('ti:memory OR abs:memory');
    expect(decoded).toContain('ti:consolidation OR abs:consolidation');
    expect(decoded).not.toContain(') AND (ti:');
    expect(decoded).toContain('sortBy=relevance');
  });

  it('should not quote single-word topics', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('<feed></feed>'),
    });
    await discoverArxiv('orchestration', 5);
    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    const decoded = decodeURIComponent(calledUrl);
    expect(decoded).toContain('ti:orchestration');
    expect(decoded).not.toContain('"orchestration"');
  });

  it('should include submittedDate filter when sinceDate is provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('<feed></feed>'),
    });
    await discoverArxiv('agents', 5, '2025-01-15');
    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    const decoded = decodeURIComponent(calledUrl);
    expect(decoded).toContain('submittedDate:[20250115 TO');
  });

  it('should not include date filter when sinceDate is absent', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('<feed></feed>'),
    });
    await discoverArxiv('agents', 5);
    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    const decoded = decodeURIComponent(calledUrl);
    expect(decoded).not.toContain('submittedDate:[');
  });
});

describe('arXiv-based providers', () => {
  const arxivXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed>
  <entry>
    <id>http://arxiv.org/abs/2401.12345v1</id>
    <title>Multi-Agent Orchestration</title>
    <summary>A paper about agents.</summary>
  </entry>
</feed>`;

  const providers = [
    { name: 'discoverGoogleAI', fn: discoverGoogleAI, source: 'google_ai' },
    { name: 'discoverMetaFAIR', fn: discoverMetaFAIR, source: 'meta_fair' },
    { name: 'discoverMicrosoftResearch', fn: discoverMicrosoftResearch, source: 'microsoft' },
    { name: 'discoverDeepMind', fn: discoverDeepMind, source: 'deepmind' },
  ] as const;

  for (const { name, fn, source } of providers) {
    describe(name, () => {
      it('should parse arXiv XML response', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(arxivXml),
        });

        const result = await fn('orchestration', 10);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).toHaveLength(1);
          expect(result.value[0]?.source).toBe(source);
          expect(result.value[0]?.title).toBe('Multi-Agent Orchestration');
          expect(result.value[0]?.url).toContain('2401.12345');
        }
      });

      it('should handle HTTP errors', async () => {
        mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
        const result = await fn('test', 5);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('HTTP_ERROR');
      });

      it('should handle network errors', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network failure'));
        const result = await fn('test', 5);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('NETWORK');
      });

      it('should use ti:/abs: query prefix', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve('<feed></feed>'),
        });
        await fn('agent memory', 5);
        const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
        expect(calledUrl).toContain('ti%3A');
        expect(calledUrl).toContain('abs%3A');
        expect(calledUrl).not.toContain('all%3A');
      });
    });
  }

  describe('buildArxivUrl (#3543)', () => {
    it('OR-joins multi-word topic terms and sorts by relevance', () => {
      const url = buildArxivUrl({
        topic: 'self healing software repair agents',
        authorFilter: '',
        maxResults: 8,
      });
      const q = new URL(url).searchParams.get('search_query') ?? '';
      expect(q).toContain('ti:self');
      expect(q).toContain(' OR ');
      // Regression: AND-joining the topic terms required all to co-occur and
      // returned 0 results for normal multi-word topics (#3543).
      expect(q).not.toContain(') AND (ti:');
      expect(url).toContain('sortBy=relevance');
    });

    it('keeps a single-word topic as a ti/abs OR query', () => {
      const url = buildArxivUrl({ topic: 'agents', authorFilter: '', maxResults: 5 });
      const q = new URL(url).searchParams.get('search_query') ?? '';
      expect(q).toBe('(ti:agents OR abs:agents)');
    });
  });
});
