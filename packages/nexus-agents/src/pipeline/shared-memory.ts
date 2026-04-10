/**
 * Shared Memory — Cross-stage knowledge propagation (#1737, Phase 4)
 *
 * Early pipeline stages (planning, research) write structured discoveries
 * to a shared memory layer. Later stages read before acting.
 *
 * Scoped to a single pipeline run — not persisted cross-session.
 *
 * Pattern from: SWE-AF shared memory, AutoGen knowledge propagation.
 *
 * @module pipeline/shared-memory
 */

// ============================================================================
// Types
// ============================================================================

/** A tagged memory entry written by a pipeline stage. */
export interface SharedMemoryEntry {
  /** Stage that wrote this entry. */
  readonly sourceStage: string;
  /** Category tag for filtering. */
  readonly tag: SharedMemoryTag;
  /** The content (structured or text). */
  readonly content: unknown;
  /** When this was written. */
  readonly timestamp: number;
}

/** Tags for categorizing shared memory entries. */
export type SharedMemoryTag =
  | 'convention'
  | 'discovery'
  | 'constraint'
  | 'decision'
  | 'risk'
  | 'dependency'
  | 'context';

// ============================================================================
// Shared Memory Store (per-pipeline-run)
// ============================================================================

/** In-memory store for cross-stage knowledge sharing. */
export class SharedMemoryStore {
  private readonly entries: SharedMemoryEntry[] = [];
  private readonly maxEntries: number;

  constructor(maxEntries = 100) {
    this.maxEntries = maxEntries;
  }

  /** Write a memory entry. */
  write(sourceStage: string, tag: SharedMemoryTag, content: unknown): void {
    if (this.entries.length >= this.maxEntries) {
      this.entries.shift(); // Evict oldest
    }
    this.entries.push({
      sourceStage,
      tag,
      content,
      timestamp: Date.now(),
    });
  }

  /** Read all entries, optionally filtered by tag. */
  read(tag?: SharedMemoryTag): readonly SharedMemoryEntry[] {
    if (tag === undefined) return [...this.entries];
    return this.entries.filter((e) => e.tag === tag);
  }

  /** Read entries from a specific stage. */
  readFromStage(sourceStage: string): readonly SharedMemoryEntry[] {
    return this.entries.filter((e) => e.sourceStage === sourceStage);
  }

  /** Get summary of all entries as context string for LLM consumption. */
  summarize(maxLength = 2000): string {
    if (this.entries.length === 0) return '';
    const lines = this.entries.map(
      (e) => `[${e.tag}] (from ${e.sourceStage}): ${formatContent(e.content)}`
    );
    const joined = lines.join('\n');
    if (joined.length <= maxLength) return joined;
    return `${joined.slice(0, maxLength - 3)}...`;
  }

  /** Get entry count. */
  get size(): number {
    return this.entries.length;
  }

  /** Clear all entries. */
  clear(): void {
    this.entries.length = 0;
  }
}

/** Format content for summarization. */
function formatContent(content: unknown): string {
  if (typeof content === 'string') return content.slice(0, 200);
  if (typeof content === 'object' && content !== null) {
    try {
      return JSON.stringify(content).slice(0, 200);
    } catch {
      return '[object]';
    }
  }
  return String(content);
}
