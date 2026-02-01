/**
 * nexus-agents/context - Hybrid Memory Backend Types
 *
 * Type definitions, interfaces, and schemas for the hybrid memory backend.
 *
 * @module context/memory-backend-types
 */

import { z } from 'zod';
import type { Result } from '../core/result.js';
import { NexusError, ErrorCode } from '../core/errors.js';
import type { ILogger } from '../core/logger.js';
import type { ISQLiteDatabase, ISQLiteStatement } from '../core/types/index.js';

// Re-export for backward compatibility
export type { ISQLiteDatabase, ISQLiteStatement };

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Importance levels for memory entries.
 */
export const MemoryImportance = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
} as const;

export type MemoryImportance = (typeof MemoryImportance)[keyof typeof MemoryImportance];

/**
 * Zod schema for MemoryImportance validation.
 */
export const MemoryImportanceSchema = z.enum(['low', 'medium', 'high']);

/**
 * Metadata associated with a memory entry.
 */
export interface MemoryMetadata {
  /** Importance level determining storage strategy */
  importance: MemoryImportance;
  /** Optional tags for categorization */
  tags?: string[];
  /** Time-to-live in milliseconds (optional) */
  ttl?: number;
}

/**
 * Zod schema for MemoryMetadata validation.
 */
export const MemoryMetadataSchema = z.object({
  importance: MemoryImportanceSchema,
  tags: z.array(z.string()).optional(),
  ttl: z.number().positive().optional(),
});

/**
 * A complete memory entry with all fields.
 */
export interface MemoryEntry {
  /** Unique key for the memory */
  key: string;
  /** The stored value (JSON-serializable) */
  value: unknown;
  /** Associated metadata */
  metadata: MemoryMetadata;
  /** When the entry was created */
  createdAt: Date;
  /** When the entry was last accessed */
  accessedAt: Date;
}

/**
 * Zod schema for MemoryEntry validation.
 */
export const MemoryEntrySchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  metadata: MemoryMetadataSchema,
  createdAt: z.date(),
  accessedAt: z.date(),
});

/**
 * Error class for memory operations.
 */
export class MemoryError extends NexusError {
  constructor(
    message: string,
    options?: Partial<
      Omit<{ code: ErrorCode; cause?: Error; context?: Record<string, unknown> }, 'code'>
    >
  ) {
    super(message, { code: ErrorCode.INTERNAL_ERROR, ...options });
    this.name = 'MemoryError';
  }
}

/**
 * Interface for memory backend implementations.
 */
export interface IMemoryBackend {
  /**
   * Store a value with associated metadata.
   * @param key - Unique key for the memory
   * @param value - The value to store (must be JSON-serializable)
   * @param metadata - Associated metadata
   */
  store(key: string, value: unknown, metadata: MemoryMetadata): Promise<Result<void, MemoryError>>;

  /**
   * Retrieve a value by key.
   * @param key - The key to look up
   * @returns The value or null if not found
   */
  retrieve(key: string): Promise<Result<unknown, MemoryError>>;

  /**
   * Search memories using full-text search.
   * @param query - Search query string
   * @param limit - Maximum number of results
   */
  search(query: string, limit: number): Promise<Result<MemoryEntry[], MemoryError>>;

  /**
   * Remove memories older than the specified date.
   * @param olderThan - Cutoff date for pruning
   * @returns Number of entries pruned
   */
  prune(olderThan: Date): Promise<Result<number, MemoryError>>;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for HybridMemoryBackend.
 */
export interface HybridMemoryConfig {
  /** Path to SQLite database file */
  dbPath: string;
  /** Directory for Markdown exports */
  markdownDir: string;
  /** Optional logger instance */
  logger?: ILogger;
  /** Whether to auto-expire TTL entries on access (default: true) */
  autoExpire?: boolean;
}

/**
 * Zod schema for HybridMemoryConfig validation.
 */
export const HybridMemoryConfigSchema = z.object({
  dbPath: z.string().min(1),
  markdownDir: z.string().min(1),
  autoExpire: z.boolean().optional(),
});

// ============================================================================
// SQLite Types (for better-sqlite3)
// ============================================================================

/**
 * Row structure in the memories table.
 */
export interface MemoryRow {
  key: string;
  value: string;
  metadata: string;
  created_at: number;
  accessed_at: number;
  expires_at: number | null;
}

// ISQLiteDatabase and ISQLiteStatement imported from core/types/database-types.ts
// and re-exported above for backward compatibility
