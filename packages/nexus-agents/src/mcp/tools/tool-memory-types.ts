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
  /** When the entry was created, or the query time when creation time is unavailable */
  timestamp: Date;
  /**
   * 'recorded' when the backend persisted a creation time; 'query-time' when the entry
   * predates creation-time tracking and `timestamp` is only the time of this query (not
   * when the entry was created). Absent on backends that always had real timestamps.
   */
  readonly timestampSource?: 'recorded' | 'query-time';
  /** Additional metadata (e.g., confidence, keywords) */
  metadata?: Record<string, unknown>;
}
