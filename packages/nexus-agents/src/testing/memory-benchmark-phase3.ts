/**
 * Memory Benchmark Phase 3 Metrics
 *
 * Advanced metrics for promotion effectiveness and decay appropriateness.
 * Measures whether the tiering and forgetting systems work correctly.
 *
 * @module testing/memory-benchmark-phase3
 * (Source: Issue #748 - Memory evaluation framework)
 */

import type { ILogger } from '../core/index.js';
import { getTimeProvider } from '../core/index.js';
import type { IContextMemoryBackend, MemoryMetadata } from '../context/memory-backend-types.js';

// ============================================================================
// Types
// ============================================================================

/** Promotion effectiveness measurement result. */
export interface PromotionMeasurement {
  readonly retentionRate: number;
  readonly itemsPromoted: number;
  readonly itemsRetained: number;
}

/** Decay appropriateness measurement result. */
export interface DecayAppropriatenessMeasurement {
  readonly regretScore: number;
  readonly itemsDecayed: number;
  readonly prematureDecays: number;
}

// ============================================================================
// Promotion Effectiveness (Phase 3)
// ============================================================================

/** Measure promotion effectiveness (retention rate of promoted memories). */
export async function measurePromotionEffectiveness(
  backend: IContextMemoryBackend,
  logger?: ILogger
): Promise<PromotionMeasurement> {
  const promotedEntries: string[] = [];
  const metadata: MemoryMetadata = { importance: 'high', tags: ['promoted', 'benchmark'] };

  // Create promoted entries (simulate learnings elevated to beliefs/agentic)
  for (let i = 0; i < 10; i++) {
    const key = `promoted-${String(getTimeProvider().now())}-${String(i)}`;
    const value = {
      type: 'promoted_learning',
      content: `Important insight #${String(i)} that was promoted`,
      confidence: 0.85 + Math.random() * 0.15,
      promotedAt: new Date().toISOString(),
    };
    const storeResult = await backend.store(key, value, metadata);
    if (storeResult.ok) promotedEntries.push(key);
  }

  // Verify retention (all promoted entries should be retrievable)
  let retained = 0;
  for (const key of promotedEntries) {
    const result = await backend.retrieve(key);
    if (result.ok) retained++;
  }

  const retentionRate = promotedEntries.length > 0 ? retained / promotedEntries.length : 1.0;
  logger?.debug('Promotion effectiveness measured', {
    promoted: promotedEntries.length,
    retained,
    retentionRate,
  });

  return { retentionRate, itemsPromoted: promotedEntries.length, itemsRetained: retained };
}

// ============================================================================
// Decay Appropriateness (Phase 3)
// ============================================================================

/** Store test entries with specified importance level. */
async function storeTestEntries(
  backend: IContextMemoryBackend,
  importance: 'low' | 'high',
  count: number
): Promise<string[]> {
  const keys: string[] = [];
  const metadata: MemoryMetadata = { importance, tags: ['decay-test'] };

  for (let i = 0; i < count; i++) {
    const key = `${importance}-importance-${String(getTimeProvider().now())}-${String(i)}`;
    const value = { importance, content: `${importance} value content #${String(i)}` };
    const storeResult = await backend.store(key, value, metadata);
    if (storeResult.ok) keys.push(key);
  }

  return keys;
}

/** Count how many keys are no longer retrievable. */
async function countDecayed(backend: IContextMemoryBackend, keys: string[]): Promise<number> {
  let decayed = 0;
  for (const key of keys) {
    const result = await backend.retrieve(key);
    if (!result.ok) decayed++;
  }
  return decayed;
}

/** Measure decay appropriateness (regret score for premature decay). */
export async function measureDecayAppropriateness(
  backend: IContextMemoryBackend,
  logger?: ILogger
): Promise<DecayAppropriatenessMeasurement> {
  // Store entries with different importance levels
  const lowKeys = await storeTestEntries(backend, 'low', 5);
  const highKeys = await storeTestEntries(backend, 'high', 5);

  // Simulate time passing by pruning
  const cutoffDate = new Date(Date.now() + 1000);
  await backend.prune(cutoffDate);

  // Check what was decayed
  const highDecayed = await countDecayed(backend, highKeys);
  const lowDecayed = await countDecayed(backend, lowKeys);

  // Regret = proportion of high-importance items decayed (lower is better)
  const totalDecayed = highDecayed + lowDecayed;
  const regret = totalDecayed > 0 ? highDecayed / totalDecayed : 0;

  logger?.debug('Decay appropriateness measured', {
    highImportanceDecayed: highDecayed,
    lowImportanceDecayed: lowDecayed,
    regretScore: regret,
  });

  return { regretScore: regret, itemsDecayed: totalDecayed, prematureDecays: highDecayed };
}
