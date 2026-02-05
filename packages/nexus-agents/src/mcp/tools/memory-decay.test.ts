/**
 * Tests for Coordinated Memory Decay (Phase 5 #746)
 *
 * @module mcp/tools/memory-decay.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MemoryDecayManager,
  CrossReferenceTracker,
  DEFAULT_DECAY_CONFIG,
  type MemoryDecayConfig,
} from './memory-decay.js';

describe('CrossReferenceTracker', () => {
  let tracker: CrossReferenceTracker;

  beforeEach(() => {
    tracker = new CrossReferenceTracker();
  });

  it('should register and retrieve cross-references', () => {
    tracker.registerReference({
      sourceMemory: 'session',
      sourceKey: 'learning-1',
      targetMemory: 'belief',
      targetKey: 'belief-123',
    });

    expect(tracker.hasReferences('session', 'learning-1')).toBe(true);
    expect(tracker.hasReferences('session', 'learning-2')).toBe(false);

    const refs = tracker.getReferences('session', 'learning-1');
    expect(refs).toHaveLength(1);
    expect(refs[0]?.targetMemory).toBe('belief');
    expect(refs[0]?.targetKey).toBe('belief-123');
  });

  it('should remove cross-references', () => {
    tracker.registerReference({
      sourceMemory: 'belief',
      sourceKey: 'belief-1',
      targetMemory: 'agentic',
      targetKey: 'knowledge-1',
    });

    expect(tracker.hasReferences('belief', 'belief-1')).toBe(true);

    const removed = tracker.removeReferences('belief', 'belief-1');
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(tracker.hasReferences('belief', 'belief-1')).toBe(false);
  });

  it('should track multiple references for same source', () => {
    tracker.registerReference({
      sourceMemory: 'session',
      sourceKey: 'learning-1',
      targetMemory: 'belief',
      targetKey: 'belief-1',
    });
    tracker.registerReference({
      sourceMemory: 'session',
      sourceKey: 'learning-1',
      targetMemory: 'agentic',
      targetKey: 'knowledge-1',
    });

    const refs = tracker.getReferences('session', 'learning-1');
    expect(refs).toHaveLength(2);
  });

  it('should provide accurate stats', () => {
    tracker.registerReference({
      sourceMemory: 'session',
      sourceKey: 'learning-1',
      targetMemory: 'belief',
      targetKey: 'belief-1',
    });
    tracker.registerReference({
      sourceMemory: 'belief',
      sourceKey: 'belief-1',
      targetMemory: 'agentic',
      targetKey: 'knowledge-1',
    });

    const stats = tracker.getStats();
    expect(stats.totalReferences).toBe(2);
    expect(stats.uniqueSources).toBe(2);
  });
});

describe('MemoryDecayManager', () => {
  let manager: MemoryDecayManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new MemoryDecayManager({ enabled: false }); // Disable auto-decay for tests
    manager.initialize({});
  });

  afterEach(() => {
    manager.shutdown();
    vi.useRealTimers();
  });

  it('should use default configuration', () => {
    const defaultManager = new MemoryDecayManager();
    expect(DEFAULT_DECAY_CONFIG.enabled).toBe(true);
    expect(DEFAULT_DECAY_CONFIG.beliefMaxAgeDays).toBe(30);
    expect(DEFAULT_DECAY_CONFIG.decayIntervalMs).toBe(60 * 60 * 1000);
    defaultManager.shutdown();
  });

  it('should accept custom configuration', () => {
    const customConfig: Partial<MemoryDecayConfig> = {
      beliefMaxAgeDays: 60,
      agenticMaxEntries: 5000,
    };
    const customManager = new MemoryDecayManager(customConfig);
    customManager.shutdown();
    // Config is applied internally (verified via behavior)
  });

  it('should run decay without memory backends', async () => {
    const stats = await manager.runDecay();

    expect(stats.beliefsPruned).toBe(0);
    expect(stats.agenticEvicted).toBe(0);
    expect(stats.adaptiveEvicted).toBe(0);
    expect(stats.mobimemEvicted).toBe(0);
    expect(stats.errors).toHaveLength(0);
    expect(stats.startedAt).toBeInstanceOf(Date);
    expect(stats.completedAt).toBeInstanceOf(Date);
  });

  it('should track decay run history', async () => {
    await manager.runDecay();
    await manager.runDecay();
    await manager.runDecay();

    const aggregateStats = manager.getAggregateStats();
    expect(aggregateStats.totalRuns).toBe(3);
    expect(aggregateStats.lastRunAt).toBeInstanceOf(Date);

    const recentRuns = manager.getRecentRuns(2);
    expect(recentRuns).toHaveLength(2);
  });

  it('should register cross-references', () => {
    manager.registerCrossReference('session', 'learning-1', 'belief', 'belief-1');

    const stats = manager.getCrossReferenceStats();
    expect(stats.totalReferences).toBe(1);
    expect(stats.uniqueSources).toBe(1);
  });

  it('should start and stop auto-decay', () => {
    const autoManager = new MemoryDecayManager({ enabled: true, decayIntervalMs: 1000 });
    autoManager.initialize({});

    autoManager.startAutoDecay();
    // Should not throw when starting again
    autoManager.startAutoDecay();

    autoManager.stopAutoDecay();
    // Should not throw when stopping again
    autoManager.stopAutoDecay();

    autoManager.shutdown();
  });

  it('should not start auto-decay when disabled', () => {
    const disabledManager = new MemoryDecayManager({ enabled: false });
    disabledManager.initialize({});

    // This should be a no-op
    disabledManager.startAutoDecay();

    disabledManager.shutdown();
  });

  it('should provide aggregate stats with zeros initially', () => {
    const stats = manager.getAggregateStats();

    expect(stats.totalRuns).toBe(0);
    expect(stats.lastRunAt).toBeNull();
    expect(stats.totalBeliefsPruned).toBe(0);
    expect(stats.totalAgenticEvicted).toBe(0);
    expect(stats.totalAdaptiveEvicted).toBe(0);
    expect(stats.totalMobimemEvicted).toBe(0);
    expect(stats.totalCrossReferencesPreserved).toBe(0);
    expect(stats.totalErrors).toBe(0);
  });

  it('should accumulate stats across runs', async () => {
    await manager.runDecay();
    await manager.runDecay();

    const stats = manager.getAggregateStats();
    expect(stats.totalRuns).toBe(2);
  });

  it('should limit history to 100 runs', async () => {
    // Run decay 105 times
    for (let i = 0; i < 105; i++) {
      await manager.runDecay();
    }

    const recentRuns = manager.getRecentRuns(150);
    expect(recentRuns.length).toBeLessThanOrEqual(100);
  });
});

describe('MemoryDecayManager with mock backends', () => {
  it('should handle belief decay errors gracefully', async () => {
    const mockBeliefs = {
      pruneSuperseded: vi.fn().mockRejectedValue(new Error('Test error')),
    };

    const manager = new MemoryDecayManager({ enabled: false });
    manager.initialize({ beliefs: mockBeliefs as never });

    const stats = await manager.runDecay();
    expect(stats.errors).toHaveLength(1);
    expect(stats.errors[0]).toContain('Belief decay failed');

    manager.shutdown();
  });

  it('should handle agentic decay errors gracefully', async () => {
    const mockAgentic = {
      prune: vi.fn().mockRejectedValue(new Error('Test error')),
    };

    const manager = new MemoryDecayManager({ enabled: false });
    manager.initialize({ agentic: mockAgentic as never });

    const stats = await manager.runDecay();
    expect(stats.errors).toHaveLength(1);
    expect(stats.errors[0]).toContain('Agentic decay failed');

    manager.shutdown();
  });

  it('should handle adaptive decay errors gracefully', async () => {
    const mockAdaptive = {
      prune: vi.fn().mockRejectedValue(new Error('Test error')),
    };

    const manager = new MemoryDecayManager({ enabled: false });
    manager.initialize({ adaptive: mockAdaptive as never });

    const stats = await manager.runDecay();
    expect(stats.errors).toHaveLength(1);
    expect(stats.errors[0]).toContain('Adaptive decay failed');

    manager.shutdown();
  });

  it('should run MobiMem maintenance during decay', async () => {
    const mockMobimem = {
      runMaintenance: vi.fn(),
      getStats: vi.fn().mockReturnValue({
        profile: { totalEntries: 10, uniqueEntities: 5, avgConfidence: 0.8 },
        experience: { totalPatterns: 20, uniqueTaskTypes: 3, avgSuccessRate: 0.9 },
        action: { totalEntries: 100, totalHits: 50, hitRate: 0.5, timeSavedMs: 5000 },
      }),
    };

    const manager = new MemoryDecayManager({
      enabled: false,
      mobimemEvictOnDecay: true,
    });
    manager.initialize({ mobimem: mockMobimem as never });

    await manager.runDecay();
    expect(mockMobimem.runMaintenance).toHaveBeenCalled();

    manager.shutdown();
  });

  it('should skip MobiMem maintenance when disabled', async () => {
    const mockMobimem = {
      runMaintenance: vi.fn(),
      getStats: vi.fn(),
    };

    const manager = new MemoryDecayManager({
      enabled: false,
      mobimemEvictOnDecay: false,
    });
    manager.initialize({ mobimem: mockMobimem as never });

    await manager.runDecay();
    expect(mockMobimem.runMaintenance).not.toHaveBeenCalled();

    manager.shutdown();
  });
});
