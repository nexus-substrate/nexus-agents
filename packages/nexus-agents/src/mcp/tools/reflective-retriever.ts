/**
 * MemR3 Reflective Memory Retriever
 *
 * Enhances memory retrieval by using an LLM reasoning step to generate
 * structured relevance criteria before keyword-based search.
 * Based on MemR3 (arXiv:2512.20237).
 *
 * Feature-gated via NEXUS_REFLECTIVE_MEMORY (default: false).
 * Falls back to keyword-based retrieval on any failure.
 *
 * @module mcp/tools/reflective-retriever
 * (Source: Issue #988, Research Issue #736)
 */

import { z } from 'zod';
import type { IModelAdapter, ILogger } from '../../core/index.js';
import { createLogger, getErrorMessage } from '../../core/index.js';
import { withTimeout } from '../../utils/async-utils.js';

// ============================================================================
// Configuration
// ============================================================================

// Canonical source: config/timeouts.ts (Issue #1046)
import { REFLECTIVE_TIMEOUTS } from '../../config/timeouts.js';

const REFLECTION_TIMEOUT_MS = REFLECTIVE_TIMEOUTS.reflectionMs;

/** Maximum LRU cache entries. */
const MAX_CACHE_ENTRIES = 50;

const CACHE_TTL_MS: number = REFLECTIVE_TIMEOUTS.cacheTtlMs;

/** Maximum tokens for reflection prompt output. */
const REFLECTION_MAX_TOKENS = 100;

// ============================================================================
// Schema
// ============================================================================

/**
 * Zod schema for structured reflection output.
 * The LLM returns search criteria to improve retrieval.
 */
export const ReflectionCriteriaSchema = z.object({
  keywords: z.array(z.string()).min(1).max(10).describe('Expanded keywords for memory search'),
  context: z.string().max(200).describe('Brief context about what memories would be useful'),
});

export type ReflectionCriteria = z.infer<typeof ReflectionCriteriaSchema>;

// ============================================================================
// LRU Cache
// ============================================================================

interface CacheEntry {
  criteria: ReflectionCriteria;
  timestamp: number;
}

/**
 * Simple LRU cache for reflection criteria.
 * Keyed on normalized query string.
 */
export class ReflectionCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;

  constructor(maxEntries = MAX_CACHE_ENTRIES, ttlMs = CACHE_TTL_MS) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
  }

  /** Normalize query for cache key. */
  private normalize(query: string): string {
    return query.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  get(query: string): ReflectionCriteria | undefined {
    const key = this.normalize(query);
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }
    // Move to end (most recently used)
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.criteria;
  }

  set(query: string, criteria: ReflectionCriteria): void {
    const key = this.normalize(query);
    this.entries.delete(key); // Remove if exists for re-insertion at end
    if (this.entries.size >= this.maxEntries) {
      // Evict oldest (first entry)
      const oldest = this.entries.keys().next();
      if (oldest.done !== true) this.entries.delete(oldest.value);
    }
    this.entries.set(key, { criteria, timestamp: Date.now() });
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}

// ============================================================================
// Reflection Prompt
// ============================================================================

/** System prompt for reflection reasoning. */
const REFLECTION_SYSTEM_PROMPT =
  'You help improve memory search. Given a task, output JSON with expanded ' +
  'keywords and brief context about what past experiences would be relevant. ' +
  'Output ONLY valid JSON: {"keywords":["..."],"context":"..."}';

/** Build the reflection user prompt. */
function buildReflectionPrompt(query: string): string {
  return (
    `Task: "${query.slice(0, 200)}"\n\n` +
    'What types of past experiences, patterns, and knowledge would help? ' +
    'Generate 3-8 search keywords (including synonyms and related terms) ' +
    'and a one-sentence context.'
  );
}

// ============================================================================
// Reflective Retriever
// ============================================================================

/** Options for creating a ReflectiveRetriever. */
export interface ReflectiveRetrieverOptions {
  /** Model adapter for LLM reflection calls. */
  readonly adapter: IModelAdapter;
  /** Logger instance. */
  readonly logger?: ILogger;
  /** Timeout for reflection call in ms (default: 2000). */
  readonly timeoutMs?: number;
  /** Whether to run in shadow mode (log comparison, return original). */
  readonly shadowMode?: boolean;
  /** Shared cache instance (creates new if not provided). */
  readonly cache?: ReflectionCache;
}

/** Result of a reflection attempt. */
export interface ReflectionResult {
  /** Enhanced keywords from reflection (or original if fallback). */
  readonly keywords: readonly string[];
  /** Whether reflection was used (vs fallback). */
  readonly reflected: boolean;
  /** Source: 'cache', 'llm', 'fallback'. */
  readonly source: 'cache' | 'llm' | 'fallback';
  /** Processing time in ms. */
  readonly durationMs: number;
}

/**
 * Enhances memory retrieval queries via LLM reflection.
 *
 * Before searching memory, asks an LLM to reason about what types
 * of memories would be most relevant, generating expanded keywords
 * and search context. Falls back to original keywords on any failure.
 */
export class ReflectiveRetriever {
  private readonly adapter: IModelAdapter;
  private readonly logger: ILogger;
  private readonly timeoutMs: number;
  private readonly shadowMode: boolean;
  private readonly cache: ReflectionCache;

  constructor(options: ReflectiveRetrieverOptions) {
    this.adapter = options.adapter;
    this.logger = options.logger ?? createLogger({ component: 'reflective-retriever' });
    this.timeoutMs = options.timeoutMs ?? REFLECTION_TIMEOUT_MS;
    this.shadowMode = options.shadowMode ?? false;
    this.cache = options.cache ?? new ReflectionCache();
  }

  /** Build a result object with timing. */
  private buildResult(
    keywords: readonly string[],
    reflected: boolean,
    source: ReflectionResult['source'],
    start: number
  ): ReflectionResult {
    return { keywords, reflected, source, durationMs: Date.now() - start };
  }

  /** Handle successful reflection (or shadow mode). */
  private handleReflectionSuccess(
    criteria: ReflectionCriteria,
    originalKeywords: string[],
    start: number
  ): ReflectionResult {
    const enhanced = this.mergeKeywords(originalKeywords, criteria.keywords);
    this.logger.info('Reflection enhanced query', {
      original: originalKeywords.length,
      enhanced: enhanced.length,
      context: criteria.context.slice(0, 80),
    });

    if (this.shadowMode) {
      this.logger.info('Shadow mode: returning original keywords', {
        originalKeywords,
        enhancedKeywords: enhanced,
        reflectionContext: criteria.context,
      });
      return this.buildResult(originalKeywords, false, 'fallback', start);
    }

    return this.buildResult(enhanced, true, 'llm', start);
  }

  /**
   * Enhance a query with reflective reasoning.
   * Returns expanded keywords or falls back to original keywords.
   */
  async enhance(query: string): Promise<ReflectionResult> {
    const start = Date.now();
    const originalKeywords = this.extractKeywords(query);

    // Check cache first
    const cached = this.cache.get(query);
    if (cached !== undefined) {
      this.logger.debug('Reflection cache hit', { query: query.slice(0, 50) });
      return this.buildResult(cached.keywords, true, 'cache', start);
    }

    // Call LLM for reflection
    try {
      const criteria = await this.callReflection(query);
      this.cache.set(query, criteria);
      return this.handleReflectionSuccess(criteria, originalKeywords, start);
    } catch (error) {
      this.logger.warn('Reflection failed, using keyword fallback', {
        error: getErrorMessage(error),
        query: query.slice(0, 50),
      });
      return this.buildResult(originalKeywords, false, 'fallback', start);
    }
  }

  /** Extract basic keywords from query (existing approach). */
  private extractKeywords(query: string): string[] {
    return query
      .toLowerCase()
      .split(/\s+/)
      .filter((k) => k.length > 2);
  }

  /** Merge original keywords with reflection-generated ones. */
  private mergeKeywords(original: readonly string[], expanded: readonly string[]): string[] {
    const seen = new Set<string>();
    const merged: string[] = [];
    // Original keywords first (preserve order)
    for (const k of original) {
      const lower = k.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        merged.push(lower);
      }
    }
    // Add expanded keywords
    for (const k of expanded) {
      const lower = k.toLowerCase();
      if (!seen.has(lower) && lower.length > 2) {
        seen.add(lower);
        merged.push(lower);
      }
    }
    return merged;
  }

  /** Call LLM to generate reflection criteria. */
  private async callReflection(query: string): Promise<ReflectionCriteria> {
    const result = await withTimeout(
      this.adapter.complete({
        messages: [
          { role: 'system', content: REFLECTION_SYSTEM_PROMPT },
          { role: 'user', content: buildReflectionPrompt(query) },
        ],
        maxTokens: REFLECTION_MAX_TOKENS,
        temperature: 0.1,
      }),
      this.timeoutMs,
      `Reflection timeout after ${String(this.timeoutMs)}ms`
    );

    if (!result.ok) {
      throw new Error(`Reflection timed out: ${result.error}`);
    }

    const response = result.value;
    if (!response.ok) {
      throw new Error(`Model error in reflection: ${response.error.message}`);
    }

    const text = this.extractText(response.value.content);
    return this.parseCriteria(text);
  }

  /** Extract text from completion response content. */
  private extractText(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((block) => {
          if (typeof block === 'object' && block !== null && 'type' in block) {
            const typed = block as { type: string; text?: string };
            if (typed.type === 'text' && typeof typed.text === 'string') {
              return typed.text;
            }
          }
          return '';
        })
        .join('');
    }
    return String(content);
  }

  /** Parse and validate LLM output as ReflectionCriteria. */
  private parseCriteria(text: string): ReflectionCriteria {
    // Try direct parse first (most common case: clean JSON output)
    const trimmed = text.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        return ReflectionCriteriaSchema.parse(parsed);
      } catch {
        // Fall through to extraction
      }
    }

    // Extract JSON from response (may have markdown fences or preamble)
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('No JSON object found in reflection response');
    }

    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    return ReflectionCriteriaSchema.parse(parsed);
  }
}

// ============================================================================
// Feature Flag
// ============================================================================

/**
 * Check if reflective memory retrieval is enabled.
 */
export function isReflectiveMemoryEnabled(): boolean {
  return process.env.NEXUS_REFLECTIVE_MEMORY === 'true';
}

/**
 * Check if shadow mode is enabled (run reflection but return original results).
 */
export function isReflectiveShadowMode(): boolean {
  return process.env.NEXUS_REFLECTIVE_MEMORY === 'shadow';
}
