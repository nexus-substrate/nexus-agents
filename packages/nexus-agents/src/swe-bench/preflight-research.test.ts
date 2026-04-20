/**
 * Tests for pre-flight research lookup (#1414 option 3).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  extractKeywords,
  findRelevantPapers,
  isPreflightResearchEnabled,
  renderResearchContext,
  type PaperHit,
} from './preflight-research.js';

beforeEach(() => {
  delete process.env['NEXUS_PREFLIGHT_RESEARCH'];
});

afterEach(() => {
  delete process.env['NEXUS_PREFLIGHT_RESEARCH'];
});

describe('isPreflightResearchEnabled', () => {
  it('defaults to false when env var unset', () => {
    expect(isPreflightResearchEnabled()).toBe(false);
  });

  it('activates only when set to "1"', () => {
    process.env['NEXUS_PREFLIGHT_RESEARCH'] = '1';
    expect(isPreflightResearchEnabled()).toBe(true);

    process.env['NEXUS_PREFLIGHT_RESEARCH'] = 'true';
    expect(isPreflightResearchEnabled()).toBe(false);

    process.env['NEXUS_PREFLIGHT_RESEARCH'] = '0';
    expect(isPreflightResearchEnabled()).toBe(false);
  });
});

describe('extractKeywords', () => {
  it('extracts lowercased alphanumeric tokens >= 4 chars', () => {
    const kw = extractKeywords('Parser NullPointerException when input is empty');
    expect(kw).toContain('parser');
    expect(kw).toContain('nullpointerexception');
    expect(kw).toContain('input');
    expect(kw).toContain('empty');
  });

  it('filters out common stopwords', () => {
    const kw = extractKeywords('The test bug error issue with fix');
    // All these are stopwords per the built-in set.
    expect(kw).toHaveLength(0);
  });

  it('dedupes', () => {
    const kw = extractKeywords('parser parser parser');
    expect(kw).toEqual(['parser']);
  });

  it('caps at 15 keywords', () => {
    const words = Array.from({ length: 30 }, (_, i) => `word${String(i).padStart(2, '0')}`).join(
      ' '
    );
    const kw = extractKeywords(words);
    expect(kw.length).toBeLessThanOrEqual(15);
  });

  it('handles empty and whitespace-only input', () => {
    expect(extractKeywords('')).toEqual([]);
    expect(extractKeywords('   \n\t  ')).toEqual([]);
  });
});

describe('findRelevantPapers', () => {
  it('returns empty array when disabled', async () => {
    // Default: NEXUS_PREFLIGHT_RESEARCH unset.
    const hits = await findRelevantPapers('parser nullpointerexception');
    expect(hits).toEqual([]);
  });

  it('returns papers when enabled and registry has matches', async () => {
    process.env['NEXUS_PREFLIGHT_RESEARCH'] = '1';
    // Use keywords likely to match the actual registry bundled in the repo.
    // "memory" and "agent" are very common in papers.yaml tags.
    const hits = await findRelevantPapers('Debug agent memory retrieval failure');
    // We don't assert specific papers (registry changes); just assert
    // the call succeeds and returns a valid shape.
    expect(Array.isArray(hits)).toBe(true);
    for (const hit of hits) {
      expect(typeof hit.arxivId).toBe('string');
      expect(typeof hit.title).toBe('string');
      expect(typeof hit.score).toBe('number');
      expect(hit.score).toBeGreaterThan(0);
    }
  });
});

describe('renderResearchContext', () => {
  it('returns empty string for empty hits', () => {
    expect(renderResearchContext([])).toBe('');
  });

  it('renders hits as a compact markdown block', () => {
    const hits: PaperHit[] = [
      {
        arxivId: 'arxiv-1234.5678',
        title: 'Test Paper',
        summary: 'A summary of the paper.',
        score: 5,
      },
    ];
    const rendered = renderResearchContext(hits);
    expect(rendered).toContain('## Relevant research');
    expect(rendered).toContain('Test Paper');
    expect(rendered).toContain('arxiv-1234.5678');
    expect(rendered).toContain('A summary of the paper.');
  });
});
