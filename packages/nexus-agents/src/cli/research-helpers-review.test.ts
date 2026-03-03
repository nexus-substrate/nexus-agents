/**
 * Tests for research-helpers-review.ts
 *
 * @module cli/research-helpers-review.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  executeReview,
  formatReviewResults,
  executePrioritize,
  type ReviewOptions,
  type ReviewResult,
  type PrioritizeOptions,
} from './research-helpers-review.js';
import type { DiscoveredSource } from './research-helpers-sources.js';
import type { QualityScore } from './research-helpers-scoring.js';
import type { TechniqueEntry } from './research-types.js';
import { ParseError } from '../core/types/workflow.js';

// =============================================================================
// MOCKS
// =============================================================================

vi.mock('./research-helpers-scoring.js', () => ({
  rankDiscoveredItems: vi.fn(),
}));

vi.mock('./research-helpers-issues.js', () => ({
  formatResearchIssueBody: vi.fn(),
  createResearchIssue: vi.fn(),
}));

vi.mock('./research-helpers-io.js', () => ({
  loadTechniquesRegistry: vi.fn(),
}));

// =============================================================================
// HELPERS
// =============================================================================

/** Create a minimal TechniqueEntry with required fields, allowing partial overrides. */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeTechnique(
  overrides: Partial<TechniqueEntry> & Pick<TechniqueEntry, 'name' | 'topic' | 'status'>
) {
  return {
    description: '',
    source_papers: [],
    tags: [],
    metrics: {},
    priority: 'P2' as const,
    complexity: 'medium' as const,
    integration_files: [],
    implementation_issue: null,
    related_prs: [],
    notes: '',
    dependencies: [],
    decision_history: [],
    ...overrides,
  } satisfies TechniqueEntry;
}

// =============================================================================
// TEST DATA
// =============================================================================

const mockDiscoveredItem: DiscoveredSource = {
  title: 'Advanced Multi-Agent System',
  source: 'arxiv',
  url: 'https://arxiv.org/abs/2401.12345',
  description: 'Novel approach to multi-agent coordination',
  relevance: 'high',
  discoveredAt: '2024-01-01T00:00:00Z',
};

const mockQualityScore: QualityScore = {
  relevance: 0.9,
  impact: 0.8,
  recency: 0.7,
  reproducibility: 0.6,
  composite: 0.75,
};

const mockRankedItem = { item: mockDiscoveredItem, score: mockQualityScore };

// =============================================================================
// TESTS: executeReview
// =============================================================================

describe('executeReview', () => {
  beforeEach(() => {
    // Vitest 4: resetAllMocks to clear implementations that leak between tests
    // (restoreMocks no longer resets vi.fn() implementations in v4)
    vi.resetAllMocks();
  });

  it('should execute discovery and return basic review result', async () => {
    const { rankDiscoveredItems } = await import('./research-helpers-scoring.js');
    const mockDiscover = vi.fn(() =>
      Promise.resolve({ results: [mockDiscoveredItem], errors: [] })
    );
    vi.mocked(rankDiscoveredItems).mockReturnValue([mockRankedItem]);

    const options: ReviewOptions = {
      topic: 'multi-agent systems',
      maxResults: 10,
      createIssues: false,
      vote: false,
    };

    const result = await executeReview(options, mockDiscover);

    expect(mockDiscover).toHaveBeenCalledWith('multi-agent systems', 10);
    expect(rankDiscoveredItems).toHaveBeenCalledWith([mockDiscoveredItem], 'multi-agent systems');
    expect(result.topic).toBe('multi-agent systems');
    expect(result.itemCount).toBe(1);
    expect(result.rankedItems).toEqual([mockRankedItem]);
    expect(result.issuesCreated).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('should propagate discovery errors', async () => {
    const { rankDiscoveredItems } = await import('./research-helpers-scoring.js');
    const mockDiscover = vi.fn(() =>
      Promise.resolve({ results: [], errors: ['Failed to fetch from source'] })
    );
    vi.mocked(rankDiscoveredItems).mockReturnValue([]);

    const options: ReviewOptions = {
      topic: 'test',
      maxResults: 5,
      createIssues: false,
      vote: false,
    };

    const result = await executeReview(options, mockDiscover);

    expect(result.errors).toEqual(['Failed to fetch from source']);
  });

  it('should create issues for high-quality items when createIssues=true', async () => {
    const { rankDiscoveredItems } = await import('./research-helpers-scoring.js');
    const { formatResearchIssueBody, createResearchIssue } =
      await import('./research-helpers-issues.js');

    const highQualityItem = {
      item: mockDiscoveredItem,
      score: { ...mockQualityScore, composite: 0.85 },
    };
    const mockDiscover = vi.fn(() =>
      Promise.resolve({ results: [mockDiscoveredItem], errors: [] })
    );
    vi.mocked(rankDiscoveredItems).mockReturnValue([highQualityItem]);
    vi.mocked(formatResearchIssueBody).mockReturnValue('Issue body content');
    vi.mocked(createResearchIssue).mockResolvedValue({
      ok: true,
      value: { success: true, url: 'https://github.com/owner/repo/issues/123', message: 'Created' },
    });

    const options: ReviewOptions = {
      topic: 'test',
      maxResults: 10,
      createIssues: true,
      vote: false,
    };

    const result = await executeReview(options, mockDiscover);

    expect(formatResearchIssueBody).toHaveBeenCalled();
    expect(createResearchIssue).toHaveBeenCalledWith({
      title: 'research: Advanced Multi-Agent System',
      body: 'Issue body content',
      labels: ['research', 'discovered'],
    });
    expect(result.issuesCreated).toEqual(['https://github.com/owner/repo/issues/123']);
  });

  it('should filter only high-quality items (composite >= 0.6) for issue creation', async () => {
    const { rankDiscoveredItems } = await import('./research-helpers-scoring.js');
    const { createResearchIssue } = await import('./research-helpers-issues.js');

    const lowQualityItem = {
      item: mockDiscoveredItem,
      score: { ...mockQualityScore, composite: 0.5 },
    };
    const mockDiscover = vi.fn(() =>
      Promise.resolve({ results: [mockDiscoveredItem], errors: [] })
    );
    vi.mocked(rankDiscoveredItems).mockReturnValue([lowQualityItem]);

    const options: ReviewOptions = {
      topic: 'test',
      maxResults: 10,
      createIssues: true,
      vote: false,
    };

    const result = await executeReview(options, mockDiscover);

    expect(createResearchIssue).not.toHaveBeenCalled();
    expect(result.issuesCreated).toEqual([]);
  });

  it('should limit issue creation to top 5 items', async () => {
    const { rankDiscoveredItems } = await import('./research-helpers-scoring.js');
    const { createResearchIssue } = await import('./research-helpers-issues.js');

    const items = Array.from({ length: 10 }, (_, i) => ({
      item: { ...mockDiscoveredItem, title: `Item ${String(i)}` },
      score: { ...mockQualityScore, composite: 0.8 },
    }));
    const mockDiscover = vi.fn(() =>
      Promise.resolve({ results: items.map((r) => r.item), errors: [] })
    );
    vi.mocked(rankDiscoveredItems).mockReturnValue(items);
    vi.mocked(createResearchIssue).mockResolvedValue({
      ok: true,
      value: { success: true, url: 'https://github.com/owner/repo/issues/1', message: 'Created' },
    });

    const options: ReviewOptions = {
      topic: 'test',
      maxResults: 10,
      createIssues: true,
      vote: false,
    };

    const result = await executeReview(options, mockDiscover);

    expect(createResearchIssue).toHaveBeenCalledTimes(5);
    expect(result.issuesCreated).toHaveLength(5);
  });

  it('should assign P1 priority for items with composite >= 0.8', async () => {
    const { rankDiscoveredItems } = await import('./research-helpers-scoring.js');
    const { formatResearchIssueBody, createResearchIssue } =
      await import('./research-helpers-issues.js');

    const highScoreItem = {
      item: mockDiscoveredItem,
      score: { ...mockQualityScore, composite: 0.85 },
    };
    const mockDiscover = vi.fn(() =>
      Promise.resolve({ results: [mockDiscoveredItem], errors: [] })
    );
    vi.mocked(rankDiscoveredItems).mockReturnValue([highScoreItem]);
    vi.mocked(formatResearchIssueBody).mockImplementation((findings) => {
      expect(findings[0]!.priority).toBe('P1');
      return 'Body';
    });
    vi.mocked(createResearchIssue).mockResolvedValue({
      ok: true,
      value: { success: true, url: 'https://github.com/owner/repo/issues/1', message: 'Created' },
    });

    const options: ReviewOptions = {
      topic: 'test',
      maxResults: 10,
      createIssues: true,
      vote: false,
    };

    await executeReview(options, mockDiscover);

    expect(formatResearchIssueBody).toHaveBeenCalled();
  });

  it('should assign P2 priority for items with 0.6 <= composite < 0.8', async () => {
    const { rankDiscoveredItems } = await import('./research-helpers-scoring.js');
    const { formatResearchIssueBody, createResearchIssue } =
      await import('./research-helpers-issues.js');

    const midScoreItem = {
      item: mockDiscoveredItem,
      score: { ...mockQualityScore, composite: 0.7 },
    };
    const mockDiscover = vi.fn(() =>
      Promise.resolve({ results: [mockDiscoveredItem], errors: [] })
    );
    vi.mocked(rankDiscoveredItems).mockReturnValue([midScoreItem]);
    vi.mocked(formatResearchIssueBody).mockImplementation((findings) => {
      expect(findings[0]!.priority).toBe('P2');
      return 'Body';
    });
    vi.mocked(createResearchIssue).mockResolvedValue({
      ok: true,
      value: { success: true, url: 'https://github.com/owner/repo/issues/1', message: 'Created' },
    });

    const options: ReviewOptions = {
      topic: 'test',
      maxResults: 10,
      createIssues: true,
      vote: false,
    };

    await executeReview(options, mockDiscover);

    expect(formatResearchIssueBody).toHaveBeenCalled();
  });

  it('should handle issue creation failures gracefully', async () => {
    const { rankDiscoveredItems } = await import('./research-helpers-scoring.js');
    const { createResearchIssue } = await import('./research-helpers-issues.js');

    const highQualityItem = {
      item: mockDiscoveredItem,
      score: { ...mockQualityScore, composite: 0.8 },
    };
    const mockDiscover = vi.fn(() =>
      Promise.resolve({ results: [mockDiscoveredItem], errors: [] })
    );
    vi.mocked(rankDiscoveredItems).mockReturnValue([highQualityItem]);
    vi.mocked(createResearchIssue).mockResolvedValue({
      ok: false,
      error: { code: 'GH_ERROR' as const, message: 'GitHub API error' },
    });

    const options: ReviewOptions = {
      topic: 'test',
      maxResults: 10,
      createIssues: true,
      vote: false,
    };

    const result = await executeReview(options, mockDiscover);

    expect(result.issuesCreated).toEqual([]);
    expect(result.errors).toContain('Issue creation failed: GitHub API error');
  });
});

// =============================================================================
// TESTS: formatReviewResults
// =============================================================================

describe('formatReviewResults', () => {
  it('should format basic review results', () => {
    const result: ReviewResult = {
      topic: 'test topic',
      itemCount: 1,
      rankedItems: [mockRankedItem],
      issuesCreated: [],
      errors: [],
    };

    const output = formatReviewResults(result);

    expect(output).toContain('Research Review: "test topic"');
    expect(output).toContain('Found 1 items');
    expect(output).toContain('[75%] Advanced Multi-Agent System');
    expect(output).toContain('Source: arxiv');
    expect(output).toContain('Relevance: high');
    expect(output).toContain('URL: https://arxiv.org/abs/2401.12345');
  });

  it('should limit display to top 20 items', () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      item: { ...mockDiscoveredItem, title: `Item ${String(i)}` },
      score: mockQualityScore,
    }));
    const result: ReviewResult = {
      topic: 'test',
      itemCount: 30,
      rankedItems: items,
      issuesCreated: [],
      errors: [],
    };

    const output = formatReviewResults(result);

    expect(output).toContain('Item 0');
    expect(output).toContain('Item 19');
    expect(output).not.toContain('Item 20');
  });

  it('should include created issues section when issues exist', () => {
    const result: ReviewResult = {
      topic: 'test',
      itemCount: 1,
      rankedItems: [mockRankedItem],
      issuesCreated: [
        'https://github.com/owner/repo/issues/1',
        'https://github.com/owner/repo/issues/2',
      ],
      errors: [],
    };

    const output = formatReviewResults(result);

    expect(output).toContain('Issues created: 2');
    expect(output).toContain('- https://github.com/owner/repo/issues/1');
    expect(output).toContain('- https://github.com/owner/repo/issues/2');
  });

  it('should include errors section when errors exist', () => {
    const result: ReviewResult = {
      topic: 'test',
      itemCount: 1,
      rankedItems: [mockRankedItem],
      issuesCreated: [],
      errors: ['Error 1', 'Error 2'],
    };

    const output = formatReviewResults(result);

    expect(output).toContain('Errors:');
    expect(output).toContain('- Error 1');
    expect(output).toContain('- Error 2');
  });

  it('should round composite scores to nearest integer percentage', () => {
    const itemWith64 = {
      item: mockDiscoveredItem,
      score: { ...mockQualityScore, composite: 0.644 },
    };
    const result: ReviewResult = {
      topic: 'test',
      itemCount: 1,
      rankedItems: [itemWith64],
      issuesCreated: [],
      errors: [],
    };

    const output = formatReviewResults(result);

    expect(output).toContain('[64%]');
  });
});

// =============================================================================
// TESTS: executePrioritize
// =============================================================================

describe('executePrioritize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return error message when registry load fails', async () => {
    const { loadTechniquesRegistry } = await import('./research-helpers-io.js');
    vi.mocked(loadTechniquesRegistry).mockResolvedValue({
      ok: false,
      error: new ParseError('File not found'),
    });

    const options: PrioritizeOptions = { vote: false };
    const result = await executePrioritize(options);

    expect(result).toContain('Error: Failed to load techniques registry: File not found');
  });

  it('should return message when no actionable techniques found', async () => {
    const { loadTechniquesRegistry } = await import('./research-helpers-io.js');
    vi.mocked(loadTechniquesRegistry).mockResolvedValue({
      ok: true,
      value: { schema_version: '1.0', techniques: {} },
    });

    const options: PrioritizeOptions = { vote: false };
    const result = await executePrioritize(options);

    expect(result).toBe('No actionable techniques found in registry');
  });

  it('should return message for specific topic when no techniques found', async () => {
    const { loadTechniquesRegistry } = await import('./research-helpers-io.js');
    vi.mocked(loadTechniquesRegistry).mockResolvedValue({
      ok: true,
      value: { schema_version: '1.0', techniques: {} },
    });

    const options: PrioritizeOptions = { topic: 'consensus', vote: false };
    const result = await executePrioritize(options);

    expect(result).toBe('No actionable techniques found for topic: consensus');
  });

  it('should format backlog with actionable techniques', async () => {
    const { loadTechniquesRegistry } = await import('./research-helpers-io.js');
    vi.mocked(loadTechniquesRegistry).mockResolvedValue({
      ok: true,
      value: {
        schema_version: '1.0',
        techniques: {
          tech1: makeTechnique({
            name: 'Technique One',
            topic: 'consensus',
            status: 'planned',
            priority: 'P1',
          }),
          tech2: makeTechnique({
            name: 'Technique Two',
            topic: 'consensus',
            status: 'not-started',
            priority: 'P2',
          }),
        },
      },
    });

    const options: PrioritizeOptions = { vote: false };
    const result = await executePrioritize(options);

    expect(result).toContain('Research Priority Backlog');
    expect(result).toContain('2 actionable techniques');
    expect(result).toContain('## consensus (2 items)');
    expect(result).toContain('[P1] Technique One (planned)');
    expect(result).toContain('[P2] Technique Two (not-started)');
  });

  it('should exclude implemented techniques', async () => {
    const { loadTechniquesRegistry } = await import('./research-helpers-io.js');
    vi.mocked(loadTechniquesRegistry).mockResolvedValue({
      ok: true,
      value: {
        schema_version: '1.0',
        techniques: {
          tech1: makeTechnique({
            name: 'Implemented Tech',
            topic: 'consensus',
            status: 'implemented',
            priority: 'P1',
          }),
          tech2: makeTechnique({
            name: 'Planned Tech',
            topic: 'consensus',
            status: 'planned',
            priority: 'P1',
          }),
        },
      },
    });

    const options: PrioritizeOptions = { vote: false };
    const result = await executePrioritize(options);

    expect(result).not.toContain('Implemented Tech');
    expect(result).toContain('Planned Tech');
  });

  it('should exclude rejected techniques', async () => {
    const { loadTechniquesRegistry } = await import('./research-helpers-io.js');
    vi.mocked(loadTechniquesRegistry).mockResolvedValue({
      ok: true,
      value: {
        schema_version: '1.0',
        techniques: {
          tech1: makeTechnique({
            name: 'Rejected Tech',
            topic: 'consensus',
            status: 'rejected',
            priority: 'P1',
          }),
          tech2: makeTechnique({
            name: 'Planned Tech',
            topic: 'consensus',
            status: 'planned',
            priority: 'P1',
          }),
        },
      },
    });

    const options: PrioritizeOptions = { vote: false };
    const result = await executePrioritize(options);

    expect(result).not.toContain('Rejected Tech');
    expect(result).toContain('Planned Tech');
  });

  it('should filter by topic when specified', async () => {
    const { loadTechniquesRegistry } = await import('./research-helpers-io.js');
    vi.mocked(loadTechniquesRegistry).mockResolvedValue({
      ok: true,
      value: {
        schema_version: '1.0',
        techniques: {
          tech1: makeTechnique({
            name: 'Consensus Tech',
            topic: 'consensus',
            status: 'planned',
            priority: 'P1',
          }),
          tech2: makeTechnique({
            name: 'Memory Tech',
            topic: 'memory',
            status: 'planned',
            priority: 'P1',
          }),
        },
      },
    });

    const options: PrioritizeOptions = { topic: 'consensus', vote: false };
    const result = await executePrioritize(options);

    expect(result).toContain('Consensus Tech');
    expect(result).not.toContain('Memory Tech');
  });

  it('should sort by priority order (P1, P2, P3, P4, unset)', async () => {
    const { loadTechniquesRegistry } = await import('./research-helpers-io.js');
    vi.mocked(loadTechniquesRegistry).mockResolvedValue({
      ok: true,
      value: {
        schema_version: '1.0',
        techniques: {
          tech1: makeTechnique({
            name: 'P3 Tech',
            topic: 'test',
            status: 'planned',
            priority: 'P3',
          }),
          tech2: makeTechnique({
            name: 'P1 Tech',
            topic: 'test',
            status: 'planned',
            priority: 'P1',
          }),
          tech3: makeTechnique({
            name: 'Unset Tech',
            topic: 'test',
            status: 'planned',
            priority: null,
          }),
          tech4: makeTechnique({
            name: 'P2 Tech',
            topic: 'test',
            status: 'planned',
            priority: 'P2',
          }),
        },
      },
    });

    const options: PrioritizeOptions = { vote: false };
    const result = await executePrioritize(options);

    const lines = result.split('\n');
    const techLines = lines.filter((l) => l.includes('Tech (planned)'));
    expect(techLines[0]!).toContain('[P1] P1 Tech');
    expect(techLines[1]!).toContain('[P2] P2 Tech');
    expect(techLines[2]!).toContain('[P3] P3 Tech');
    expect(techLines[3]!).toContain('[unset] Unset Tech');
  });

  it('should group techniques by topic', async () => {
    const { loadTechniquesRegistry } = await import('./research-helpers-io.js');
    vi.mocked(loadTechniquesRegistry).mockResolvedValue({
      ok: true,
      value: {
        schema_version: '1.0',
        techniques: {
          tech1: makeTechnique({
            name: 'Tech A',
            topic: 'consensus',
            status: 'planned',
            priority: 'P1',
          }),
          tech2: makeTechnique({
            name: 'Tech B',
            topic: 'memory',
            status: 'planned',
            priority: 'P1',
          }),
          tech3: makeTechnique({
            name: 'Tech C',
            topic: 'consensus',
            status: 'planned',
            priority: 'P2',
          }),
        },
      },
    });

    const options: PrioritizeOptions = { vote: false };
    const result = await executePrioritize(options);

    expect(result).toContain('## consensus (2 items)');
    expect(result).toContain('## memory (1 items)');
  });
});
