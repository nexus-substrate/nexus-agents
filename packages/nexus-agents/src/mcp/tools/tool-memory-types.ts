/**
 * Tool Memory Types
 *
 * Shared types for the tool-memory module, extracted to avoid
 * circular imports between tool-memory.ts and tool-memory-query.ts.
 *
 * @module mcp/tools/tool-memory-types
 */

/**
 * Result from unified cross-memory query (Phase 3 #746).
 * Includes source attribution and relevance scoring.
 */
export interface UnifiedMemoryResult {
  /** Source memory system */
  source: 'session' | 'belief' | 'agentic' | 'typed' | 'adaptive';
  /** Type of memory entry */
  type: string;
  /** Content summary (may be truncated) */
  content: string;
  /** Relevance score (0-1) based on keyword matching */
  relevance: number;
  /** When the entry was created */
  timestamp: Date;
  /** Additional metadata (e.g., confidence, keywords) */
  metadata?: Record<string, unknown>;
}
