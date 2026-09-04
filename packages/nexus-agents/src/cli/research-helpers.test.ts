/**
 * Tests for research-helpers
 *
 * (Source: Issue #249 - CLI test coverage)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { REGISTRY_PATH } from './research-helpers-io.js';
import {
  getProjectRoot,
  toStatusSummary,
  filterByStatus,
  countByStatus,
  formatStatusResult,
  calculateTagOverlap,
  findSharedTags,
  determineRelationship,
  formatOverlapResult,
} from './research-helpers.js';
import type {
  TechniqueEntry,
  ResearchStatusResult,
  ResearchOverlapResult,
} from './research-types.js';

// Mock node:fs/promises
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

// Mock yaml
vi.mock('yaml', () => ({
  parse: vi.fn(),
  stringify: vi.fn(),
}));

describe('research-helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getProjectRoot', () => {
    // Previously pinned `process.cwd()` — the #5053 defect: vitest runs with
    // cwd at packages/nexus-agents, which is not where the registry lives.
    it('should return the ancestor that owns docs/research/registry, not cwd', () => {
      const result = getProjectRoot();
      expect(result).not.toBe(process.cwd());
      expect(existsSync(join(result, REGISTRY_PATH))).toBe(true);
      expect(process.cwd().startsWith(result)).toBe(true);
    });
  });

  describe('toStatusSummary', () => {
    it('should convert technique entry to status summary', () => {
      const entry: TechniqueEntry = {
        name: 'Test Technique',
        description: 'A test technique',
        source_papers: ['arxiv-1234'],
        topic: 'consensus',
        tags: ['test', 'sample'],
        metrics: {},
        status: 'implemented',
        priority: 'P1',
        complexity: 'medium',
        integration_files: [],
        implementation_issue: 123,
        related_prs: [],
        notes: '',
        dependencies: [],
        decision_history: [],
      };

      const result = toStatusSummary('test-technique', entry);

      expect(result).toEqual({
        id: 'test-technique',
        name: 'Test Technique',
        status: 'implemented',
        priority: 'P1',
        topic: 'consensus',
        implementationIssue: 123,
      });
    });

    it('should handle null priority', () => {
      const entry: TechniqueEntry = {
        name: 'No Priority',
        description: '',
        source_papers: [],
        topic: 'routing',
        tags: [],
        metrics: {},
        status: 'not-started',
        priority: null,
        complexity: 'low',
        integration_files: [],
        implementation_issue: null,
        related_prs: [],
        notes: '',
        dependencies: [],
        decision_history: [],
      };

      const result = toStatusSummary('no-priority', entry);

      expect(result.priority).toBeNull();
      expect(result.implementationIssue).toBeNull();
    });
  });

  describe('filterByStatus', () => {
    const techniques: Record<string, TechniqueEntry> = {
      'tech-1': {
        name: 'Tech 1',
        description: '',
        source_papers: [],
        topic: 'consensus',
        tags: [],
        metrics: {},
        status: 'implemented',
        priority: 'P1',
        complexity: 'low',
        integration_files: [],
        implementation_issue: null,
        related_prs: [],
        notes: '',
        dependencies: [],
        decision_history: [],
      },
      'tech-2': {
        name: 'Tech 2',
        description: '',
        source_papers: [],
        topic: 'routing',
        tags: [],
        metrics: {},
        status: 'planned',
        priority: 'P2',
        complexity: 'medium',
        integration_files: [],
        implementation_issue: null,
        related_prs: [],
        notes: '',
        dependencies: [],
        decision_history: [],
      },
      'tech-3': {
        name: 'Tech 3',
        description: '',
        source_papers: [],
        topic: 'memory',
        tags: [],
        metrics: {},
        status: 'implemented',
        priority: 'P2',
        complexity: 'high',
        integration_files: [],
        implementation_issue: null,
        related_prs: [],
        notes: '',
        dependencies: [],
        decision_history: [],
      },
    };

    it('should filter by implemented status', () => {
      const result = filterByStatus(techniques, 'implemented');

      expect(result).toHaveLength(2);
      expect(result.map((t) => t.id)).toContain('tech-1');
      expect(result.map((t) => t.id)).toContain('tech-3');
    });

    it('should return all techniques when status is all', () => {
      const result = filterByStatus(techniques, 'all');

      expect(result).toHaveLength(3);
    });

    it('should sort by priority then name', () => {
      const result = filterByStatus(techniques, 'all');

      // P1 should come first
      expect(result[0]?.priority).toBe('P1');
    });
  });

  describe('countByStatus', () => {
    it('should count techniques by status', () => {
      const techniques: Record<string, TechniqueEntry> = {
        'impl-1': createTechniqueEntry('implemented'),
        'impl-2': createTechniqueEntry('implemented'),
        'planned-1': createTechniqueEntry('planned'),
        'progress-1': createTechniqueEntry('in-progress'),
        'not-started-1': createTechniqueEntry('not-started'),
        'rejected-1': createTechniqueEntry('rejected'),
      };

      const result = countByStatus(techniques);

      expect(result.implemented).toBe(2);
      expect(result.planned).toBe(2); // planned + in-progress
      expect(result.notStarted).toBe(1);
      expect(result.rejected).toBe(1);
      expect(result.total).toBe(6);
    });
  });

  describe('formatStatusResult', () => {
    const mockResult: ResearchStatusResult = {
      success: true,
      techniques: [
        {
          id: 'tech-1',
          name: 'Technique 1',
          status: 'implemented',
          priority: 'P1',
          topic: 'consensus',
          implementationIssue: 100,
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
      const result = formatStatusResult(mockResult, 'json');

      expect((): unknown => JSON.parse(result)).not.toThrow();
      const parsed = JSON.parse(result) as ResearchStatusResult;
      expect(parsed.success).toBe(true);
    });

    it('should format as compact', () => {
      const result = formatStatusResult(mockResult, 'compact');

      expect(result).toContain('implemented');
      expect(result).toContain('P1');
      expect(result).toContain('tech-1');
    });

    it('should format as table', () => {
      const result = formatStatusResult(mockResult, 'table');

      expect(result).toContain('Research Registry Status');
      expect(result).toContain('Implemented: 1');
      expect(result).toContain('Total: 1');
      expect(result).toContain('Status');
      expect(result).toContain('Pri');
      expect(result).toContain('Topic');
    });

    it('should show no techniques message when empty', () => {
      const emptyResult: ResearchStatusResult = {
        success: true,
        techniques: [],
        counts: { implemented: 0, planned: 0, notStarted: 0, rejected: 0, total: 0 },
      };

      const result = formatStatusResult(emptyResult, 'table');

      expect(result).toContain('No techniques found');
    });
  });

  describe('calculateTagOverlap', () => {
    it('should calculate Jaccard similarity', () => {
      const tags1 = ['a', 'b', 'c'];
      const tags2 = ['b', 'c', 'd'];

      const result = calculateTagOverlap(tags1, tags2);

      // Intersection: {b, c} = 2, Union: {a, b, c, d} = 4
      expect(result).toBe(0.5);
    });

    it('should return 0 for no overlap', () => {
      const result = calculateTagOverlap(['a', 'b'], ['c', 'd']);
      expect(result).toBe(0);
    });

    it('should return 1 for identical tags', () => {
      const result = calculateTagOverlap(['a', 'b'], ['a', 'b']);
      expect(result).toBe(1);
    });

    it('should return 0 for empty arrays', () => {
      const result = calculateTagOverlap([], []);
      expect(result).toBe(0);
    });
  });

  describe('findSharedTags', () => {
    it('should find shared tags', () => {
      const result = findSharedTags(['a', 'b', 'c'], ['b', 'c', 'd']);
      expect(result).toEqual(['b', 'c']);
    });

    it('should return empty array for no overlap', () => {
      const result = findSharedTags(['a', 'b'], ['c', 'd']);
      expect(result).toEqual([]);
    });
  });

  describe('determineRelationship', () => {
    it('should return overlapping for same topic with high overlap', () => {
      const source = createTechniqueEntry('implemented', 'consensus');
      const target = createTechniqueEntry('planned', 'consensus');

      const result = determineRelationship(source, target, 0.6);

      expect(result).toBe('overlapping');
    });

    it('should return complementary for same topic with low overlap', () => {
      const source = createTechniqueEntry('implemented', 'consensus');
      const target = createTechniqueEntry('planned', 'consensus');

      const result = determineRelationship(source, target, 0.3);

      expect(result).toBe('complementary');
    });

    it('should return enhances for different topic with moderate overlap', () => {
      const source = createTechniqueEntry('implemented', 'consensus');
      const target = createTechniqueEntry('planned', 'routing');

      const result = determineRelationship(source, target, 0.4);

      expect(result).toBe('enhances');
    });

    it('should return complementary for different topic with low overlap', () => {
      const source = createTechniqueEntry('implemented', 'consensus');
      const target = createTechniqueEntry('planned', 'memory');

      const result = determineRelationship(source, target, 0.1);

      expect(result).toBe('complementary');
    });
  });

  describe('formatOverlapResult', () => {
    it('should format as JSON', () => {
      const result: ResearchOverlapResult = {
        success: true,
        sourceId: 'tech-1',
        matches: [],
        suggestedAlignments: [],
      };

      const output = formatOverlapResult(result, 'json');

      expect((): unknown => JSON.parse(output)).not.toThrow();
    });

    it('should format table with matches', () => {
      const result: ResearchOverlapResult = {
        success: true,
        sourceId: 'tech-1',
        matches: [
          {
            techniqueId: 'tech-2',
            name: 'Related Technique',
            overlapScore: 0.75,
            sharedTags: ['tag1', 'tag2'],
            sharedTopic: true,
            relationship: 'overlapping',
          },
        ],
        suggestedAlignments: ['tech-1 -> tech-2: overlapping'],
      };

      const output = formatOverlapResult(result, 'table');

      expect(output).toContain('Overlap Analysis: tech-1');
      expect(output).toContain('Found 1 related technique');
      expect(output).toContain('tech-2');
      expect(output).toContain('75%');
      expect(output).toContain('tag1, tag2');
      expect(output).toContain('Suggested alignments');
    });

    it('should show not found message on failure', () => {
      const result: ResearchOverlapResult = {
        success: false,
        sourceId: 'unknown',
        matches: [],
        suggestedAlignments: [],
      };

      const output = formatOverlapResult(result, 'table');

      expect(output).toContain("'unknown' not found");
    });

    it('should show no overlap message when empty', () => {
      const result: ResearchOverlapResult = {
        success: true,
        sourceId: 'tech-1',
        matches: [],
        suggestedAlignments: [],
      };

      const output = formatOverlapResult(result, 'table');

      expect(output).toContain('No overlapping techniques found');
    });
  });
});

// Helper function to create technique entries for testing
function createTechniqueEntry(
  status: TechniqueEntry['status'],
  topic: string = 'consensus'
): TechniqueEntry {
  return {
    name: 'Test Technique',
    description: '',
    source_papers: [],
    topic,
    tags: [],
    metrics: {},
    status,
    priority: null,
    complexity: 'low',
    integration_files: [],
    implementation_issue: null,
    related_prs: [],
    notes: '',
    dependencies: [],
    decision_history: [],
  };
}
