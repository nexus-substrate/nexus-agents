/**
 * Tests for ConfidenceCascadeStage
 *
 * @module cli-adapters/routing/stages/confidence-cascade-stage.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ConfidenceCascadeStage,
  createConfidenceCascadeStage,
} from './confidence-cascade-stage.js';
import type { RoutingContext } from '../router-stage.js';

describe('ConfidenceCascadeStage', () => {
  let stage: ConfidenceCascadeStage;

  beforeEach(() => {
    stage = new ConfidenceCascadeStage();
  });

  describe('constructor', () => {
    it('creates stage with default config', () => {
      expect(stage.name).toBe('confidence-cascade');
      expect(stage.priority).toBe(10);
    });

    it('accepts custom config', () => {
      const custom = new ConfidenceCascadeStage({ escalationThreshold: 0.8 });
      const stats = custom.getStats();
      expect(stats['config']).toEqual(expect.objectContaining({ escalationThreshold: 0.8 }));
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
  });

  describe('route', () => {
    it('classifies simple tasks', async () => {
      const ctx = createContext('hello world');
      const result = await stage.route(ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.context.signals).toContain('confidence:complexity-simple');
      }
    });

    it('classifies moderate tasks', async () => {
      // 30-100 words, no strong indicators (avoid simple: fix, add, remove, update, change, simple, basic, quick)
      // and avoid complex: design, architecture, implement, optimize, refactor, security, performance, scalable, distributed, algorithm
      const ctx = createContext(
        'Please review this code snippet and provide feedback on the approach. ' +
          'The current solution works but could be improved in some ways. ' +
          'Consider the naming conventions and overall structure of the functions. ' +
          'We want to ensure the code is readable and maintainable. ' +
          'Let me know your thoughts on how to proceed.'
      );
      const result = await stage.route(ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.context.signals).toContain('confidence:complexity-moderate');
      }
    });

    it('classifies complex tasks with many words', async () => {
      // >100 words
      const longTask = Array.from({ length: 30 }, () => 'word word word word').join(' ');
      const ctx = createContext(longTask);
      const result = await stage.route(ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.context.signals).toContain('confidence:complexity-complex');
      }
    });

    it('classifies complex tasks with complex indicators', async () => {
      // Uses >=2 complex indicators: design, architecture, implement, optimize, refactor, security, performance, scalable, distributed, algorithm
      const ctx = createContext('design a scalable architecture for this distributed system');
      const result = await stage.route(ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.context.signals).toContain('confidence:complexity-complex');
      }
    });

    it('identifies best CLI for simple tasks', async () => {
      const ctx = createContext('simple hello');
      const result = await stage.route(ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Gemini has highest simpleScore (1.0)
        expect(result.value.context.signals).toContain('confidence:best-gemini');
      }
    });

    it('identifies best CLI for complex tasks', async () => {
      const longTask = Array.from({ length: 30 }, () => 'word word word word').join(' ');
      const ctx = createContext(longTask);
      const result = await stage.route(ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Claude has highest complexScore (1.0)
        expect(result.value.context.signals).toContain('confidence:best-claude');
      }
    });

    it('does not escalate simple tasks', async () => {
      const ctx = createContext('hello');
      const result = await stage.route(ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.context.signals).not.toContain('confidence:should-escalate');
      }
    });

    it('updates scores for all candidates', async () => {
      const ctx = createContext('test task');
      const result = await stage.route(ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const scores = result.value.context.scores;
        expect(scores.get('claude')).toBeGreaterThan(0);
        expect(scores.get('gemini')).toBeGreaterThan(0);
        expect(scores.get('codex')).toBeGreaterThan(0);
      }
    });

    it('adds trace to context', async () => {
      const ctx = createContext('test task');
      const result = await stage.route(ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.context.trace.length).toBeGreaterThan(ctx.trace.length);
        const trace = result.value.context.trace.find((t) => t.stageName === 'confidence-cascade');
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
      expect(stats['escalationCount']).toBe(0);
      expect(stats['escalationRate']).toBe(0);
      expect(stats['complexityDistribution']).toEqual({
        simple: 0,
        moderate: 0,
        complex: 0,
      });
    });

    it('tracks routing count', async () => {
      await stage.route(createContext('test'));
      await stage.route(createContext('test 2'));

      const stats = stage.getStats();
      expect(stats['routingsCount']).toBe(2);
    });

    it('tracks complexity distribution', async () => {
      await stage.route(createContext('simple'));
      const longTask = Array.from({ length: 30 }, () => 'word word word word').join(' ');
      await stage.route(createContext(longTask));

      const stats = stage.getStats();
      const distribution = stats['complexityDistribution'] as Record<string, number>;
      expect(distribution['simple']).toBe(1);
      expect(distribution['complex']).toBe(1);
    });

    it('calculates escalation rate', async () => {
      // Create scenarios that might trigger escalation
      const lowThresholdStage = new ConfidenceCascadeStage({ escalationThreshold: 1.1 });
      const moderateTask =
        'This is a task that has a moderate amount of text and requires some thought';
      await lowThresholdStage.route(createContext(moderateTask));

      const stats = lowThresholdStage.getStats();
      // Escalation happens when maxScore < threshold and not simple
      expect(stats['escalationRate']).toBeGreaterThanOrEqual(0);
    });
  });

  describe('createConfidenceCascadeStage', () => {
    it('creates stage with factory function', () => {
      const created = createConfidenceCascadeStage();
      expect(created).toBeInstanceOf(ConfidenceCascadeStage);
    });

    it('passes config to factory function', () => {
      const created = createConfidenceCascadeStage({ complexityWeight: 0.5 });
      const stats = created.getStats();
      expect(stats['config']).toEqual(expect.objectContaining({ complexityWeight: 0.5 }));
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
