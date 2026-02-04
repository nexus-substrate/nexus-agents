/**
 * nexus-agents/mcp - Research Auto-Catalog
 *
 * Automatically records research references found during normal tool execution.
 * Scans tool outputs for arXiv IDs and GitHub URLs, stores them in session memory
 * for later review and approval.
 *
 * @module mcp/tools/research-auto-catalog
 * (Source: Research System Enhancement - Phase 5)
 */

import type { ILogger } from '../../core/index.js';
import { createLogger } from '../../core/index.js';
import { getToolMemory } from './tool-memory.js';

// =============================================================================
// TYPES
// =============================================================================

/** A cataloged research reference. */
export interface CatalogedReference {
  /** Type of reference */
  type: 'arxiv' | 'github' | 'url';
  /** Reference identifier (arXiv ID or URL) */
  identifier: string;
  /** Context where it was found */
  context: string;
  /** Tool that produced the reference */
  sourceTool: string;
  /** When it was discovered */
  discoveredAt: string;
  /** Whether it has been reviewed */
  reviewed: boolean;
}

// =============================================================================
// REGEX PATTERNS
// =============================================================================

/** Pattern for arXiv paper IDs (e.g., 2401.12345). */
const ARXIV_PATTERN = /\b(\d{4}\.\d{4,5})\b/g;

/** Pattern for GitHub repository URLs. */
const GITHUB_PATTERN = /github\.com\/([\w.-]+\/[\w.-]+)/g;

// =============================================================================
// RESEARCH AUTO-CATALOG
// =============================================================================

/**
 * ResearchAutoCatalog records research references found during tool execution.
 * Uses ToolMemoryManager for persistence across sessions.
 */
export class ResearchAutoCatalog {
  private readonly logger: ILogger;
  private readonly pendingReferences: CatalogedReference[] = [];

  /** Maximum pending references to hold in memory. */
  private static readonly MAX_PENDING = 100;

  constructor(logger?: ILogger) {
    this.logger = logger ?? createLogger({ component: 'research-auto-catalog' });
  }

  /**
   * Scan text output for research references and record them.
   *
   * @param text - Text to scan for references
   * @param sourceTool - Name of the tool that produced the text
   * @returns Number of new references found
   */
  scanAndRecord(text: string, sourceTool: string): number {
    let count = 0;

    // Scan for arXiv IDs
    const arxivMatches = text.matchAll(ARXIV_PATTERN);
    for (const match of arxivMatches) {
      const id = match[1];
      if (id === undefined) continue;
      if (this.isDuplicate('arxiv', id)) continue;
      this.recordReference({
        type: 'arxiv',
        identifier: id,
        context: this.extractContext(text, match.index),
        sourceTool,
        discoveredAt: new Date().toISOString(),
        reviewed: false,
      });
      count++;
    }

    // Scan for GitHub URLs
    const githubMatches = text.matchAll(GITHUB_PATTERN);
    for (const match of githubMatches) {
      const repo = match[1];
      if (repo === undefined) continue;
      const url = `https://github.com/${repo}`;
      if (this.isDuplicate('github', url)) continue;
      this.recordReference({
        type: 'github',
        identifier: url,
        context: this.extractContext(text, match.index),
        sourceTool,
        discoveredAt: new Date().toISOString(),
        reviewed: false,
      });
      count++;
    }

    if (count > 0) {
      this.logger.debug('Auto-cataloged references', { count, sourceTool });
    }

    return count;
  }

  /**
   * Record a single research reference.
   *
   * @param entry - Reference to record
   */
  recordReference(entry: CatalogedReference): void {
    if (this.pendingReferences.length >= ResearchAutoCatalog.MAX_PENDING) {
      this.logger.warn('Auto-catalog pending limit reached, dropping oldest entry');
      this.pendingReferences.shift();
    }
    this.pendingReferences.push(entry);

    // Also persist to session memory
    try {
      const memory = getToolMemory(this.logger);
      memory.recordLearning({
        pattern: `Research reference: ${entry.type}:${entry.identifier}`,
        context: `tool=${entry.sourceTool}, context=${entry.context.slice(0, 100)}`,
        confidence: 0.5,
        source: 'auto-catalog',
      });
    } catch {
      this.logger.debug('Failed to persist to session memory');
    }
  }

  /**
   * Get all pending (unreviewed) references.
   *
   * @returns Array of pending references
   */
  getPending(): readonly CatalogedReference[] {
    return this.pendingReferences.filter((r) => !r.reviewed);
  }

  /**
   * Get all cataloged references.
   *
   * @returns Array of all references
   */
  getAll(): readonly CatalogedReference[] {
    return [...this.pendingReferences];
  }

  /**
   * Mark a reference as reviewed.
   *
   * @param identifier - Reference identifier to mark
   * @returns true if found and marked
   */
  markReviewed(identifier: string): boolean {
    const ref = this.pendingReferences.find((r) => r.identifier === identifier);
    if (ref !== undefined) {
      ref.reviewed = true;
      return true;
    }
    return false;
  }

  /**
   * Dismiss a reference (remove from pending).
   *
   * @param identifier - Reference identifier to dismiss
   * @returns true if found and removed
   */
  dismiss(identifier: string): boolean {
    const index = this.pendingReferences.findIndex((r) => r.identifier === identifier);
    if (index >= 0) {
      this.pendingReferences.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Clear all pending references.
   */
  flush(): void {
    this.pendingReferences.length = 0;
    this.logger.debug('Flushed all pending references');
  }

  /** Check if a reference already exists in pending. */
  private isDuplicate(type: string, identifier: string): boolean {
    return this.pendingReferences.some((r) => r.type === type && r.identifier === identifier);
  }

  /** Extract surrounding context from text. */
  private extractContext(text: string, position: number): string {
    const start = Math.max(0, position - 50);
    const end = Math.min(text.length, position + 50);
    return text.slice(start, end).replace(/\s+/g, ' ').trim();
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let autoCatalogInstance: ResearchAutoCatalog | undefined;

/**
 * Get the singleton ResearchAutoCatalog instance.
 *
 * @param logger - Optional logger
 * @returns The auto-catalog instance
 */
export function getAutoCatalog(logger?: ILogger): ResearchAutoCatalog {
  autoCatalogInstance ??= new ResearchAutoCatalog(logger);
  return autoCatalogInstance;
}

/**
 * Reset the auto-catalog instance (for testing).
 * @internal
 */
export function resetAutoCatalog(): void {
  autoCatalogInstance = undefined;
}
