/**
 * Tests for research-helpers-status
 *
 * Comprehensive tests for status computation and formatting functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  toStatusSummary,
  filterByStatus,
  countByStatus,
  getResearchStatus,
  formatStatusResult,
  computeTechniqueEvidence,
} from './research-helpers-status.js';
import type {
  TechniqueEntry,
  TechniquesRegistry,
  PapersRegistry,
  PaperEntry,
  ResearchStatusOptions,
  ResearchStatusResult,
} from './research-types.js';
import { ParseError } from '../core/types/workflow.js';
import * as researchIO from './research-helpers-io.js';

// Mock research-helpers-io module
vi.mock('./research-helpers-io.js', () => ({
  loadTechniquesRegistry: vi.fn(),
  loadPapersRegistry: vi.fn(),
}));

// Helper to create a mock paper entry (only the fields the evidence join reads
// need be meaningful; the rest satisfy the PaperEntry shape).
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createMockPaper(overrides: Partial<PaperEntry> = {}) {
  const defaults: PaperEntry = {
    title: 'A Paper',
    authors: [],
    source: 'arxiv',
    arxiv_id: '0000.00000',
    url: 'https://example.com',
    publication_date: '2025-01-01',
    venue: null,
    topics: [],
    tags: [],
    reviewed_date: '2025-01-01',
    reviewed_in: '',
    summary: '',
    key_findings: [],
    relevance: 'medium',
    techniques_extracted: [],
    related_issues: [],
    implementation_status: 'not-started',
  };
  return { ...defaults, ...overrides };
}

function makePapersRegistry(papers: Record<string, PaperEntry>): PapersRegistry {
  return { schema_version: '1.0', papers };
}

// Helper to create mock technique entry
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createMockTechnique(overrides: Partial<TechniqueEntry> = {}) {
  const defaults: TechniqueEntry = {
    name: 'Test Technique',
    description: 'Test description',
    source_papers: [],
    topic: 'testing',
    tags: [],
    metrics: {},
    status: 'not-started',
    priority: null,
    complexity: 'medium',
    integration_files: [],
    implementation_issue: null,
    related_prs: [],
    notes: '',
    dependencies: [],
    decision_history: [],
  };
  return { ...defaults, ...overrides };
}

describe('research-helpers-status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =============================================================================
  // toStatusSummary
  // =============================================================================

  describe('toStatusSummary', () => {
    it('should convert technique entry to status summary', () => {
      const entry = createMockTechnique({
        name: 'Test Technique',
        status: 'implemented',
        priority: 'P1',
        topic: 'optimization',
        implementation_issue: 42,
      });

      const result = toStatusSummary('tech-001', entry);

      expect(result).toEqual({
        id: 'tech-001',
        name: 'Test Technique',
        status: 'implemented',
        priority: 'P1',
        topic: 'optimization',
        implementationIssue: 42,
      });
    });

    it('should handle null priority', () => {
      const entry = createMockTechnique({
        name: 'No Priority Tech',
        priority: null,
      });

      const result = toStatusSummary('tech-002', entry);

      expect(result.priority).toBeNull();
    });

    it('should handle null implementation issue', () => {
      const entry = createMockTechnique({
        implementation_issue: null,
      });

      const result = toStatusSummary('tech-003', entry);

      expect(result.implementationIssue).toBeNull();
    });
  });

  // =============================================================================
  // filterByStatus
  // =============================================================================

  describe('filterByStatus', () => {
    const techniques: Record<string, TechniqueEntry> = {
      'tech-001': createMockTechnique({
        name: 'Alpha Tech',
        status: 'implemented',
        priority: 'P1',
      }),
      'tech-002': createMockTechnique({
        name: 'Beta Tech',
        status: 'planned',
        priority: 'P2',
      }),
      'tech-003': createMockTechnique({
        name: 'Gamma Tech',
        status: 'not-started',
        priority: 'P1',
      }),
      'tech-004': createMockTechnique({
        name: 'Delta Tech',
        status: 'rejected',
        priority: null,
      }),
      'tech-005': createMockTechnique({
        name: 'Epsilon Tech',
        status: 'in-progress',
        priority: 'P3',
      }),
    };

    it('should filter by implemented status', () => {
      const result = filterByStatus(techniques, 'implemented');

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('tech-001');
      expect(result[0]?.status).toBe('implemented');
    });

    it('should filter by planned status', () => {
      const result = filterByStatus(techniques, 'planned');

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('tech-002');
      expect(result[0]?.status).toBe('planned');
    });

    it('should filter by in-progress status', () => {
      const result = filterByStatus(techniques, 'in-progress');

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('tech-005');
      expect(result[0]?.status).toBe('in-progress');
    });

    it('should filter by not-started status', () => {
      const result = filterByStatus(techniques, 'not-started');

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('tech-003');
    });

    it('should filter by rejected status', () => {
      const result = filterByStatus(techniques, 'rejected');

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('tech-004');
    });

    it('should return all techniques when status is "all"', () => {
      const result = filterByStatus(techniques, 'all');

      expect(result).toHaveLength(5);
    });

    it('should handle empty techniques object', () => {
      const result = filterByStatus({}, 'implemented');

      expect(result).toEqual([]);
    });

    it('should sort by priority then name', () => {
      const mixedTechniques: Record<string, TechniqueEntry> = {
        'tech-001': createMockTechnique({ name: 'Zulu', priority: 'P2' }),
        'tech-002': createMockTechnique({ name: 'Alpha', priority: 'P1' }),
        'tech-003': createMockTechnique({ name: 'Beta', priority: 'P1' }),
        'tech-004': createMockTechnique({ name: 'Charlie', priority: null }),
      };

      const result = filterByStatus(mixedTechniques, 'all');

      expect(result[0]?.name).toBe('Alpha'); // P1, alphabetically first
      expect(result[1]?.name).toBe('Beta'); // P1, alphabetically second
      expect(result[2]?.name).toBe('Zulu'); // P2
      expect(result[3]?.name).toBe('Charlie'); // null priority (sorted last)
    });

    it('should handle unknown priority values', () => {
      const unknownPriority: Record<string, TechniqueEntry> = {
        'tech-001': createMockTechnique({
          name: 'Test',
          // @ts-expect-error Testing unknown priority value
          priority: 'P99',
        }),
      };

      const result = filterByStatus(unknownPriority, 'all');

      expect(result).toHaveLength(1);
      expect(result[0]?.priority).toBe('P99');
    });
  });

  // =============================================================================
  // countByStatus
  // =============================================================================

  describe('countByStatus', () => {
    it('should count techniques by status', () => {
      const techniques: Record<string, TechniqueEntry> = {
        'tech-001': createMockTechnique({ status: 'implemented' }),
        'tech-002': createMockTechnique({ status: 'implemented' }),
        'tech-003': createMockTechnique({ status: 'planned' }),
        'tech-004': createMockTechnique({ status: 'in-progress' }),
        'tech-005': createMockTechnique({ status: 'not-started' }),
        'tech-006': createMockTechnique({ status: 'rejected' }),
      };

      const result = countByStatus(techniques);

      expect(result).toEqual({
        implemented: 2,
        planned: 2, // planned + in-progress
        notStarted: 1,
        rejected: 1,
        total: 6,
      });
    });

    it('should treat in-progress as planned', () => {
      const techniques: Record<string, TechniqueEntry> = {
        'tech-001': createMockTechnique({ status: 'in-progress' }),
        'tech-002': createMockTechnique({ status: 'planned' }),
      };

      const result = countByStatus(techniques);

      expect(result.planned).toBe(2);
      expect(result.total).toBe(2);
    });

    it('should handle empty techniques object', () => {
      const result = countByStatus({});

      expect(result).toEqual({
        implemented: 0,
        planned: 0,
        notStarted: 0,
        rejected: 0,
        total: 0,
      });
    });

    it('should calculate correct total', () => {
      const techniques: Record<string, TechniqueEntry> = {
        'tech-001': createMockTechnique({ status: 'implemented' }),
        'tech-002': createMockTechnique({ status: 'planned' }),
        'tech-003': createMockTechnique({ status: 'not-started' }),
        'tech-004': createMockTechnique({ status: 'rejected' }),
      };

      const result = countByStatus(techniques);

      expect(result.total).toBe(4);
      expect(result.total).toBe(
        result.implemented + result.planned + result.notStarted + result.rejected
      );
    });
  });

  // =============================================================================
  // computeTechniqueEvidence (#4287)
  // =============================================================================

  describe('computeTechniqueEvidence', () => {
    it('returns the MAX quality_score (and its tier) across resolved source papers', () => {
      const entry = createMockTechnique({ source_papers: ['p-low', 'p-high', 'p-mid'] });
      const papers = makePapersRegistry({
        'p-low': createMockPaper({ quality_score: 3.0, evidence_tier: 'low' }),
        'p-high': createMockPaper({ quality_score: 9.5, evidence_tier: 'high' }),
        'p-mid': createMockPaper({ quality_score: 6.0, evidence_tier: 'medium' }),
      });

      expect(computeTechniqueEvidence(entry, papers)).toEqual({
        evidenceTier: 'high',
        qualityScore: 9.5,
      });
    });

    it('defaults a scored paper without an evidence_tier to "low"', () => {
      const entry = createMockTechnique({ source_papers: ['p-1'] });
      const papers = makePapersRegistry({
        'p-1': createMockPaper({ quality_score: 8.0 }),
      });

      expect(computeTechniqueEvidence(entry, papers)).toEqual({
        evidenceTier: 'low',
        qualityScore: 8.0,
      });
    });

    it('returns undefined for a technique with zero source papers', () => {
      const entry = createMockTechnique({ source_papers: [] });
      const papers = makePapersRegistry({
        'p-1': createMockPaper({ quality_score: 9.0, evidence_tier: 'high' }),
      });

      expect(computeTechniqueEvidence(entry, papers)).toBeUndefined();
    });

    it('skips source paper ids missing from the registry', () => {
      const entry = createMockTechnique({ source_papers: ['missing', 'p-present'] });
      const papers = makePapersRegistry({
        'p-present': createMockPaper({ quality_score: 5.5, evidence_tier: 'medium' }),
      });

      expect(computeTechniqueEvidence(entry, papers)).toEqual({
        evidenceTier: 'medium',
        qualityScore: 5.5,
      });
    });

    it('returns undefined when no source paper resolves (all ids missing)', () => {
      const entry = createMockTechnique({ source_papers: ['nope-1', 'nope-2'] });
      const papers = makePapersRegistry({
        other: createMockPaper({ quality_score: 9.0, evidence_tier: 'high' }),
      });

      expect(computeTechniqueEvidence(entry, papers)).toBeUndefined();
    });

    it('returns undefined when resolved papers carry no numeric quality_score', () => {
      const entry = createMockTechnique({ source_papers: ['p-1'] });
      const papers = makePapersRegistry({
        // Registered, but no quality_score — nothing to weight on.
        'p-1': createMockPaper({ evidence_tier: 'high' }),
      });

      expect(computeTechniqueEvidence(entry, papers)).toBeUndefined();
    });

    it('is fail-soft against a malformed registry with no papers map', () => {
      const entry = createMockTechnique({ source_papers: ['p-1'] });
      // Simulate an unparsable/partial papers.yaml where `papers` is absent.
      const malformed = { schema_version: '1.0' } as unknown as PapersRegistry;

      expect(computeTechniqueEvidence(entry, malformed)).toBeUndefined();
    });
  });

  // =============================================================================
  // getResearchStatus
  // =============================================================================

  describe('getResearchStatus', () => {
    const mockRegistry: TechniquesRegistry = {
      schema_version: '1.0',
      techniques: {
        'tech-001': createMockTechnique({
          name: 'Alpha',
          status: 'implemented',
          priority: 'P1',
          topic: 'optimization',
        }),
        'tech-002': createMockTechnique({
          name: 'Beta',
          status: 'planned',
          priority: 'P2',
          topic: 'routing',
        }),
        'tech-003': createMockTechnique({
          name: 'Gamma',
          status: 'not-started',
          priority: 'P3',
          topic: 'observability',
        }),
      },
    };

    it('should return all techniques when no filters applied', async () => {
      vi.mocked(researchIO.loadTechniquesRegistry).mockResolvedValue({
        ok: true,
        value: mockRegistry,
      });

      const options: ResearchStatusOptions = {
        status: 'all',
        format: 'table',
      };

      const result = await getResearchStatus(options);

      expect(result.success).toBe(true);
      expect(result.techniques).toHaveLength(3);
      expect(result.counts.total).toBe(3);
    });

    it('should filter by status', async () => {
      vi.mocked(researchIO.loadTechniquesRegistry).mockResolvedValue({
        ok: true,
        value: mockRegistry,
      });

      const options: ResearchStatusOptions = {
        status: 'implemented',
        format: 'table',
      };

      const result = await getResearchStatus(options);

      expect(result.success).toBe(true);
      expect(result.techniques).toHaveLength(1);
      expect(result.techniques[0]?.id).toBe('tech-001');
    });

    it('should return specific technique by ID', async () => {
      vi.mocked(researchIO.loadTechniquesRegistry).mockResolvedValue({
        ok: true,
        value: mockRegistry,
      });

      const options: ResearchStatusOptions = {
        techniqueId: 'tech-002',
        status: 'all',
        format: 'table',
      };

      const result = await getResearchStatus(options);

      expect(result.success).toBe(true);
      expect(result.techniques).toHaveLength(1);
      expect(result.techniques[0]?.id).toBe('tech-002');
      expect(result.techniques[0]?.name).toBe('Beta');
    });

    it('should return failure when technique ID not found', async () => {
      vi.mocked(researchIO.loadTechniquesRegistry).mockResolvedValue({
        ok: true,
        value: mockRegistry,
      });

      const options: ResearchStatusOptions = {
        techniqueId: 'nonexistent',
        status: 'all',
        format: 'table',
      };

      const result = await getResearchStatus(options);

      expect(result.success).toBe(false);
      expect(result.techniques).toEqual([]);
      expect(result.counts.total).toBe(3); // Still has overall counts
    });

    it('should return failure when registry load fails', async () => {
      vi.mocked(researchIO.loadTechniquesRegistry).mockResolvedValue({
        ok: false,
        error: new ParseError('Failed to load'),
      });

      const options: ResearchStatusOptions = {
        status: 'all',
        format: 'table',
      };

      const result = await getResearchStatus(options);

      expect(result.success).toBe(false);
      expect(result.techniques).toEqual([]);
      expect(result.counts).toEqual({
        implemented: 0,
        planned: 0,
        notStarted: 0,
        rejected: 0,
        total: 0,
      });
    });

    it('should handle empty string technique ID as undefined', async () => {
      vi.mocked(researchIO.loadTechniquesRegistry).mockResolvedValue({
        ok: true,
        value: mockRegistry,
      });

      const options: ResearchStatusOptions = {
        techniqueId: '',
        status: 'all',
        format: 'table',
      };

      const result = await getResearchStatus(options);

      expect(result.success).toBe(true);
      expect(result.techniques).toHaveLength(3); // Returns all, not a specific one
    });

    it('should include overall counts even when filtering', async () => {
      vi.mocked(researchIO.loadTechniquesRegistry).mockResolvedValue({
        ok: true,
        value: mockRegistry,
      });

      const options: ResearchStatusOptions = {
        status: 'implemented',
        format: 'table',
      };

      const result = await getResearchStatus(options);

      expect(result.success).toBe(true);
      expect(result.techniques).toHaveLength(1);
      expect(result.counts.total).toBe(3); // Overall total, not filtered
      expect(result.counts.implemented).toBe(1);
      expect(result.counts.planned).toBe(1);
      expect(result.counts.notStarted).toBe(1);
    });

    it('joins papers.yaml evidence onto summaries when the registry resolves (#4287)', async () => {
      const registryWithPapers: TechniquesRegistry = {
        schema_version: '1.0',
        techniques: {
          'tech-001': createMockTechnique({
            name: 'Alpha',
            status: 'implemented',
            priority: 'P1',
            topic: 'optimization',
            source_papers: ['p-a', 'p-b'],
          }),
          'tech-002': createMockTechnique({
            name: 'Beta',
            status: 'planned',
            priority: 'P2',
            topic: 'routing',
            source_papers: ['p-missing'],
          }),
        },
      };
      vi.mocked(researchIO.loadTechniquesRegistry).mockResolvedValue({
        ok: true,
        value: registryWithPapers,
      });
      vi.mocked(researchIO.loadPapersRegistry).mockResolvedValue({
        ok: true,
        value: makePapersRegistry({
          'p-a': createMockPaper({ quality_score: 4.0, evidence_tier: 'medium' }),
          'p-b': createMockPaper({ quality_score: 9.0, evidence_tier: 'high' }),
        }),
      });

      const result = await getResearchStatus({ status: 'all', format: 'json' });
      const alpha = result.techniques.find((t) => t.id === 'tech-001');
      const beta = result.techniques.find((t) => t.id === 'tech-002');

      // Alpha weights on its best (max) source paper.
      expect(alpha?.evidenceTier).toBe('high');
      expect(alpha?.qualityScore).toBe(9.0);
      // Beta's only source paper is unresolved → fields stay absent (fail-soft).
      expect(beta?.evidenceTier).toBeUndefined();
      expect(beta?.qualityScore).toBeUndefined();
    });

    it('leaves summaries unchanged when papers.yaml fails to load (fail-soft #4287)', async () => {
      vi.mocked(researchIO.loadTechniquesRegistry).mockResolvedValue({
        ok: true,
        value: mockRegistry,
      });
      vi.mocked(researchIO.loadPapersRegistry).mockResolvedValue({
        ok: false,
        error: new ParseError('papers.yaml unparsable'),
      });

      const result = await getResearchStatus({ status: 'all', format: 'json' });

      expect(result.success).toBe(true);
      for (const t of result.techniques) {
        expect(t.evidenceTier).toBeUndefined();
        expect(t.qualityScore).toBeUndefined();
      }
    });
  });

  // =============================================================================
  // formatStatusResult
  // =============================================================================

  describe('formatStatusResult', () => {
    const baseResult: ResearchStatusResult = {
      success: true,
      techniques: [
        {
          id: 'tech-001',
          name: 'Alpha Tech',
          status: 'implemented',
          priority: 'P1',
          topic: 'optimization',
          implementationIssue: 42,
        },
        {
          id: 'tech-002',
          name: 'Beta Tech',
          status: 'planned',
          priority: 'P2',
          topic: 'routing',
          implementationIssue: null,
        },
      ],
      counts: {
        implemented: 1,
        planned: 1,
        notStarted: 0,
        rejected: 0,
        total: 2,
      },
    };

    describe('json format', () => {
      it('should format result as JSON', () => {
        const output = formatStatusResult(baseResult, 'json');

        const parsed = JSON.parse(output);
        expect(parsed).toEqual(baseResult);
      });

      it('should format with proper indentation', () => {
        const output = formatStatusResult(baseResult, 'json');

        expect(output).toContain('  '); // Contains indentation
        expect(output).toContain('\n'); // Contains newlines
      });
    });

    describe('compact format', () => {
      it('should format result in compact mode', () => {
        const output = formatStatusResult(baseResult, 'compact');

        expect(output).toContain('implemented');
        expect(output).toContain('P1');
        expect(output).toContain('tech-001');
        expect(output).toContain('planned');
        expect(output).toContain('P2');
        expect(output).toContain('tech-002');
      });

      it('should handle null priority with dash', () => {
        const result: ResearchStatusResult = {
          ...baseResult,
          techniques: [
            {
              id: 'tech-001',
              name: 'Test',
              status: 'not-started',
              priority: null,
              topic: 'testing',
              implementationIssue: null,
            },
          ],
        };

        const output = formatStatusResult(result, 'compact');

        expect(output).toContain('-'); // Dash for null priority
      });

      it('should align columns properly', () => {
        const output = formatStatusResult(baseResult, 'compact');

        const lines = output.split('\n');
        expect(lines).toHaveLength(2);
        // Each line should have consistent spacing
        expect(lines[0]).toMatch(/\w+\s+\w+\s+[\w-]+/);
      });
    });

    describe('table format', () => {
      it('should format result as table', () => {
        const output = formatStatusResult(baseResult, 'table');

        expect(output).toContain('Research Registry Status');
        expect(output).toContain('='.repeat(60));
        expect(output).toContain('Implemented: 1');
        expect(output).toContain('Planned: 1');
        expect(output).toContain('Not Started: 0');
        expect(output).toContain('Rejected: 0');
        expect(output).toContain('Total: 2');
      });

      it('should include table header', () => {
        const output = formatStatusResult(baseResult, 'table');

        expect(output).toContain('Status       | Pri | Topic          | ID');
        expect(output).toContain('-'.repeat(60));
      });

      it('should format technique rows', () => {
        const output = formatStatusResult(baseResult, 'table');

        expect(output).toContain('implemented');
        expect(output).toContain('P1');
        expect(output).toContain('optimization');
        expect(output).toContain('tech-001');
      });

      it('should truncate long topic names', () => {
        const result: ResearchStatusResult = {
          ...baseResult,
          techniques: [
            {
              id: 'tech-001',
              name: 'Test',
              status: 'implemented',
              priority: 'P1',
              topic: 'very-long-topic-name-that-exceeds-limit',
              implementationIssue: null,
            },
          ],
        };

        const output = formatStatusResult(result, 'table');

        // Topic should be truncated to 14 chars
        expect(output).toContain('very-long-topi');
      });

      it('should handle null priority in table', () => {
        const result: ResearchStatusResult = {
          ...baseResult,
          techniques: [
            {
              id: 'tech-001',
              name: 'Test',
              status: 'not-started',
              priority: null,
              topic: 'testing',
              implementationIssue: null,
            },
          ],
        };

        const output = formatStatusResult(result, 'table');

        expect(output).toContain('-   |'); // Dash for null priority
      });

      it('should handle empty techniques list', () => {
        const result: ResearchStatusResult = {
          success: true,
          techniques: [],
          counts: {
            implemented: 0,
            planned: 0,
            notStarted: 0,
            rejected: 0,
            total: 0,
          },
        };

        const output = formatStatusResult(result, 'table');

        expect(output).toContain('No techniques found matching criteria.');
        expect(output).not.toContain('Status       | Pri | Topic');
      });

      it('should pad columns consistently', () => {
        const output = formatStatusResult(baseResult, 'table');

        const lines = output.split('\n');
        const dataLines = lines.filter((line) => line.includes('tech-'));

        // All data lines should have consistent column separators
        dataLines.forEach((line) => {
          expect(line).toMatch(/\|\s+\w+\s+\|/); // Has | separator with spacing
        });
      });
    });
  });
});
