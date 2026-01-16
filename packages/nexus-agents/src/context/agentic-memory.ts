/**
 * Agentic Memory Backend
 *
 * Implements A-MEM Zettelkasten-style agentic memory with:
 * - Automatic attribute extraction (keywords, tags, entities)
 * - Dynamic linking between related memories
 * - Memory evolution detection
 *
 * Composes with HybridMemoryBackend for storage and GraphMemoryBackend
 * for relationship management.
 *
 * @module context/agentic-memory
 * (Source: Issue #122, arXiv:2502.12110)
 */

import type { Result } from '../core/result.js';
import { ok, err } from '../core/result.js';
import type { ILogger } from '../core/logger.js';
import { createLogger } from '../core/logger.js';
import type { MemoryEntry, MemoryMetadata, ISQLiteDatabase } from './memory-backend-types.js';
import { MemoryError } from './memory-backend-types.js';
import { HybridMemoryBackend } from './memory-backend.js';
import { GraphMemoryBackend } from './graph-memory.js';
import type {
  IAgenticMemory,
  AgenticMemoryConfig,
  AgenticMemoryEntry,
  AgenticStoreResult,
  MemoryAttributes,
  ExtractionConfig,
  LinkingConfig,
  LinkingOptions,
  LinkSuggestion,
  EvolutionResult,
} from './agentic-memory-types.js';
import { AgenticMemoryConfigSchema } from './agentic-memory-types.js';
import {
  extractAttributes,
  generateLinkSuggestions,
  detectEvolution,
  mergeExtractionConfig,
  mergeLinkingConfig,
  searchWithAttributes,
  getAttributeSet,
  findMatchingMemories,
} from './agentic-memory-helpers.js';
import {
  queryMemoriesForAnalysis,
  queryMemoryByKey,
  queryCandidateMemories,
  queryMemoriesForEvolution,
  queryAllMemoriesExcept,
  updateMemoryMetadata,
  applyLinkSuggestions,
  prepareRefreshedMetadata,
  buildAgenticEntry,
  memoryRowToAgenticEntry,
  getAttributesFromRow,
} from './agentic-memory-operations.js';

// Re-export types (type-only exports)
export type {
  IAgenticMemory,
  AgenticMemoryConfig,
  AgenticMemoryEntry,
  AgenticStoreResult,
  MemoryAttributes,
  ExtractionConfig,
  LinkingConfig,
  LinkingOptions,
  LinkSuggestion,
  EvolutionResult,
  EntityReference,
} from './agentic-memory-types.js';

// Re-export values (EntityType and EvolutionType are both const values and types)
export {
  EntityType,
  EvolutionType,
  DEFAULT_EXTRACTION_CONFIG,
  DEFAULT_LINKING_CONFIG,
  DEFAULT_AGENTIC_MEMORY_CONFIG,
} from './agentic-memory-types.js';

const logger = createLogger({ component: 'AgenticMemoryBackend' });

/**
 * Agentic memory backend with A-MEM Zettelkasten-style organization.
 *
 * Provides automatic attribute extraction, dynamic linking suggestions,
 * and memory evolution detection on top of the hybrid storage backend.
 */
export class AgenticMemoryBackend implements IAgenticMemory {
  private readonly config: AgenticMemoryConfig;
  private readonly log: ILogger;
  private readonly base: HybridMemoryBackend;
  private readonly graph: GraphMemoryBackend;
  private extractionConfig: ExtractionConfig;
  private linkingConfig: LinkingConfig;
  private db: ISQLiteDatabase | null = null;
  private initialized = false;

  constructor(config: AgenticMemoryConfig) {
    const validation = AgenticMemoryConfigSchema.safeParse(config);
    if (!validation.success) {
      const msg = validation.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new MemoryError(`Invalid AgenticMemoryBackend config: ${msg}`);
    }
    this.config = config;
    this.log = logger;
    this.extractionConfig = mergeExtractionConfig(config.extraction);
    this.linkingConfig = mergeLinkingConfig(config.linking);
    this.base = new HybridMemoryBackend({
      dbPath: config.dbPath,
      markdownDir: config.markdownDir,
      autoExpire: config.autoExpire ?? true,
    });
    this.graph = new GraphMemoryBackend({
      dbPath: config.dbPath,
      markdownDir: config.markdownDir,
      autoExpire: config.autoExpire ?? true,
    });
  }

  async initialize(): Promise<Result<void, MemoryError>> {
    if (this.initialized) return ok(undefined);

    const baseInit = await this.base.initialize();
    if (!baseInit.ok) return baseInit;

    const graphInit = await this.graph.initialize();
    if (!graphInit.ok) return graphInit;

    try {
      const mod = await import('better-sqlite3').catch(() => null);
      if (mod === null) return err(new MemoryError('better-sqlite3 not installed'));
      const Database = mod.default;
      this.db = new (Database as new (p: string) => ISQLiteDatabase)(this.config.dbPath);
      this.initialized = true;
      this.log.info('AgenticMemoryBackend initialized');
      return ok(undefined);
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      return err(new MemoryError('Failed to initialize agentic backend', { cause }));
    }
  }

  initializeWithDatabase(database: ISQLiteDatabase): void {
    this.base.initializeWithDatabase(database);
    this.graph.initializeWithDatabase(database);
    this.db = database;
    this.initialized = true;
    this.log.info('AgenticMemoryBackend initialized with database');
  }

  private getDb(): ISQLiteDatabase {
    if (this.db === null) throw new MemoryError('Database not initialized');
    return this.db;
  }

  private ensureInit(): void {
    if (!this.initialized) throw new MemoryError('AgenticMemoryBackend not initialized');
  }

  // IMemoryBackend Methods (delegated to base)
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

  // IAgenticMemory Methods
  async storeWithAttributes(
    key: string,
    value: unknown,
    metadata: MemoryMetadata
  ): Promise<Result<AgenticStoreResult, MemoryError>> {
    try {
      this.ensureInit();
      const attributes = extractAttributes(value, this.extractionConfig);
      const extendedMetadata = { ...metadata, amem: { ...attributes } };

      const storeResult = await this.base.store(key, value, extendedMetadata);
      if (!storeResult.ok) return storeResult;

      const existingMemories = queryMemoriesForAnalysis(this.getDb(), key, this.extractionConfig);
      const now = new Date();
      const linkSuggestions = generateLinkSuggestions(
        key,
        attributes,
        now,
        existingMemories,
        this.linkingConfig
      );
      const evolution = detectEvolution(key, attributes, now, existingMemories);
      const entry = buildAgenticEntry(key, value, extendedMetadata, attributes, now);

      this.log.debug('Stored with attributes', { key, keywords: attributes.keywords.length });
      return ok({ entry, linkSuggestions, evolution });
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      return err(new MemoryError('Failed to store with attributes', { cause }));
    }
  }

  retrieveWithAttributes(key: string): Promise<Result<AgenticMemoryEntry | null, MemoryError>> {
    try {
      this.ensureInit();
      const row = queryMemoryByKey(this.getDb(), key);
      if (row === undefined) return Promise.resolve(ok(null));
      const entry = memoryRowToAgenticEntry(row, this.extractionConfig);
      return Promise.resolve(ok(entry));
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      return Promise.resolve(err(new MemoryError('Failed to retrieve with attributes', { cause })));
    }
  }

  searchAgentic(query: string, limit = 10): Promise<Result<AgenticMemoryEntry[], MemoryError>> {
    try {
      this.ensureInit();
      const entries = searchWithAttributes(this.getDb(), query, limit, this.extractionConfig);
      return Promise.resolve(ok(entries));
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      return Promise.resolve(err(new MemoryError('Failed to search agentic', { cause })));
    }
  }

  suggestLinks(key: string, limit?: number): Promise<Result<LinkSuggestion[], MemoryError>> {
    try {
      this.ensureInit();
      const sourceRow = queryMemoryByKey(this.getDb(), key);
      if (sourceRow === undefined)
        return Promise.resolve(err(new MemoryError(`Memory not found: ${key}`)));

      const sourceAttrs = getAttributesFromRow(sourceRow, this.extractionConfig);
      const candidates = queryCandidateMemories(this.getDb(), key, this.extractionConfig);
      const maxSuggestions = limit ?? this.linkingConfig.maxSuggestions;
      const suggestions = generateLinkSuggestions(
        key,
        sourceAttrs,
        new Date(sourceRow.created_at),
        candidates,
        { ...this.linkingConfig, maxSuggestions }
      );
      return Promise.resolve(ok(suggestions));
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      return Promise.resolve(err(new MemoryError('Failed to suggest links', { cause })));
    }
  }

  async linkRelatedMemories(
    key: string,
    opts?: LinkingOptions
  ): Promise<Result<number, MemoryError>> {
    try {
      this.ensureInit();
      const { threshold = 0.7, maxLinks, bidirectional = true } = opts ?? {};
      const limit = maxLinks ?? this.linkingConfig.maxSuggestions;

      const suggestionsResult = await this.suggestLinks(key, limit);
      if (!suggestionsResult.ok) return suggestionsResult;

      const filtered = suggestionsResult.value.filter((s) => s.confidence >= threshold);
      const linksCreated = await applyLinkSuggestions(this.graph, filtered, bidirectional);

      this.log.debug('Linked related memories', { key, linksCreated, threshold });
      return ok(linksCreated);
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      return err(new MemoryError('Failed to link related memories', { cause }));
    }
  }

  detectEvolution(key: string): Promise<Result<EvolutionResult[], MemoryError>> {
    try {
      this.ensureInit();
      const sourceRow = queryMemoryByKey(this.getDb(), key);
      if (sourceRow === undefined)
        return Promise.resolve(err(new MemoryError(`Memory not found: ${key}`)));

      const sourceAttrs = getAttributesFromRow(sourceRow, this.extractionConfig);
      const existingMemories = queryMemoriesForEvolution(this.getDb(), key, this.extractionConfig);
      const evolution = detectEvolution(
        key,
        sourceAttrs,
        new Date(sourceRow.created_at),
        existingMemories
      );
      return Promise.resolve(ok(evolution));
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      return Promise.resolve(err(new MemoryError('Failed to detect evolution', { cause })));
    }
  }

  refreshAttributes(key: string): Promise<Result<MemoryAttributes, MemoryError>> {
    try {
      this.ensureInit();
      const row = queryMemoryByKey(this.getDb(), key);
      if (row === undefined)
        return Promise.resolve(err(new MemoryError(`Memory not found: ${key}`)));

      const value = JSON.parse(row.value) as unknown;
      const attributes = extractAttributes(value, this.extractionConfig);
      const currentMeta = JSON.parse(row.metadata) as Record<string, unknown>;
      const updatedMeta = prepareRefreshedMetadata(currentMeta, attributes);
      updateMemoryMetadata(this.getDb(), key, updatedMeta);

      this.log.debug('Refreshed attributes', { key, keywords: attributes.keywords.length });
      return Promise.resolve(ok(attributes));
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      return Promise.resolve(err(new MemoryError('Failed to refresh attributes', { cause })));
    }
  }

  findBySharedAttributes(
    key: string,
    attributeType: 'keywords' | 'semanticTags' | 'entities',
    limit = 10
  ): Promise<Result<AgenticMemoryEntry[], MemoryError>> {
    try {
      this.ensureInit();
      const sourceRow = queryMemoryByKey(this.getDb(), key);
      if (sourceRow === undefined)
        return Promise.resolve(err(new MemoryError(`Memory not found: ${key}`)));

      const sourceAttrs = getAttributesFromRow(sourceRow, this.extractionConfig);
      const sourceSet = getAttributeSet(sourceAttrs, attributeType);
      if (sourceSet.size === 0) return Promise.resolve(ok([]));

      const allRows = queryAllMemoriesExcept(this.getDb(), key);
      const matches = findMatchingMemories(
        allRows,
        sourceSet,
        attributeType,
        this.extractionConfig
      );
      return Promise.resolve(ok(matches.slice(0, limit).map((m) => m.entry)));
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      return Promise.resolve(
        err(new MemoryError('Failed to find by shared attributes', { cause }))
      );
    }
  }

  // Configuration getters and setters
  getExtractionConfig(): ExtractionConfig {
    return this.extractionConfig;
  }
  updateExtractionConfig(config: Partial<ExtractionConfig>): void {
    this.extractionConfig = mergeExtractionConfig({ ...this.extractionConfig, ...config });
    this.log.info('Updated extraction config');
  }
  getLinkingConfig(): LinkingConfig {
    return this.linkingConfig;
  }
  updateLinkingConfig(config: Partial<LinkingConfig>): void {
    this.linkingConfig = mergeLinkingConfig({ ...this.linkingConfig, ...config });
    this.log.info('Updated linking config');
  }

  close(): void {
    this.base.close();
    this.graph.close();
    if (this.db !== null) {
      this.db.close();
      this.db = null;
    }
    this.initialized = false;
    this.log.info('AgenticMemoryBackend closed');
  }
}

/** Create an AgenticMemoryBackend instance. */
export function createAgenticMemory(config: AgenticMemoryConfig): AgenticMemoryBackend {
  return new AgenticMemoryBackend(config);
}
