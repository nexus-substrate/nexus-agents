/**
 * Tests for Graph Memory Helpers
 * @module context/graph-memory-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { GraphEdge, GraphEdgeRow, RelationType } from './graph-memory-types.js';
import {
  CREATE_EDGES_TABLE_SQL,
  CREATE_FROM_INDEX_SQL,
  CREATE_TO_INDEX_SQL,
  rowToEdge,
  resolveTraversalOptions,
  edgePassesFilter,
  getNextKeys,
} from './graph-memory-helpers.js';
import type { ResolvedTraversalOptions } from './graph-memory-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeEdge(overrides: Partial<GraphEdge> = {}): GraphEdge {
  return {
    from: 'node-a',
    to: 'node-b',
    type: 'related_to' as RelationType,
    weight: 1.0,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeOpts(overrides: Partial<ResolvedTraversalOptions> = {}): ResolvedTraversalOptions {
  return {
    maxDepth: 3,
    relationTypes: undefined,
    minWeight: 0,
    limit: 100,
    includeStart: false,
    direction: 'both',
    ...overrides,
  };
}

// ============================================================================
// SQL Constants
// ============================================================================

describe('SQL constants', () => {
  it('CREATE_EDGES_TABLE_SQL creates graph_edges table', () => {
    expect(CREATE_EDGES_TABLE_SQL).toContain('CREATE TABLE IF NOT EXISTS graph_edges');
    expect(CREATE_EDGES_TABLE_SQL).toContain('from_key TEXT NOT NULL');
    expect(CREATE_EDGES_TABLE_SQL).toContain('to_key TEXT NOT NULL');
    expect(CREATE_EDGES_TABLE_SQL).toContain('relation_type TEXT NOT NULL');
  });

  it('CREATE_FROM_INDEX_SQL creates from_key index', () => {
    expect(CREATE_FROM_INDEX_SQL).toContain('idx_edges_from');
  });

  it('CREATE_TO_INDEX_SQL creates to_key index', () => {
    expect(CREATE_TO_INDEX_SQL).toContain('idx_edges_to');
  });
});

// ============================================================================
// rowToEdge
// ============================================================================

describe('rowToEdge', () => {
  it('converts row to edge', () => {
    const row: GraphEdgeRow = {
      from_key: 'a',
      to_key: 'b',
      relation_type: 'depends_on',
      weight: 0.8,
      created_at: 1700000000000,
      metadata: null,
    };
    const edge = rowToEdge(row);
    expect(edge.from).toBe('a');
    expect(edge.to).toBe('b');
    expect(edge.type).toBe('depends_on');
    expect(edge.weight).toBe(0.8);
    expect(edge.createdAt).toBeInstanceOf(Date);
  });

  it('parses metadata JSON when present', () => {
    const row: GraphEdgeRow = {
      from_key: 'a',
      to_key: 'b',
      relation_type: 'related_to',
      weight: 1.0,
      created_at: 1700000000000,
      metadata: '{"source":"test"}',
    };
    const edge = rowToEdge(row);
    expect(edge.metadata).toEqual({ source: 'test' });
  });

  it('omits metadata when null', () => {
    const row: GraphEdgeRow = {
      from_key: 'a',
      to_key: 'b',
      relation_type: 'related_to',
      weight: 1.0,
      created_at: 1700000000000,
      metadata: null,
    };
    const edge = rowToEdge(row);
    expect(edge.metadata).toBeUndefined();
  });
});

// ============================================================================
// resolveTraversalOptions
// ============================================================================

describe('resolveTraversalOptions', () => {
  it('returns defaults for undefined', () => {
    const opts = resolveTraversalOptions();
    expect(opts.maxDepth).toBeGreaterThan(0);
    expect(opts.minWeight).toBe(0);
    expect(opts.limit).toBe(100);
    expect(opts.includeStart).toBe(false);
    expect(opts.direction).toBe('both');
    expect(opts.relationTypes).toBeUndefined();
  });

  it('overrides with provided values', () => {
    const opts = resolveTraversalOptions({
      maxDepth: 5,
      minWeight: 0.5,
      limit: 50,
      includeStart: true,
      direction: 'outgoing',
      relationTypes: ['depends_on' as RelationType],
    });
    expect(opts.maxDepth).toBe(5);
    expect(opts.minWeight).toBe(0.5);
    expect(opts.limit).toBe(50);
    expect(opts.includeStart).toBe(true);
    expect(opts.direction).toBe('outgoing');
    expect(opts.relationTypes).toEqual(['depends_on']);
  });

  it('preserves defaults for omitted fields', () => {
    const opts = resolveTraversalOptions({ maxDepth: 10 });
    expect(opts.maxDepth).toBe(10);
    expect(opts.minWeight).toBe(0);
    expect(opts.limit).toBe(100);
  });
});

// ============================================================================
// edgePassesFilter
// ============================================================================

describe('edgePassesFilter', () => {
  it('passes when weight is above minimum', () => {
    const edge = makeEdge({ weight: 0.8 });
    expect(edgePassesFilter(edge, makeOpts({ minWeight: 0.5 }))).toBe(true);
  });

  it('fails when weight is below minimum', () => {
    const edge = makeEdge({ weight: 0.3 });
    expect(edgePassesFilter(edge, makeOpts({ minWeight: 0.5 }))).toBe(false);
  });

  it('passes when relation type matches', () => {
    const edge = makeEdge({ type: 'depends_on' as RelationType });
    expect(
      edgePassesFilter(edge, makeOpts({ relationTypes: ['depends_on' as RelationType] }))
    ).toBe(true);
  });

  it('fails when relation type does not match', () => {
    const edge = makeEdge({ type: 'related_to' as RelationType });
    expect(
      edgePassesFilter(edge, makeOpts({ relationTypes: ['depends_on' as RelationType] }))
    ).toBe(false);
  });

  it('passes when no relation type filter', () => {
    const edge = makeEdge({ type: 'related_to' as RelationType });
    expect(edgePassesFilter(edge, makeOpts({ relationTypes: undefined }))).toBe(true);
  });
});

// ============================================================================
// getNextKeys
// ============================================================================

describe('getNextKeys', () => {
  it('returns outgoing targets for both direction', () => {
    const edges = [makeEdge({ from: 'a', to: 'b' }), makeEdge({ from: 'a', to: 'c' })];
    const result = getNextKeys('a', edges, makeOpts({ direction: 'both' }));
    expect(result.map((r) => r.key)).toContain('b');
    expect(result.map((r) => r.key)).toContain('c');
  });

  it('returns incoming sources for both direction', () => {
    const edges = [makeEdge({ from: 'x', to: 'a' })];
    const result = getNextKeys('a', edges, makeOpts({ direction: 'both' }));
    expect(result.map((r) => r.key)).toContain('x');
  });

  it('only returns outgoing for outgoing direction', () => {
    const edges = [makeEdge({ from: 'a', to: 'b' }), makeEdge({ from: 'x', to: 'a' })];
    const result = getNextKeys('a', edges, makeOpts({ direction: 'outgoing' }));
    expect(result.map((r) => r.key)).toContain('b');
    // Incoming edge 'x' should not appear via the outgoing direction
    // Actually, with outgoing direction, opts.direction !== 'incoming' is true so from='a' to='b' passes
    // But opts.direction !== 'outgoing' is false so to='a' from='x' does NOT pass
    expect(result.map((r) => r.key)).not.toContain('x');
  });

  it('only returns incoming for incoming direction', () => {
    const edges = [makeEdge({ from: 'a', to: 'b' }), makeEdge({ from: 'x', to: 'a' })];
    const result = getNextKeys('a', edges, makeOpts({ direction: 'incoming' }));
    expect(result.map((r) => r.key)).toContain('x');
    expect(result.map((r) => r.key)).not.toContain('b');
  });

  it('filters by weight', () => {
    const edges = [
      makeEdge({ from: 'a', to: 'b', weight: 0.1 }),
      makeEdge({ from: 'a', to: 'c', weight: 0.9 }),
    ];
    const result = getNextKeys('a', edges, makeOpts({ minWeight: 0.5 }));
    expect(result).toHaveLength(1);
    expect(result[0]!.key).toBe('c');
  });
});
