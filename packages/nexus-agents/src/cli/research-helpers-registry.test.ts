/**
 * Research Registry Helper Tests
 *
 * Tests for the registry integration functions that add papers to papers.yaml.
 *
 * @see Issue #299 (Auto-add papers to registry from arXiv fetch)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateRegistryEntry,
  paperEntryToResearchPaper,
  paperExistsInRegistry,
  addPaperToRegistry,
  getCurrentDate,
  type AddPaperOptions,
} from './research-helpers-registry.js';
import { computeEvidenceTier } from '../research/research-quality.js';
import type { ArxivMetadata, PapersRegistry, PaperEntry } from './research-types.js';
import * as ioHelpers from './research-helpers-io.js';
import { ParseError } from '../core/types/workflow.js';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const SAMPLE_ARXIV_METADATA: ArxivMetadata = {
  id: '2501.06322',
  title: 'Multi-Agent Collaboration Mechanisms: A Survey of LLMs',
  authors: ['Author One', 'Author Two'],
  summary: 'A comprehensive survey of multi-agent collaboration mechanisms...',
  published: '2025-01-15',
  updated: '2025-01-15',
  categories: ['cs.AI', 'cs.CL'],
  pdfUrl: 'https://arxiv.org/pdf/2501.06322.pdf',
};

const SAMPLE_ROUTING_METADATA: ArxivMetadata = {
  id: '2406.18510',
  title: 'RouteLLM: Cost-Quality Routing for LLM Inference',
  authors: ['Researcher A'],
  summary: 'Efficient routing strategies for cost-quality tradeoffs in LLMs...',
  published: '2024-06-20',
  updated: '2024-06-20',
  categories: ['cs.LG'],
  pdfUrl: 'https://arxiv.org/pdf/2406.18510.pdf',
};

const SAMPLE_MEMORY_METADATA: ArxivMetadata = {
  id: '2504.19413',
  title: 'Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory',
  authors: ['Memory Team'],
  summary: 'A scalable memory architecture for AI agents with long-term context...',
  published: '2025-04-20',
  updated: '2025-04-20',
  categories: ['cs.AI'],
  pdfUrl: 'https://arxiv.org/pdf/2504.19413.pdf',
};

const EMPTY_REGISTRY: PapersRegistry = {
  schema_version: '1.0',
  papers: {},
};

const REGISTRY_WITH_PAPERS: PapersRegistry = {
  schema_version: '1.0',
  papers: {
    'arxiv-2501.06322': {
      title: 'Existing Paper',
      authors: [],
      source: 'arxiv',
      arxiv_id: '2501.06322',
      url: 'https://arxiv.org/abs/2501.06322',
      publication_date: '2025-01',
      venue: null,
      topics: ['consensus'],
      tags: [],
      reviewed_date: '2026-01-01',
      reviewed_in: '',
      summary: '',
      key_findings: [],
      relevance: 'medium',
      techniques_extracted: [],
      related_issues: [],
      implementation_status: 'not-started',
    },
  },
};

// =============================================================================
// getCurrentDate Tests
// =============================================================================

describe('getCurrentDate', () => {
  it('should return date in YYYY-MM-DD format', () => {
    const date = getCurrentDate();
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('should return a valid date', () => {
    const date = getCurrentDate();
    const parsed = new Date(date);
    expect(parsed.toString()).not.toBe('Invalid Date');
  });
});

// =============================================================================
// generateRegistryEntry Tests
// =============================================================================

describe('generateRegistryEntry', () => {
  it('should generate valid entry from arXiv metadata', () => {
    const result = generateRegistryEntry(SAMPLE_ARXIV_METADATA);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.title).toBe('Multi-Agent Collaboration Mechanisms: A Survey of LLMs');
      expect(result.value.arxiv_id).toBe('2501.06322');
      expect(result.value.url).toBe('https://arxiv.org/abs/2501.06322');
      expect(result.value.source).toBe('arxiv');
      expect(result.value.publication_date).toBe('2025-01');
      expect(result.value.venue).toBeNull();
      expect(result.value.implementation_status).toBe('not-started');
      expect(result.value.relevance).toBe('medium');
    }
  });

  it('should detect consensus topic from metadata', () => {
    const result = generateRegistryEntry(SAMPLE_ARXIV_METADATA);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should detect 'orchestration' from 'multi-agent' keyword
      expect(result.value.topics).toContain('orchestration');
    }
  });

  it('should detect routing topic from metadata', () => {
    const result = generateRegistryEntry(SAMPLE_ROUTING_METADATA);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.topics).toContain('routing');
    }
  });

  it('should detect memory topic from metadata', () => {
    const result = generateRegistryEntry(SAMPLE_MEMORY_METADATA);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.topics).toContain('memory');
    }
  });

  it('should use provided topic override', () => {
    const result = generateRegistryEntry(SAMPLE_ARXIV_METADATA, 'consensus');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.topics).toContain('consensus');
    }
  });

  it('should generate tags from metadata', () => {
    const result = generateRegistryEntry(SAMPLE_ARXIV_METADATA);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should detect 'survey' and 'multi-agent' tags
      expect(result.value.tags).toContain('survey');
      expect(result.value.tags).toContain('multi-agent');
    }
  });

  it('should extract publication date from arXiv ID', () => {
    const result = generateRegistryEntry(SAMPLE_ARXIV_METADATA);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // 2501.06322 -> 2025-01
      expect(result.value.publication_date).toBe('2025-01');
    }
  });

  it('should return error for empty metadata', () => {
    const emptyMetadata: ArxivMetadata = {
      id: '',
      title: '',
      authors: [],
      summary: '',
      published: '',
      updated: '',
      categories: [],
      pdfUrl: '',
    };

    const result = generateRegistryEntry(emptyMetadata);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_METADATA');
    }
  });

  it('should set reviewed_date to current date', () => {
    const result = generateRegistryEntry(SAMPLE_ARXIV_METADATA);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.reviewed_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('should preserve authors from metadata', () => {
    const result = generateRegistryEntry(SAMPLE_ARXIV_METADATA);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.authors).toEqual(['Author One', 'Author Two']);
    }
  });
});

// =============================================================================
// paperExistsInRegistry Tests
// =============================================================================

describe('paperExistsInRegistry', () => {
  it('should return true when paper exists', () => {
    const exists = paperExistsInRegistry('2501.06322', REGISTRY_WITH_PAPERS);
    expect(exists).toBe(true);
  });

  it('should return false when paper does not exist', () => {
    const exists = paperExistsInRegistry('9999.99999', REGISTRY_WITH_PAPERS);
    expect(exists).toBe(false);
  });

  it('should return false for empty registry', () => {
    const exists = paperExistsInRegistry('2501.06322', EMPTY_REGISTRY);
    expect(exists).toBe(false);
  });

  it('should handle different arXiv ID formats', () => {
    // Without the arxiv- prefix
    const exists = paperExistsInRegistry('2501.06322', REGISTRY_WITH_PAPERS);
    expect(exists).toBe(true);
  });
});

// =============================================================================
// addPaperToRegistry Tests
// =============================================================================

describe('addPaperToRegistry', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should add new paper to empty registry', async () => {
    vi.spyOn(ioHelpers, 'loadPapersRegistry').mockResolvedValue({
      ok: true,
      value: EMPTY_REGISTRY,
    });

    const saveSpy = vi.spyOn(ioHelpers, 'savePapersRegistry').mockResolvedValue({
      ok: true,
      value: undefined,
    });

    const options: AddPaperOptions = {
      metadata: SAMPLE_ROUTING_METADATA,
    };

    const result = await addPaperToRegistry(options);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(true);
      expect(result.value.paperId).toBe('arxiv-2406.18510');
      expect(result.value.message).toContain('Added paper');
      expect(result.value.dryRun).toBe(false);
    }

    expect(saveSpy).toHaveBeenCalledTimes(1);
    const savedRegistry = saveSpy.mock.calls[0]?.[0] as PapersRegistry;
    expect(savedRegistry.papers['arxiv-2406.18510']).toBeDefined();
  });

  it('should detect duplicate and return error', async () => {
    vi.spyOn(ioHelpers, 'loadPapersRegistry').mockResolvedValue({
      ok: true,
      value: REGISTRY_WITH_PAPERS,
    });

    const options: AddPaperOptions = {
      metadata: SAMPLE_ARXIV_METADATA, // This paper already exists in REGISTRY_WITH_PAPERS
    };

    const result = await addPaperToRegistry(options);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('DUPLICATE');
      expect(result.error.message).toContain('already exists');
    }
  });

  it('should support dry run mode', async () => {
    vi.spyOn(ioHelpers, 'loadPapersRegistry').mockResolvedValue({
      ok: true,
      value: EMPTY_REGISTRY,
    });

    const saveSpy = vi.spyOn(ioHelpers, 'savePapersRegistry').mockResolvedValue({
      ok: true,
      value: undefined,
    });

    const options: AddPaperOptions = {
      metadata: SAMPLE_ROUTING_METADATA,
      dryRun: true,
    };

    const result = await addPaperToRegistry(options);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.dryRun).toBe(true);
      expect(result.value.message).toContain('[DRY RUN]');
      expect(result.value.entry).toBeDefined();
    }

    // Should not save in dry run mode
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('should use provided topic', async () => {
    vi.spyOn(ioHelpers, 'loadPapersRegistry').mockResolvedValue({
      ok: true,
      value: EMPTY_REGISTRY,
    });

    const saveSpy = vi.spyOn(ioHelpers, 'savePapersRegistry').mockResolvedValue({
      ok: true,
      value: undefined,
    });

    const options: AddPaperOptions = {
      metadata: SAMPLE_ROUTING_METADATA,
      topic: 'consensus',
    };

    const result = await addPaperToRegistry(options);

    expect(result.ok).toBe(true);

    const savedRegistry = saveSpy.mock.calls[0]?.[0] as PapersRegistry;
    const savedEntry = savedRegistry.papers['arxiv-2406.18510'] as PaperEntry;
    expect(savedEntry.topics).toContain('consensus');
  });

  it('should handle load error', async () => {
    vi.spyOn(ioHelpers, 'loadPapersRegistry').mockResolvedValue({
      ok: false,
      error: new ParseError('File not found'),
    });

    const options: AddPaperOptions = {
      metadata: SAMPLE_ROUTING_METADATA,
    };

    const result = await addPaperToRegistry(options);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LOAD_ERROR');
    }
  });

  it('should handle save error', async () => {
    vi.spyOn(ioHelpers, 'loadPapersRegistry').mockResolvedValue({
      ok: true,
      value: EMPTY_REGISTRY,
    });

    vi.spyOn(ioHelpers, 'savePapersRegistry').mockResolvedValue({
      ok: false,
      error: new ParseError('Write permission denied'),
    });

    const options: AddPaperOptions = {
      metadata: SAMPLE_ROUTING_METADATA,
    };

    const result = await addPaperToRegistry(options);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SAVE_ERROR');
    }
  });

  it('should preserve existing papers when adding new one', async () => {
    vi.spyOn(ioHelpers, 'loadPapersRegistry').mockResolvedValue({
      ok: true,
      value: REGISTRY_WITH_PAPERS,
    });

    const saveSpy = vi.spyOn(ioHelpers, 'savePapersRegistry').mockResolvedValue({
      ok: true,
      value: undefined,
    });

    const options: AddPaperOptions = {
      metadata: SAMPLE_ROUTING_METADATA, // Different paper
    };

    const result = await addPaperToRegistry(options);

    expect(result.ok).toBe(true);

    const savedRegistry = saveSpy.mock.calls[0]?.[0] as PapersRegistry;
    // Both papers should exist
    expect(savedRegistry.papers['arxiv-2501.06322']).toBeDefined();
    expect(savedRegistry.papers['arxiv-2406.18510']).toBeDefined();
  });
});

// =============================================================================
// YAML Format Verification Tests
// =============================================================================

describe('YAML format verification', () => {
  it('should generate entry with correct structure', () => {
    const result = generateRegistryEntry(SAMPLE_ARXIV_METADATA);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const entry = result.value;

      // Required fields per papers.yaml schema
      expect(typeof entry.title).toBe('string');
      expect(Array.isArray(entry.authors)).toBe(true);
      expect(entry.source).toBe('arxiv');
      expect(typeof entry.arxiv_id).toBe('string');
      expect(entry.url).toMatch(/^https:\/\/arxiv\.org\/abs\//);
      expect(entry.venue).toBeNull();

      // Topics and tags
      expect(Array.isArray(entry.topics)).toBe(true);
      expect(Array.isArray(entry.tags)).toBe(true);

      // Review fields
      expect(typeof entry.reviewed_date).toBe('string');
      expect(typeof entry.reviewed_in).toBe('string');
      expect(typeof entry.summary).toBe('string');

      // Findings and techniques
      expect(Array.isArray(entry.key_findings)).toBe(true);
      expect(Array.isArray(entry.techniques_extracted)).toBe(true);

      // Status fields
      expect(['high', 'medium', 'low']).toContain(entry.relevance);
      expect(entry.implementation_status).toBe('not-started');
      expect(Array.isArray(entry.related_issues)).toBe(true);
    }
  });

  it('should generate publication_date in YYYY-MM format', () => {
    const testCases: Array<{ id: string; expected: string }> = [
      { id: '2501.06322', expected: '2025-01' },
      { id: '2406.18510', expected: '2024-06' },
      { id: '2310.08560', expected: '2023-10' },
      { id: '1912.12345', expected: '2019-12' },
    ];

    for (const testCase of testCases) {
      const metadata: ArxivMetadata = {
        ...SAMPLE_ARXIV_METADATA,
        id: testCase.id,
      };
      const result = generateRegistryEntry(metadata);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.publication_date).toBe(testCase.expected);
      }
    }
  });
});

// #2943: PaperEntry pre-fix had no `rigor_tags` field, so the
// `as unknown as ResearchPaper` cast hid that the field was missing on the
// runtime value. `computeEvidenceTier`'s high-tier branch (which reads
// `rigor_tags`) was unreachable for anything flowing through that cast. The
// field is now part of PaperEntry and survives the typed conversion.
describe('paperEntryToResearchPaper (#2943)', () => {
  const baseEntry: PaperEntry = {
    title: 'Test',
    authors: ['A'],
    source: 'arxiv',
    arxiv_id: '2501.99999',
    url: 'https://arxiv.org/abs/2501.99999',
    publication_date: '2025-01',
    venue: null,
    topics: ['t'],
    tags: ['x'],
    reviewed_date: '2026-05-23',
    reviewed_in: '',
    summary: '',
    key_findings: [],
    relevance: 'medium',
    techniques_extracted: [],
    related_issues: [],
    implementation_status: 'not-started',
  };

  it('preserves rigor_tags so the high-evidence tier becomes reachable', () => {
    const entry: PaperEntry = {
      ...baseEntry,
      rigor_tags: ['peer-reviewed', 'has-code', 'has-baselines'],
    };
    const research = paperEntryToResearchPaper(entry);

    expect(research.rigor_tags).toEqual(['peer-reviewed', 'has-code', 'has-baselines']);
    expect(computeEvidenceTier(research)).toBe('high');
  });

  it('defaults rigor_tags to [] when the entry omits them (arXiv ingest case)', () => {
    const research = paperEntryToResearchPaper(baseEntry);
    expect(research.rigor_tags).toEqual([]);
    // Without rigor signals AND with a low score, the tier correctly stays low.
    expect(computeEvidenceTier({ ...research, quality_score: 1 })).toBe('low');
  });
});
