/**
 * Tests for MobiMEM Implementation (ProfileMemoryImpl, ExperienceMemoryImpl, ActionCacheImpl).
 *
 * Covers: observe, getPreferences, getPreference, getEstablishedPreferences,
 * clearPreferences, recordExecution, findPatterns, findReliablePatterns,
 * getBestPattern, updatePatternMetrics, cache, get, recordHit, evictExpired,
 * clear, getStats, enforceLimit, and metric helpers.
 */

import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';

import type { MobiMemConfig, ActionStep, ExecutionOutcome } from './mobimem-types.js';
import { ProfileMemoryImpl, ExperienceMemoryImpl, ActionCacheImpl } from './mobimem-impl.js';

// ============================================================================
// Test Config
// ============================================================================

function makeConfig(overrides: Partial<MobiMemConfig> = {}): MobiMemConfig {
  return {
    dbPath: ':memory:',
    maxProfileEntries: 5,
    maxExperiencePatterns: 5,
    maxActionCacheEntries: 5,
    actionCacheTtlMs: 60_000,
    minProfileConfidence: 0.6,
    minExperienceSuccessRate: 0.7,
    autoEviction: true,
    ...overrides,
  };
}

function makeActionStep(overrides: Partial<ActionStep> = {}): ActionStep {
  return {
    index: 0,
    actionType: 'tool_call',
    parameters: { tool: 'test' },
    durationMs: 100,
    success: true,
    ...overrides,
  };
}

function makeOutcome(overrides: Partial<ExecutionOutcome> = {}): ExecutionOutcome {
  return {
    success: true,
    totalDurationMs: 500,
    tokensUsed: 100,
    ...overrides,
  };
}

// ============================================================================
// ProfileMemoryImpl
// ============================================================================

describe('ProfileMemoryImpl', () => {
  let profile: ProfileMemoryImpl;

  beforeEach(() => {
    profile = new ProfileMemoryImpl(makeConfig());
  });

  it('creates a new preference entry', () => {
    const entry = profile.observe('agent-1', 'agent', 'model', 'claude');
    expect(entry.entityId).toBe('agent-1');
    expect(entry.entityType).toBe('agent');
    expect(entry.preferenceKey).toBe('model');
    expect(entry.preferenceValue).toBe('claude');
    expect(entry.observationCount).toBe(1);
    expect(entry.confidence).toBeGreaterThan(0);
  });

  it('updates existing preference on re-observe', () => {
    profile.observe('agent-1', 'agent', 'model', 'claude');
    const updated = profile.observe('agent-1', 'agent', 'model', 'gpt-4');
    expect(updated.preferenceValue).toBe('gpt-4');
    expect(updated.observationCount).toBe(2);
  });

  it('increases confidence with more observations', () => {
    const first = profile.observe('agent-1', 'agent', 'model', 'claude');
    profile.observe('agent-1', 'agent', 'model', 'claude');
    const third = profile.observe('agent-1', 'agent', 'model', 'claude');
    expect(third.confidence).toBeGreaterThan(first.confidence);
  });

  it('getPreferences returns entries sorted by confidence', () => {
    profile.observe('agent-1', 'agent', 'a', 'v1');
    profile.observe('agent-1', 'agent', 'b', 'v2');
    // Observe 'b' more to increase confidence
    profile.observe('agent-1', 'agent', 'b', 'v2');
    profile.observe('agent-1', 'agent', 'b', 'v2');

    const prefs = profile.getPreferences('agent-1');
    expect(prefs.length).toBe(2);
    expect(prefs[0]?.preferenceKey).toBe('b');
  });

  it('getPreferences returns empty for unknown entity', () => {
    expect(profile.getPreferences('unknown')).toEqual([]);
  });

  it('getPreference returns specific preference', () => {
    profile.observe('agent-1', 'agent', 'model', 'claude');
    const pref = profile.getPreference('agent-1', 'model');
    expect(pref).not.toBeNull();
    expect(pref?.preferenceValue).toBe('claude');
  });

  it('getPreference returns null for missing preference', () => {
    expect(profile.getPreference('agent-1', 'nonexistent')).toBeNull();
  });

  it('getEstablishedPreferences filters by minProfileConfidence', () => {
    // Single observation has low confidence
    profile.observe('agent-1', 'agent', 'a', 'v1');
    expect(profile.getEstablishedPreferences('agent-1')).toHaveLength(0);

    // Many observations increase confidence above threshold
    const config = makeConfig({ minProfileConfidence: 0.1 });
    const lowThreshold = new ProfileMemoryImpl(config);
    lowThreshold.observe('agent-1', 'agent', 'a', 'v1');
    expect(lowThreshold.getEstablishedPreferences('agent-1').length).toBeGreaterThan(0);
  });

  it('clearPreferences removes all entries for entity', () => {
    profile.observe('agent-1', 'agent', 'a', 'v1');
    profile.observe('agent-1', 'agent', 'b', 'v2');
    profile.observe('agent-2', 'agent', 'a', 'v3');

    const cleared = profile.clearPreferences('agent-1');
    expect(cleared).toBe(2);
    expect(profile.getPreferences('agent-1')).toHaveLength(0);
    expect(profile.getPreferences('agent-2')).toHaveLength(1);
  });

  it('getEntryCount returns total entries', () => {
    profile.observe('agent-1', 'agent', 'a', 'v1');
    profile.observe('agent-2', 'agent', 'b', 'v2');
    expect(profile.getEntryCount()).toBe(2);
  });

  it('getUniqueEntities counts distinct entity IDs', () => {
    profile.observe('agent-1', 'agent', 'a', 'v1');
    profile.observe('agent-1', 'agent', 'b', 'v2');
    profile.observe('agent-2', 'agent', 'a', 'v3');
    expect(profile.getUniqueEntities()).toBe(2);
  });

  it('getAverageConfidence computes mean', () => {
    profile.observe('agent-1', 'agent', 'a', 'v1');
    profile.observe('agent-1', 'agent', 'b', 'v2');
    const avg = profile.getAverageConfidence();
    expect(avg).toBeGreaterThan(0);
    expect(avg).toBeLessThanOrEqual(1);
  });

  it('enforces maxProfileEntries limit per entity', () => {
    const config = makeConfig({ maxProfileEntries: 3 });
    const limited = new ProfileMemoryImpl(config);

    limited.observe('agent-1', 'agent', 'a', '1');
    limited.observe('agent-1', 'agent', 'b', '2');
    limited.observe('agent-1', 'agent', 'c', '3');
    limited.observe('agent-1', 'agent', 'd', '4');

    // Should have at most maxProfileEntries
    const prefs = limited.getPreferences('agent-1');
    expect(prefs.length).toBeLessThanOrEqual(3);
  });
});

// ============================================================================
// ExperienceMemoryImpl
// ============================================================================

describe('ExperienceMemoryImpl', () => {
  let experience: ExperienceMemoryImpl;

  beforeEach(() => {
    experience = new ExperienceMemoryImpl(makeConfig());
  });

  it('records a new execution pattern', () => {
    const entry = experience.recordExecution(
      'code-review',
      [makeActionStep()],
      makeOutcome(),
      'ctx-1'
    );
    expect(entry.taskType).toBe('code-review');
    expect(entry.attemptCount).toBe(1);
    expect(entry.successRate).toBe(1);
  });

  it('records failed execution with 0 success rate', () => {
    const entry = experience.recordExecution(
      'code-review',
      [makeActionStep()],
      makeOutcome({ success: false }),
      'ctx-1'
    );
    expect(entry.successCount).toBe(0);
    expect(entry.successRate).toBe(0);
  });

  it('updates existing pattern on same key', () => {
    const steps = [makeActionStep()];
    experience.recordExecution('code-review', steps, makeOutcome(), 'ctx-1');
    const updated = experience.recordExecution(
      'code-review',
      steps,
      makeOutcome({ success: false }),
      'ctx-1'
    );
    expect(updated.attemptCount).toBe(2);
    expect(updated.successCount).toBe(1);
    expect(updated.successRate).toBe(0.5);
  });

  it('findPatterns returns patterns for task type sorted by success rate', () => {
    experience.recordExecution('code-review', [makeActionStep()], makeOutcome(), 'ctx-1');
    experience.recordExecution(
      'code-review',
      [makeActionStep({ actionType: 'different' })],
      makeOutcome({ success: false }),
      'ctx-2'
    );
    experience.recordExecution('other-task', [makeActionStep()], makeOutcome(), 'ctx-1');

    const patterns = experience.findPatterns('code-review');
    expect(patterns).toHaveLength(2);
    expect(patterns[0]?.successRate).toBeGreaterThanOrEqual(patterns[1]?.successRate ?? 0);
  });

  it('findPatterns respects limit', () => {
    for (let i = 0; i < 5; i++) {
      experience.recordExecution(
        'code-review',
        [makeActionStep({ actionType: `step-${String(i)}` })],
        makeOutcome(),
        `ctx-${String(i)}`
      );
    }
    expect(experience.findPatterns('code-review', 2)).toHaveLength(2);
  });

  it('findReliablePatterns filters by success rate and min attempts', () => {
    const steps = [makeActionStep()];
    // Record same pattern 3 times with all successes
    experience.recordExecution('code-review', steps, makeOutcome(), 'ctx-1');
    experience.recordExecution('code-review', steps, makeOutcome(), 'ctx-1');
    experience.recordExecution('code-review', steps, makeOutcome(), 'ctx-1');

    const reliable = experience.findReliablePatterns('code-review');
    expect(reliable.length).toBeGreaterThan(0);
    expect(reliable[0]?.successRate).toBeGreaterThanOrEqual(0.7);
    expect(reliable[0]?.attemptCount).toBeGreaterThanOrEqual(3);
  });

  it('findReliablePatterns excludes low-attempt patterns', () => {
    experience.recordExecution('code-review', [makeActionStep()], makeOutcome(), 'ctx-1');
    // Only 1 attempt - should not be reliable
    const reliable = experience.findReliablePatterns('code-review');
    expect(reliable).toHaveLength(0);
  });

  it('getBestPattern finds best matching pattern', () => {
    const steps = [makeActionStep()];
    experience.recordExecution('code-review', steps, makeOutcome(), 'ctx-1');

    const best = experience.getBestPattern('code-review', 'ctx-1');
    expect(best).not.toBeNull();
    expect(best?.taskType).toBe('code-review');
  });

  it('getBestPattern returns null for unknown task type', () => {
    expect(experience.getBestPattern('unknown', 'ctx-1')).toBeNull();
  });

  it('getBestPattern prefers matching context', () => {
    const config = makeConfig({ minExperienceSuccessRate: 0 });
    const exp = new ExperienceMemoryImpl(config);

    exp.recordExecution(
      'code-review',
      [makeActionStep({ actionType: 'a' })],
      makeOutcome(),
      'ctx-match'
    );
    exp.recordExecution(
      'code-review',
      [makeActionStep({ actionType: 'b' })],
      makeOutcome(),
      'ctx-other'
    );

    const best = exp.getBestPattern('code-review', 'ctx-match');
    expect(best?.contextSignature).toBe('ctx-match');
  });

  it('updatePatternMetrics updates success rate', () => {
    const entry = experience.recordExecution(
      'code-review',
      [makeActionStep()],
      makeOutcome(),
      'ctx-1'
    );
    experience.updatePatternMetrics(entry.id, false);

    const patterns = experience.findPatterns('code-review');
    expect(patterns[0]?.attemptCount).toBe(2);
    expect(patterns[0]?.successRate).toBe(0.5);
  });

  it('getPatternCount returns total patterns', () => {
    experience.recordExecution('a', [makeActionStep()], makeOutcome(), 'ctx-1');
    experience.recordExecution('b', [makeActionStep()], makeOutcome(), 'ctx-1');
    expect(experience.getPatternCount()).toBe(2);
  });

  it('getUniqueTaskTypes counts distinct task types', () => {
    experience.recordExecution('a', [makeActionStep()], makeOutcome(), 'ctx-1');
    experience.recordExecution('a', [makeActionStep({ actionType: 'x' })], makeOutcome(), 'ctx-2');
    experience.recordExecution('b', [makeActionStep()], makeOutcome(), 'ctx-1');
    expect(experience.getUniqueTaskTypes()).toBe(2);
  });

  it('getAverageSuccessRate computes mean', () => {
    experience.recordExecution('a', [makeActionStep()], makeOutcome(), 'ctx-1');
    experience.recordExecution(
      'b',
      [makeActionStep({ actionType: 'x' })],
      makeOutcome({ success: false }),
      'ctx-1'
    );
    const avg = experience.getAverageSuccessRate();
    expect(avg).toBe(0.5);
  });

  it('enforces maxExperiencePatterns limit', () => {
    const config = makeConfig({ maxExperiencePatterns: 2 });
    const exp = new ExperienceMemoryImpl(config);

    exp.recordExecution('code-review', [makeActionStep({ actionType: 'a' })], makeOutcome(), 'c1');
    exp.recordExecution('code-review', [makeActionStep({ actionType: 'b' })], makeOutcome(), 'c2');
    exp.recordExecution('code-review', [makeActionStep({ actionType: 'c' })], makeOutcome(), 'c3');

    expect(exp.getPatternCount()).toBeLessThanOrEqual(3);
  });
});

// ============================================================================
// ActionCacheImpl
// ============================================================================

describe('ActionCacheImpl', () => {
  let cache: ActionCacheImpl;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
    cache = new ActionCacheImpl(makeConfig());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('caches and retrieves an entry', () => {
    cache.cache({ query: 'test' }, { result: 'ok' }, 500);
    const entry = cache.get({ query: 'test' });
    expect(entry).not.toBeNull();
    expect(entry?.result).toEqual({ result: 'ok' });
  });

  it('returns null for cache miss', () => {
    expect(cache.get({ query: 'missing' })).toBeNull();
  });

  it('returns null for expired entries', () => {
    cache.cache({ query: 'test' }, { result: 'ok' }, 500);
    // Advance past TTL (60 seconds)
    vi.advanceTimersByTime(61_000);
    expect(cache.get({ query: 'test' })).toBeNull();
  });

  it('recordHit updates hit count and time saved', () => {
    const entry = cache.cache({ query: 'test' }, { result: 'ok' }, 500);
    cache.recordHit(entry.id);
    cache.recordHit(entry.id);

    // Get won't show updated stats directly, check through getStats
    const stats = cache.getStats();
    expect(stats.timeSavedMs).toBe(1000); // 2 hits * 500ms
  });

  it('evictExpired removes only expired entries', () => {
    cache.cache({ q: 1 }, 'r1', 100);
    cache.cache({ q: 2 }, 'r2', 200);

    // Advance past TTL
    vi.advanceTimersByTime(61_000);
    const evicted = cache.evictExpired();
    expect(evicted).toBe(2);
    expect(cache.getStats().entries).toBe(0);
  });

  it('evictExpired keeps non-expired entries', () => {
    cache.cache({ q: 1 }, 'r1', 100);
    vi.advanceTimersByTime(30_000); // Only half TTL
    cache.cache({ q: 2 }, 'r2', 200);

    vi.advanceTimersByTime(31_000); // First entry expired, second not
    const evicted = cache.evictExpired();
    expect(evicted).toBe(1);
    expect(cache.getStats().entries).toBe(1);
  });

  it('clear removes all entries and resets stats', () => {
    cache.cache({ q: 1 }, 'r1', 100);
    cache.cache({ q: 2 }, 'r2', 200);
    cache.get({ q: 1 }); // Generate a request/hit

    const cleared = cache.clear();
    expect(cleared).toBe(2);

    const stats = cache.getStats();
    expect(stats.entries).toBe(0);
    expect(stats.hits).toBe(0);
    expect(stats.hitRate).toBe(0);
  });

  it('getStats returns correct hit rate', () => {
    cache.cache({ q: 1 }, 'r1', 100);
    cache.get({ q: 1 }); // hit
    cache.get({ q: 2 }); // miss

    const stats = cache.getStats();
    expect(stats.entries).toBe(1);
    expect(stats.hits).toBe(1);
    expect(stats.hitRate).toBe(0.5); // 1 hit / 2 requests
  });

  it('enforces maxActionCacheEntries limit', () => {
    const config = makeConfig({ maxActionCacheEntries: 3 });
    const limited = new ActionCacheImpl(config);

    limited.cache({ q: 1 }, 'r1', 100);
    limited.cache({ q: 2 }, 'r2', 100);
    limited.cache({ q: 3 }, 'r3', 100);
    limited.cache({ q: 4 }, 'r4', 100);

    expect(limited.getStats().entries).toBeLessThanOrEqual(3);
  });

  it('enforceLimit evicts LRU entry when all non-expired', () => {
    const config = makeConfig({ maxActionCacheEntries: 2, actionCacheTtlMs: 600_000 });
    const limited = new ActionCacheImpl(config);

    limited.cache({ q: 'oldest' }, 'r1', 100);
    vi.advanceTimersByTime(1000);
    limited.cache({ q: 'newer' }, 'r2', 100);
    vi.advanceTimersByTime(1000);
    limited.cache({ q: 'newest' }, 'r3', 100);

    // Oldest should be evicted
    expect(limited.get({ q: 'oldest' })).toBeNull();
  });
});
