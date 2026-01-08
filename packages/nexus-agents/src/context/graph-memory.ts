/**
 * Graph-Based Memory Backend
 *
 * Implements graph-structured memory with entity relationships.
 * Extends HybridMemoryBackend with graph operations for traversal
 * and relationship management.
 *
 * @module context/graph-memory
 * (Source: Issue #142, arXiv:2308.09687)
 */

import type { Result } from '../core/result.js';
import { ok, err } from '../core/result.js';
import type { ILogger } from '../core/logger.js';
import { createLogger } from '../core/logger.js';
import type { MemoryEntry, MemoryMetadata, ISQLiteDatabase } from './memory-backend-types.js';
import { MemoryError } from './memory-backend-types.js';
import { HybridMemoryBackend } from './memory-backend.js';
import type {
  IGraphMemory,
  GraphEdge,
  GraphMemoryConfig,
  TraversalOptions,
  TraversalResult,
  RelationType,
  AddRelationshipOptions,
} from './graph-memory-types.js';
import {
  GraphMemoryConfigSchema,
  DEFAULT_GRAPH_MEMORY_CONFIG,
  RelationType as RelationTypes,
} from './graph-memory-types.js';
import {
  CREATE_EDGES_TABLE_SQL,
  CREATE_FROM_INDEX_SQL,
  CREATE_TO_INDEX_SQL,
  resolveTraversalOptions,
  getEdgesForKey,
  bfsTraverse,
  findShortestPath,
  memoryExists,
} from './graph-memory-helpers.js';

// Re-export types
export type {
  IGraphMemory,
  GraphEdge,
  GraphMemoryConfig,
  TraversalOptions,
  TraversalResult,
  RelationType,
  AddRelationshipOptions,
} from './graph-memory-types.js';
export { RelationType as RelationTypes } from './graph-memory-types.js';

const logger = createLogger({ component: 'GraphMemoryBackend' });

/**
 * Graph-based memory backend with relationship traversal.
 */
export class GraphMemoryBackend implements IGraphMemory {
  private readonly config: GraphMemoryConfig;
  private readonly log: ILogger;
  private readonly base: HybridMemoryBackend;
  private db: ISQLiteDatabase | null = null;
  private initialized = false;

  constructor(config: GraphMemoryConfig) {
    const validation = GraphMemoryConfigSchema.safeParse(config);
    if (!validation.success) {
      const msg = validation.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new MemoryError(`Invalid GraphMemoryBackend config: ${msg}`);
    }
    this.config = { ...DEFAULT_GRAPH_MEMORY_CONFIG, ...config };
    this.log = logger;
    this.base = new HybridMemoryBackend({ dbPath: config.dbPath, markdownDir: config.markdownDir });
  }

  async initialize(): Promise<Result<void, MemoryError>> {
    if (this.initialized) return ok(undefined);
    const baseInit = await this.base.initialize();
    if (!baseInit.ok) return baseInit;

    try {
      const mod = await import('better-sqlite3').catch(() => null);
      if (mod === null) return err(new MemoryError('better-sqlite3 not installed'));
      const Database = mod.default;
      this.db = new (Database as new (p: string) => ISQLiteDatabase)(this.config.dbPath);
      this.createGraphTables();
      this.initialized = true;
      this.log.info('GraphMemoryBackend initialized');
      return ok(undefined);
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      return err(new MemoryError('Failed to initialize graph backend', { cause }));
    }
  }

  initializeWithDatabase(database: ISQLiteDatabase): void {
    this.base.initializeWithDatabase(database);
    this.db = database;
    this.createGraphTables();
    this.initialized = true;
    this.log.info('GraphMemoryBackend initialized with database');
  }

  private createGraphTables(): void {
    const db = this.getDb();
    db.exec(CREATE_EDGES_TABLE_SQL);
    db.exec(CREATE_FROM_INDEX_SQL);
    db.exec(CREATE_TO_INDEX_SQL);
    this.log.debug('Graph tables created');
  }

  private getDb(): ISQLiteDatabase {
    if (this.db === null) throw new MemoryError('Database not initialized');
    return this.db;
  }

  private ensureInit(): void {
    if (!this.initialized) throw new MemoryError('GraphMemoryBackend not initialized');
  }

  // =========================================================================
  // IMemoryBackend Methods (delegated to base)
  // =========================================================================

  store(key: string, value: unknown, metadata: MemoryMetadata): Promise<Result<void, MemoryError>> {
    return this.base.store(key, value, metadata);
  }

  retrieve(key: string): Promise<Result<unknown, MemoryError>> {
    return this.base.retrieve(key);
  }

  search(query: string, limit: number): Promise<Result<MemoryEntry[], MemoryError>> {
    return this.base.search(query, limit);
  }

  prune(olderThan: Date): Promise<Result<number, MemoryError>> {
    return this.base.prune(olderThan);
  }

  // =========================================================================
  // Graph Relationship Methods
  // =========================================================================

  addRelationship(
    from: string,
    to: string,
    type: RelationType,
    opts?: AddRelationshipOptions
  ): Promise<Result<void, MemoryError>> {
    try {
      this.ensureInit();
      const db = this.getDb();
      if (!memoryExists(db, from))
        return Promise.resolve(err(new MemoryError(`Source key not found: ${from}`)));
      if (!memoryExists(db, to))
        return Promise.resolve(err(new MemoryError(`Target key not found: ${to}`)));

      const weight = opts?.weight ?? 1.0;
      const metadata = opts?.metadata !== undefined ? JSON.stringify(opts.metadata) : null;
      const stmt = db.prepare(`INSERT OR REPLACE INTO graph_edges VALUES (?, ?, ?, ?, ?, ?)`);
      stmt.run(from, to, type, weight, Date.now(), metadata);
      this.log.debug('Added relationship', { from, to, type, weight });
      return Promise.resolve(ok(undefined));
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      return Promise.resolve(err(new MemoryError('Failed to add relationship', { cause })));
    }
  }

  removeRelationship(
    from: string,
    to: string,
    type?: RelationType
  ): Promise<Result<void, MemoryError>> {
    try {
      this.ensureInit();
      const db = this.getDb();
      const sql =
        type !== undefined
          ? 'DELETE FROM graph_edges WHERE from_key = ? AND to_key = ? AND relation_type = ?'
          : 'DELETE FROM graph_edges WHERE from_key = ? AND to_key = ?';
      const args = type !== undefined ? [from, to, type] : [from, to];
      db.prepare(sql).run(...args);
      this.log.debug('Removed relationship', { from, to, type });
      return Promise.resolve(ok(undefined));
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      return Promise.resolve(err(new MemoryError('Failed to remove relationship', { cause })));
    }
  }

  getRelationships(
    key: string,
    direction: 'outgoing' | 'incoming' | 'both' = 'both'
  ): Promise<Result<GraphEdge[], MemoryError>> {
    try {
      this.ensureInit();
      const edges = getEdgesForKey({ db: this.getDb(), key, direction });
      return Promise.resolve(ok(edges));
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      return Promise.resolve(err(new MemoryError('Failed to get relationships', { cause })));
    }
  }

  // =========================================================================
  // Graph Traversal Methods
  // =========================================================================

  traverse(
    startKey: string,
    opts?: TraversalOptions
  ): Promise<Result<TraversalResult[], MemoryError>> {
    try {
      this.ensureInit();
      const db = this.getDb();
      if (!memoryExists(db, startKey))
        return Promise.resolve(err(new MemoryError(`Key not found: ${startKey}`)));

      const maxDepth =
        this.config.maxTraversalDepth ?? DEFAULT_GRAPH_MEMORY_CONFIG.maxTraversalDepth;
      const resolved = resolveTraversalOptions(opts);
      if (resolved.maxDepth > maxDepth) {
        const msg = `Max depth exceeded: ${String(resolved.maxDepth)} > ${String(maxDepth)}`;
        return Promise.resolve(err(new MemoryError(msg)));
      }

      const results = bfsTraverse({ db, startKey, opts: resolved });
      return Promise.resolve(ok(results));
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      return Promise.resolve(err(new MemoryError('Traversal failed', { cause })));
    }
  }

  findPath(
    from: string,
    to: string,
    opts?: Pick<TraversalOptions, 'relationTypes' | 'minWeight'>
  ): Promise<Result<string[] | null, MemoryError>> {
    try {
      this.ensureInit();
      const db = this.getDb();
      if (!memoryExists(db, from))
        return Promise.resolve(err(new MemoryError(`From key not found: ${from}`)));
      if (!memoryExists(db, to))
        return Promise.resolve(err(new MemoryError(`To key not found: ${to}`)));

      const resolved = resolveTraversalOptions(opts);
      const path = findShortestPath(db, from, to, resolved);
      return Promise.resolve(ok(path));
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      return Promise.resolve(err(new MemoryError('Path finding failed', { cause })));
    }
  }

  async getNeighbors(key: string, depth = 1): Promise<Result<MemoryEntry[], MemoryError>> {
    const result = await this.traverse(key, { maxDepth: depth, includeStart: false });
    if (!result.ok) return result;
    return ok(result.value.map((r) => r.entry));
  }

  // =========================================================================
  // Store with Relations
  // =========================================================================

  async storeWithRelations(
    key: string,
    value: unknown,
    metadata: MemoryMetadata,
    relatedTo?: readonly string[]
  ): Promise<Result<void, MemoryError>> {
    const storeResult = await this.store(key, value, metadata);
    if (!storeResult.ok) return storeResult;

    if (relatedTo !== undefined && relatedTo.length > 0) {
      for (const relKey of relatedTo) {
        const addResult = await this.addRelationship(key, relKey, RelationTypes.RELATED_TO);
        if (!addResult.ok) this.log.warn('Failed to add relation', { from: key, to: relKey });
      }
    }
    return ok(undefined);
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  close(): void {
    this.base.close();
    if (this.db !== null) {
      this.db.close();
      this.db = null;
    }
    this.initialized = false;
    this.log.info('GraphMemoryBackend closed');
  }
}

/** Create a GraphMemoryBackend instance. */
export function createGraphMemory(config: GraphMemoryConfig): GraphMemoryBackend {
  return new GraphMemoryBackend(config);
}
