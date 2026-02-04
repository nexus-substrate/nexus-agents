/**
 * Tests for academic source discovery providers (Semantic Scholar, Papers with Code).
 *
 * @module cli/research-helpers-sources-academic.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  discoverSemanticScholar,
  discoverPapersWithCode,
} from './research-helpers-sources-academic.js';

const mockFetch = vi.fn();

beforeEach(() => {
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

  it('should handle HTTP errors', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429 });
    const result = await discoverSemanticScholar('test', 5);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('HTTP_ERROR');
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
      json: () => Promise.resolve(42),
    });
    const result = await discoverPapersWithCode('test', 5);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('PARSE_ERROR');
  });

  it('should return PARSE_ERROR when response is HTML error page', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
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
