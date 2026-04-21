/**
 * Tests for research-index-markdown.ts
 *
 * Covers markdown section generators for RESEARCH_INDEX.md.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getETDate,
  generateFrontmatter,
  generateHeader,
  generateQuickStats,
  generateTopicsTable,
  generateP1Section,
  generateP2Section,
  generateRecentPapers,
  generateGitHubIssues,
  generateSearchTags,
  generateRegistryFiles,
  generateContributing,
} from './research-index-markdown.js';
import { FixedTimeProvider, setTimeProvider, resetTimeProvider } from '../core/index.js';
import type { PaperWithId, TechniqueWithId, RegistryStats } from './research-index-types.js';

// ============================================================================
// Setup
// ============================================================================

const FIXED_TIME = 1700000000000; // 2023-11-14

beforeEach(() => {
  setTimeProvider(new FixedTimeProvider(FIXED_TIME));
});

afterEach(() => {
  resetTimeProvider();
});

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeStats(overrides: Partial<RegistryStats> = {}) {
  return {
    totalPapers: 10,
    totalTechniques: 5,
    totalTopics: 3,
    techniquesByStatus: {
      implemented: 2,
      'in-progress': 1,
      planned: 1,
      'not-started': 1,
      rejected: 0,
    },
    topicStats: [
      { topic: 'consensus', papers: 3, techniques: 2 },
      { topic: 'memory', papers: 2, techniques: 1 },
    ],
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeTechnique(overrides: Partial<TechniqueWithId> = {}) {
  return {
    id: 'tech-1',
    name: 'Test Technique',
    topic: 'consensus',
    priority: 'P1',
    status: 'planned',
    metrics: {},
    source_papers: [],
    tags: ['ai', 'consensus'],
    implementation_issue: null,
    ...overrides,
  } as TechniqueWithId;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makePaper(overrides: Partial<PaperWithId> = {}) {
  return {
    id: 'paper-1',
    title: 'Test Paper',
    url: 'https://arxiv.org/abs/2401.12345',
    topics: ['consensus'],
    reviewed_date: '2024-01-15',
    summary: 'A paper about consensus.',
    ...overrides,
  } as PaperWithId;
}

// ============================================================================
// getETDate
// ============================================================================

describe('getETDate', () => {
  it('returns date in YYYY-MM-DD format', () => {
    const date = getETDate();
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ============================================================================
// generateFrontmatter
// ============================================================================

describe('generateFrontmatter', () => {
  it('includes checksums', () => {
    const result = generateFrontmatter('abc123', 'def456');
    expect(result).toContain('sha256:abc123');
    expect(result).toContain('sha256:def456');
  });

  it('includes auto-generated warning', () => {
    const result = generateFrontmatter('a', 'b');
    expect(result).toContain('AUTO-GENERATED');
  });
});

// ============================================================================
// generateHeader
// ============================================================================

describe('generateHeader', () => {
  it('includes stats in header', () => {
    const result = generateHeader(makeStats(), '2024-01-15');
    expect(result).toContain('10');
    expect(result).toContain('5');
    expect(result).toContain('3');
    expect(result).toContain('2024-01-15');
  });
});

// ============================================================================
// generateQuickStats
// ============================================================================

describe('generateQuickStats', () => {
  it('includes status breakdown', () => {
    const result = generateQuickStats(makeStats());
    expect(result).toContain('Implemented');
    expect(result).toContain('Planned');
    expect(result).toContain('Rejected');
  });
});

// ============================================================================
// generateTopicsTable
// ============================================================================

describe('generateTopicsTable', () => {
  it('generates topic rows', () => {
    const result = generateTopicsTable(makeStats());
    expect(result).toContain('Topics');
    expect(result).toContain('consensus');
  });
});

// ============================================================================
// P1/P2 sections
// ============================================================================

describe('generateP1Section', () => {
  it('generates table for P1 techniques', () => {
    const result = generateP1Section([makeTechnique({ priority: 'P1' })]);
    expect(result).toContain('Priority 1');
    expect(result).toContain('Test Technique');
  });

  it('returns empty for no P1 techniques', () => {
    const result = generateP1Section([makeTechnique({ priority: 'P2' })]);
    expect(result).toBe('');
  });
});

describe('generateP2Section', () => {
  it('generates table for P2 techniques', () => {
    const result = generateP2Section([makeTechnique({ priority: 'P2' })]);
    expect(result).toContain('Priority 2');
  });

  it('returns empty for no P2 techniques', () => {
    const result = generateP2Section([makeTechnique({ priority: 'P1' })]);
    expect(result).toBe('');
  });
});

// ============================================================================
// generateRecentPapers
// ============================================================================

describe('generateRecentPapers', () => {
  it('shows papers sorted by date', () => {
    const papers = [
      makePaper({ reviewed_date: '2024-01-10', title: 'Older' }),
      makePaper({ reviewed_date: '2024-01-20', title: 'Newer' }),
    ];
    const result = generateRecentPapers(papers, 5);
    const newerIdx = result.indexOf('Newer');
    const olderIdx = result.indexOf('Older');
    expect(newerIdx).toBeLessThan(olderIdx);
  });

  it('respects limit', () => {
    const papers = [
      makePaper({ reviewed_date: '2024-01-01', title: 'Paper1' }),
      makePaper({ reviewed_date: '2024-01-02', title: 'Paper2' }),
      makePaper({ reviewed_date: '2024-01-03', title: 'Paper3' }),
    ];
    const result = generateRecentPapers(papers, 2);
    expect(result).toContain('Paper3');
    expect(result).toContain('Paper2');
    expect(result).not.toContain('Paper1');
  });

  it('returns empty for no papers with dates', () => {
    const result = generateRecentPapers(
      [makePaper({ reviewed_date: undefined as unknown as string })],
      5
    );
    expect(result).toBe('');
  });
});

// ============================================================================
// generateGitHubIssues
// ============================================================================

describe('generateGitHubIssues', () => {
  it('lists techniques with issues', () => {
    const result = generateGitHubIssues([makeTechnique({ implementation_issue: 42 })]);
    expect(result).toContain('#42');
    expect(result).toContain('Test Technique');
  });

  it('returns empty for no issues', () => {
    const result = generateGitHubIssues([makeTechnique({ implementation_issue: null })]);
    expect(result).toBe('');
  });
});

// ============================================================================
// generateSearchTags
// ============================================================================

describe('generateSearchTags', () => {
  it('lists sorted unique tags', () => {
    const techniques = [
      makeTechnique({ tags: ['zebra', 'alpha'] }),
      makeTechnique({ tags: ['alpha', 'beta'] }),
    ];
    const result = generateSearchTags(techniques);
    expect(result).toContain('#alpha');
    expect(result).toContain('#beta');
    expect(result).toContain('#zebra');
    // Alpha should come before zebra
    expect(result.indexOf('#alpha')).toBeLessThan(result.indexOf('#zebra'));
  });
});

// ============================================================================
// generateRegistryFiles / generateContributing
// ============================================================================

describe('generateRegistryFiles', () => {
  it('includes paper and technique counts', () => {
    const result = generateRegistryFiles(makeStats());
    expect(result).toContain('10 papers');
    expect(result).toContain('5 techniques');
  });
});

describe('generateContributing', () => {
  it('includes date', () => {
    const result = generateContributing('2024-01-15');
    expect(result).toContain('2024-01-15');
    expect(result).toContain('CONTRIBUTING.md');
  });
});
