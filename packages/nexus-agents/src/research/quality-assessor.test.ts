/**
 * Tests for QualityAssessor consolidation and backfill-on-load.
 * @module research/quality-assessor.test
 */

import { describe, it, expect } from 'vitest';
import {
  paperQualityAssessor,
  sourceQualityAssessor,
  backfillPaperQualities,
} from './quality-assessor.js';
import type { ResearchPaper } from './research-schemas.js';
import type { ResearchSource } from '../indexer/research-index/research-index-base-types.js';
import type { PapersRegistry } from '../cli/research-types.js';

describe('QualityAssessor', () => {
  it('assesses paper quality correctly using paperQualityAssessor', () => {
    const paper: ResearchPaper = {
      title: 'Test Paper',
      authors: ['Alice'],
      source: 'arxiv',
      citation_count: 15,
      venue: 'NeurIPS',
      publication_date: '2026-01-01',
      has_code: true,
      rigor_tags: ['peer-reviewed', 'has-code'],
      url: 'https://example.com',
      topics: ['agents'],
      tags: [],
      key_findings: [],
      techniques_extracted: [],
      related_issues: [],
      implementation_status: 'not-started',
    };

    const result = paperQualityAssessor.assess(paper);
    expect(result.qualityScore).toBeGreaterThan(0);
    expect(['high', 'medium', 'low']).toContain(result.evidenceTier);
  });

  it('assesses source quality correctly using sourceQualityAssessor', () => {
    const source: ResearchSource = {
      type: 'open_source_repo',
      name: 'test-repo',
      url: 'https://github.com/test/repo',
      topics: ['agents'],
      tags: [],
      key_info: [],
      best_practices: [],
      techniques_extracted: [],
      quality_signals: {
        stars_at_review: 150,
        has_tests: true,
        has_docs: true,
      },
      reviewed_date: '2026-01-01',
    };

    const result = sourceQualityAssessor.assess(source);
    expect(result.qualityScore).toBeGreaterThan(0);
    expect(['high', 'medium', 'low']).toContain(result.evidenceTier);
  });

  it('backfills missing paper quality scores and evidence tiers', () => {
    const registry: PapersRegistry = {
      schema_version: '1.1',
      papers: {
        p1: {
          title: 'Incomplete Paper',
          authors: ['Bob'],
          source: 'arxiv',
          arxiv_id: '2601.00001',
          citation_count: 5,
          venue: 'arXiv',
          publication_date: '2026-01-01',
          url: 'https://example.com/1',
          topics: ['agents'],
          tags: [],
          reviewed_date: '2026-01-01',
          reviewed_in: '',
          summary: '',
          key_findings: [],
          relevance: 'medium',
          techniques_extracted: [],
          related_issues: [],
          implementation_status: 'not-started',
          // quality_score and evidence_tier are undefined
        },
        p2: {
          title: 'Complete Paper',
          authors: ['Charlie'],
          source: 'arxiv',
          arxiv_id: '2601.00002',
          citation_count: 50,
          venue: 'ICML',
          publication_date: '2026-01-01',
          quality_score: 9,
          evidence_tier: 'high',
          url: 'https://example.com/2',
          topics: ['consensus'],
          tags: [],
          reviewed_date: '2026-01-01',
          reviewed_in: '',
          summary: '',
          key_findings: [],
          relevance: 'high',
          techniques_extracted: [],
          related_issues: [],
          implementation_status: 'not-started',
        },
      },
    };

    const { registry: updated, modifiedCount } = backfillPaperQualities(registry);
    expect(modifiedCount).toBe(1);
    expect(updated.papers['p1']?.quality_score).toBeDefined();
    expect(updated.papers['p1']?.evidence_tier).toBeDefined();
    expect(updated.papers['p2']?.quality_score).toBe(9);
  });
});
