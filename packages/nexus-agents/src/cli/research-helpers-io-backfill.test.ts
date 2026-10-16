/**
 * Tests for backfill-on-load in loadPapersRegistry (#4288).
 * @module cli/research-helpers-io-backfill.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadPapersRegistry } from './research-helpers-io.js';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { stringify as stringifyYaml } from 'yaml';
import type { PapersRegistry } from './research-types.js';

describe('loadPapersRegistry backfill-on-load (#4288)', () => {
  let tmpDir: string;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'research-io-test-'));
    originalEnv = process.env['NEXUS_BACKFILL_RESEARCH_QUALITY'];
    await fs.mkdir(join(tmpDir, 'docs/research/registry'), { recursive: true });
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['NEXUS_BACKFILL_RESEARCH_QUALITY'];
    } else {
      process.env['NEXUS_BACKFILL_RESEARCH_QUALITY'] = originalEnv;
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('does not backfill missing quality scores when NEXUS_BACKFILL_RESEARCH_QUALITY is unset', async () => {
    const registry: PapersRegistry = {
      schema_version: '1.1',
      papers: {
        p1: {
          title: 'Unscored Paper',
          authors: ['Alice'],
          source: 'arxiv',
          arxiv_id: '2601.00001',
          citation_count: 10,
          venue: 'NeurIPS',
          publication_date: '2026-01-01',
          url: 'https://example.com',
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
        },
      },
    };
    await fs.writeFile(
      join(tmpDir, 'docs/research/registry/papers.yaml'),
      stringifyYaml(registry),
      'utf-8'
    );

    delete process.env['NEXUS_BACKFILL_RESEARCH_QUALITY'];
    const result = await loadPapersRegistry(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.papers['p1']?.quality_score).toBeUndefined();
      expect(result.value.papers['p1']?.evidence_tier).toBeUndefined();
    }
  });

  it('backfills missing quality scores and evidence tiers when NEXUS_BACKFILL_RESEARCH_QUALITY=1', async () => {
    const registry: PapersRegistry = {
      schema_version: '1.1',
      papers: {
        p1: {
          title: 'Unscored Paper',
          authors: ['Alice'],
          source: 'arxiv',
          arxiv_id: '2601.00001',
          citation_count: 10,
          venue: 'NeurIPS',
          publication_date: '2026-01-01',
          url: 'https://example.com',
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
        },
      },
    };
    await fs.writeFile(
      join(tmpDir, 'docs/research/registry/papers.yaml'),
      stringifyYaml(registry),
      'utf-8'
    );

    process.env['NEXUS_BACKFILL_RESEARCH_QUALITY'] = '1';
    const result = await loadPapersRegistry(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.papers['p1']?.quality_score).toBeDefined();
      expect(result.value.papers['p1']?.evidence_tier).toBeDefined();
    }
  });
});
