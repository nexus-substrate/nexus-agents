/**
 * Tests for academic source discovery providers (Semantic Scholar, Papers with Code).
 *
 * @module cli/research-helpers-sources-academic.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  discoverSemanticScholar,
  discoverPapersWithCode,
  discoverOpenAlex,
} from './research-helpers-sources-academic.js';

const mockFetch = vi.fn();

/** Headers mock that returns 'application/json' for content-type. */
const jsonHeaders = {
  get: (name: string) => (name === 'content-type' ? 'application/json' : null),
};

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('discoverSemanticScholar', () => {
  it('should parse valid response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            {
              paperId: 'abc123',
              title: 'Multi-Agent Orchestration',
              url: 'https://semanticscholar.org/paper/abc123',
              abstract: 'A paper about agents.',
              citationCount: 150,
              year: 2025,
              isOpenAccess: true,
              externalIds: { ArXiv: '2401.12345' },
            },
          ],
        }),
    });

    const result = await discoverSemanticScholar('orchestration', 10);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.source).toBe('semantic_scholar');
      expect(result.value[0]?.title).toBe('Multi-Agent Orchestration');
      expect(result.value[0]?.url).toContain('2401.12345');
      expect(result.value[0]?.relevance).toBe('high');
    }
  });

  it('should not include sort parameter in URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });
    await discoverSemanticScholar('test', 5);
    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(calledUrl).not.toContain('sort=');
  });

  it('should surface 429 as RATE_LIMIT, not generic HTTP_ERROR (#2234)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429 });
    const result = await discoverSemanticScholar('test', 5);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('RATE_LIMIT');
  });

  it('should handle non-429 HTTP errors as HTTP_ERROR', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const result = await discoverSemanticScholar('test', 5);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('HTTP_ERROR');
  });

  it('should send x-api-key when SEMANTIC_SCHOLAR_API_KEY is set (#2234)', async () => {
    const prev = process.env['SEMANTIC_SCHOLAR_API_KEY'];
    process.env['SEMANTIC_SCHOLAR_API_KEY'] = 'test-key-abc';
    try {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });
      await discoverSemanticScholar('test', 5);
      const calledOpts = mockFetch.mock.calls[0]?.[1] as { headers?: Record<string, string> };
      expect(calledOpts?.headers?.['x-api-key']).toBe('test-key-abc');
    } finally {
      if (prev === undefined) {
        delete process.env['SEMANTIC_SCHOLAR_API_KEY'];
      } else {
        process.env['SEMANTIC_SCHOLAR_API_KEY'] = prev;
      }
    }
  });

  it('should NOT send x-api-key when SEMANTIC_SCHOLAR_API_KEY is unset (#2234)', async () => {
    const prev = process.env['SEMANTIC_SCHOLAR_API_KEY'];
    delete process.env['SEMANTIC_SCHOLAR_API_KEY'];
    try {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });
      await discoverSemanticScholar('test', 5);
      const calledOpts = mockFetch.mock.calls[0]?.[1] as { headers?: Record<string, string> };
      expect(calledOpts?.headers?.['x-api-key']).toBeUndefined();
    } finally {
      if (prev !== undefined) {
        process.env['SEMANTIC_SCHOLAR_API_KEY'] = prev;
      }
    }
  });

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));
    const result = await discoverSemanticScholar('test', 5);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NETWORK');
  });

  it('should return PARSE_ERROR on invalid schema', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve('not an object'),
    });
    const result = await discoverSemanticScholar('test', 5);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('PARSE_ERROR');
  });

  it('should return PARSE_ERROR when response is HTML instead of JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.reject(new SyntaxError("Unexpected token '<'")),
    });
    const result = await discoverSemanticScholar('test', 5);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PARSE_ERROR');
      expect(result.error.source).toBe('semantic_scholar');
    }
  });

  it('should filter out papers without titles', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            { paperId: 'a', title: '', abstract: 'no title' },
            { paperId: 'b', title: 'Valid Paper', abstract: 'has title' },
          ],
        }),
    });
    const result = await discoverSemanticScholar('test', 10);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(1);
  });
});

describe('discoverPapersWithCode', () => {
  it('should parse valid response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: jsonHeaders,
      json: () =>
        Promise.resolve({
          results: [
            {
              id: 'paper1',
              title: 'Agent Framework',
              url_abs: 'https://paperswithcode.com/paper/agent-framework',
              abstract: 'A framework for agents',
              repository_count: 3,
            },
          ],
        }),
    });

    const result = await discoverPapersWithCode('agent framework', 10);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.source).toBe('papers_with_code');
      expect(result.value[0]?.relevance).toBe('high');
    }
  });

  it('should handle HTTP errors', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const result = await discoverPapersWithCode('test', 5);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('HTTP_ERROR');
  });

  it('should return PARSE_ERROR on invalid schema', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: jsonHeaders,
      json: () => Promise.resolve(42),
    });
    const result = await discoverPapersWithCode('test', 5);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('PARSE_ERROR');
  });

  it('should return empty result when response is HTML (API redirect)', async () => {
    const htmlHeaders = { get: (name: string) => (name === 'content-type' ? 'text/html' : null) };
    mockFetch.mockResolvedValueOnce({ ok: true, headers: htmlHeaders });
    const result = await discoverPapersWithCode('test', 5);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('should return PARSE_ERROR when JSON parse fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: jsonHeaders,
      json: () => Promise.reject(new SyntaxError('Unexpected token \'<\', "<!doctype "...')),
    });
    const result = await discoverPapersWithCode('test', 5);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PARSE_ERROR');
      expect(result.error.message).toContain('not valid JSON');
    }
  });

  it('should mark papers without repos as medium relevance', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: jsonHeaders,
      json: () =>
        Promise.resolve({
          results: [
            { title: 'No Code Paper', url_abs: 'https://example.com', repository_count: 0 },
          ],
        }),
    });
    const result = await discoverPapersWithCode('test', 10);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value[0]?.relevance).toBe('medium');
  });
});

describe('discoverOpenAlex', () => {
  it('should parse valid response with inverted index abstract', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [
            {
              id: 'https://openalex.org/W1234567890',
              title: 'Multi-Agent Systems',
              doi: '10.1234/example.123',
              publication_date: '2025-01-15',
              cited_by_count: 150,
              is_oa: true,
              abstract_inverted_index: {
                This: [0],
                is: [1, 4],
                a: [2],
                paper: [3],
                about: [5],
                agents: [6],
              },
              primary_location: {
                landing_page_url: 'https://doi.org/10.1234/example.123',
              },
            },
          ],
        }),
    });

    const result = await discoverOpenAlex('multi-agent', 10);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.source).toBe('openalex');
      expect(result.value[0]?.title).toBe('Multi-Agent Systems');
      expect(result.value[0]?.url).toBe('https://doi.org/10.1234/example.123');
      expect(result.value[0]?.relevance).toBe('high');
      expect(result.value[0]?.description).toContain('This is a paper is about agents');
    }
  });

  it('should use mailto parameter in URL for polite API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    });
    await discoverOpenAlex('test', 5);
    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('mailto=');
    expect(calledUrl).toContain('api.openalex.org');
  });

  it('should handle HTTP errors', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
    const result = await discoverOpenAlex('test', 5);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('HTTP_ERROR');
  });

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Connection refused'));
    const result = await discoverOpenAlex('test', 5);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NETWORK');
  });

  it('should return PARSE_ERROR on invalid schema', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve('invalid'),
    });
    const result = await discoverOpenAlex('test', 5);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('PARSE_ERROR');
  });

  it('should return PARSE_ERROR when response is not JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.reject(new SyntaxError("Unexpected token '<'")),
    });
    const result = await discoverOpenAlex('test', 5);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PARSE_ERROR');
      expect(result.error.source).toBe('openalex');
    }
  });

  it('should filter out works without titles', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [
            { id: 'W1', title: '', cited_by_count: 10 },
            { id: 'W2', title: 'Valid Work', cited_by_count: 50 },
          ],
        }),
    });
    const result = await discoverOpenAlex('test', 10);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(1);
  });

  it('should handle null abstract_inverted_index', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [
            {
              id: 'W1',
              title: 'Paper Without Abstract',
              cited_by_count: 5,
              abstract_inverted_index: null,
            },
          ],
        }),
    });
    const result = await discoverOpenAlex('test', 10);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.description).toBe('');
    }
  });

  it('should set relevance based on citation count', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [
            { id: 'W1', title: 'High Citations', cited_by_count: 200 },
            { id: 'W2', title: 'Medium Citations', cited_by_count: 50 },
            { id: 'W3', title: 'Low Citations', cited_by_count: 5 },
          ],
        }),
    });
    const result = await discoverOpenAlex('test', 10);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.relevance).toBe('high');
      expect(result.value[1]?.relevance).toBe('medium');
      expect(result.value[2]?.relevance).toBe('low');
    }
  });
});
