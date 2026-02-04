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
  scoreRelevance,
} from './research-helpers-sources.js';

// Mock global fetch
const mockFetch = vi.fn();

beforeEach(() => {
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
    });
  }
});
