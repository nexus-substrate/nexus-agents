/**
 * Tests for research_discover MCP tool.
 *
 * @module mcp/tools/research-discover.test
 * (Source: Research System Enhancement - Phase 1C)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  registerResearchDiscoverTool,
  ResearchDiscoverInputSchema,
  executeDiscovery,
  type ResearchDiscoverDeps,
} from './research-discover.js';
import { loadPapersRegistry } from '../../cli/research-helpers.js';
import { RateLimiter } from '../middleware/rate-limiter.js';

vi.mock('../../cli/research-helpers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../cli/research-helpers.js')>();
  return { ...actual, loadPapersRegistry: vi.fn() };
});

// Every discovery provider is stubbed to an empty success. Without this the
// tests below reach the REAL arXiv/GitHub/OpenAlex endpoints: `source` defaults
// to 'all' (research-discover.ts:127) and `queryAllSources` is module-private,
// so there is no seam inside the module to intercept. That made them fail
// offline and flake in CI on unrelated PRs — the network is the fixture.
// The factory is HOISTED above any top-level const, so the stub is inlined
// rather than shared — `vi.mock` cannot close over a module-scope helper.
vi.mock('../../cli/research-helpers-sources.js', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../cli/research-helpers-sources.js')
  >();
  return {
    ...actual,
    discoverArxiv: vi.fn(() => ({ ok: true, value: [] })),
    discoverGitHubRepos: vi.fn(() => ({ ok: true, value: [] })),
    discoverGoogleAI: vi.fn(() => ({ ok: true, value: [] })),
    discoverMetaFAIR: vi.fn(() => ({ ok: true, value: [] })),
    discoverMicrosoftResearch: vi.fn(() => ({ ok: true, value: [] })),
    discoverDeepMind: vi.fn(() => ({ ok: true, value: [] })),
  };
});
vi.mock('../../cli/research-helpers-sources-academic.js', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../cli/research-helpers-sources-academic.js')
  >();
  return {
    ...actual,
    discoverSemanticScholar: vi.fn(() => ({ ok: true, value: [] })),
    discoverPapersWithCode: vi.fn(() => ({ ok: true, value: [] })),
    discoverOpenAlex: vi.fn(() => ({ ok: true, value: [] })),
  };
});

// Mock McpServer
interface MockServer {
  tool: ReturnType<typeof vi.fn>;
  registerTool: ReturnType<typeof vi.fn>;
}

function createMockServer(): MockServer {
  return {
    tool: vi.fn(),
    registerTool: vi.fn(),
  };
}

// Create a permissive rate limiter for tests
function createTestRateLimiter(): RateLimiter {
  return new RateLimiter({
    capacity: 1000,
    refillRate: 1000,
    refillIntervalMs: 1000,
  });
}

// Create a rate limiter that blocks all requests
function createBlockingRateLimiter(): RateLimiter {
  return new RateLimiter({
    capacity: 0,
    refillRate: 0,
    refillIntervalMs: 60000,
  });
}

describe('research_discover tool', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let deps: ResearchDiscoverDeps;

  beforeEach(() => {
    mockServer = createMockServer();
    deps = {
      rateLimiter: createTestRateLimiter(),
    };
  });

  describe('ResearchDiscoverInputSchema', () => {
    it('should accept valid topic', () => {
      const result = ResearchDiscoverInputSchema.safeParse({ topic: 'orchestration' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.topic).toBe('orchestration');
      }
    });

    it('should accept topic with source and maxResults', () => {
      const result = ResearchDiscoverInputSchema.safeParse({
        topic: 'agents',
        source: 'github',
        maxResults: 5,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.topic).toBe('agents');
        expect(result.data.source).toBe('github');
        expect(result.data.maxResults).toBe(5);
      }
    });

    it('should accept semantic_scholar source', () => {
      const result = ResearchDiscoverInputSchema.safeParse({
        topic: 'agents',
        source: 'semantic_scholar',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.source).toBe('semantic_scholar');
      }
    });

    it('should accept papers_with_code source', () => {
      const result = ResearchDiscoverInputSchema.safeParse({
        topic: 'agents',
        source: 'papers_with_code',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.source).toBe('papers_with_code');
      }
    });

    it('should reject empty topic', () => {
      const result = ResearchDiscoverInputSchema.safeParse({ topic: '' });
      expect(result.success).toBe(false);
    });

    it('should reject maxResults over 20', () => {
      const result = ResearchDiscoverInputSchema.safeParse({
        topic: 'test',
        maxResults: 100,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('registerResearchDiscoverTool', () => {
    it('should register the tool with correct name', () => {
      registerResearchDiscoverTool(
        mockServer as unknown as Parameters<typeof registerResearchDiscoverTool>[0],
        deps
      );

      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'research_discover',
        expect.objectContaining({
          description: expect.any(String),
          inputSchema: expect.any(Object),
        }),
        expect.any(Function)
      );
    });

    it('should respect rate limiting', async () => {
      deps.rateLimiter = createBlockingRateLimiter();

      registerResearchDiscoverTool(
        mockServer as unknown as Parameters<typeof registerResearchDiscoverTool>[0],
        deps
      );

      const handler = mockServer.registerTool.mock.calls[0]?.[2] as (
        args: unknown
      ) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>;
      const result = await handler({ topic: 'orchestration' });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('Rate limit exceeded');
    });
  });

  describe('registryConsulted discloses whether the dedup pass ran (#5925)', () => {
    // `loadPapersRegistry` returns !ok on a validatePath denial or any
    // readFile/parseYaml throw — an unscaffolded docs/, NEXUS_NO_SCAFFOLD, or
    // malformed YAML. Before this, that produced `alreadyInRegistry: 0` and
    // `newItems: <all>`, byte-identical to "read it, nothing matched". A caller
    // feeding those into research_add re-adds catalogued papers.
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(),
    } as unknown as Parameters<typeof executeDiscovery>[1];

    it('reports registryConsulted false when the registry could not be read', async () => {
      vi.mocked(loadPapersRegistry).mockResolvedValue({
        ok: false,
        error: new Error('papers.yaml unreadable'),
      } as unknown as Awaited<ReturnType<typeof loadPapersRegistry>>);

      const result = await executeDiscovery(
        ResearchDiscoverInputSchema.parse({ topic: 'memory systems', source: 'arxiv' }),
        logger
      );

      expect(result.registryConsulted).toBe(false);
    });

    it('reports registryConsulted true on a clean read', async () => {
      vi.mocked(loadPapersRegistry).mockResolvedValue({
        ok: true,
        value: { papers: {} },
      } as unknown as Awaited<ReturnType<typeof loadPapersRegistry>>);

      const result = await executeDiscovery(
        ResearchDiscoverInputSchema.parse({ topic: 'memory systems', source: 'arxiv' }),
        logger
      );

      expect(result.registryConsulted).toBe(true);
    });

    it('makes the two cases distinguishable — the whole point', async () => {
      // Both report alreadyInRegistry 0. Before #5925 every other field was
      // equal too, so no caller could tell an empty registry from an unread one.
      vi.mocked(loadPapersRegistry).mockResolvedValue({
        ok: true,
        value: { papers: {} },
      } as unknown as Awaited<ReturnType<typeof loadPapersRegistry>>);
      const readOk = await executeDiscovery(
        ResearchDiscoverInputSchema.parse({ topic: 'memory systems', source: 'arxiv' }),
        logger
      );

      vi.mocked(loadPapersRegistry).mockResolvedValue({
        ok: false,
        error: new Error('boom'),
      } as unknown as Awaited<ReturnType<typeof loadPapersRegistry>>);
      const unread = await executeDiscovery(
        ResearchDiscoverInputSchema.parse({ topic: 'memory systems', source: 'arxiv' }),
        logger
      );

      expect(readOk.alreadyInRegistry).toBe(unread.alreadyInRegistry);
      expect(readOk).not.toEqual(unread);
      expect(readOk.registryConsulted).not.toBe(unread.registryConsulted);
    });

    it('does NOT report the registry read as a failed discovery SOURCE', async () => {
      // `failedSources` means "a discovery provider failed". The registry is not
      // a provider, and putting it there would trade one misreport for another.
      vi.mocked(loadPapersRegistry).mockResolvedValue({
        ok: false,
        error: new Error('boom'),
      } as unknown as Awaited<ReturnType<typeof loadPapersRegistry>>);

      const result = await executeDiscovery(
        ResearchDiscoverInputSchema.parse({ topic: 'memory systems', source: 'arxiv' }),
        logger
      );

      expect(result.failedSources).not.toContain('registry');
      expect(result.failedSources).not.toContain('papers');
    });
  });
});
