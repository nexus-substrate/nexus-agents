/**
 * Graph Memory Helpers
 *
 * Helper functions for graph memory operations including SQL queries
 * and traversal algorithms.
 *
 * @module context/graph-memory-helpers
 * (Source: Issue #142, arXiv:2308.09687)
 */

import type {
  GraphEdge,
  GraphEdgeRow,
  TraversalOptions,
  TraversalResult,
  RelationType,
} from './graph-memory-types.js';
import { DEFAULT_GRAPH_MEMORY_CONFIG } from './graph-memory-types.js';
import type { MemoryEntry, MemoryRow, ISQLiteDatabase } from './memory-backend-types.js';

// ============================================================================
// SQL Schema
// ============================================================================

/** SQL to create the graph_edges table. */
export const CREATE_EDGES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS graph_edges (
    from_key TEXT NOT NULL,
    to_key TEXT NOT NULL,
    relation_type TEXT NOT NULL,
    weight REAL NOT NULL DEFAULT 1.0,
    created_at INTEGER NOT NULL,
    metadata TEXT,
    PRIMARY KEY (from_key, to_key, relation_type),
    FOREIGN KEY (from_key) REFERENCES memories(key) ON DELETE CASCADE,
    FOREIGN KEY (to_key) REFERENCES memories(key) ON DELETE CASCADE
  )
`;

/** SQL to create index on from_key. */
export const CREATE_FROM_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_edges_from ON graph_edges(from_key)
`;

/** SQL to create index on to_key. */
export const CREATE_TO_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_edges_to ON graph_edges(to_key)
`;

// ============================================================================
// Row Conversion
// ============================================================================

/** Convert a database row to a GraphEdge. */
export function rowToEdge(row: GraphEdgeRow): GraphEdge {
  return {
    from: row.from_key,
    to: row.to_key,
    type: row.relation_type as RelationType,
    weight: row.weight,
    createdAt: new Date(row.created_at),
    metadata:
      row.metadata !== null ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined,
  };
}

/** Convert a MemoryRow to a MemoryEntry. */
export function memoryRowToEntry(row: MemoryRow): MemoryEntry {
  return {
    key: row.key,
    value: JSON.parse(row.value) as unknown,
    metadata: JSON.parse(row.metadata) as MemoryEntry['metadata'],
    createdAt: new Date(row.created_at),
    accessedAt: new Date(row.accessed_at),
  };
}

// ============================================================================
// Traversal Options
// ============================================================================

/** Resolved traversal options with defaults applied. */
export interface ResolvedTraversalOptions {
  readonly maxDepth: number;
  readonly relationTypes: readonly RelationType[] | undefined;
  readonly minWeight: number;
  readonly limit: number;
  readonly includeStart: boolean;
  readonly direction: 'outgoing' | 'incoming' | 'both';
}

/** Default values for traversal options. */
const TRAVERSAL_DEFAULTS: Omit<ResolvedTraversalOptions, 'relationTypes'> = {
  maxDepth: DEFAULT_GRAPH_MEMORY_CONFIG.defaultTraversalDepth,
  minWeight: 0,
  limit: 100,
  includeStart: false,
  direction: 'both',
};

/** Resolve traversal options with defaults. */
export function resolveTraversalOptions(opts?: TraversalOptions): ResolvedTraversalOptions {
  if (opts === undefined) return { ...TRAVERSAL_DEFAULTS, relationTypes: undefined };
  return {
    maxDepth: opts.maxDepth ?? TRAVERSAL_DEFAULTS.maxDepth,
    relationTypes: opts.relationTypes,
    minWeight: opts.minWeight ?? TRAVERSAL_DEFAULTS.minWeight,
    limit: opts.limit ?? TRAVERSAL_DEFAULTS.limit,
    includeStart: opts.includeStart ?? TRAVERSAL_DEFAULTS.includeStart,
    direction: opts.direction ?? TRAVERSAL_DEFAULTS.direction,
  };
}

// ============================================================================
// Edge Queries
// ============================================================================

/** Query configuration for edge retrieval. */
export interface EdgeQueryConfig {
  readonly db: ISQLiteDatabase;
  readonly key: string;
  readonly direction: 'outgoing' | 'incoming' | 'both';
}

/** Get edges for a key based on direction. */
export function getEdgesForKey(config: EdgeQueryConfig): GraphEdge[] {
  const { db, key, direction } = config;
  const edges: GraphEdge[] = [];

  if (direction === 'outgoing' || direction === 'both') {
    const stmt = db.prepare<GraphEdgeRow>('SELECT * FROM graph_edges WHERE from_key = ?');
    const rows = stmt.all(key);
    edges.push(...rows.map(rowToEdge));
  }

  if (direction === 'incoming' || direction === 'both') {
    const stmt = db.prepare<GraphEdgeRow>('SELECT * FROM graph_edges WHERE to_key = ?');
    const rows = stmt.all(key);
    edges.push(...rows.map(rowToEdge));
  }

  return edges;
}

// ============================================================================
// BFS Traversal
// ============================================================================

/** State for BFS traversal. */
interface BFSState {
  readonly visited: Set<string>;
  readonly queue: Array<{ key: string; depth: number; path: string[]; edge?: GraphEdge }>;
  readonly results: TraversalResult[];
}

/** Configuration for BFS traversal. */
export interface BFSConfig {
  readonly db: ISQLiteDatabase;
  readonly startKey: string;
  readonly opts: ResolvedTraversalOptions;
}

/** Check if an edge passes the filter criteria. */
export function edgePassesFilter(edge: GraphEdge, opts: ResolvedTraversalOptions): boolean {
  if (edge.weight < opts.minWeight) return false;
  if (opts.relationTypes !== undefined && !opts.relationTypes.includes(edge.type)) return false;
  return true;
}

/** Get next keys to visit from current edges. */
export function getNextKeys(
  currentKey: string,
  edges: GraphEdge[],
  opts: ResolvedTraversalOptions
): Array<{ key: string; edge: GraphEdge }> {
  const next: Array<{ key: string; edge: GraphEdge }> = [];

  for (const edge of edges) {
    if (!edgePassesFilter(edge, opts)) continue;

    if (opts.direction !== 'incoming' && edge.from === currentKey) {
      next.push({ key: edge.to, edge });
    }
    if (opts.direction !== 'outgoing' && edge.to === currentKey) {
      next.push({ key: edge.from, edge });
    }
  }

  return next;
}

/** Perform BFS traversal. */
export function bfsTraverse(config: BFSConfig): TraversalResult[] {
  const { db, startKey, opts } = config;

  const state: BFSState = {
    visited: new Set([startKey]),
    queue: [{ key: startKey, depth: 0, path: [startKey] }],
    results: [],
  };

  while (state.queue.length > 0 && state.results.length < opts.limit) {
    const current = state.queue.shift();
    if (current === undefined) break;

    if (current.depth > 0 || opts.includeStart) {
      const entry = getMemoryEntry(db, current.key);
      if (entry !== undefined) {
        state.results.push({
          entry,
          depth: current.depth,
          path: current.path,
          edge: current.edge,
        });
      }
    }

    if (current.depth >= opts.maxDepth) continue;

    const edges = getEdgesForKey({ db, key: current.key, direction: opts.direction });
    const nextKeys = getNextKeys(current.key, edges, opts);

    for (const { key: nextKey, edge } of nextKeys) {
      if (!state.visited.has(nextKey)) {
        state.visited.add(nextKey);
        state.queue.push({
          key: nextKey,
          depth: current.depth + 1,
          path: [...current.path, nextKey],
          edge,
        });
      }
    }
  }

  return state.results;
}

// ============================================================================
// Path Finding (BFS-based shortest path)
// ============================================================================

/** Find shortest path between two keys. */
export function findShortestPath(
  db: ISQLiteDatabase,
  from: string,
  to: string,
  opts: Pick<ResolvedTraversalOptions, 'relationTypes' | 'minWeight'>
): string[] | null {
  const visited = new Set<string>([from]);
  const queue: Array<{ key: string; path: string[] }> = [{ key: from, path: [from] }];
  const resolvedOpts = { ...resolveTraversalOptions(), ...opts, maxDepth: 10 };

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;

    if (current.key === to) return current.path;

    const edges = getEdgesForKey({ db, key: current.key, direction: 'both' });
    const nextKeys = getNextKeys(current.key, edges, resolvedOpts);

    for (const { key: nextKey } of nextKeys) {
      if (!visited.has(nextKey)) {
        visited.add(nextKey);
        queue.push({ key: nextKey, path: [...current.path, nextKey] });
      }
    }
  }

  return null;
}

// ============================================================================
// Memory Retrieval Helper
// ============================================================================

/** Get a memory entry by key. */
export function getMemoryEntry(db: ISQLiteDatabase, key: string): MemoryEntry | undefined {
  const stmt = db.prepare<MemoryRow>('SELECT * FROM memories WHERE key = ?');
  const row = stmt.get(key);
  return row !== undefined ? memoryRowToEntry(row) : undefined;
}

/** Check if a memory key exists. */
export function memoryExists(db: ISQLiteDatabase, key: string): boolean {
  const stmt = db.prepare<{ count: number }>(
    'SELECT COUNT(*) as count FROM memories WHERE key = ?'
  );
  const result = stmt.get(key);
  return result !== undefined && result.count > 0;
}
