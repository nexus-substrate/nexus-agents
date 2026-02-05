/**
 * Tests for Freshness Analyzer
 * @module indexer/freshness-analyzer.test
 */

import { describe, it, expect } from 'vitest';
import type { FreshnessAnalysisResult } from './freshness-analyzer.js';
import {
  DEFAULT_TRACKED_DOCUMENTS,
  formatFreshnessTable,
  formatFreshnessJson,
} from './freshness-analyzer.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeFreshnessResult(
  overrides?: Partial<FreshnessAnalysisResult>
): FreshnessAnalysisResult {
  return {
    documents: [
      {
        path: 'README.md',
        lastModified: '2026-01-15',
        lastModifiedRelative: '3 weeks ago',
        daysSinceModified: 21,
        status: 'fresh',
        dependencies: ['src/index.ts'],
        newerDependencies: [],
      },
      {
        path: 'ARCHITECTURE.md',
        lastModified: '2025-12-01',
        lastModifiedRelative: '2 months ago',
        daysSinceModified: 66,
        status: 'stale',
        dependencies: ['src/core/', 'src/agents/'],
        newerDependencies: ['src/core/'],
      },
      {
        path: 'docs/MISSING.md',
        lastModified: null,
        lastModifiedRelative: null,
        daysSinceModified: null,
        status: 'unknown',
        dependencies: [],
        newerDependencies: [],
      },
    ],
    summary: { total: 3, fresh: 1, warning: 0, stale: 1, unknown: 1 },
    analyzedAt: '2026-02-05T12:00:00.000Z',
    ...overrides,
  };
}

// ============================================================================
// DEFAULT_TRACKED_DOCUMENTS
// ============================================================================

describe('DEFAULT_TRACKED_DOCUMENTS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(DEFAULT_TRACKED_DOCUMENTS)).toBe(true);
    expect(DEFAULT_TRACKED_DOCUMENTS.length).toBeGreaterThan(0);
  });

  it('each entry has required fields', () => {
    for (const doc of DEFAULT_TRACKED_DOCUMENTS) {
      expect(typeof doc.path).toBe('string');
      expect(doc.path.length).toBeGreaterThan(0);
      expect(Array.isArray(doc.dependencies)).toBe(true);
      expect(typeof doc.staleThresholdDays).toBe('number');
      expect(typeof doc.warningThresholdDays).toBe('number');
    }
  });

  it('staleThresholdDays >= warningThresholdDays for all entries', () => {
    for (const doc of DEFAULT_TRACKED_DOCUMENTS) {
      expect(doc.staleThresholdDays).toBeGreaterThanOrEqual(doc.warningThresholdDays);
    }
  });

  it('includes README.md', () => {
    const readme = DEFAULT_TRACKED_DOCUMENTS.find((d) => d.path === 'README.md');
    expect(readme).toBeDefined();
  });

  it('includes CLAUDE.md', () => {
    const claude = DEFAULT_TRACKED_DOCUMENTS.find((d) => d.path === 'CLAUDE.md');
    expect(claude).toBeDefined();
  });

  it('has positive threshold values', () => {
    for (const doc of DEFAULT_TRACKED_DOCUMENTS) {
      expect(doc.staleThresholdDays).toBeGreaterThan(0);
      expect(doc.warningThresholdDays).toBeGreaterThan(0);
    }
  });

  it('has unique paths', () => {
    const paths = DEFAULT_TRACKED_DOCUMENTS.map((d) => d.path);
    const unique = new Set(paths);
    expect(unique.size).toBe(paths.length);
  });
});

// ============================================================================
// formatFreshnessTable
// ============================================================================

describe('formatFreshnessTable', () => {
  it('returns a string', () => {
    const result = makeFreshnessResult();
    const table = formatFreshnessTable(result);
    expect(typeof table).toBe('string');
  });

  it('contains the dashboard header', () => {
    const result = makeFreshnessResult();
    const table = formatFreshnessTable(result);
    expect(table).toContain('Documentation Freshness Dashboard');
  });

  it('contains analyzed date', () => {
    const result = makeFreshnessResult();
    const table = formatFreshnessTable(result);
    expect(table).toContain('2026-02-05');
  });

  it('contains summary counts', () => {
    const result = makeFreshnessResult();
    const table = formatFreshnessTable(result);
    expect(table).toContain('1 fresh');
    expect(table).toContain('0 warnings');
    expect(table).toContain('1 stale');
    expect(table).toContain('1 unknown');
  });

  it('contains document paths', () => {
    const result = makeFreshnessResult();
    const table = formatFreshnessTable(result);
    expect(table).toContain('README.md');
    expect(table).toContain('ARCHITECTURE.md');
    expect(table).toContain('docs/MISSING.md');
  });

  it('contains relative time info', () => {
    const result = makeFreshnessResult();
    const table = formatFreshnessTable(result);
    expect(table).toContain('3 weeks ago');
    expect(table).toContain('2 months ago');
    expect(table).toContain('unknown');
  });

  it('shows newer deps count for stale docs', () => {
    const result = makeFreshnessResult();
    const table = formatFreshnessTable(result);
    expect(table).toContain('1 newer deps');
  });

  it('shows stale document details section', () => {
    const result = makeFreshnessResult();
    const table = formatFreshnessTable(result);
    expect(table).toContain('Stale Document Details');
    expect(table).toContain('ARCHITECTURE.md');
    expect(table).toContain('src/core/');
  });

  it('omits stale details when no stale docs with newer deps', () => {
    const result = makeFreshnessResult({
      documents: [
        {
          path: 'README.md',
          lastModified: '2026-02-01',
          lastModifiedRelative: '4 days ago',
          daysSinceModified: 4,
          status: 'fresh',
          dependencies: [],
          newerDependencies: [],
        },
      ],
      summary: { total: 1, fresh: 1, warning: 0, stale: 0, unknown: 0 },
    });
    const table = formatFreshnessTable(result);
    expect(table).not.toContain('Stale Document Details');
  });

  it('contains separator line', () => {
    const result = makeFreshnessResult();
    const table = formatFreshnessTable(result);
    expect(table).toContain('-'.repeat(90));
  });

  it('handles empty documents array', () => {
    const result = makeFreshnessResult({
      documents: [],
      summary: { total: 0, fresh: 0, warning: 0, stale: 0, unknown: 0 },
    });
    const table = formatFreshnessTable(result);
    expect(typeof table).toBe('string');
    expect(table).toContain('0 fresh');
  });
});

// ============================================================================
// formatFreshnessJson
// ============================================================================

describe('formatFreshnessJson', () => {
  it('returns valid JSON string', () => {
    const result = makeFreshnessResult();
    const json = formatFreshnessJson(result);
    expect(() => JSON.parse(json) as unknown).not.toThrow();
  });

  it('round-trips the data', () => {
    const result = makeFreshnessResult();
    const json = formatFreshnessJson(result);
    const parsed = JSON.parse(json) as FreshnessAnalysisResult;
    expect(parsed.summary.total).toBe(3);
    expect(parsed.documents).toHaveLength(3);
    expect(parsed.analyzedAt).toBe('2026-02-05T12:00:00.000Z');
  });

  it('is pretty-printed with 2-space indent', () => {
    const result = makeFreshnessResult();
    const json = formatFreshnessJson(result);
    // Pretty-printed JSON has newlines
    expect(json).toContain('\n');
    expect(json).toContain('  ');
  });

  it('preserves all document fields', () => {
    const result = makeFreshnessResult();
    const json = formatFreshnessJson(result);
    const parsed = JSON.parse(json) as FreshnessAnalysisResult;
    const firstDoc = parsed.documents[0];
    expect(firstDoc?.path).toBe('README.md');
    expect(firstDoc?.status).toBe('fresh');
    expect(firstDoc?.lastModified).toBe('2026-01-15');
  });

  it('handles null values correctly', () => {
    const result = makeFreshnessResult();
    const json = formatFreshnessJson(result);
    const parsed = JSON.parse(json) as FreshnessAnalysisResult;
    const unknownDoc = parsed.documents[2];
    expect(unknownDoc?.lastModified).toBeNull();
    expect(unknownDoc?.lastModifiedRelative).toBeNull();
    expect(unknownDoc?.daysSinceModified).toBeNull();
  });
});
