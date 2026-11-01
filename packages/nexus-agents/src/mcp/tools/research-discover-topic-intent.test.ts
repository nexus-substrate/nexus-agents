/**
 * Tests for research_discover topic intent preservation (#7540).
 *
 * Verifies that topic aliases (e.g. multi-agent -> orchestration) do not erase
 * caller search intent during provider query construction and relevance scoring,
 * while retaining canonical taxonomy in response.canonicalTopic.
 *
 * @module mcp/tools/research-discover-topic-intent.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeDiscovery, ResearchDiscoverInputSchema } from './research-discover.js';
import { loadPapersRegistry } from '../../cli/research-helpers.js';
import { discoverArxiv } from '../../cli/research-helpers-sources.js';
import type { DiscoveredSource } from '../../cli/research-helpers-sources.js';

vi.mock('../../cli/research-helpers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../cli/research-helpers.js')>();
  return { ...actual, loadPapersRegistry: vi.fn() };
});

vi.mock('../../cli/research-helpers-sources.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../cli/research-helpers-sources.js')>();
  return {
    ...actual,
    discoverArxiv: vi.fn(),
    discoverGitHubRepos: vi.fn(() => ({ ok: true, value: [] })),
    discoverGoogleAI: vi.fn(() => ({ ok: true, value: [] })),
    discoverMetaFAIR: vi.fn(() => ({ ok: true, value: [] })),
    discoverMicrosoftResearch: vi.fn(() => ({ ok: true, value: [] })),
    discoverDeepMind: vi.fn(() => ({ ok: true, value: [] })),
  };
});

vi.mock('../../cli/research-helpers-sources-academic.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../cli/research-helpers-sources-academic.js')>();
  return {
    ...actual,
    discoverSemanticScholar: vi.fn(() => ({ ok: true, value: [] })),
    discoverPapersWithCode: vi.fn(() => ({ ok: true, value: [] })),
    discoverOpenAlex: vi.fn(() => ({ ok: true, value: [] })),
  };
});

describe('research_discover topic intent preservation (#7540)', () => {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  } as unknown as Parameters<typeof executeDiscovery>[1];

  // arXiv 1810.08611 (piano/orchestral MIDI paper containing "orchestration" in title)
  const musicPaper: DiscoveredSource = {
    source: 'arxiv',
    title:
      'A database linking piano and orchestral MIDI scores with application to automatic projective orchestration',
    url: 'https://arxiv.org/abs/1810.08611',
    description:
      'This article introduces the Projective Orchestral Database (POD), a collection of MIDI scores composed of pairs linking piano scores to their corresponding orchestrations.',
    relevance: 'high',
    discoveredAt: '2026-10-20T00:00:00.000Z',
  };

  // Multi-agent paper matching caller intent
  const agentPaper: DiscoveredSource = {
    source: 'arxiv',
    title: 'Multi-Agent Orchestration Framework for Autonomous Task Execution',
    url: 'https://arxiv.org/abs/2606.31518',
    description:
      'A framework for coordinating multi-agent systems with consensus voting and task delegation.',
    relevance: 'high',
    discoveredAt: '2026-10-20T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadPapersRegistry).mockResolvedValue({
      ok: true,
      value: { papers: {} },
    } as unknown as Awaited<ReturnType<typeof loadPapersRegistry>>);
  });

  it('preserves query intent and excludes unrelated music paper when searching aliased topic "multi-agent"', async () => {
    vi.mocked(discoverArxiv).mockResolvedValue({
      ok: true,
      value: [musicPaper, agentPaper],
    });

    const input = ResearchDiscoverInputSchema.parse({
      topic: 'multi-agent',
      source: 'arxiv',
      maxResults: 3,
      relevanceThreshold: 0.3,
    });

    const response = await executeDiscovery(input, logger);

    // Provider query MUST receive the caller's search topic, not the erased canonical alias
    expect(discoverArxiv).toHaveBeenCalledWith('multi-agent', 3, undefined, undefined);

    // Response must preserve caller's query topic and report canonicalTopic
    expect(response.topic).toBe('multi-agent');
    expect(response.canonicalTopic).toBe('orchestration');

    // Relevance filtering MUST use caller intent ("multi-agent"), filtering out the music paper
    expect(response.items).toHaveLength(1);
    expect(response.items[0]?.title).toBe(agentPaper.title);
    expect(response.filteredByRelevance).toBe(1);
  });

  it('retains canonical taxonomy when searching an existing canonical topic', async () => {
    vi.mocked(discoverArxiv).mockResolvedValue({
      ok: true,
      value: [musicPaper, agentPaper],
    });

    const input = ResearchDiscoverInputSchema.parse({
      topic: 'orchestration',
      source: 'arxiv',
      maxResults: 3,
      relevanceThreshold: 0.3,
    });

    const response = await executeDiscovery(input, logger);

    expect(discoverArxiv).toHaveBeenCalledWith('orchestration', 3, undefined, undefined);
    expect(response.topic).toBe('orchestration');
    expect(response.canonicalTopic).toBe('orchestration');
  });

  it('handles unmapped topics without alias mapping', async () => {
    vi.mocked(discoverArxiv).mockResolvedValue({
      ok: true,
      value: [agentPaper],
    });

    const input = ResearchDiscoverInputSchema.parse({
      topic: 'unmapped-novel-topic',
      source: 'arxiv',
      maxResults: 3,
      relevanceThreshold: 0.3,
    });

    const response = await executeDiscovery(input, logger);

    expect(discoverArxiv).toHaveBeenCalledWith('unmapped-novel-topic', 3, undefined, undefined);
    expect(response.topic).toBe('unmapped-novel-topic');
    expect(response.canonicalTopic).toBe('unmapped-novel-topic');
  });

  it('honors relevanceThreshold: threshold 0 keeps both music and agent paper', async () => {
    vi.mocked(discoverArxiv).mockResolvedValue({
      ok: true,
      value: [musicPaper, agentPaper],
    });

    const input = ResearchDiscoverInputSchema.parse({
      topic: 'multi-agent',
      source: 'arxiv',
      maxResults: 3,
      relevanceThreshold: 0,
    });

    const response = await executeDiscovery(input, logger);

    expect(response.items).toHaveLength(2);
    expect(response.filteredByRelevance).toBe(0);
    // Agent paper should rank higher than music paper
    expect(response.items[0]?.title).toBe(agentPaper.title);
  });
});
