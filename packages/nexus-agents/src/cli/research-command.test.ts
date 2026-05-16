/**
 * Research Registry CLI Tests
 *
 * Tests for research command implementations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock node:fs/promises before importing the module under test
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  access: vi.fn(),
}));

import * as fs from 'node:fs/promises';
import {
  toStatusSummary,
  filterByStatus,
  countByStatus,
  calculateTagOverlap,
  findSharedTags,
  determineRelationship,
  formatStatusResult,
  formatOverlapResult,
  getResearchStatus,
  findOverlaps,
  paperExists,
  researchCommand,
} from './research-command.js';
import type { TechniqueEntry, ResearchStatusResult } from './research-types.js';

// =============================================================================
// TEST DATA
// =============================================================================

const mockTechnique: TechniqueEntry = {
  name: 'Test Technique',
  description: 'A test technique for unit testing',
  source_papers: ['arxiv-1234.56789'],
  topic: 'consensus',
  tags: ['test', 'consensus', 'multi-agent'],
  metrics: { accuracy: '90%' },
  status: 'implemented',
  priority: 'P1',
  complexity: 'medium',
  integration_files: ['src/test.ts'],
  implementation_issue: 123,
  related_prs: [456],
  notes: 'Test notes',
  dependencies: [],
  decision_history: [],
};

const mockTechnique2: TechniqueEntry = {
  ...mockTechnique,
  name: 'Another Technique',
  topic: 'routing',
  tags: ['test', 'routing', 'optimization'],
  status: 'planned',
  priority: 'P2',
};

const mockTechnique3: TechniqueEntry = {
  ...mockTechnique,
  name: 'Third Technique',
  topic: 'consensus',
  tags: ['consensus', 'voting', 'byzantine'],
  status: 'not-started',
  priority: null,
};

const mockTechniquesYaml = `
schema_version: '1.0'
techniques:
  test-technique:
    name: 'Test Technique'
    description: 'A test technique'
    source_papers:
      - arxiv-1234.56789
    topic: consensus
    tags:
      - test
      - consensus
    metrics:
      accuracy: '90%'
    status: implemented
    priority: P1
    complexity: medium
    integration_files:
      - src/test.ts
    implementation_issue: 123
    related_prs: []
    notes: 'Test notes'
    dependencies: []
    decision_history: []
  another-technique:
    name: 'Another Technique'
    description: 'Another test'
    source_papers: []
    topic: routing
    tags:
      - routing
    metrics: {}
    status: planned
    priority: P2
    complexity: low
    integration_files: []
    implementation_issue: null
    related_prs: []
    notes: ''
    dependencies: []
    decision_history: []
`;

const mockPapersYaml = `
schema_version: '1.0'
papers:
  arxiv-1234.56789:
    title: 'Test Paper'
    authors: []
    source: arxiv
    arxiv_id: '1234.56789'
    url: 'https://arxiv.org/abs/1234.56789'
    publication_date: '2025-01'
    venue: null
    topics:
      - consensus
    tags:
      - test
    reviewed_date: '2026-01-01'
    reviewed_in: 'test.md'
    summary: 'Test summary'
    key_findings: []
    relevance: high
    techniques_extracted: []
    related_issues: []
    implementation_status: not-started
`;

// =============================================================================
// UNIT TESTS
// =============================================================================

describe('toStatusSummary', () => {
  it('should convert technique entry to status summary', () => {
    const result = toStatusSummary('test-id', mockTechnique);

    expect(result).toEqual({
      id: 'test-id',
      name: 'Test Technique',
      status: 'implemented',
      priority: 'P1',
      topic: 'consensus',
      implementationIssue: 123,
    });
  });

  it('should handle null priority', () => {
    const technique: TechniqueEntry = { ...mockTechnique, priority: null };
    const result = toStatusSummary('test-id', technique);

    expect(result.priority).toBeNull();
  });

  it('should handle null implementation issue', () => {
    const technique: TechniqueEntry = { ...mockTechnique, implementation_issue: null };
    const result = toStatusSummary('test-id', technique);

    expect(result.implementationIssue).toBeNull();
  });
});

describe('filterByStatus', () => {
  const techniques = {
    'tech-1': mockTechnique,
    'tech-2': mockTechnique2,
    'tech-3': mockTechnique3,
  };

  it('should return all techniques when status is all', () => {
    const result = filterByStatus(techniques, 'all');
    expect(result).toHaveLength(3);
  });

  it('should filter by implemented status', () => {
    const result = filterByStatus(techniques, 'implemented');
    expect(result).toHaveLength(1);
    expect(result[0]?.status).toBe('implemented');
  });

  it('should filter by planned status', () => {
    const result = filterByStatus(techniques, 'planned');
    expect(result).toHaveLength(1);
    expect(result[0]?.status).toBe('planned');
  });

  it('should filter by not-started status', () => {
    const result = filterByStatus(techniques, 'not-started');
    expect(result).toHaveLength(1);
    expect(result[0]?.status).toBe('not-started');
  });

  it('should sort by priority (P1 first)', () => {
    const result = filterByStatus(techniques, 'all');
    expect(result[0]?.priority).toBe('P1');
    expect(result[1]?.priority).toBe('P2');
    expect(result[2]?.priority).toBeNull();
  });
});

describe('countByStatus', () => {
  it('should count techniques by status', () => {
    const techniques = {
      'tech-1': mockTechnique,
      'tech-2': mockTechnique2,
      'tech-3': mockTechnique3,
    };

    const result = countByStatus(techniques);

    expect(result.implemented).toBe(1);
    expect(result.planned).toBe(1);
    expect(result.notStarted).toBe(1);
    expect(result.rejected).toBe(0);
    expect(result.total).toBe(3);
  });

  it('should count in-progress as planned', () => {
    const techniques = {
      'tech-1': { ...mockTechnique, status: 'in-progress' as const },
    };

    const result = countByStatus(techniques);
    expect(result.planned).toBe(1);
  });

  it('should handle empty registry', () => {
    const result = countByStatus({});

    expect(result.total).toBe(0);
  });
});

describe('calculateTagOverlap', () => {
  it('should calculate Jaccard similarity', () => {
    const tags1 = ['a', 'b', 'c'];
    const tags2 = ['b', 'c', 'd'];

    const result = calculateTagOverlap(tags1, tags2);

    // Intersection: b, c (2), Union: a, b, c, d (4)
    expect(result).toBe(0.5);
  });

  it('should return 1 for identical tags', () => {
    const tags = ['a', 'b', 'c'];
    const result = calculateTagOverlap(tags, tags);
    expect(result).toBe(1);
  });

  it('should return 0 for no overlap', () => {
    const tags1 = ['a', 'b'];
    const tags2 = ['c', 'd'];
    const result = calculateTagOverlap(tags1, tags2);
    expect(result).toBe(0);
  });

  it('should handle empty arrays', () => {
    expect(calculateTagOverlap([], [])).toBe(0);
    expect(calculateTagOverlap(['a'], [])).toBe(0);
    expect(calculateTagOverlap([], ['a'])).toBe(0);
  });
});

describe('findSharedTags', () => {
  it('should find shared tags', () => {
    const tags1 = ['a', 'b', 'c'];
    const tags2 = ['b', 'c', 'd'];

    const result = findSharedTags(tags1, tags2);

    expect(result).toEqual(['b', 'c']);
  });

  it('should return empty array for no overlap', () => {
    const result = findSharedTags(['a', 'b'], ['c', 'd']);
    expect(result).toEqual([]);
  });
});

describe('determineRelationship', () => {
  it('should return overlapping for same topic and high overlap', () => {
    const result = determineRelationship(mockTechnique, mockTechnique3, 0.6);
    expect(result).toBe('overlapping');
  });

  it('should return complementary for same topic and low overlap', () => {
    const result = determineRelationship(mockTechnique, mockTechnique3, 0.3);
    expect(result).toBe('complementary');
  });

  it('should return enhances for different topic with some overlap', () => {
    const result = determineRelationship(mockTechnique, mockTechnique2, 0.4);
    expect(result).toBe('enhances');
  });

  it('should return complementary for different topic with low overlap', () => {
    const result = determineRelationship(mockTechnique, mockTechnique2, 0.1);
    expect(result).toBe('complementary');
  });
});

describe('formatStatusResult', () => {
  const result: ResearchStatusResult = {
    success: true,
    techniques: [
      {
        id: 'tech-1',
        name: 'Test',
        status: 'implemented',
        priority: 'P1',
        topic: 'consensus',
        implementationIssue: 123,
      },
    ],
    counts: {
      implemented: 1,
      planned: 0,
      notStarted: 0,
      rejected: 0,
      total: 1,
    },
  };

  it('should format as JSON', () => {
    const output = formatStatusResult(result, 'json');
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(true);
    expect(parsed.techniques).toHaveLength(1);
  });

  it('should format as compact', () => {
    const output = formatStatusResult(result, 'compact');
    expect(output).toContain('implemented');
    expect(output).toContain('P1');
    expect(output).toContain('tech-1');
  });

  it('should format as table', () => {
    const output = formatStatusResult(result, 'table');
    expect(output).toContain('Research Registry Status');
    expect(output).toContain('Implemented: 1');
    expect(output).toContain('Status');
  });

  it('should handle empty results', () => {
    const emptyResult: ResearchStatusResult = {
      success: true,
      techniques: [],
      counts: { implemented: 0, planned: 0, notStarted: 0, rejected: 0, total: 0 },
    };
    const output = formatStatusResult(emptyResult, 'table');
    expect(output).toContain('No techniques found');
  });
});

describe('formatOverlapResult', () => {
  it('should format as JSON', () => {
    const result = {
      success: true,
      sourceId: 'test',
      matches: [],
      suggestedAlignments: [],
    };
    const output = formatOverlapResult(result, 'json');
    const parsed = JSON.parse(output);
    expect(parsed.sourceId).toBe('test');
  });

  it('should format as table with no matches', () => {
    const result = {
      success: true,
      sourceId: 'test',
      matches: [],
      suggestedAlignments: [],
    };
    const output = formatOverlapResult(result, 'table');
    expect(output).toContain('No overlapping techniques found');
  });

  it('should handle not found', () => {
    const result = {
      success: false,
      sourceId: 'unknown',
      matches: [],
      suggestedAlignments: [],
    };
    const output = formatOverlapResult(result, 'table');
    expect(output).toContain('not found');
  });
});

// =============================================================================
// INTEGRATION TESTS (with mocked fs)
// =============================================================================

describe('getResearchStatus', () => {
  beforeEach(() => {
    vi.mocked(fs.readFile).mockResolvedValue(mockTechniquesYaml);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should load and return all techniques', async () => {
    const result = await getResearchStatus({ status: 'all', format: 'table' });

    expect(result.success).toBe(true);
    expect(result.techniques.length).toBeGreaterThan(0);
    expect(result.counts.total).toBeGreaterThan(0);
  });

  it('should filter by status', async () => {
    const result = await getResearchStatus({ status: 'implemented', format: 'table' });

    expect(result.success).toBe(true);
    for (const tech of result.techniques) {
      expect(tech.status).toBe('implemented');
    }
  });

  it('should return specific technique', async () => {
    const result = await getResearchStatus({
      techniqueId: 'test-technique',
      status: 'all',
      format: 'table',
    });

    expect(result.success).toBe(true);
    expect(result.techniques).toHaveLength(1);
    expect(result.techniques[0]?.id).toBe('test-technique');
  });

  it('should handle technique not found', async () => {
    const result = await getResearchStatus({
      techniqueId: 'nonexistent',
      status: 'all',
      format: 'table',
    });

    expect(result.success).toBe(false);
    expect(result.techniques).toHaveLength(0);
  });
});

describe('findOverlaps', () => {
  beforeEach(() => {
    vi.mocked(fs.readFile).mockResolvedValue(mockTechniquesYaml);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should find overlapping techniques', async () => {
    const result = await findOverlaps({
      techniqueId: 'test-technique',
      threshold: 0,
      format: 'table',
    });

    expect(result.success).toBe(true);
    expect(result.sourceId).toBe('test-technique');
  });

  it('should handle technique not found', async () => {
    const result = await findOverlaps({
      techniqueId: 'nonexistent',
      threshold: 0.3,
      format: 'table',
    });

    expect(result.success).toBe(false);
  });
});

describe('paperExists', () => {
  beforeEach(() => {
    vi.mocked(fs.readFile).mockResolvedValue(mockPapersYaml);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return true for existing paper', async () => {
    const result = await paperExists('1234.56789');
    expect(result).toBe(true);
  });

  it('should return false for non-existent paper', async () => {
    const result = await paperExists('9999.99999');
    expect(result).toBe(false);
  });
});

describe('researchCommand', () => {
  beforeEach(() => {
    vi.mocked(fs.readFile).mockImplementation((filePath: Parameters<typeof fs.readFile>[0]) => {
      // Convert PathLike to string safely
      let pathStr: string;
      if (typeof filePath === 'string') {
        pathStr = filePath;
      } else if (Buffer.isBuffer(filePath)) {
        pathStr = filePath.toString('utf-8');
      } else if (filePath instanceof URL) {
        pathStr = filePath.pathname;
      } else {
        // FileHandle - shouldn't happen in our tests
        pathStr = '';
      }
      if (pathStr.includes('techniques')) {
        return Promise.resolve(mockTechniquesYaml);
      }
      return Promise.resolve(mockPapersYaml);
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should handle status subcommand', async () => {
    const result = await researchCommand('status', [], { status: 'all', format: 'table' });
    expect(result.text).toContain('Research Registry Status');
    expect(result.exitCode).toBe(0);
  });

  it('should handle overlap subcommand', async () => {
    const result = await researchCommand('overlap', ['test-technique'], { format: 'table' });
    expect(result.text).toContain('Overlap Analysis');
    expect(result.exitCode).toBe(0);
  });

  it('should require technique-id for overlap', async () => {
    const result = await researchCommand('overlap', [], {});
    expect(result.text).toContain('Error');
    expect(result.text).toContain('required');
    // overlap's "missing arg" path returns from the inner handler as a plain
    // string; the `ok()` wrapper sets exitCode 0. Exit code for input
    // validation is governed by the dispatcher, not the subcommand handler.
  });

  it('should handle add subcommand with missing arxiv-id', async () => {
    const result = await researchCommand('add', [], {});
    expect(result.text).toContain('Error');
    expect(result.text).toContain('required');
    // #2761: add now translates "Error:" prefix to non-zero exit so caller
    // scripts can detect validation failures.
    expect(result.exitCode).toBe(1);
  });

  it('should handle unknown subcommand', async () => {
    const result = await researchCommand('unknown' as 'status', [], {});
    expect(result.text).toContain('Unknown subcommand');
    // #2761: unknown subcommand exits 1, not 0.
    expect(result.exitCode).toBe(1);
  });
});
