/**
 * Tests for research synthesis helpers.
 *
 * @module cli/research-helpers-synthesize.test
 * (Source: Issue #1386 — Research Synthesis Pipeline)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { synthesizeResearch, AttributedInsightSchema } from './research-helpers-synthesize.js';

// ============================================================================
// Mocks
// ============================================================================

const mockLoadPapersRegistry = vi.fn<() => Promise<unknown>>();

vi.mock('./research-helpers-io.js', () => ({
  loadPapersRegistry: (): Promise<unknown> => mockLoadPapersRegistry(),
}));

// ============================================================================
// Test Data
// ============================================================================

function makePaper(
  id: string,
  title: string,
  topics: string[],
  tags: string[],
  opts?: {
    summary?: string;
    key_findings?: string[];
    implementation_status?: string;
    techniques_extracted?: string[];
  }
): Record<string, unknown> {
  return {
    title,
    authors: ['Test Author'],
    source: 'arxiv',
    arxiv_id: `test-${id}`,
    url: `https://arxiv.org/abs/test-${id}`,
    publication_date: '2025-01-01',
    venue: null,
    topics,
    tags,
    reviewed_date: '2025-01-01',
    reviewed_in: 'test',
    summary: opts?.summary ?? `Summary of ${title}`,
    key_findings: opts?.key_findings ?? [`Finding from ${title}`],
    relevance: 'high',
    implementation_status: opts?.implementation_status ?? 'not-started',
    techniques_extracted: opts?.techniques_extracted ?? [`technique-${id}`],
    priority: 'P2',
  };
}

function makeRegistry(papers: Record<string, Record<string, unknown>>): Record<string, unknown> {
  return { schema_version: '1.0', papers };
}

// ============================================================================
// Tests
// ============================================================================

describe('synthesizeResearch', () => {
  beforeEach(() => {
    mockLoadPapersRegistry.mockReset();
  });

  it('returns LOAD_ERROR when registry fails to load', async () => {
    mockLoadPapersRegistry.mockResolvedValue({
      ok: false,
      error: { message: 'File not found' },
    });

    const result = await synthesizeResearch();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LOAD_ERROR');
    }
  });

  it('returns NO_PAPERS when registry is empty', async () => {
    mockLoadPapersRegistry.mockResolvedValue({
      ok: true,
      value: { papers: {} },
    });

    const result = await synthesizeResearch();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NO_PAPERS');
    }
  });

  it('groups papers by topic correctly', async () => {
    mockLoadPapersRegistry.mockResolvedValue({
      ok: true,
      value: makeRegistry({
        'paper-1': makePaper('1', 'Paper A', ['memory', 'routing'], ['llm']),
        'paper-2': makePaper('2', 'Paper B', ['memory'], ['llm']),
        'paper-3': makePaper('3', 'Paper C', ['routing'], ['optimization']),
      }),
    });

    const result = await synthesizeResearch();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const value = result.value;
    expect(value.totalPapers).toBe(3);
    expect(value.topicCount).toBe(2);

    // memory cluster should have 2 papers, routing should have 2 papers
    const memoryCluster = value.clusters.find((c) => c.topic === 'memory');
    expect(memoryCluster).toBeDefined();
    if (memoryCluster === undefined) return;
    expect(memoryCluster.paperCount).toBe(2);
  });

  it('filters to single topic when topicFilter provided', async () => {
    mockLoadPapersRegistry.mockResolvedValue({
      ok: true,
      value: makeRegistry({
        'paper-1': makePaper('1', 'Paper A', ['memory'], ['llm']),
        'paper-2': makePaper('2', 'Paper B', ['routing'], ['llm']),
      }),
    });

    const result = await synthesizeResearch('memory');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.topicCount).toBe(1);
    const first = result.value.clusters[0];
    if (first === undefined) return;
    expect(first.topic).toBe('memory');
  });

  it('identifies common themes from shared tags', async () => {
    mockLoadPapersRegistry.mockResolvedValue({
      ok: true,
      value: makeRegistry({
        p1: makePaper('1', 'Paper 1', ['memory'], ['llm', 'transformers']),
        p2: makePaper('2', 'Paper 2', ['memory'], ['llm', 'attention']),
        p3: makePaper('3', 'Paper 3', ['memory'], ['llm', 'rag']),
      }),
    });

    const result = await synthesizeResearch('memory');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const cluster = result.value.clusters[0];
    if (cluster === undefined) return;
    expect(cluster.commonThemes).toContain('llm');
  });

  it('extracts implementation opportunities from not-started papers', async () => {
    mockLoadPapersRegistry.mockResolvedValue({
      ok: true,
      value: makeRegistry({
        p1: makePaper('1', 'Paper 1', ['routing'], ['llm'], {
          implementation_status: 'not-started',
          techniques_extracted: ['moe-routing'],
        }),
        p2: makePaper('2', 'Paper 2', ['routing'], ['llm'], {
          implementation_status: 'implemented',
          techniques_extracted: ['linear-routing'],
        }),
      }),
    });

    const result = await synthesizeResearch('routing');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const cluster = result.value.clusters[0];
    if (cluster === undefined) return;
    expect(cluster.implementationOpportunities).toContain('moe-routing');
    expect(cluster.implementationOpportunities).not.toContain('linear-routing');
  });

  it('detects gaps for single-paper clusters', async () => {
    mockLoadPapersRegistry.mockResolvedValue({
      ok: true,
      value: makeRegistry({
        p1: makePaper('1', 'Paper 1', ['niche-topic'], ['llm']),
      }),
    });

    const result = await synthesizeResearch('niche-topic');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const cluster = result.value.clusters[0];
    if (cluster === undefined) return;
    expect(cluster.gaps.some((g) => g.includes('Only 1 paper'))).toBe(true);
  });

  it('finds cross-cutting themes spanning 3+ topics', async () => {
    mockLoadPapersRegistry.mockResolvedValue({
      ok: true,
      value: makeRegistry({
        p1: makePaper('1', 'Paper 1', ['memory'], ['llm', 'safety']),
        p2: makePaper('2', 'Paper 2', ['routing'], ['llm', 'safety']),
        p3: makePaper('3', 'Paper 3', ['consensus'], ['llm', 'safety']),
        p4: makePaper('4', 'Paper 4', ['security'], ['llm']),
      }),
    });

    const result = await synthesizeResearch();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 'safety' spans memory, routing, consensus (3 topics) → cross-cutting
    const safetyTheme = result.value.crossCuttingThemes.find((t) => t.startsWith('safety'));
    expect(safetyTheme).toBeDefined();

    // 'llm' spans all 4 topics → also cross-cutting
    const llmTheme = result.value.crossCuttingThemes.find((t) => t.startsWith('llm'));
    expect(llmTheme).toBeDefined();
  });

  it('deduplicates key findings', async () => {
    mockLoadPapersRegistry.mockResolvedValue({
      ok: true,
      value: makeRegistry({
        p1: makePaper('1', 'Paper 1', ['memory'], ['llm'], {
          key_findings: ['LLMs benefit from retrieval', 'LLMs benefit from retrieval'],
        }),
        p2: makePaper('2', 'Paper 2', ['memory'], ['llm'], {
          key_findings: ['LLMs benefit from retrieval'],
        }),
      }),
    });

    const result = await synthesizeResearch('memory');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const cluster = result.value.clusters[0];
    if (cluster === undefined) return;
    const retrievalFindings = cluster.keyInsights.filter((i) =>
      i.insight.toLowerCase().includes('retrieval')
    );
    expect(retrievalFindings.length).toBe(1);
    // #2663 — every synthesized insight carries at least one source paper id.
    for (const insight of cluster.keyInsights) {
      expect(insight.sourcePaperIds.length).toBeGreaterThan(0);
    }
  });

  it('attributes a shared finding to every paper that asserts it (#2663)', async () => {
    mockLoadPapersRegistry.mockResolvedValue({
      ok: true,
      value: makeRegistry({
        p1: makePaper('1', 'Paper A', ['memory'], ['retrieval'], {
          key_findings: ['Shared finding about retrieval'],
        }),
        p2: makePaper('2', 'Paper B', ['memory'], ['retrieval'], {
          key_findings: ['Shared finding about retrieval'],
        }),
      }),
    });
    const result = await synthesizeResearch('memory');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const cluster = result.value.clusters[0];
    if (cluster === undefined) return;
    const shared = cluster.keyInsights.find((i) => i.insight.includes('Shared finding'));
    // Both papers asserted it — both ids survive into the output, the
    // structure that makes a contradiction representable rather than collapsed.
    expect([...(shared?.sourcePaperIds ?? [])].sort()).toEqual(['p1', 'p2']);
    // Paper refs carry provenance (#2663), not just titles.
    expect(cluster.papers.find((p) => p.id === 'p1')?.sourceUri).toBe(
      'https://arxiv.org/abs/test-1'
    );
  });

  it('identifies aligned techniques with implementation status', async () => {
    mockLoadPapersRegistry.mockResolvedValue({
      ok: true,
      value: makeRegistry({
        p1: makePaper('1', 'Paper 1', ['routing'], ['llm'], {
          techniques_extracted: ['linucb-routing', 'knn-routing', 'novel-technique'],
        }),
      }),
    });

    const result = await synthesizeResearch('routing');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const cluster = result.value.clusters[0];
    if (cluster === undefined) return;

    // linucb-routing is fully implemented
    const linucb = cluster.alignedTechniques.find((a) => a.technique === 'linucb-routing');
    expect(linucb).toBeDefined();
    if (linucb === undefined) return;
    expect(linucb.status).toBe('implemented');
    expect(linucb.canonicalPath).toContain('linucb');

    // knn-routing is implemented (promoted via KnnRoutingStage)
    const knn = cluster.alignedTechniques.find((a) => a.technique === 'knn-routing');
    expect(knn).toBeDefined();
    if (knn === undefined) return;
    expect(knn.status).toBe('implemented');
    expect(knn.canonicalPath).toContain('knn');

    // novel-technique is not-started
    const novel = cluster.alignedTechniques.find((a) => a.technique === 'novel-technique');
    expect(novel).toBeDefined();
    if (novel === undefined) return;
    expect(novel.status).toBe('not-started');
  });

  it('builds alignment summary across clusters', async () => {
    mockLoadPapersRegistry.mockResolvedValue({
      ok: true,
      value: makeRegistry({
        p1: makePaper('1', 'Paper 1', ['routing'], ['llm'], {
          techniques_extracted: ['linucb-routing', 'topsis-routing'],
        }),
        p2: makePaper('2', 'Paper 2', ['consensus'], ['llm'], {
          techniques_extracted: ['consensus-protocol', 'knn-routing', 'new-thing'],
        }),
      }),
    });

    const result = await synthesizeResearch();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const summary = result.value.alignmentSummary;
    expect(summary.total).toBeGreaterThan(0);
    expect(summary.implemented).toBeGreaterThanOrEqual(3); // linucb + topsis + consensus + knn
    expect(summary.partial).toBeGreaterThanOrEqual(0);
    expect(summary.notStarted).toBeGreaterThanOrEqual(1); // new-thing
    expect(summary.topOpportunities.length).toBeGreaterThanOrEqual(0);
  });

  it('sorts clusters by paper count descending', async () => {
    mockLoadPapersRegistry.mockResolvedValue({
      ok: true,
      value: makeRegistry({
        p1: makePaper('1', 'Paper 1', ['small'], ['llm']),
        p2: makePaper('2', 'Paper 2', ['big'], ['llm']),
        p3: makePaper('3', 'Paper 3', ['big'], ['llm']),
        p4: makePaper('4', 'Paper 4', ['big'], ['llm']),
      }),
    });

    const result = await synthesizeResearch();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const first = result.value.clusters[0];
    if (first === undefined) return;
    expect(first.topic).toBe('big');
    expect(first.paperCount).toBe(3);
  });
});

describe('cluster insight truncation is disclosed (#5001)', () => {
  function registryWithFindings(count: number): Record<string, unknown> {
    const papers: Record<string, Record<string, unknown>> = {};
    for (let i = 0; i < count; i++) {
      papers[`p${String(i)}`] = makePaper(String(i), `Paper ${String(i)}`, ['memory'], ['x'], {
        key_findings: [`distinct finding number ${String(i)}`],
      });
    }
    return makeRegistry(papers);
  }

  it('reports the full finding count when the cap bites', async () => {
    // `keyInsights` is capped at 10 and the cap bites in practice: against the
    // live registry six of eleven clusters exceed it, `orchestration` with 55.
    // Ten insights beside `paperCount` were indistinguishable from a cluster
    // that had exactly ten.
    mockLoadPapersRegistry.mockResolvedValue({ ok: true, value: registryWithFindings(12) });

    const result = await synthesizeResearch('memory');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const cluster = result.value.clusters[0];
    expect(cluster?.keyInsights.length).toBe(10);
    expect(cluster?.totalInsights).toBe(12);
  });

  it('reports an honest count when nothing was dropped', async () => {
    // The pair: a cluster inside the cap must not imply hidden findings.
    mockLoadPapersRegistry.mockResolvedValue({ ok: true, value: registryWithFindings(3) });

    const result = await synthesizeResearch('memory');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const cluster = result.value.clusters[0];
    expect(cluster?.totalInsights).toBe(cluster?.keyInsights.length);
  });
});

describe('alignment summary truncation (#5001)', () => {
  beforeEach(() => {
    mockLoadPapersRegistry.mockReset();
  });

  /**
   * The map holds twelve `partial` techniques carrying an improvement hint, so
   * one paper per technique overruns the ten-item cap on `topOpportunities`
   * using only real keys — no synthetic inflation.
   */
  const PARTIAL_WITH_HINT = [
    'capability-instruction-tuning',
    'aegean-consensus',
    'cp-wbft-consensus',
    'mem0-memory-architecture',
    'graph-based-memory',
    'history-encoding',
    'aflow-mcts-workflows',
    'temporal-graph-orchestration',
    'model-based-coordination',
    'trinity-roles',
    'sew-self-evolving-workflows',
    'scaling-coordination-predictor',
  ];

  it('says how many improvement opportunities it found, not just the ten it lists', async () => {
    // `topOpportunities` is capped, and a caller seeing ten entries cannot
    // tell a repo with exactly ten improvable techniques from one with
    // twelve. Same shape as `totalInsights` (#5001) one level up.
    const papers: Record<string, Record<string, unknown>> = {};
    PARTIAL_WITH_HINT.forEach((technique, i) => {
      papers[`p${String(i)}`] = makePaper(String(i), `Paper ${String(i)}`, ['memory'], ['llm'], {
        techniques_extracted: [technique],
      });
    });
    mockLoadPapersRegistry.mockResolvedValue({ ok: true, value: makeRegistry(papers) });

    const result = await synthesizeResearch('memory');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`synthesis failed: ${result.error.message}`);
    const summary = result.value.alignmentSummary;
    // The cap still applies — this discloses the truncation, it does not lift it.
    expect(summary.topOpportunities.length).toBe(10);
    expect(summary.totalOpportunities).toBe(PARTIAL_WITH_HINT.length);
  });

  it('reports an untruncated list as complete', async () => {
    // The pair: with fewer opportunities than the cap the two agree, so a
    // consumer comparing them learns nothing was dropped.
    const papers: Record<string, Record<string, unknown>> = {};
    PARTIAL_WITH_HINT.slice(0, 3).forEach((technique, i) => {
      papers[`p${String(i)}`] = makePaper(String(i), `Paper ${String(i)}`, ['memory'], ['llm'], {
        techniques_extracted: [technique],
      });
    });
    mockLoadPapersRegistry.mockResolvedValue({ ok: true, value: makeRegistry(papers) });

    const result = await synthesizeResearch('memory');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`synthesis failed: ${result.error.message}`);
    expect(result.value.alignmentSummary.totalOpportunities).toBe(3);
    expect(result.value.alignmentSummary.topOpportunities.length).toBe(3);
  });
});

describe('AttributedInsightSchema (#5001)', () => {
  /**
   * `.rules/research.md` credits this schema with structurally enforcing that
   * every synthesized insight carries a source. At its only call site the
   * input is built as `[...new Set([paper.id])]` — non-empty by construction —
   * so `.min(1)` has never had the chance to reject anything, and no test
   * imported it. The invariant held because of the caller, not the schema.
   */
  it('rejects an insight with no source paper ids', () => {
    expect(() =>
      AttributedInsightSchema.parse({ insight: 'unattributed claim', sourcePaperIds: [] })
    ).toThrow();
  });

  it('accepts an insight that names its source', () => {
    expect(() =>
      AttributedInsightSchema.parse({ insight: 'attributed claim', sourcePaperIds: ['p1'] })
    ).not.toThrow();
  });
});
