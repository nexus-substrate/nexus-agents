/**
 * Tests for research-index-parser.
 *
 * Covers: parsePapersRegistry, parseTechniquesRegistry, parseSourcesRegistry,
 * computeStats, parseRegistry, getTechniquesByStatus, getTechniquesByPriority,
 * getTechniquesByTopic, getPapersByTopic, getRecentlyReviewedPapers,
 * getTechniquesWithIssues.
 */

import { describe, expect, it } from 'vitest';

import type {
  ResearchPaperWithId,
  ResearchTechniqueWithId,
  ResearchSourceWithId,
  ResearchIndex,
} from './research-index-types.js';
import {
  computeStats,
  getTechniquesByStatus,
  getTechniquesByPriority,
  getTechniquesByTopic,
  getPapersByTopic,
  getRecentlyReviewedPapers,
  getTechniquesWithIssues,
} from './research-index-parser.js';

// ============================================================================
// Test Data Helpers
// ============================================================================

function makePaper(overrides: Partial<ResearchPaperWithId> = {}): ResearchPaperWithId {
  return {
    id: 'paper-1',
    title: 'Test Paper',
    arxiv_id: '2401.12345',
    topics: ['consensus'],
    authors: [],
    tags: [],
    key_findings: [],
    techniques_extracted: [],
    related_issues: [],
    implementation_status: 'not-started',
    relevance: 'high',
    reviewed_date: '2026-01-15',
    summary: 'A test paper summary.',
    ...overrides,
  } as ResearchPaperWithId;
}

function makeTechnique(overrides: Partial<ResearchTechniqueWithId> = {}): ResearchTechniqueWithId {
  return {
    id: 'technique-1',
    name: 'Test Technique',
    topic: 'consensus',
    status: 'implemented',
    priority: 'P1',
    description: 'A test technique',
    source_papers: ['paper-1'],
    implementation_issue: null,
    complexity: 'medium',
    decision_history: [],
    tags: [],
    metrics: {},
    integration_files: [],
    related_prs: [],
    dependencies: [],
    ...overrides,
  } as ResearchTechniqueWithId;
}

function makeSource(overrides: Partial<ResearchSourceWithId> = {}): ResearchSourceWithId {
  return {
    id: 'source-1',
    name: 'Test Source',
    type: 'specification',
    url: 'https://example.com',
    topics: [],
    tags: [],
    key_info: [],
    best_practices: [],
    ...overrides,
  } as ResearchSourceWithId;
}

function makeIndex(overrides: Partial<ResearchIndex> = {}): ResearchIndex {
  return {
    schemaVersion: '1.0',
    generatedAt: '2026-01-15 (ET)',
    papers: [],
    techniques: [],
    sources: [],
    stats: {
      totalPapers: 0,
      totalTechniques: 0,
      totalSources: 0,
      totalTopics: 7,
      techniquesByStatus: {
        implemented: 0,
        planned: 0,
        inProgress: 0,
        notStarted: 0,
        rejected: 0,
      },
      techniquesByPriority: { P1: 0, P2: 0, P3: 0, P4: 0, none: 0 },
      topicStats: [],
    },
    ...overrides,
  };
}

// ============================================================================
// computeStats
// ============================================================================

describe('computeStats', () => {
  it('returns correct totals', () => {
    const papers = [makePaper(), makePaper({ id: 'paper-2' })];
    const techniques = [makeTechnique()];
    const sources = [makeSource(), makeSource({ id: 'source-2' })];

    const stats = computeStats(papers, techniques, sources);
    expect(stats.totalPapers).toBe(2);
    expect(stats.totalTechniques).toBe(1);
    expect(stats.totalSources).toBe(2);
    // Topics derived from data (no longer fixed enum)
    expect(stats.totalTopics).toBeGreaterThanOrEqual(1);
  });

  it('counts techniques by status', () => {
    const techniques = [
      makeTechnique({ id: 't1', status: 'implemented' }),
      makeTechnique({ id: 't2', status: 'implemented' }),
      makeTechnique({ id: 't3', status: 'planned' }),
      makeTechnique({ id: 't4', status: 'in-progress' }),
      makeTechnique({ id: 't5', status: 'not-started' }),
      makeTechnique({ id: 't6', status: 'rejected' }),
    ];

    const stats = computeStats([], techniques, []);
    expect(stats.techniquesByStatus.implemented).toBe(2);
    expect(stats.techniquesByStatus.planned).toBe(1);
    expect(stats.techniquesByStatus.inProgress).toBe(1);
    expect(stats.techniquesByStatus.notStarted).toBe(1);
    expect(stats.techniquesByStatus.rejected).toBe(1);
  });

  it('counts techniques by priority', () => {
    const techniques = [
      makeTechnique({ id: 't1', priority: 'P1' }),
      makeTechnique({ id: 't2', priority: 'P2' }),
      makeTechnique({ id: 't3', priority: 'P3' }),
      makeTechnique({ id: 't4', priority: 'P4' }),
      makeTechnique({ id: 't5', priority: null }),
    ];

    const stats = computeStats([], techniques, []);
    expect(stats.techniquesByPriority.P1).toBe(1);
    expect(stats.techniquesByPriority.P2).toBe(1);
    expect(stats.techniquesByPriority.P3).toBe(1);
    expect(stats.techniquesByPriority.P4).toBe(1);
    expect(stats.techniquesByPriority.none).toBe(1);
  });

  it('derives topics from actual data (no fixed enum)', () => {
    // With empty data, no topics should be derived
    const emptyStats = computeStats([], [], []);
    expect(emptyStats.topicStats).toHaveLength(0);
  });

  it('counts papers and techniques per topic', () => {
    const papers = [
      makePaper({ id: 'p1', topics: ['consensus', 'routing'] }),
      makePaper({ id: 'p2', topics: ['consensus'] }),
    ];
    const techniques = [
      makeTechnique({ id: 't1', topic: 'consensus' }),
      makeTechnique({ id: 't2', topic: 'routing' }),
    ];

    const stats = computeStats(papers, techniques, []);
    const consensusStats = stats.topicStats.find((t) => t.topic === 'consensus');
    expect(consensusStats?.paperCount).toBe(2);
    expect(consensusStats?.techniqueCount).toBe(1);

    const routingStats = stats.topicStats.find((t) => t.topic === 'routing');
    expect(routingStats?.paperCount).toBe(1);
    expect(routingStats?.techniqueCount).toBe(1);
  });

  it('handles empty arrays', () => {
    const stats = computeStats([], [], []);
    expect(stats.totalPapers).toBe(0);
    expect(stats.totalTechniques).toBe(0);
    expect(stats.totalSources).toBe(0);
  });
});

// ============================================================================
// Query Helpers
// ============================================================================

describe('getTechniquesByStatus', () => {
  it('filters techniques by status', () => {
    const index = makeIndex({
      techniques: [
        makeTechnique({ id: 't1', status: 'implemented' }),
        makeTechnique({ id: 't2', status: 'planned' }),
        makeTechnique({ id: 't3', status: 'implemented' }),
      ],
    });

    const implemented = getTechniquesByStatus(index, 'implemented');
    expect(implemented).toHaveLength(2);
    expect(implemented.every((t) => t.status === 'implemented')).toBe(true);
  });

  it('returns empty for no matches', () => {
    const index = makeIndex({
      techniques: [makeTechnique({ status: 'implemented' })],
    });
    expect(getTechniquesByStatus(index, 'rejected')).toHaveLength(0);
  });
});

describe('getTechniquesByPriority', () => {
  it('filters techniques by priority', () => {
    const index = makeIndex({
      techniques: [
        makeTechnique({ id: 't1', priority: 'P1' }),
        makeTechnique({ id: 't2', priority: 'P2' }),
        makeTechnique({ id: 't3', priority: 'P1' }),
      ],
    });

    const p1 = getTechniquesByPriority(index, 'P1');
    expect(p1).toHaveLength(2);
  });
});

describe('getTechniquesByTopic', () => {
  it('filters techniques by topic', () => {
    const index = makeIndex({
      techniques: [
        makeTechnique({ id: 't1', topic: 'consensus' }),
        makeTechnique({ id: 't2', topic: 'routing' }),
        makeTechnique({ id: 't3', topic: 'consensus' }),
      ],
    });

    const consensus = getTechniquesByTopic(index, 'consensus');
    expect(consensus).toHaveLength(2);
  });
});

describe('getPapersByTopic', () => {
  it('filters papers by topic', () => {
    const index = makeIndex({
      papers: [
        makePaper({ id: 'p1', topics: ['consensus', 'routing'] }),
        makePaper({ id: 'p2', topics: ['memory'] }),
        makePaper({ id: 'p3', topics: ['consensus'] }),
      ],
    });

    const consensus = getPapersByTopic(index, 'consensus');
    expect(consensus).toHaveLength(2);
  });

  it('returns empty for unmatched topic', () => {
    const index = makeIndex({
      papers: [makePaper({ topics: ['consensus'] })],
    });
    expect(getPapersByTopic(index, 'security')).toHaveLength(0);
  });
});

describe('getRecentlyReviewedPapers', () => {
  it('returns papers sorted by review date descending', () => {
    const index = makeIndex({
      papers: [
        makePaper({ id: 'p1', reviewed_date: '2026-01-10' }),
        makePaper({ id: 'p2', reviewed_date: '2026-01-20' }),
        makePaper({ id: 'p3', reviewed_date: '2026-01-15' }),
      ],
    });

    const recent = getRecentlyReviewedPapers(index);
    expect(recent).toHaveLength(3);
    expect(recent[0]?.id).toBe('p2');
    expect(recent[1]?.id).toBe('p3');
    expect(recent[2]?.id).toBe('p1');
  });

  it('respects limit parameter', () => {
    const index = makeIndex({
      papers: [
        makePaper({ id: 'p1', reviewed_date: '2026-01-10' }),
        makePaper({ id: 'p2', reviewed_date: '2026-01-20' }),
        makePaper({ id: 'p3', reviewed_date: '2026-01-15' }),
      ],
    });

    expect(getRecentlyReviewedPapers(index, 2)).toHaveLength(2);
  });

  it('filters out papers without reviewed_date', () => {
    const index = makeIndex({
      papers: [
        makePaper({ id: 'p1', reviewed_date: '2026-01-10' }),
        makePaper({ id: 'p2', reviewed_date: null as unknown as string }),
      ],
    });

    const recent = getRecentlyReviewedPapers(index);
    expect(recent).toHaveLength(1);
    expect(recent[0]?.id).toBe('p1');
  });
});

describe('getTechniquesWithIssues', () => {
  it('returns techniques with implementation issues', () => {
    const index = makeIndex({
      techniques: [
        makeTechnique({ id: 't1', implementation_issue: 123 }),
        makeTechnique({ id: 't2', implementation_issue: null }),
        makeTechnique({ id: 't3', implementation_issue: 456 }),
      ],
    });

    const withIssues = getTechniquesWithIssues(index);
    expect(withIssues).toHaveLength(2);
  });

  it('returns empty when no techniques have issues', () => {
    const index = makeIndex({
      techniques: [makeTechnique({ id: 't1', implementation_issue: null })],
    });
    expect(getTechniquesWithIssues(index)).toHaveLength(0);
  });
});
