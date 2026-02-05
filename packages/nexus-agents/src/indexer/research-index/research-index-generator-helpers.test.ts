/**
 * Tests for Research Index Generator Helpers
 * @module indexer/research-index/research-index-generator-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { ResearchIndex, ResearchTechniqueWithId } from './research-index-types.js';
import {
  capitalize,
  generateHeader,
  generateQuickStats,
  generateTechniqueRow,
} from './research-index-generator-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeIndex(overrides: Partial<ResearchIndex> = {}): ResearchIndex {
  return {
    schemaVersion: '1.0',
    generatedAt: '2026-01-15T12:00:00-05:00',
    papers: [],
    techniques: [],
    sources: [],
    stats: {
      totalPapers: 10,
      totalTechniques: 15,
      totalSources: 5,
      totalTopics: 7,
      techniquesByStatus: {
        implemented: 5,
        planned: 4,
        inProgress: 3,
        notStarted: 2,
        rejected: 1,
      },
      techniquesByPriority: {
        P1: 3,
        P2: 5,
        P3: 4,
        P4: 2,
        none: 1,
      },
      topicStats: [],
    },
    ...overrides,
  } as ResearchIndex;
}

function makeTechnique(overrides: Partial<ResearchTechniqueWithId> = {}): ResearchTechniqueWithId {
  return {
    id: 'test-technique',
    name: 'Test Technique',
    description: 'A test technique',
    topic: 'consensus',
    status: 'planned',
    metrics: {},
    implementation_issue: null,
    source_papers: [],
    tags: [],
    priority: null,
    ...overrides,
  } as ResearchTechniqueWithId;
}

// ============================================================================
// capitalize (re-export)
// ============================================================================

describe('capitalize', () => {
  it('capitalizes words', () => {
    expect(capitalize('hello world')).toBe('Hello World');
  });

  it('handles single word', () => {
    expect(capitalize('test')).toBe('Test');
  });

  it('handles empty string', () => {
    expect(capitalize('')).toBe('');
  });
});

// ============================================================================
// generateHeader
// ============================================================================

describe('generateHeader', () => {
  it('includes title', () => {
    const result = generateHeader(makeIndex());
    expect(result).toContain('# Nexus-Agents Research Index');
  });

  it('includes generation timestamp', () => {
    const result = generateHeader(makeIndex());
    expect(result).toContain('2026-01-15T12:00:00-05:00');
  });

  it('includes stats counts', () => {
    const result = generateHeader(makeIndex());
    expect(result).toContain('10');
    expect(result).toContain('15');
    expect(result).toContain('7');
  });

  it('includes separator', () => {
    const result = generateHeader(makeIndex());
    expect(result).toContain('---');
  });
});

// ============================================================================
// generateQuickStats
// ============================================================================

describe('generateQuickStats', () => {
  it('includes Quick Stats heading', () => {
    const result = generateQuickStats(makeIndex());
    expect(result).toContain('## Quick Stats');
  });

  it('includes status table', () => {
    const result = generateQuickStats(makeIndex());
    expect(result).toContain('| Status');
    expect(result).toContain('Implemented');
    expect(result).toContain('5');
    expect(result).toContain('4');
    expect(result).toContain('3');
    expect(result).toContain('2');
    expect(result).toContain('1');
  });

  it('includes note about technique status', () => {
    const result = generateQuickStats(makeIndex());
    expect(result).toContain('Technique status is source of truth');
  });
});

// ============================================================================
// generateTechniqueRow
// ============================================================================

describe('generateTechniqueRow', () => {
  it('generates table row with name link', () => {
    const technique = makeTechnique({ id: 'my-tech', name: 'My Technique' });
    const row = generateTechniqueRow(technique);
    expect(row).toContain('[My Technique]');
    expect(row).toContain('#my-tech');
  });

  it('includes topic', () => {
    const technique = makeTechnique({ topic: 'routing' });
    const row = generateTechniqueRow(technique);
    expect(row).toContain('routing');
  });

  it('shows metrics when present', () => {
    const technique = makeTechnique({
      metrics: { accuracy: '95%', latency: '50ms' },
    });
    const row = generateTechniqueRow(technique);
    expect(row).toContain('accuracy: 95%');
    expect(row).toContain('latency: 50ms');
  });

  it('shows dash for empty metrics', () => {
    const technique = makeTechnique({ metrics: {} });
    const row = generateTechniqueRow(technique);
    expect(row).toContain('| - |');
  });

  it('shows issue number when present', () => {
    const technique = makeTechnique({ implementation_issue: 42 });
    const row = generateTechniqueRow(technique);
    expect(row).toContain('#42');
  });

  it('shows dash for no issue', () => {
    const technique = makeTechnique({ implementation_issue: null });
    const row = generateTechniqueRow(technique);
    // Last column should contain '- |' for no issue
    expect(row).toMatch(/\| - \|$/);
  });
});
