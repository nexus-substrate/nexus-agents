/**
 * Adaptive Memory Backend
 *
 * Implements adaptive memory with priority-based retrieval combining
 * recency decay, importance weighting, and context relevance.
 *
 * @module context/adaptive-memory
 * (Source: Issue #143, arXiv:2310.08560)
 */

import type { Result } from '../core/result.js';
import { ok, err } from '../core/result.js';
import type { ILogger } from '../core/logger.js';
import { createLogger } from '../core/logger.js';
import type { MemoryEntry, MemoryMetadata, ISQLiteDatabase } from './memory-backend-types.js';
import { MemoryError } from './memory-backend-types.js';
import { HybridMemoryBackend } from './memory-backend.js';
import type {
  IAdaptiveMemory,
  AdaptiveMemoryConfig,
  ScoringConfig,
  PriorityScore,
  ScoredMemoryEntry,
  PriorityRetrievalOptions,
} from './adaptive-memory-types.js';
import { AdaptiveMemoryConfigSchema } from './adaptive-memory-types.js';
import {
  mergeScoringConfig,
  scoreAndSortEntries,
  getAllMemoryRows,
  getMemoryRow,
  touchMemory,
  memoryExists,
  memoryRowToEntry,
  calculatePriorityScore,
} from './adaptive-memory-helpers.js';

// Re-export types
export type {
  IAdaptiveMemory,
  AdaptiveMemoryConfig,
  ScoringConfig,
  PriorityScore,
  ScoredMemoryEntry,
  PriorityRetrievalOptions,
  ScoringWeights,
  ImportanceWeights,
  DecayConfig,
  PriorityScoreComponents,
} from './adaptive-memory-types.js';
export { DEFAULT_SCORING_CONFIG } from './adaptive-memory-types.js';

const logger = createLogger({ component: 'AdaptiveMemoryBackend' });

/**
 * Adaptive memory backend with priority-based retrieval.
 */
export class AdaptiveMemoryBackend implements IAdaptiveMemory {
  private readonly config: AdaptiveMemoryConfig;
  private readonly log: ILogger;
  private readonly base: HybridMemoryBackend;
  private scoringConfig: ScoringConfig;
  private db: ISQLiteDatabase | null = null;
  private initialized = false;

  constructor(config: AdaptiveMemoryConfig) {
    const validation = AdaptiveMemoryConfigSchema.safeParse(config);
    if (!validation.success) {
      const msg = validation.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new MemoryError(`Invalid AdaptiveMemoryBackend config: ${msg}`);
    }
    this.config = config;
    this.log = logger;
    this.scoringConfig = mergeScoringConfig(config.scoring);
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
      this.initialized = true;
      this.log.info('AdaptiveMemoryBackend initialized');
      return ok(undefined);
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      return err(new MemoryError('Failed to initialize adaptive backend', { cause }));
    }
  }

  initializeWithDatabase(database: ISQLiteDatabase): void {
    this.base.initializeWithDatabase(database);
    this.db = database;
    this.initialized = true;
    this.log.info('AdaptiveMemoryBackend initialized with database');
  }

  private getDb(): ISQLiteDatabase {
    if (this.db === null) throw new MemoryError('Database not initialized');
    return this.db;
  }

  private ensureInit(): void {
    if (!this.initialized) throw new MemoryError('AdaptiveMemoryBackend not initialized');
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
  // IAdaptiveMemory Methods
  // =========================================================================

  retrieveByPriority(
    opts?: PriorityRetrievalOptions
  ): Promise<Result<ScoredMemoryEntry[], MemoryError>> {
    try {
      this.ensureInit();
      const db = this.getDb();

      // Get all rows (with a reasonable limit for initial fetch)
      const maxFetch = (opts?.limit ?? 100) * 2;
      const rows = getAllMemoryRows(db, maxFetch);

      // Score, filter, and sort
      const scored = scoreAndSortEntries(rows, opts, this.scoringConfig);

      this.log.debug('Retrieved by priority', { count: scored.length, query: opts?.query });
      return Promise.resolve(ok(scored));
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      return Promise.resolve(err(new MemoryError('Failed to retrieve by priority', { cause })));
    }
  }

  getPriorityScore(key: string, query?: string): Promise<Result<PriorityScore, MemoryError>> {
    try {
      this.ensureInit();
      const db = this.getDb();

      if (!memoryExists(db, key)) {
        return Promise.resolve(err(new MemoryError(`Key not found: ${key}`)));
      }

      const row = getMemoryRow(db, key);
      if (row === undefined) {
        return Promise.resolve(err(new MemoryError(`Key not found: ${key}`)));
      }

      const entry = memoryRowToEntry(row);
      const priority = calculatePriorityScore({
        entry,
        now: new Date(),
        config: this.scoringConfig,
        ...(query !== undefined && { query }),
      });

      return Promise.resolve(ok(priority));
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      return Promise.resolve(err(new MemoryError('Failed to get priority score', { cause })));
    }
  }

  touch(key: string): Promise<Result<void, MemoryError>> {
    try {
      this.ensureInit();
      const db = this.getDb();

      if (!memoryExists(db, key)) {
        return Promise.resolve(err(new MemoryError(`Key not found: ${key}`)));
      }

      const updated = touchMemory(db, key);
      if (!updated) {
        return Promise.resolve(err(new MemoryError(`Failed to touch: ${key}`)));
      }

      this.log.debug('Touched memory', { key });
      return Promise.resolve(ok(undefined));
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      return Promise.resolve(err(new MemoryError('Failed to touch memory', { cause })));
    }
  }

  getScoringConfig(): ScoringConfig {
    return this.scoringConfig;
  }

  updateScoringConfig(config: Partial<ScoringConfig>): void {
    this.scoringConfig = mergeScoringConfig({ ...this.scoringConfig, ...config });
    this.log.info('Updated scoring config', { config: this.scoringConfig });
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
    this.log.info('AdaptiveMemoryBackend closed');
  }
}

/** Create an AdaptiveMemoryBackend instance. */
export function createAdaptiveMemory(config: AdaptiveMemoryConfig): AdaptiveMemoryBackend {
  return new AdaptiveMemoryBackend(config);
}
