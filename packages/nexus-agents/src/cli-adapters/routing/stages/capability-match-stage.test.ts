/**
 * Tests for CapabilityMatchStage
 *
 * @module cli-adapters/routing/stages/capability-match-stage.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { CliName } from '../../types-core.js';
import { CapabilityMatchStage, createCapabilityMatchStage } from './capability-match-stage.js';
import type { RoutingContext } from '../router-stage.js';

describe('CapabilityMatchStage', () => {
  let stage: CapabilityMatchStage;

  beforeEach(() => {
    stage = new CapabilityMatchStage();
  });

  describe('constructor', () => {
    it('creates stage with default config', () => {
      expect(stage.name).toBe('capability-match');
      expect(stage.priority).toBe(35);
    });

    it('accepts custom config', () => {
      const custom = new CapabilityMatchStage({ capabilityWeight: 0.5 });
      const stats = custom.getStats();
      expect(stats['config']).toEqual(expect.objectContaining({ capabilityWeight: 0.5 }));
    });
  });

  describe('canHandle', () => {
    it('returns true when candidates remain', () => {
      const ctx = createContext('test task');
      expect(stage.canHandle(ctx)).toBe(true);
    });

    it('returns false when no candidates', () => {
      const ctx = createContext('test task', []);
      expect(stage.canHandle(ctx)).toBe(false);
    });

    it('returns false when all candidates filtered', () => {
      const ctx = createFilteredContext('test task');
      expect(stage.canHandle(ctx)).toBe(false);
    });
  });

  describe('route', () => {
    it('classifies reasoning tasks', async () => {
      const ctx = createContext('analyze this code and explain why it fails');
      const result = await stage.route(ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const signals = result.value.context.signals;
        expect(signals).toContain('capability:task-reasoning');
        expect(signals).toContain('capability:best-claude');
      }
    });

    it('classifies code tasks', async () => {
      const ctx = createContext('implement a function to fix this bug');
      const result = await stage.route(ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const signals = result.value.context.signals;
        expect(signals).toContain('capability:task-code');
        expect(signals).toContain('capability:best-codex');
      }
    });

    it('classifies creative tasks', async () => {
      const ctx = createContext('write a story about design');
      const result = await stage.route(ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const signals = result.value.context.signals;
        expect(signals).toContain('capability:task-creative');
      }
    });

    it('classifies general tasks when no indicators', async () => {
      const ctx = createContext('hello world');
      const result = await stage.route(ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.context.signals).toContain('capability:task-general');
      }
    });

    it('updates scores for all candidates', async () => {
      const ctx = createContext('analyze this problem');
      const result = await stage.route(ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const scores = result.value.context.scores;
        expect(scores.get('claude')).toBeGreaterThan(0);
        expect(scores.get('gemini')).toBeGreaterThan(0);
        expect(scores.get('codex')).toBeGreaterThan(0);
      }
    });

    it('applies specialization bonus for reasoning + claude', async () => {
      const ctx = createContext('analyze and explain why this reasoning is flawed');
      const result = await stage.route(ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const scores = result.value.context.scores;
        // Claude should have highest score for reasoning tasks
        const claudeScore = scores.get('claude') ?? 0;
        const geminiScore = scores.get('gemini') ?? 0;
        expect(claudeScore).toBeGreaterThan(geminiScore);
      }
    });

    /**
     * The DELTA, not the sign (#5723). `toBeGreaterThan(0)` was already
     * guaranteed by the base weighted capability score for every CLI, so
     * `getSpecializationBonus` could return 0 unconditionally — the task matrix
     * never consulted — with all four of these tests still green.
     */
    async function specializationDelta(cli: CliName, specialized: string): Promise<number> {
      const neutralResult = await stage.route(createContext('do the thing'));
      const specializedResult = await stage.route(createContext(specialized));
      expect(neutralResult.ok).toBe(true);
      expect(specializedResult.ok).toBe(true);
      if (!neutralResult.ok || !specializedResult.ok) return 0;
      const neutral = neutralResult.value.context.scores.get(cli) ?? 0;
      const boosted = specializedResult.value.context.scores.get(cli) ?? 0;
      return boosted - neutral;
    }

    it('applies specialization bonus for code + codex', async () => {
      expect(
        await specializationDelta('codex', 'implement and refactor this function code')
      ).toBeGreaterThan(0);
    });

    it('applies specialization bonus for research + gemini', async () => {
      expect(
        await specializationDelta(
          'gemini',
          'research and investigate the state of the art literature'
        )
      ).toBeGreaterThan(0);
    });

    it('applies specialization bonus for exploration + gemini', async () => {
      expect(
        await specializationDelta(
          'gemini',
          'explore and navigate the codebase to find relevant files'
        )
      ).toBeGreaterThan(0);
    });

    it('applies specialization bonus for security + claude', async () => {
      expect(
        await specializationDelta(
          'claude',
          'audit security vulnerabilities and perform threat modeling'
        )
      ).toBeGreaterThan(0);
    });

    it('adds trace to context', async () => {
      const ctx = createContext('test task');
      const result = await stage.route(ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.context.trace.length).toBeGreaterThan(ctx.trace.length);
        const trace = result.value.context.trace.find((t) => t.stageName === 'capability-match');
        expect(trace).toBeDefined();
        expect(trace?.action).toBe('score');
      }
    });

    it('continues pipeline', async () => {
      const ctx = createContext('test task');
      const result = await stage.route(ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.continuesPipeline).toBe(true);
      }
    });
  });

  describe('recordOutcome', () => {
    it('records outcome without error', () => {
      expect(() => {
        stage.recordOutcome({
          selectedCli: 'claude',
          task: 'test task',
          success: true,
          qualityScore: 0.9,
          latencyMs: 1000,
          tokensUsed: 500,
        });
      }).not.toThrow();
    });
  });

  describe('getStats', () => {
    it('returns initial stats', () => {
      const stats = stage.getStats();
      expect(stats['routingsCount']).toBe(0);
      expect(stats['taskTypeDistribution']).toEqual({
        reasoning: 0,
        code: 0,
        creative: 0,
        general: 0,
      });
    });

    it('tracks routing count', async () => {
      await stage.route(createContext('test'));
      await stage.route(createContext('test 2'));

      const stats = stage.getStats();
      expect(stats['routingsCount']).toBe(2);
    });

    it('tracks task type distribution', async () => {
      await stage.route(createContext('analyze this'));
      await stage.route(createContext('implement this function'));
      await stage.route(createContext('write content'));

      const stats = stage.getStats();
      const distribution = stats['taskTypeDistribution'] as Record<string, number>;
      expect(distribution['reasoning']).toBe(1);
      expect(distribution['code']).toBe(1);
      expect(distribution['creative']).toBe(1);
    });
  });

  describe('cross-attention matrix', () => {
    it('uses default attention when no custom matrix provided', () => {
      const stats = stage.getStats();
      const config = stats['config'] as Record<string, unknown>;
      expect(config['attentionSource']).toBe('default');
    });

    it('accepts custom attention matrix', () => {
      const custom = new CapabilityMatchStage({
        attention: {
          reasoning: { reasoning: 0.8, codeGeneration: 0.1, speed: 0.05, costEfficiency: 0.05 },
          code: { reasoning: 0.1, codeGeneration: 0.8, speed: 0.05, costEfficiency: 0.05 },
          creative: { reasoning: 0.4, codeGeneration: 0.1, speed: 0.2, costEfficiency: 0.3 },
          general: { reasoning: 0.25, codeGeneration: 0.25, speed: 0.25, costEfficiency: 0.25 },
        },
      });
      const stats = custom.getStats();
      const config = stats['config'] as Record<string, unknown>;
      expect(config['attentionSource']).toBe('custom');
    });

    it('custom attention affects routing scores', async () => {
      // Custom matrix that heavily weights reasoning for code tasks
      const custom = new CapabilityMatchStage({
        attention: {
          reasoning: { reasoning: 0.25, codeGeneration: 0.25, speed: 0.25, costEfficiency: 0.25 },
          code: { reasoning: 0.9, codeGeneration: 0.05, speed: 0.025, costEfficiency: 0.025 },
          creative: { reasoning: 0.25, codeGeneration: 0.25, speed: 0.25, costEfficiency: 0.25 },
          general: { reasoning: 0.25, codeGeneration: 0.25, speed: 0.25, costEfficiency: 0.25 },
        },
      });

      const ctx = createContext('implement a new function');
      const result = await custom.route(ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // With reasoning=0.9 for code tasks, claude (reasoning=10) should beat codex
        const scores = result.value.context.scores;
        const claudeScore = scores.get('claude') ?? 0;
        const codexScore = scores.get('codex') ?? 0;
        expect(claudeScore).toBeGreaterThan(codexScore);
      }
    });
  });

  describe('createCapabilityMatchStage', () => {
    it('creates stage with factory function', () => {
      const created = createCapabilityMatchStage();
      expect(created).toBeInstanceOf(CapabilityMatchStage);
    });

    it('passes config to factory function', () => {
      const created = createCapabilityMatchStage({ specializationBonus: 0.2 });
      const stats = created.getStats();
      expect(stats['config']).toEqual(expect.objectContaining({ specializationBonus: 0.2 }));
    });
  });
});

// Helper functions

function createContext(
  task: string,
  availableClis: Array<'claude' | 'gemini' | 'codex'> = ['claude', 'gemini', 'codex']
): RoutingContext {
  return {
    task,
    availableClis,
    scores: new Map(availableClis.map((c) => [c, 0])),
    filtered: new Map(),
    signals: [],
    trace: [],
    metadata: undefined,
  };
}

function createFilteredContext(task: string): RoutingContext {
  const ctx = createContext(task, ['claude', 'gemini', 'codex']);
  const filtered = new Map<'claude' | 'gemini' | 'codex', string>();
  filtered.set('claude', 'budget');
  filtered.set('gemini', 'budget');
  filtered.set('codex', 'budget');
  return { ...ctx, filtered };
}
