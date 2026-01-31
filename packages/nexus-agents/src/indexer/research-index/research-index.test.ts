/**
 * nexus-agents/indexer/research-index - Tests
 *
 * Tests for the research index parser and generator.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  parseRegistry,
  parsePapersRegistry,
  parseTechniquesRegistry,
  parseSourcesRegistry,
  computeStats,
  getTechniquesByStatus,
  getTechniquesByPriority,
  getTechniquesByTopic,
  getPapersByTopic,
  getRecentlyReviewedPapers,
  getTechniquesWithIssues,
  generateIndexMarkdown,
  generateStatsJson,
  generateSummaryReport,
  ResearchPaperSchema,
  ResearchTechniqueSchema,
  ResearchSourceSchema,
} from './index.js';
import type {
  ResearchIndex,
  ResearchPaperWithId,
  ResearchTechniqueWithId,
  ResearchSourceWithId,
} from './index.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const TEST_REGISTRY_PATH = 'docs/research/registry';

// Check if real registry exists for integration tests
const hasRealRegistry = fs.existsSync(path.join(process.cwd(), TEST_REGISTRY_PATH, 'papers.yaml'));

// Mock data for unit tests
const mockPaper: ResearchPaperWithId = {
  id: 'arxiv-2501.00001',
  title: 'Test Paper',
  authors: ['Test Author'],
  source: 'arxiv',
  arxiv_id: '2501.00001',
  url: 'https://arxiv.org/abs/2501.00001',
  publication_date: '2025-01',
  venue: null,
  topics: ['consensus'],
  tags: ['test', 'mock'],
  reviewed_date: '2026-01-01',
  reviewed_in: 'test.md',
  summary: 'A test paper for unit testing.',
  key_findings: ['Finding 1', 'Finding 2'],
  relevance: 'high',
  techniques_extracted: ['test-technique'],
  related_issues: [100],
  implementation_status: 'planned',
};

const mockTechnique: ResearchTechniqueWithId = {
  id: 'test-technique',
  name: 'Test Technique',
  description: 'A test technique for unit testing.',
  source_papers: ['arxiv-2501.00001'],
  topic: 'consensus',
  tags: ['test', 'mock'],
  metrics: { improvement: '50%' },
  status: 'implemented',
  priority: 'P1',
  complexity: 'medium',
  integration_files: ['src/test.ts'],
  implementation_issue: 100,
  related_prs: [101],
  notes: 'Test notes',
  dependencies: [],
  decision_history: [{ date: '2026-01-01', decision: 'Implemented', rationale: 'Test rationale' }],
};

const mockSource: ResearchSourceWithId = {
  id: 'test-source',
  name: 'Test Source',
  type: 'product_docs',
  url: 'https://example.com',
  vendor: 'Test Vendor',
  topics: ['cli-tools'],
  tags: ['test'],
  reviewed_date: '2026-01-01',
  reviewed_in: 'test.md',
  key_info: ['Info 1'],
  best_practices: ['Practice 1'],
  version_checked: '1.0.0',
};

function createMockIndex(): ResearchIndex {
  return {
    schemaVersion: '1.0',
    generatedAt: '2026-01-13 (ET)',
    papers: [mockPaper],
    techniques: [mockTechnique],
    sources: [mockSource],
    stats: computeStats([mockPaper], [mockTechnique], [mockSource]),
  };
}

// ============================================================================
// Schema Validation Tests
// ============================================================================

describe('Schema Validation', () => {
  describe('ResearchPaperSchema', () => {
    it('should validate a complete paper entry', () => {
      const paper = {
        title: 'Test Paper',
        authors: ['Author 1'],
        source: 'arxiv',
        arxiv_id: '2501.00001',
        url: 'https://arxiv.org/abs/2501.00001',
        publication_date: '2025-01',
        venue: null,
        topics: ['consensus'],
        tags: ['test'],
        reviewed_date: '2026-01-01',
        reviewed_in: 'test.md',
        summary: 'Test summary',
        key_findings: ['Finding 1'],
        relevance: 'high',
        techniques_extracted: [],
        related_issues: [],
        implementation_status: 'not-started',
      };

      const result = ResearchPaperSchema.safeParse(paper);
      expect(result.success).toBe(true);
    });

    it('should validate a minimal paper entry', () => {
      const paper = {
        title: 'Minimal Paper',
      };

      const result = ResearchPaperSchema.safeParse(paper);
      expect(result.success).toBe(true);
    });

    it('should reject invalid implementation status', () => {
      const paper = {
        title: 'Test Paper',
        implementation_status: 'invalid-status',
      };

      const result = ResearchPaperSchema.safeParse(paper);
      expect(result.success).toBe(false);
    });
  });

  describe('ResearchTechniqueSchema', () => {
    it('should validate a complete technique entry', () => {
      const technique = {
        name: 'Test Technique',
        description: 'Test description',
        source_papers: ['arxiv-2501.00001'],
        topic: 'consensus',
        tags: ['test'],
        metrics: { improvement: '50%' },
        status: 'implemented',
        priority: 'P1',
        complexity: 'medium',
        integration_files: ['src/test.ts'],
        implementation_issue: 100,
        related_prs: [],
        notes: 'Test notes',
        dependencies: [],
        decision_history: [],
      };

      const result = ResearchTechniqueSchema.safeParse(technique);
      expect(result.success).toBe(true);
    });

    it('should validate a minimal technique entry', () => {
      const technique = {
        name: 'Minimal Technique',
        description: 'Minimal description',
        topic: 'routing',
        status: 'not-started',
      };

      const result = ResearchTechniqueSchema.safeParse(technique);
      expect(result.success).toBe(true);
    });

    it('should reject invalid status', () => {
      const technique = {
        name: 'Test',
        description: 'Test',
        topic: 'consensus',
        status: 'invalid',
      };

      const result = ResearchTechniqueSchema.safeParse(technique);
      expect(result.success).toBe(false);
    });

    it('should reject invalid topic', () => {
      const technique = {
        name: 'Test',
        description: 'Test',
        topic: 'invalid-topic',
        status: 'implemented',
      };

      const result = ResearchTechniqueSchema.safeParse(technique);
      expect(result.success).toBe(false);
    });
  });

  describe('ResearchSourceSchema', () => {
    it('should validate a complete source entry', () => {
      const source = {
        name: 'Test Source',
        type: 'product_docs',
        url: 'https://example.com',
        vendor: 'Test',
        topics: ['cli-tools'],
        tags: ['test'],
        reviewed_date: '2026-01-01',
        reviewed_in: 'test.md',
        key_info: ['Info 1'],
        best_practices: ['Practice 1'],
        version_checked: '1.0.0',
      };

      const result = ResearchSourceSchema.safeParse(source);
      expect(result.success).toBe(true);
    });

    it('should reject invalid source type', () => {
      const source = {
        name: 'Test',
        type: 'invalid-type',
        url: 'https://example.com',
      };

      const result = ResearchSourceSchema.safeParse(source);
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================================
// Statistics Computation Tests
// ============================================================================

describe('Statistics Computation', () => {
  describe('computeStats', () => {
    it('should compute correct totals', () => {
      const papers = [mockPaper];
      const techniques = [mockTechnique];
      const sources = [mockSource];

      const stats = computeStats(papers, techniques, sources);

      expect(stats.totalPapers).toBe(1);
      expect(stats.totalTechniques).toBe(1);
      expect(stats.totalSources).toBe(1);
      expect(stats.totalTopics).toBe(7);
    });

    it('should count techniques by status correctly', () => {
      const techniques: ResearchTechniqueWithId[] = [
        { ...mockTechnique, id: '1', status: 'implemented' },
        { ...mockTechnique, id: '2', status: 'implemented' },
        { ...mockTechnique, id: '3', status: 'planned' },
        { ...mockTechnique, id: '4', status: 'not-started' },
        { ...mockTechnique, id: '5', status: 'rejected' },
      ];

      const stats = computeStats([], techniques, []);

      expect(stats.techniquesByStatus.implemented).toBe(2);
      expect(stats.techniquesByStatus.planned).toBe(1);
      expect(stats.techniquesByStatus.notStarted).toBe(1);
      expect(stats.techniquesByStatus.rejected).toBe(1);
      expect(stats.techniquesByStatus.inProgress).toBe(0);
    });

    it('should count techniques by priority correctly', () => {
      const techniques: ResearchTechniqueWithId[] = [
        { ...mockTechnique, id: '1', priority: 'P1' },
        { ...mockTechnique, id: '2', priority: 'P1' },
        { ...mockTechnique, id: '3', priority: 'P2' },
        { ...mockTechnique, id: '4', priority: null },
      ];

      const stats = computeStats([], techniques, []);

      expect(stats.techniquesByPriority.P1).toBe(2);
      expect(stats.techniquesByPriority.P2).toBe(1);
      expect(stats.techniquesByPriority.P3).toBe(0);
      expect(stats.techniquesByPriority.P4).toBe(0);
      expect(stats.techniquesByPriority.none).toBe(1);
    });

    it('should compute topic stats correctly', () => {
      const papers: ResearchPaperWithId[] = [
        { ...mockPaper, id: '1', topics: ['consensus'] },
        { ...mockPaper, id: '2', topics: ['consensus', 'routing'] },
        { ...mockPaper, id: '3', topics: ['memory'] },
      ];
      const techniques: ResearchTechniqueWithId[] = [
        { ...mockTechnique, id: '1', topic: 'consensus' },
        { ...mockTechnique, id: '2', topic: 'routing' },
      ];

      const stats = computeStats(papers, techniques, []);

      const consensusStats = stats.topicStats.find((t) => t.topic === 'consensus');
      const routingStats = stats.topicStats.find((t) => t.topic === 'routing');
      const memoryStats = stats.topicStats.find((t) => t.topic === 'memory');

      expect(consensusStats?.paperCount).toBe(2);
      expect(consensusStats?.techniqueCount).toBe(1);
      expect(routingStats?.paperCount).toBe(1);
      expect(routingStats?.techniqueCount).toBe(1);
      expect(memoryStats?.paperCount).toBe(1);
      expect(memoryStats?.techniqueCount).toBe(0);
    });
  });
});

// ============================================================================
// Query Helper Tests
// ============================================================================

describe('Query Helpers', () => {
  const mockIndex = createMockIndex();

  describe('getTechniquesByStatus', () => {
    it('should filter techniques by status', () => {
      const implemented = getTechniquesByStatus(mockIndex, 'implemented');
      expect(implemented.length).toBe(1);
      expect(implemented[0]?.id).toBe('test-technique');
    });

    it('should return empty array for non-matching status', () => {
      const planned = getTechniquesByStatus(mockIndex, 'planned');
      expect(planned.length).toBe(0);
    });
  });

  describe('getTechniquesByPriority', () => {
    it('should filter techniques by priority', () => {
      const p1 = getTechniquesByPriority(mockIndex, 'P1');
      expect(p1.length).toBe(1);
      expect(p1[0]?.id).toBe('test-technique');
    });

    it('should return empty array for non-matching priority', () => {
      const p4 = getTechniquesByPriority(mockIndex, 'P4');
      expect(p4.length).toBe(0);
    });
  });

  describe('getTechniquesByTopic', () => {
    it('should filter techniques by topic', () => {
      const consensus = getTechniquesByTopic(mockIndex, 'consensus');
      expect(consensus.length).toBe(1);
      expect(consensus[0]?.id).toBe('test-technique');
    });

    it('should return empty array for non-matching topic', () => {
      const routing = getTechniquesByTopic(mockIndex, 'routing');
      expect(routing.length).toBe(0);
    });
  });

  describe('getPapersByTopic', () => {
    it('should filter papers by topic', () => {
      const consensus = getPapersByTopic(mockIndex, 'consensus');
      expect(consensus.length).toBe(1);
      expect(consensus[0]?.id).toBe('arxiv-2501.00001');
    });

    it('should return empty array for non-matching topic', () => {
      const routing = getPapersByTopic(mockIndex, 'routing');
      expect(routing.length).toBe(0);
    });
  });

  describe('getRecentlyReviewedPapers', () => {
    it('should return papers sorted by review date', () => {
      const indexWithMultiplePapers: ResearchIndex = {
        ...mockIndex,
        papers: [
          { ...mockPaper, id: '1', reviewed_date: '2026-01-01' },
          { ...mockPaper, id: '2', reviewed_date: '2026-01-10' },
          { ...mockPaper, id: '3', reviewed_date: '2026-01-05' },
        ],
      };

      const recent = getRecentlyReviewedPapers(indexWithMultiplePapers, 2);

      expect(recent.length).toBe(2);
      expect(recent[0]?.id).toBe('2');
      expect(recent[1]?.id).toBe('3');
    });

    it('should respect the limit parameter', () => {
      const recent = getRecentlyReviewedPapers(mockIndex, 1);
      expect(recent.length).toBe(1);
    });
  });

  describe('getTechniquesWithIssues', () => {
    it('should return techniques with implementation issues', () => {
      const withIssues = getTechniquesWithIssues(mockIndex);
      expect(withIssues.length).toBe(1);
      expect(withIssues[0]?.implementation_issue).toBe(100);
    });

    it('should exclude techniques without issues', () => {
      const indexWithoutIssues: ResearchIndex = {
        ...mockIndex,
        techniques: [{ ...mockTechnique, implementation_issue: null }],
      };

      const withIssues = getTechniquesWithIssues(indexWithoutIssues);
      expect(withIssues.length).toBe(0);
    });
  });
});

// ============================================================================
// Generator Tests
// ============================================================================

describe('Generators', () => {
  describe('generateIndexMarkdown', () => {
    it('should generate valid markdown', () => {
      const mockIndex = createMockIndex();
      const result = generateIndexMarkdown(mockIndex);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('# Nexus-Agents Research Index');
        expect(result.value).toContain('## Quick Stats');
        expect(result.value).toContain('## Topics');
      }
    });

    it('should include P1 techniques when enabled', () => {
      const mockIndex = createMockIndex();
      const result = generateIndexMarkdown(mockIndex, { includeP1Table: true });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('## Priority 1 (P1) Techniques');
      }
    });

    it('should exclude P1 techniques when disabled', () => {
      const mockIndex = createMockIndex();
      const result = generateIndexMarkdown(mockIndex, { includeP1Table: false });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).not.toContain('## Priority 1 (P1) Techniques');
      }
    });
  });

  describe('generateStatsJson', () => {
    it('should generate valid JSON', () => {
      const mockIndex = createMockIndex();
      const json = generateStatsJson(mockIndex);

      // Verify it's valid JSON by parsing
      let parsed: {
        schemaVersion: string;
        stats: { totalPapers: number; totalTechniques: number };
      };
      expect(() => {
        parsed = JSON.parse(json) as typeof parsed;
      }).not.toThrow();

      expect(parsed!.schemaVersion).toBe('1.0');
      expect(parsed!.stats.totalPapers).toBe(1);
      expect(parsed!.stats.totalTechniques).toBe(1);
    });
  });

  describe('generateSummaryReport', () => {
    it('should generate a summary report', () => {
      const mockIndex = createMockIndex();
      const summary = generateSummaryReport(mockIndex);

      expect(summary).toContain('# Research Index Summary');
      expect(summary).toContain('Total Papers:');
      expect(summary).toContain('Total Techniques:');
      expect(summary).toContain('Implementation Rate:');
    });
  });
});

// ============================================================================
// Integration Tests (with real registry)
// ============================================================================

describe.skipIf(!hasRealRegistry)('Integration Tests (Real Registry)', () => {
  let index: ResearchIndex;

  beforeAll(() => {
    const result = parseRegistry({ registryPath: TEST_REGISTRY_PATH });
    if (!result.ok) {
      throw new Error(`Failed to parse registry: ${result.error.message}`);
    }
    index = result.value;
  });

  describe('parseRegistry', () => {
    it('should parse all registry files', () => {
      expect(index.papers.length).toBeGreaterThan(0);
      expect(index.techniques.length).toBeGreaterThan(0);
      expect(index.sources.length).toBeGreaterThan(0);
    });

    it('should compute valid statistics', () => {
      expect(index.stats.totalPapers).toBe(index.papers.length);
      expect(index.stats.totalTechniques).toBe(index.techniques.length);
      expect(index.stats.totalSources).toBe(index.sources.length);
    });
  });

  describe('parsePapersRegistry', () => {
    it('should parse papers.yaml', () => {
      const result = parsePapersRegistry(TEST_REGISTRY_PATH);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeGreaterThan(40);
      }
    });
  });

  describe('parseTechniquesRegistry', () => {
    it('should parse techniques.yaml', () => {
      const result = parseTechniquesRegistry(TEST_REGISTRY_PATH);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeGreaterThan(20);
      }
    });
  });

  describe('parseSourcesRegistry', () => {
    it('should parse sources.yaml', () => {
      const result = parseSourcesRegistry(TEST_REGISTRY_PATH);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeGreaterThan(5);
      }
    });
  });

  describe('Statistics', () => {
    it('should have more implemented than not-started techniques', () => {
      const { techniquesByStatus } = index.stats;
      expect(techniquesByStatus.implemented).toBeGreaterThan(techniquesByStatus.notStarted);
    });

    it('should have papers in multiple topics', () => {
      const { topicStats } = index.stats;
      const topicsWithPapers = topicStats.filter((t) => t.paperCount > 0);
      expect(topicsWithPapers.length).toBeGreaterThan(3);
    });
  });

  describe('Markdown Generation', () => {
    it('should generate valid markdown from real data', () => {
      const result = generateIndexMarkdown(index);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeGreaterThan(1000);
        expect(result.value).toContain('## Quick Stats');
        expect(result.value).toContain('## Topics');
      }
    });
  });
});

// ============================================================================
// Edge Case Tests
// ============================================================================

describe('Edge Cases', () => {
  describe('Empty Registries', () => {
    it('should handle empty papers array', () => {
      const stats = computeStats([], [mockTechnique], [mockSource]);
      expect(stats.totalPapers).toBe(0);
      expect(stats.topicStats.every((t) => t.paperCount <= 0 || t.topic === 'cli-tools')).toBe(
        true
      );
    });

    it('should handle empty techniques array', () => {
      const stats = computeStats([mockPaper], [], [mockSource]);
      expect(stats.totalTechniques).toBe(0);
      expect(stats.techniquesByStatus.implemented).toBe(0);
      expect(stats.techniquesByPriority.P1).toBe(0);
    });

    it('should handle empty sources array', () => {
      const stats = computeStats([mockPaper], [mockTechnique], []);
      expect(stats.totalSources).toBe(0);
    });

    it('should handle all empty arrays', () => {
      const stats = computeStats([], [], []);
      expect(stats.totalPapers).toBe(0);
      expect(stats.totalTechniques).toBe(0);
      expect(stats.totalSources).toBe(0);
    });

    it('should generate markdown for empty index', () => {
      const emptyIndex: ResearchIndex = {
        schemaVersion: '1.0',
        generatedAt: '2026-01-13 (ET)',
        papers: [],
        techniques: [],
        sources: [],
        stats: computeStats([], [], []),
      };

      const result = generateIndexMarkdown(emptyIndex);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('# Nexus-Agents Research Index');
        expect(result.value).toContain('Total Papers:** 0');
      }
    });
  });

  describe('Deterministic Output', () => {
    it('should produce identical markdown for same input', () => {
      const mockIndex = createMockIndex();

      const result1 = generateIndexMarkdown(mockIndex);
      const result2 = generateIndexMarkdown(mockIndex);

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      if (result1.ok && result2.ok) {
        expect(result1.value).toBe(result2.value);
      }
    });

    it('should produce identical JSON for same input', () => {
      const mockIndex = createMockIndex();

      const json1 = generateStatsJson(mockIndex);
      const json2 = generateStatsJson(mockIndex);

      expect(json1).toBe(json2);
    });

    it('should produce identical summary for same input', () => {
      const mockIndex = createMockIndex();

      const summary1 = generateSummaryReport(mockIndex);
      const summary2 = generateSummaryReport(mockIndex);

      expect(summary1).toBe(summary2);
    });
  });

  describe('Special Characters', () => {
    it('should handle papers with special characters in title', () => {
      const specialPaper: ResearchPaperWithId = {
        ...mockPaper,
        id: 'special-paper',
        title: 'Paper with "quotes" & <special> characters',
      };

      const index: ResearchIndex = {
        ...createMockIndex(),
        papers: [specialPaper],
      };

      const result = generateIndexMarkdown(index);
      expect(result.ok).toBe(true);
    });

    it('should handle techniques with markdown in description', () => {
      const specialTechnique: ResearchTechniqueWithId = {
        ...mockTechnique,
        id: 'special-technique',
        description: 'Description with *bold* and `code` and [links](http://example.com)',
      };

      const index: ResearchIndex = {
        ...createMockIndex(),
        techniques: [specialTechnique],
      };

      const result = generateIndexMarkdown(index);
      expect(result.ok).toBe(true);
    });
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('Error Handling', () => {
  describe('parseRegistry', () => {
    it('should return error for non-existent directory', () => {
      const result = parseRegistry({ registryPath: '/non/existent/path' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('not found');
      }
    });
  });

  describe('parsePapersRegistry', () => {
    it('should return error for invalid path', () => {
      const result = parsePapersRegistry('/non/existent/path');
      expect(result.ok).toBe(false);
    });
  });

  describe('parseTechniquesRegistry', () => {
    it('should return error for invalid path', () => {
      const result = parseTechniquesRegistry('/non/existent/path');
      expect(result.ok).toBe(false);
    });
  });

  describe('parseSourcesRegistry', () => {
    it('should return error for invalid path', () => {
      const result = parseSourcesRegistry('/non/existent/path');
      expect(result.ok).toBe(false);
    });
  });
});
