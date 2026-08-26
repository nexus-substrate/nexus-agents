/**
 * Cross-Memory Query Helpers
 *
 * Standalone functions for querying individual memory backends and
 * scoring relevance. Extracted from ToolMemoryManager (#1671) to
 * reduce tool-memory.ts below the 400-line governance limit.
 *
 * @module mcp/tools/tool-memory-query
 */

import type { ILogger } from '../../core/index.js';
import type { HindsightBeliefMemory, Belief } from '../../context/belief-memory.js';
import type { AgenticMemoryBackend } from '../../context/agentic-memory.js';
import type { AdaptiveMemoryBackend } from '../../context/adaptive-memory.js';
import type { ITypedMemory } from '../../context/memory-types.js';
import type { UnifiedMemoryResult } from './tool-memory-types.js';
import type { SessionLearning } from '../../context/session-memory-types.js';

// ============================================================================
// Relevance Scoring
// ============================================================================

/**
 * Calculate relevance score based on keyword matches (#1227).
 * Uses graduated scoring: base ratio + partial match bonus + exact phrase bonus.
 */
export function scoreRelevance(text: string, keywords: readonly string[]): number {
  if (keywords.length === 0) return 0.5;
  const lower = text.toLowerCase();
  const matched = keywords.filter((k) => lower.includes(k));
  const matchRatio = matched.length / keywords.length;
  let tfBonus = 0;
  for (const k of matched) {
    const count = lower.split(k).length - 1;
    if (count > 1) tfBonus += 0.05 * Math.min(count - 1, 3);
  }
  const phrase = keywords.join(' ');
  const phraseBonus = lower.includes(phrase) ? 0.15 : 0;
  return Math.min(1, matchRatio * 0.8 + tfBonus + phraseBonus);
}

// ============================================================================
// Per-Backend Query Helpers
// ============================================================================

/** Query SessionMemory learnings. */
export function querySessionMemory(
  learnings: readonly SessionLearning[],
  keywords: readonly string[],
  limit: number
): UnifiedMemoryResult[] {
  const now = new Date();
  return learnings.slice(0, limit).map((l) => ({
    source: 'session' as const,
    type: 'learning',
    content: `${l.pattern} (${l.context})`,
    relevance: scoreRelevance(l.pattern + ' ' + l.context, keywords),
    timestamp: now,
    metadata: { confidence: l.confidence, source: l.source },
  }));
}

/**
 * Logging + failure-reporting context shared by the per-backend query helpers.
 *
 * `onFailure` exists because each helper swallows its backend's error and
 * returns `[]` (#4999): partial results beat none, but the caller must still
 * be able to tell "this store failed" from "this store matched nothing".
 *
 * It must fire on an `err` Result as well as on a thrown exception. Every real
 * backend catches internally and resolves with `err(...)` —
 * `HybridMemoryBackend.search`, `searchAgentic` and the belief recall path all
 * do — so a version that reported only from `catch` could not see the corrupt
 * store it was written for. `ok([])` is a miss and stays silent; `err` is a
 * failure and is always reported.
 */
interface MemoryQueryContext {
  readonly log: ILogger;
  readonly onFailure?: (() => void) | undefined;
}

/**
 * Keyword fallback for a subject recall that matched nothing (#1225).
 *
 * Extracted so `queryBeliefMemory` stays within the complexity bar; it reports
 * its own `err` Result because a failed scan is a store that could not answer,
 * not a store with no matches.
 */
async function keywordScanBeliefs(
  beliefs: HindsightBeliefMemory,
  keywords: readonly string[],
  onFailure: (() => void) | undefined
): Promise<readonly Belief[]> {
  if (keywords.length === 0) return [];
  const KEYWORD_SCAN_LIMIT = 1000;
  const allResult = await beliefs.query({ includeSuperseded: false, limit: KEYWORD_SCAN_LIMIT });
  if (!allResult.ok) {
    onFailure?.();
    return [];
  }
  return allResult.value.filter((b) => {
    const text = (b.subject + ' ' + b.predicate + ' ' + b.object).toLowerCase();
    return keywords.some((k) => text.includes(k));
  });
}

/** Query BeliefMemory. Falls back to keyword search when exact match misses (#1225). */
export async function queryBeliefMemory(
  beliefs: HindsightBeliefMemory,
  query: string,
  keywords: readonly string[],
  limit: number,
  ctx: MemoryQueryContext
): Promise<UnifiedMemoryResult[]> {
  const { log, onFailure } = ctx;
  const results: UnifiedMemoryResult[] = [];
  try {
    const beliefResult = await beliefs.recallBySubject(query, limit);
    if (!beliefResult.ok) onFailure?.();
    const matched =
      beliefResult.ok && beliefResult.value.length > 0
        ? beliefResult.value
        : await keywordScanBeliefs(beliefs, keywords, onFailure);
    for (const b of matched.filter((x) => !x.superseded)) {
      results.push({
        source: 'belief',
        type: 'belief',
        content: `${b.subject} ${b.predicate} ${b.object}`,
        relevance: scoreRelevance(b.subject + ' ' + b.predicate + ' ' + b.object, keywords),
        timestamp: b.createdAt,
        metadata: { confidence: b.confidence },
      });
    }
  } catch (e: unknown) {
    // #4999: a swallowed failure used to be indistinguishable from an empty
    // result set. The caller still gets `[]` — partial results are better than
    // none — but it now learns the store could not answer.
    log.debug('Belief memory query failed', { error: String(e) });
    onFailure?.();
  }
  return results;
}

/** Query AgenticMemory for knowledge. */
export async function queryAgenticMemory(
  agentic: AgenticMemoryBackend,
  query: string,
  keywords: readonly string[],
  limit: number,
  ctx: MemoryQueryContext
): Promise<UnifiedMemoryResult[]> {
  const { log, onFailure } = ctx;
  const results: UnifiedMemoryResult[] = [];
  try {
    const agResult = await agentic.searchAgentic(query, limit);
    if (!agResult.ok) onFailure?.();
    if (agResult.ok) {
      for (const e of agResult.value) {
        results.push({
          source: 'agentic',
          type: 'knowledge',
          content: `${e.key}: ${JSON.stringify(e.value).slice(0, 100)}`,
          relevance: scoreRelevance(e.key + ' ' + e.attributes.keywords.join(' '), keywords),
          timestamp: e.createdAt,
          metadata: { keywords: e.attributes.keywords },
        });
      }
    }
  } catch (e: unknown) {
    log.debug('Agentic memory query failed', { error: String(e) });
    onFailure?.();
  }
  return results;
}

/** Query TypedMemory for semantic and episodic entries. */
export async function queryTypedMemory(
  typed: ITypedMemory,
  query: string,
  keywords: readonly string[],
  limitPerType: number,
  ctx: MemoryQueryContext
): Promise<UnifiedMemoryResult[]> {
  const { log, onFailure } = ctx;
  const results: UnifiedMemoryResult[] = [];
  try {
    const [semanticResult, episodicResult] = await Promise.all([
      typed.queryByType('semantic', query, limitPerType),
      typed.queryByType('episodic', query, limitPerType),
    ]);
    for (const r of [semanticResult, episodicResult]) {
      if (!r.ok) onFailure?.();
      if (r.ok) {
        for (const e of r.value) {
          results.push({
            source: 'typed',
            type: e.type,
            content: String(e.value).slice(0, 150),
            relevance: scoreRelevance(String(e.value), keywords),
            timestamp: e.createdAt,
          });
        }
      }
    }
  } catch (e: unknown) {
    log.debug('Typed memory query failed', { error: String(e) });
    onFailure?.();
  }
  return results;
}

/** Query AdaptiveMemory for priority-scored entries (#1226). */
export async function queryAdaptiveMemory(
  adaptive: AdaptiveMemoryBackend,
  query: string,
  keywords: readonly string[],
  limit: number,
  ctx: MemoryQueryContext
): Promise<UnifiedMemoryResult[]> {
  const { log, onFailure } = ctx;
  const results: UnifiedMemoryResult[] = [];
  try {
    const searchResult = await adaptive.search(query, limit);
    if (!searchResult.ok) onFailure?.();
    if (searchResult.ok) {
      for (const e of searchResult.value) {
        results.push({
          source: 'adaptive',
          type: 'adaptive',
          content: `${e.key}: ${JSON.stringify(e.value).slice(0, 100)}`,
          relevance: scoreRelevance(e.key + ' ' + JSON.stringify(e.value).slice(0, 200), keywords),
          timestamp: e.createdAt,
          metadata: { importance: e.metadata.importance },
        });
      }
    }
  } catch (e: unknown) {
    log.debug('Adaptive memory query failed', { error: String(e) });
    onFailure?.();
  }
  return results;
}
