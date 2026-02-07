/**
 * Tests for research-index-generator.ts
 *
 * Covers generateStatsJson, generateSummaryReport, and the
 * division-by-zero guard for empty techniques.
 */

import { describe, it, expect } from 'vitest';
import { generateStatsJson, generateSummaryReport } from './research-index-generator.js';
import type { ResearchIndex } from './research-index-stats-types.js';

// ============================================================================
// Fixtures
// ============================================================================

function makeIndex(overrides: Partial<ResearchIndex> = {}): ResearchIndex {
  return {
    schemaVersion: '1.0',
    generatedAt: '2026-01-01T00:00:00-05:00',
    papers: [],
    techniques: [],
    sources: [],
    stats: {
      totalPapers: 10,
      totalTechniques: 15,
      totalSources: 5,
      totalTopics: 7,
      techniquesByStatus: {
        implemented: 5,
        planned: 4,
        notStarted: 3,
        rejected: 3,
      },
      techniquesByPriority: { P1: 4, P2: 5, P3: 3, P4: 3 },
      topicStats: [
        { topic: 'consensus', techniqueCount: 3, paperCount: 2 },
        { topic: 'reasoning', techniqueCount: 2, paperCount: 1 },
      ],
    },
    ...overrides,
  } as unknown as ResearchIndex;
}

// ============================================================================
// generateStatsJson
// ============================================================================

describe('generateStatsJson', () => {
  it('returns valid JSON string', () => {
    const json = generateStatsJson(makeIndex());
    expect(() => JSON.parse(json) as unknown).not.toThrow();
  });

  it('includes schemaVersion', () => {
    const json = generateStatsJson(makeIndex());
    const parsed = JSON.parse(json) as { schemaVersion: string };
    expect(parsed.schemaVersion).toBe('1.0');
  });

  it('includes generatedAt', () => {
    const json = generateStatsJson(makeIndex());
    const parsed = JSON.parse(json) as { generatedAt: string };
    expect(parsed.generatedAt).toBe('2026-01-01T00:00:00-05:00');
  });

  it('includes stats', () => {
    const json = generateStatsJson(makeIndex());
    const parsed = JSON.parse(json) as { stats: { totalPapers: number } };
    expect(parsed.stats.totalPapers).toBe(10);
  });

  it('is pretty-printed with 2-space indent', () => {
    const json = generateStatsJson(makeIndex());
    expect(json).toContain('\n  ');
  });
});

// ============================================================================
// generateSummaryReport
// ============================================================================

describe('generateSummaryReport', () => {
  it('includes title', () => {
    const report = generateSummaryReport(makeIndex());
    expect(report).toContain('# Research Index Summary');
  });

  it('includes total papers count', () => {
    const report = generateSummaryReport(makeIndex());
    expect(report).toContain('**Total Papers:** 10');
  });

  it('includes total techniques count', () => {
    const report = generateSummaryReport(makeIndex());
    expect(report).toContain('**Total Techniques:** 15');
  });

  it('includes implementation rate percentage', () => {
    const report = generateSummaryReport(makeIndex());
    // 5 / 15 * 100 = 33.33... → Math.round → 33
    expect(report).toContain('**Implementation Rate:** 33%');
  });

  it('handles zero total techniques without NaN', () => {
    const index = makeIndex({
      stats: {
        totalPapers: 0,
        totalTechniques: 0,
        totalSources: 0,
        totalTopics: 0,
        techniquesByStatus: {
          implemented: 0,
          planned: 0,
          notStarted: 0,
          rejected: 0,
        },
        techniquesByPriority: { P1: 0, P2: 0, P3: 0, P4: 0 },
        topicStats: [],
      },
    } as unknown as Partial<ResearchIndex>);
    const report = generateSummaryReport(index);
    expect(report).not.toContain('NaN');
    expect(report).toContain('**Implementation Rate:** 0%');
  });

  it('includes technique status breakdown', () => {
    const report = generateSummaryReport(makeIndex());
    expect(report).toContain('Implemented: 5');
    expect(report).toContain('Planned: 4');
    expect(report).toContain('Not Started: 3');
    expect(report).toContain('Rejected: 3');
  });

  it('includes topics coverage', () => {
    const report = generateSummaryReport(makeIndex());
    expect(report).toContain('consensus: 3 techniques, 2 papers');
    expect(report).toContain('reasoning: 2 techniques, 1 papers');
  });

  it('includes generated date', () => {
    const report = generateSummaryReport(makeIndex());
    expect(report).toContain('2026-01-01T00:00:00-05:00');
  });
});
