/**
 * Tests for ResourceStrategyStage
 *
 * @module cli-adapters/routing/stages/resource-strategy-stage.test
 * (Source: Issue #998 — Resource-aware strategy oscillation)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ResourceStrategyStage,
  createResourceStrategyStage,
  computeResourceTier,
  computeScoreAdjustments,
} from './resource-strategy-stage.js';
import type { RoutingContext, CliName } from '../router-stage.js';

// ============================================================================
// Helpers
// ============================================================================

function createContext(
  task: string,
  clis: CliName[] = ['claude', 'gemini', 'codex'],
  signals: string[] = [],
  metadata?: Record<string, unknown>
): RoutingContext {
  return {
    task,
    metadata,
    availableClis: clis,
    scores: new Map(clis.map((c) => [c, 0])),
    filtered: new Map(),
    signals,
    trace: [],
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('ResourceStrategyStage', () => {
  let stage: ResourceStrategyStage;

  beforeEach(() => {
    stage = new ResourceStrategyStage();
  });

  describe('constructor', () => {
    it('creates stage with correct name and priority', () => {
      expect(stage.name).toBe('resource-strategy');
      expect(stage.priority).toBe(55);
    });

    it('accepts custom config', () => {
      const custom = new ResourceStrategyStage({ aggressiveThreshold: 0.8 });
      const stats = custom.getStats();
      const config = stats['config'] as Record<string, number>;
      expect(config['aggressiveThreshold']).toBe(0.8);
    });
  });

  describe('canHandle', () => {
    it('returns true with multiple candidates', () => {
      const ctx = createContext('test');
      expect(stage.canHandle(ctx)).toBe(true);
    });

    it('returns false with single candidate', () => {
      const ctx = createContext('test', ['claude']);
      expect(stage.canHandle(ctx)).toBe(false);
    });

    it('returns false with no candidates', () => {
      const ctx = createContext('test', []);
      expect(stage.canHandle(ctx)).toBe(false);
    });
  });

  describe('route — budget signal parsing', () => {
    it('skips when no budget signal present', async () => {
      const ctx = createContext('test');
      const result = await stage.route(ctx);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.continuesPipeline).toBe(true);
        const trace = result.value.context.trace;
        expect(trace[trace.length - 1]?.action).toBe('skip');
      }
    });

    it('reads the resourceLevel metadata the router supplies', async () => {
      // Was `reads budget:utilization signal`. #4872 deleted BudgetFilterStage,
      // that channel's only producer; #4869 had already superseded it with
      // typed metadata from composite-router-stages. The old form tested a
      // read that can no longer fire.
      // utilization=0.1 → resource level=0.9 → aggressive
      const ctx = createContext('test', ['claude', 'gemini', 'codex'], [], { resourceLevel: 0.9 });
      const result = await stage.route(ctx);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const signals = result.value.context.signals;
        expect(signals).toContain('resource-strategy:tier=aggressive');
      }
    });

    it('reads resourceLevel from metadata', async () => {
      const ctx = createContext('test', ['claude', 'gemini', 'codex'], [], {
        resourceLevel: 0.3,
      });
      const result = await stage.route(ctx);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const signals = result.value.context.signals;
        expect(signals).toContain('resource-strategy:tier=conservative');
      }
    });
  });

  describe('route — tier-based scoring', () => {
    it('boosts quality CLIs in aggressive tier', async () => {
      const ctx = createContext('test', ['claude', 'gemini', 'codex'], [], { resourceLevel: 0.9 }); // level=0.9 → aggressive
      const result = await stage.route(ctx);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const scores = result.value.context.scores;
        const claude = scores.get('claude') ?? 0;
        const gemini = scores.get('gemini') ?? 0;
        expect(claude).toBeGreaterThan(gemini);
      }
    });

    it('applies no adjustment in balanced tier', async () => {
      const ctx = createContext('test', ['claude', 'gemini', 'codex'], [], { resourceLevel: 0.6 }); // level=0.6 → balanced
      const result = await stage.route(ctx);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const scores = result.value.context.scores;
        // All scores should be 0 (no adjustment in balanced)
        expect(scores.get('claude')).toBe(0);
        expect(scores.get('gemini')).toBe(0);
        expect(scores.get('codex')).toBe(0);
      }
    });

    it('boosts cost-efficient CLIs in conservative tier', async () => {
      const ctx = createContext('test', ['claude', 'gemini', 'codex'], [], { resourceLevel: 0.35 }); // level=0.35 → conservative
      const result = await stage.route(ctx);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const scores = result.value.context.scores;
        const gemini = scores.get('gemini') ?? 0;
        const claude = scores.get('claude') ?? 0;
        expect(gemini).toBeGreaterThan(claude);
      }
    });

    it('strongly boosts cheapest CLI in critical tier', async () => {
      const ctx = createContext('test', ['claude', 'gemini', 'codex'], [], { resourceLevel: 0.1 }); // level=0.1 → critical
      const result = await stage.route(ctx);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const scores = result.value.context.scores;
        const gemini = scores.get('gemini') ?? 0;
        const claude = scores.get('claude') ?? 0;
        expect(gemini).toBeGreaterThan(claude);
        // Critical boost is larger than conservative
        expect(gemini).toBeGreaterThan(5);
      }
    });
  });

  describe('route — signals and trace', () => {
    it('adds tier and level signals', async () => {
      const ctx = createContext('test', ['claude', 'gemini'], [], { resourceLevel: 0.8 });
      const result = await stage.route(ctx);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const signals = result.value.context.signals;
        expect(signals).toContain('resource-strategy:tier=aggressive');
        expect(signals).toContain('resource-strategy:level=0.80');
      }
    });

    it('adds trace entry with score action', async () => {
      const ctx = createContext('test', ['claude', 'gemini'], [], { resourceLevel: 0.5 });
      const result = await stage.route(ctx);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const trace = result.value.context.trace;
        const last = trace[trace.length - 1];
        expect(last?.stageName).toBe('resource-strategy');
        expect(last?.action).toBe('score');
      }
    });
  });

  describe('getStats', () => {
    it('tracks tier distribution', async () => {
      // Run aggressive
      const aggressiveCtx = createContext('t', ['claude', 'gemini'], [], { resourceLevel: 0.9 });
      await stage.route(aggressiveCtx);

      // Run critical
      const criticalCtx = createContext('t', ['claude', 'gemini'], [], { resourceLevel: 0.1 });
      await stage.route(criticalCtx);

      const stats = stage.getStats();
      expect(stats['routingsCount']).toBe(2);
      const dist = stats['tierDistribution'] as Record<string, number>;
      expect(dist['aggressive']).toBe(1);
      expect(dist['critical']).toBe(1);
    });
  });

  describe('createResourceStrategyStage factory', () => {
    it('creates stage with defaults', () => {
      const s = createResourceStrategyStage();
      expect(s.name).toBe('resource-strategy');
    });

    it('creates stage with custom config', () => {
      const s = createResourceStrategyStage({ criticalBoost: 12 });
      const stats = s.getStats();
      const config = stats['config'] as Record<string, number>;
      expect(config['criticalBoost']).toBe(12);
    });
  });
});

describe('computeResourceTier', () => {
  it('returns aggressive above threshold', () => {
    expect(computeResourceTier(0.8)).toBe('aggressive');
    expect(computeResourceTier(1.0)).toBe('aggressive');
  });

  it('returns balanced in mid range', () => {
    expect(computeResourceTier(0.6)).toBe('balanced');
    expect(computeResourceTier(0.5)).toBe('balanced');
  });

  it('returns conservative in low range', () => {
    expect(computeResourceTier(0.3)).toBe('conservative');
    expect(computeResourceTier(0.25)).toBe('conservative');
  });

  it('returns critical below threshold', () => {
    expect(computeResourceTier(0.1)).toBe('critical');
    expect(computeResourceTier(0.0)).toBe('critical');
  });

  it('handles exact boundary values', () => {
    expect(computeResourceTier(0.75)).toBe('aggressive');
    expect(computeResourceTier(0.5)).toBe('balanced');
    expect(computeResourceTier(0.25)).toBe('conservative');
    expect(computeResourceTier(0.24)).toBe('critical');
  });
});

describe('computeScoreAdjustments', () => {
  const candidates: CliName[] = ['claude', 'gemini', 'codex'];

  it('boosts claude most in aggressive tier', () => {
    const adj = computeScoreAdjustments('aggressive', candidates);
    expect((adj.get('claude') ?? 0) > (adj.get('gemini') ?? 0)).toBe(true);
  });

  it('returns zero adjustments in balanced tier', () => {
    const adj = computeScoreAdjustments('balanced', candidates);
    expect(adj.get('claude')).toBe(0);
    expect(adj.get('gemini')).toBe(0);
    expect(adj.get('codex')).toBe(0);
  });

  it('boosts gemini most in conservative tier', () => {
    const adj = computeScoreAdjustments('conservative', candidates);
    expect((adj.get('gemini') ?? 0) > (adj.get('claude') ?? 0)).toBe(true);
  });

  it('boosts gemini most in critical tier', () => {
    const adj = computeScoreAdjustments('critical', candidates);
    const gemini = adj.get('gemini') ?? 0;
    const claude = adj.get('claude') ?? 0;
    expect(gemini).toBeGreaterThan(claude);
    // Critical boost is larger than conservative
    expect(gemini).toBeGreaterThan(5);
  });
});
